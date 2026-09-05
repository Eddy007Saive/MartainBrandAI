"""
Abonnements Stripe -> plan utilisateur + crédits mensuels.

No-op propre si Stripe non configuré (l'app marche en mode gratuit sans Stripe).
"""
from datetime import datetime, timezone, timedelta
import os
import stripe
from config import (
    supabase, logger, FRONTEND_URL,
    STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS,
    STRIPE_PRICE_PACK_EUR, STRIPE_PRICE_PACK_USD, STRIPE_PRICE_PRO_USD,
)

# Statut Stripe -> statut interne de l'abonnement (pilote les quotas)
STATUS_MAP = {
    "active": "active", "trialing": "trialing", "past_due": "past_due",
    # unpaid : fin de la séquence de relance Stripe. Ce n'est plus une résiliation :
    # la grâce, la suspension (J+10) et la résiliation (J+30) sont pilotées par
    # impaye_service à partir de notre propre impaye_depuis.
    "incomplete": "past_due", "canceled": "canceled", "unpaid": "past_due",
    "incomplete_expired": "canceled",
}

# Motifs de résiliation Stripe -> libellé FR (pour l'email admin)
CANCEL_FEEDBACK = {
    "too_expensive": "Trop cher",
    "missing_features": "Fonctionnalités manquantes",
    "switched_service": "Passé à un concurrent",
    "unused": "Pas / peu utilisé",
    "customer_service": "Service client",
    "too_complex": "Trop compliqué",
    "low_quality": "Qualité insuffisante",
    "other": "Autre",
}


def _cancel_reason(sub: dict) -> str:
    """Raison de résiliation lisible. Le payload webhook peut ne pas avoir le feedback
    au moment T -> on re-fetch l'abonnement si besoin."""
    cd = sub.get("cancellation_details") or {}
    if not (cd.get("feedback") or cd.get("comment")):
        try:
            cd = (stripe.Subscription.retrieve(sub["id"]).get("cancellation_details")) or cd
        except Exception:
            pass
    return CANCEL_FEEDBACK.get(cd.get("feedback")) or cd.get("comment") or "non précisée"


def _ready() -> bool:
    if not STRIPE_SECRET_KEY:
        return False
    stripe.api_key = STRIPE_SECRET_KEY
    return True


def _price_for(plan: str, devise: str = "eur"):
    """Le prix d'un abonnement, dans la devise du marche.

    Le Pack savait deja choisir sa monnaie, l'abonnement non : un seul prix
    etait ecrit en dur. Un client latino-americain reglait donc son Pack en
    dollars, puis se voyait facturer son abonnement en euros.

    Faute de prix dans la devise demandee, on retombe sur l'euro plutot que
    d'echouer : mieux vaut une facture dans la mauvaise monnaie qu'un
    abonnement qui ne demarre pas.
    """
    devise = (devise or "eur").lower()
    if plan == "pro":
        return (STRIPE_PRICE_PRO_USD if devise == "usd" and STRIPE_PRICE_PRO_USD
                else STRIPE_PRICE_PRO)
    if plan == "business":
        return STRIPE_PRICE_BUSINESS
    return None


def _plan_for_price(price_id: str):
    if price_id and price_id in (STRIPE_PRICE_PRO, STRIPE_PRICE_PRO_USD):
        return "pro"
    if price_id and price_id == STRIPE_PRICE_BUSINESS:
        return "business"
    return None


ESSAI_JOURS = 14

# Parcours 1 : au-dela de ce delai apres le paiement du Pack, l'abonnement part
# tout seul si personne ne l'a declenche. Mettre 0 desactive le filet et rend la
# main entiere a l'equipe.
PACK_DELAI_JOURS = int(os.environ.get("PACK_DELAI_JOURS", "14"))


def a_deja_eu_un_abonnement(telegram_id: str) -> bool:
    """Un essai par compte, jamais deux.

    Sans ce garde-fou, il suffit de resilier puis de se reabonner pour
    repartir sur quatorze jours gratuits, indefiniment. On regarde l'historique
    complet, pas seulement l'abonnement en cours.
    """
    try:
        r = (supabase.table("subscriptions").select("id, status")
             .eq("user_id", telegram_id).limit(5).execute())
        # Un essai LOCAL (sans carte, pose par quota_service) ne compte pas :
        # il n'est jamais passe par Stripe, le client n'a rien consomme de payant.
        return any(x.get("status") in ("active", "past_due", "canceled") for x in (r.data or []))
    except Exception as e:
        logger.warning(f"a_deja_eu_un_abonnement {telegram_id}: {e}")
        return False



def _options_tva() -> dict:
    """Les parametres Stripe de TVA, ou un dict vide si la TVA est desactivee.

    En prod (STRIPE_AUTO_TAX actif), on calcule la TVA et on collecte l'adresse.
    En local sans adresse de siege sur le compte test, on les omet pour que la
    session se cree quand meme — au prix d'un checkout SANS TVA, a ne jamais
    utiliser en production.
    """
    from config import STRIPE_AUTO_TAX
    if not STRIPE_AUTO_TAX:
        return {}
    return {
        "automatic_tax": {"enabled": True},
        "tax_id_collection": {"enabled": True, "required": "if_supported"},
        "billing_address_collection": "required",
        "customer_update": {"address": "auto", "name": "auto"},
    }


def create_checkout(telegram_id: str, plan: str, essai_jours: int = 0) -> dict:
    """Session d'abonnement Stripe.

    essai_jours > 0 : la carte est SAISIE mais rien n'est preleve. Stripe cree
    l'abonnement en statut « trialing » et declenche lui-meme le premier
    prelevement au terme de l'essai — nous n'avons aucun minuteur a tenir, et
    c'est ce qui rend le mecanisme fiable : meme si notre serveur est arrete
    le 14e jour, le prelevement a lieu et le webhook nous rattrape ensuite.
    """
    if not _ready():
        return {"ok": False, "error": "Paiement indisponible : Stripe non configuré (contacte le support)."}
    price = _price_for(plan)
    if not price:
        return {"ok": False, "error": "Offre inconnue."}
    res = supabase.table("users").select("stripe_customer_id, email").eq("telegram_id", telegram_id).execute()
    row = res.data[0] if res.data else {}
    customer = row.get("stripe_customer_id")
    try:
        if not customer:
            c = stripe.Customer.create(email=row.get("email"), metadata={"telegram_id": telegram_id})
            customer = c.id
            supabase.table("users").update({"stripe_customer_id": customer}).eq("telegram_id", telegram_id).execute()
        sess = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer,
            line_items=[{"price": price, "quantity": 1}],
            success_url=f"{FRONTEND_URL}/dashboard/parametres?paiement=ok",
            cancel_url=f"{FRONTEND_URL}/dashboard/parametres?paiement=annule",
            client_reference_id=telegram_id,
            metadata={"telegram_id": telegram_id, "plan": plan},
            subscription_data={
                "metadata": {"telegram_id": telegram_id, "plan": plan},
                **({"trial_period_days": essai_jours} if essai_jours else {}),
            },
            # « always » et non « if_required » : sans cela Stripe n'exige PAS
            # la carte quand la premiere facture est a zero. On la demande
            # quand meme, c'est tout l'objet de l'essai avec carte.
            **({"payment_method_collection": "always"} if essai_jours else {}),
            allow_promotion_codes=True,
            # Societe bulgare facturant des clients pro dans l'UE : la TVA doit etre calculee
            # (autoliquidation si le client B2B fournit un numero de TVA intracommunautaire
            # valide, sinon TVA locale du client) et TOUJOURS ajoutee EN PLUS des 279 EUR
            # (Price.tax_behavior='exclusive') -> la marge n'est jamais rognee par la TVA.
            # Le calcul TVA exige une adresse de siege chez Stripe : desactivable
            # par STRIPE_AUTO_TAX pour tester en local (compte test sans adresse).
            **(_options_tva()),
        )
        return {"ok": True, "url": sess.url}
    except Exception as e:
        logger.error(f"stripe checkout error: {e}")
        return {"ok": False, "error": "Impossible de créer la session de paiement."}


def create_portal(telegram_id: str) -> dict:
    if not _ready():
        return {"ok": False, "error": "Stripe non configuré."}
    res = supabase.table("users").select("stripe_customer_id").eq("telegram_id", telegram_id).execute()
    customer = res.data[0].get("stripe_customer_id") if res.data else None
    if not customer:
        return {"ok": False, "error": "Aucun abonnement à gérer."}
    try:
        sess = stripe.billing_portal.Session.create(customer=customer, return_url=f"{FRONTEND_URL}/dashboard/parametres")
        return {"ok": True, "url": sess.url}
    except Exception as e:
        logger.error(f"stripe portal error: {e}")
        return {"ok": False, "error": "Portail indisponible."}


def list_invoices(telegram_id: str) -> list:
    """Factures Stripe du compte (les plus récentes) : date, montant, statut, PDF, lien."""
    if not _ready():
        return []
    res = supabase.table("users").select("stripe_customer_id").eq("telegram_id", telegram_id).execute()
    customer = res.data[0].get("stripe_customer_id") if res.data else None
    if not customer:
        return []
    try:
        invs = stripe.Invoice.list(customer=customer, limit=24)
    except Exception as e:
        logger.error(f"list_invoices error: {e}")
        return []
    out = []
    for i in (invs.data or []):
        # on ignore les brouillons vides
        if i.get("status") == "draft" and not (i.get("amount_due") or i.get("total")):
            continue
        out.append({
            "number": i.get("number"),
            "date": _ts(i.get("created")),
            "amount": (i.get("amount_paid") or i.get("total") or 0) / 100,
            "currency": (i.get("currency") or "eur").upper(),
            "status": i.get("status"),               # paid | open | void | uncollectible
            "pdf": i.get("invoice_pdf"),
            "url": i.get("hosted_invoice_url"),
        })
    return out


def list_all_invoices(limit: int = 500) -> list:
    """[ADMIN] Toutes les factures du compte Stripe (auto-paginé), enrichies du client (nom/email)."""
    if not _ready():
        return []
    # Map customer_id -> utilisateur (pour afficher le nom du client plutôt que l'id Stripe)
    rows = supabase.table("users").select("telegram_id, nom, email, stripe_customer_id").execute().data or []
    by_cust = {r["stripe_customer_id"]: r for r in rows if r.get("stripe_customer_id")}
    out = []
    try:
        for i in stripe.Invoice.list(limit=100).auto_paging_iter():
            if len(out) >= limit:
                break
            if i.get("status") == "draft" and not (i.get("amount_due") or i.get("total")):
                continue
            u = by_cust.get(i.get("customer")) or {}
            out.append({
                "number": i.get("number"),
                "date": _ts(i.get("created")),
                "amount": (i.get("amount_paid") or i.get("total") or 0) / 100,
                "currency": (i.get("currency") or "eur").upper(),
                "status": i.get("status"),               # paid | open | void | uncollectible
                "pdf": i.get("invoice_pdf"),
                "url": i.get("hosted_invoice_url"),
                "client": u.get("nom") or i.get("customer_name") or i.get("customer_email") or "—",
                "email": u.get("email") or i.get("customer_email"),
                "telegram_id": u.get("telegram_id"),
            })
    except Exception as e:
        logger.error(f"list_all_invoices error: {e}")
    return out


def _pro_plan_id():
    r = supabase.table("plans").select("id").eq("name", "Pro").limit(1).execute()
    return r.data[0]["id"] if r.data else None


def _essai_plan_id():
    r = supabase.table("plans").select("id").eq("name", "Essai").limit(1).execute()
    return r.data[0]["id"] if r.data else None


def _plan_selon_statut(status: str):
    """Le plan qui gouverne les quotas selon l'etat de l'abonnement.

    En essai, les quotas sont VOLONTAIREMENT limites (plan Essai) : l'essai
    gratuit fait decouvrir le produit, il ne le donne pas en entier. Des le
    premier prelevement (statut « active »), le compte bascule sur les quotas
    Pro complets. Cette bascule est automatique : le webhook rejoue
    _apply_subscription au changement de statut.
    """
    essai = _essai_plan_id()
    if status == "trialing" and essai:
        return essai
    return _pro_plan_id()


def _ts(v):
    return datetime.fromtimestamp(v, tz=timezone.utc).isoformat() if v else None


def _upsert_subscription(uid: str, status: str, period_start, period_end, stripe_sub_id):
    """Écrit l'abonnement dans la table `subscriptions` (source de vérité des quotas).
    Mettre à jour current_period_start/end = nouvelle période -> compteurs repartis à zéro
    (les usage_counters sont créés par période ; les packs `extra` ne se reportent pas).

    Le PLAN suit le statut : quotas Essai (limites) pendant l'essai, quotas Pro
    au premier prelevement. Ecrire Pro des l'essai donnait l'acces complet a un
    compte qui n'a encore rien paye."""
    plan_id = _plan_selon_statut(status)
    if not plan_id:
        logger.warning("stripe: offre Pro/Essai absente de la table plans")
        return
    row = {"plan_id": plan_id, "status": status, "stripe_subscription_id": stripe_sub_id}
    if period_start:
        row["current_period_start"] = period_start
    if period_end:
        row["current_period_end"] = period_end
    existing = (supabase.table("subscriptions").select("id, status, plans(name)").eq("user_id", uid)
                .order("created_at", desc=True).limit(1).execute())
    if existing.data:
        # Un compte suspendu par notre cron (réseaux déconnectés) le reste tant que
        # Stripe ne signale qu'un past_due : sinon le cron le re-suspendrait en boucle.
        if existing.data[0].get("status") == "suspended" and status == "past_due":
            row["status"] = "suspended"
        # Un compte Boss (interne) garde son plan et reste actif : Stripe ne
        # gouverne ni ses quotas ni son accès, seulement ses dates de période.
        if (existing.data[0].get("plans") or {}).get("name") == "Boss":
            row.pop("plan_id", None)
            if status in ("past_due", "suspended"):
                row["status"] = "active"
        supabase.table("subscriptions").update(row).eq("id", existing.data[0]["id"]).execute()
    elif period_end:
        row["user_id"] = uid
        supabase.table("subscriptions").insert(row).execute()


def _apply_subscription(sub: dict):
    """Reflète l'état de l'abonnement Stripe dans `subscriptions` (pilote les quotas) + users (affichage)."""
    meta = sub.get("metadata") or {}
    tg = meta.get("telegram_id")
    customer = sub.get("customer")
    status = STATUS_MAP.get(sub.get("status"), "past_due")
    if tg:
        try:
            from services import demarrage_service
            demarrage_service.oublier(tg)  # l'étape « carte » du démarrage a peut-être changé
        except Exception:
            pass

    uid = None
    if tg:
        q = supabase.table("users").select("telegram_id").eq("telegram_id", tg).execute()
        if q.data:
            uid = q.data[0]["telegram_id"]
    if not uid and customer:
        q = supabase.table("users").select("telegram_id").eq("stripe_customer_id", customer).execute()
        if q.data:
            uid = q.data[0]["telegram_id"]
    if not uid:
        logger.warning("stripe webhook: utilisateur introuvable")
        return None

    ps = _ts(sub.get("current_period_start"))
    pe = _ts(sub.get("current_period_end"))
    # API Stripe récente : current_period_start/end vit désormais sur les ITEMS de l'abonnement,
    # plus au niveau racine → on lit en fallback sinon la période (et le reset de quotas) fige.
    if pe is None:
        items = (sub.get("items") or {}).get("data") or []
        if items:
            ps = _ts(items[0].get("current_period_start")) or ps
            pe = _ts(items[0].get("current_period_end")) or pe
    _upsert_subscription(uid, status, ps, pe, sub.get("id"))

    # Résiliation programmée : API Stripe récente -> `cancel_at` (et pas cancel_at_period_end).
    cancel_ts = sub.get("cancel_at")
    if not cancel_ts and sub.get("cancel_at_period_end"):
        items = (sub.get("items") or {}).get("data") or []
        cancel_ts = sub.get("current_period_end") or (items[0].get("current_period_end") if items else None)
    cancel_at = _ts(cancel_ts)

    actif = status in ("active", "trialing")
    # Transition None -> date = nouvelle résiliation programmée -> email admin (par la route).
    prev = (supabase.table("subscriptions").select("cancel_at")
            .eq("user_id", uid).order("created_at", desc=True).limit(1).execute().data)
    was_canceling = bool(prev and prev[0].get("cancel_at"))
    newly_canceling = bool(cancel_at) and actif and not was_canceling

    try:
        supabase.table("subscriptions").update({"cancel_at": cancel_at if actif else None}) \
            .eq("user_id", uid).execute()
    except Exception as e:
        logger.warning(f"stripe: date de résiliation non enregistrée pour {uid}: {e}")
    logger.info(f"stripe: {uid} -> {status}" + (" (résiliation programmée)" if cancel_at else ""))
    return {"uid": uid, "status": status, "newly_canceling": newly_canceling, "cancel_at": cancel_at}


# ----------------------------------------------------------------- Packs de rachat
def abonnements() -> dict:
    """{telegram_id: {plan, prix_cents, statut, renouvelle_le, resilie_le, stripe_subscription_id}}
    pour tous les comptes, en une requête. `subscriptions` fait autorité depuis le
    14/08/2026 : c'est elle qui gouverne les quotas, donc ce que le client reçoit
    vraiment. Le prix vient de `plans`, plus d'un barème codé en dur."""
    try:
        subs = (supabase.table("subscriptions")
                .select("user_id, status, current_period_end, cancel_at, stripe_subscription_id, plan_id, created_at")
                .order("created_at", desc=True).execute().data or [])
        tarifs = {p["id"]: p for p in (supabase.table("plans").select("id, name, price_cents").execute().data or [])}
    except Exception as e:
        logger.error(f"lecture abonnements: {e}")
        return {}
    par_user = {}
    for s in subs:
        uid = s["user_id"]
        if uid in par_user:      # trié par date : on garde le plus récent
            continue
        p = tarifs.get(s.get("plan_id")) or {}
        actif = s.get("status") in ("active", "trialing")
        par_user[uid] = {
            "plan": (p.get("name") or "Essai"),
            "prix_cents": (p.get("price_cents") or 0) if s.get("status") == "active" else 0,
            "statut": s.get("status"),
            "renouvelle_le": s.get("current_period_end"),
            "resilie_le": s.get("cancel_at"),
            "stripe_subscription_id": s.get("stripe_subscription_id") if actif else None,
        }
    return par_user


def abonnement(telegram_id: str) -> dict:
    """L'abonnement courant d'un compte (voir abonnements())."""
    return abonnements().get(telegram_id, {
        "plan": "Essai", "prix_cents": 0, "statut": None,
        "renouvelle_le": None, "resilie_le": None, "stripe_subscription_id": None,
    })


def list_packs(action_type: str = None) -> list:
    """Packs actifs (optionnellement filtrés par type), formulés en résultats."""
    try:
        q = supabase.table("credit_packs").select("id, action_type, name, quantity, price_cents").eq("is_active", True)
        if action_type:
            q = q.eq("action_type", action_type)
        return q.order("price_cents").execute().data or []
    except Exception as e:
        logger.error(f"list_packs error: {e}")
        return []


def create_pack_checkout(telegram_id: str, pack_id: str) -> dict:
    """Paiement unique (one-time) pour un pack -> à la confirmation, +quota via webhook."""
    if not _ready():
        return {"ok": False, "error": "Paiement indisponible : Stripe non configuré (contacte le support)."}
    r = supabase.table("credit_packs").select("*").eq("id", pack_id).eq("is_active", True).execute()
    if not r.data:
        return {"ok": False, "error": "Pack inconnu."}
    p = r.data[0]
    u = supabase.table("users").select("stripe_customer_id, email").eq("telegram_id", telegram_id).execute()
    row = u.data[0] if u.data else {}
    customer = row.get("stripe_customer_id")
    try:
        if not customer:
            c = stripe.Customer.create(email=row.get("email"), metadata={"telegram_id": telegram_id})
            customer = c.id
            supabase.table("users").update({"stripe_customer_id": customer}).eq("telegram_id", telegram_id).execute()
        sess = stripe.checkout.Session.create(
            mode="payment",
            customer=customer,
            line_items=[{"price_data": {"currency": "eur", "unit_amount": p["price_cents"],
                                        "product_data": {"name": p["name"]}}, "quantity": 1}],
            success_url=f"{FRONTEND_URL}/dashboard?pack=ok",
            cancel_url=f"{FRONTEND_URL}/dashboard?pack=annule",
            metadata={"telegram_id": telegram_id, "pack_id": p["id"],
                      "action_type": p["action_type"], "quantity": str(p["quantity"])},
        )
        return {"ok": True, "url": sess.url}
    except Exception as e:
        logger.error(f"pack checkout error: {e}")
        return {"ok": False, "error": "Impossible de créer la session de paiement."}


# --- Pack Fondations -------------------------------------------------------
# Prestation de lancement, paiement unique, vendue apres un rendez-vous. On ne
# publie pas de lien fixe : chaque lien est genere pour un client precis, avec
# le code de son apporteur d'affaires en metadata. C'est ce code, et le
# marqueur produit=fondations, que le webhook lit pour creer la commission.
PACK_PRIX = {"eur": STRIPE_PRICE_PACK_EUR, "usd": STRIPE_PRICE_PACK_USD}


# Les fuseaux disent le PAYS ; la langue ne le dit pas. C'est toute la
# difference entre Madrid et Bogota, qui ecrivent le meme « es ».
_CONTINENT_EURO = ("Europe/", "Africa/", "Atlantic/")
_CONTINENT_DOLLAR = ("America/", "Pacific/")


def devise_du_marche(langue: str = None, fuseau: str = None) -> str:
    """La monnaie de facturation d'un client.

    Le fuseau prime, parce qu'il designe un pays : un Espagnol installe a
    Bogota paie en dollars, et c'est correct — sa banque est la-bas.

    La langue ne sert plus que de repli, et c'est un mauvais repli : elle
    envoyait l'Espagne, qui est en zone euro, payer en dollars. On la garde
    faute de mieux quand le fuseau est inconnu, mais elle ne decide plus des
    qu'on sait ou vit le client.
    """
    f = (fuseau or "").strip()
    if f.startswith(_CONTINENT_DOLLAR):
        return "usd"
    if f.startswith(_CONTINENT_EURO):
        return "eur"
    return "usd" if (langue or "").lower().startswith("es") else "eur"


def lien_pack(email: str, telegram_id: str = None, affilie: str = None,
              devise: str = None, langue: str = None) -> dict:
    """Cree un lien de paiement du Pack Fondations, a envoyer apres le call."""
    if not _ready():
        return {"ok": False, "error": "Stripe non configuré."}

    devise = (devise or devise_du_marche(langue)).lower()
    price = PACK_PRIX.get(devise)
    if not price:
        return {"ok": False, "error": f"Aucun prix configuré en {devise.upper()} "
                                      f"(STRIPE_PRICE_PACK_{devise.upper()} manquant)."}

    # Le client peut ne pas encore avoir de compte : dans ce cas l'attribution
    # se fera sur son email, ou sur le code depose ici.
    row = {}
    if telegram_id:
        r = (supabase.table("users").select("stripe_customer_id, email, langue, timezone")
             .eq("telegram_id", telegram_id).execute())
        row = r.data[0] if r.data else {}
        if not devise and (row.get("timezone") or row.get("langue")):
            devise = devise_du_marche(row.get("langue"), row.get("timezone"))
    email = email or row.get("email")

    meta = {"produit": "fondations"}
    if telegram_id:
        meta["telegram_id"] = str(telegram_id)
    if affilie:
        meta["affilie"] = affilie.strip().upper()

    try:
        # La carte est ENREGISTREE au passage (`setup_future_usage`).
        #
        # C'est ce qui permet de declencher l'abonnement plus tard, quand le
        # parametrage est livre, sans redemander sa carte au client — trois
        # semaines apres qu'il ait paye 1 499 EUR, c'est le pire moment pour
        # lui redemander quoi que ce soit. Cette option ne se rattrape pas
        # apres coup : un lien parti sans elle oblige a repasser par le client.
        #
        # `customer_creation` est indispensable en mode paiement : sans client
        # Stripe, la carte n'est rattachee a personne et devient inutilisable.
        # Les deux options s'excluent, d'ou l'aiguillage.
        client = ({"customer": row["stripe_customer_id"]} if row.get("stripe_customer_id")
                  else {"customer_creation": "always",
                        **({"customer_email": email} if email else {})})
        sess = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{"price": price, "quantity": 1}],
            payment_intent_data={"setup_future_usage": "off_session", "metadata": meta},
            success_url=f"{FRONTEND_URL}/dashboard?pack=ok",
            cancel_url=f"{FRONTEND_URL}/tarifs?pack=annule",
            metadata=meta,
            client_reference_id=str(telegram_id) if telegram_id else None,
            **client,
        )
        return {"ok": True, "url": sess.url, "devise": devise.upper(),
                "expire_le": sess.expires_at}
    except Exception as e:
        logger.error(f"lien pack fondations: {e}")
        return {"ok": False, "error": "Impossible de créer le lien de paiement."}


def _lier_client_stripe(telegram_id: str, email: str, customer: str) -> None:
    """Retient l'identifiant client Stripe sur le compte.

    Le Pack se paie souvent AVANT que le compte existe : dans ce cas on
    rattrape par l'email, qui est la seule chose commune entre le paiement et
    l'inscription.
    """
    if not customer:
        return
    try:
        if telegram_id:
            supabase.table("users").update({"stripe_customer_id": customer}) \
                .eq("telegram_id", telegram_id).execute()
        elif email:
            supabase.table("users").update({"stripe_customer_id": customer}) \
                .eq("email", email.lower()).execute()
    except Exception as e:
        logger.warning(f"lier client stripe: {e}")


def carte_enregistree(telegram_id: str) -> dict:
    """Ce que le back-office a besoin de savoir avant de declencher l'abonnement.

    Rien n'est stocke chez nous : Stripe est la source, et une carte peut
    expirer ou etre retiree entre le Pack et le declenchement.
    """
    if not _ready():
        return {"ok": False, "error": "Stripe non configuré."}
    r = supabase.table("users").select("stripe_customer_id").eq("telegram_id", telegram_id).execute()
    cust = r.data[0].get("stripe_customer_id") if r.data else None
    if not cust:
        return {"ok": True, "carte": None, "abonnement": None}
    try:
        pms = stripe.Customer.list_payment_methods(cust, type="card", limit=1)
        carte = None
        if pms.data:
            c = pms.data[0].card
            carte = {"marque": c.brand, "fin": c.last4,
                     "expire": f"{c.exp_month:02d}/{c.exp_year}"}
        subs = stripe.Subscription.list(customer=cust, status="all", limit=1)
        abo = subs.data[0].status if subs.data else None
        return {"ok": True, "carte": carte, "abonnement": abo}
    except Exception as e:
        logger.error(f"carte_enregistree: {e}")
        return {"ok": False, "error": "Lecture Stripe impossible."}


def demarrer_abonnement(telegram_id: str, devise: str = None) -> dict:
    """Declenche l'abonnement Pro sur la carte laissee au paiement du Pack.

    C'est le geste que fait l'equipe quand le parametrage est livre. Aucun
    essai : ce client a paye, il entre directement en facturation.

    Le prelevement a lieu hors la presence du client (`off_session`). La
    plupart des banques l'acceptent, la carte ayant ete authentifiee « pour un
    usage futur » au moment du Pack. Il arrive qu'une banque exige malgre tout
    une confirmation : Stripe met alors l'abonnement en « incomplete » et
    envoie lui-meme un courriel au client. On remonte ce cas tel quel plutot
    que de le presenter comme un succes.
    """
    if not _ready():
        return {"ok": False, "error": "Stripe non configuré."}
    r = (supabase.table("users").select("stripe_customer_id, email, langue, timezone")
         .eq("telegram_id", telegram_id).execute())
    if not r.data:
        return {"ok": False, "error": "Compte introuvable."}
    row = r.data[0]
    cust = row.get("stripe_customer_id")
    if not cust:
        return {"ok": False, "error": "Ce compte n'a jamais payé par Stripe — aucune carte à utiliser."}

    devise = (devise or devise_du_marche(row.get("langue"), row.get("timezone"))).lower()
    price = _price_for("pro", devise)
    if not price:
        return {"ok": False, "error": "Aucun prix d'abonnement configuré."}

    try:
        deja = stripe.Subscription.list(customer=cust, status="all", limit=10)
        vivant = next((x for x in deja.data if x.status in ("active", "trialing", "past_due", "suspended")), None)
        if vivant and vivant.status == "trialing":
            # Le cas normal depuis que l'abonnement nait avec le Pack : il
            # existe deja et attend son terme. Le bouton de l'equipe ne le cree
            # pas, il ECOURTE l'attente — le parametrage est livre, la
            # facturation peut commencer.
            sub = stripe.Subscription.modify(vivant.id, trial_end="now")
            _apply_subscription(sub)
            return {"ok": True, "status": sub.status, "devise": "—", "ecourte": True,
                    "prochain_prelevement": None}
        if vivant:
            return {"ok": False, "error": f"Ce compte a déjà un abonnement ({vivant.status})."}

        pms = stripe.Customer.list_payment_methods(cust, type="card", limit=1)
        if not pms.data:
            return {"ok": False, "error": "Aucune carte enregistrée sur ce client. "
                                          "Le Pack a probablement été réglé avant la mise en place "
                                          "de l'enregistrement de carte : envoie-lui un lien d'abonnement."}
        pm = pms.data[0].id

        sub = stripe.Subscription.create(
            customer=cust,
            items=[{"price": price}],
            default_payment_method=pm,
            off_session=True,
            metadata={"telegram_id": str(telegram_id), "origine": "pack_fondations"},
            expand=["latest_invoice.payment_intent"],
        )
    except Exception as e:
        logger.error(f"demarrer_abonnement {telegram_id}: {e}")
        return {"ok": False, "error": f"Stripe a refusé : {str(e)[:160]}"}

    _apply_subscription(sub)
    # La date de fin de periode a migre a la racine vers les ITEMS dans les
    # versions recentes de l'API : lue au mauvais endroit, elle vaut None et
    # le back-office affiche « prochain prelevement : jamais ».
    fin = sub.get("current_period_end")
    if fin is None:
        items = (sub.get("items") or {}).get("data") or []
        fin = items[0].get("current_period_end") if items else None
    return {"ok": True, "status": sub.status, "devise": devise.upper(),
            "prochain_prelevement": fin}


def sync_subscription(telegram_id: str) -> dict:
    """Filet de sécurité : relit l'abonnement Stripe du compte et l'applique (au retour du checkout
    ou si un webhook a été manqué). Marche en local sans Stripe CLI."""
    if not _ready():
        return {"ok": False, "error": "Stripe non configuré."}
    u = supabase.table("users").select("stripe_customer_id").eq("telegram_id", telegram_id).execute()
    cust = u.data[0].get("stripe_customer_id") if u.data else None
    if not cust:
        return {"ok": True, "synced": False}
    try:
        subs = stripe.Subscription.list(customer=cust, status="all", limit=1)
        if subs.data:
            _apply_subscription(subs.data[0])
            return {"ok": True, "synced": True, "status": subs.data[0].get("status")}
        return {"ok": True, "synced": False}
    except Exception as e:
        logger.error(f"sync_subscription error: {e}")
        return {"ok": False, "error": "Synchronisation impossible."}


def _apply_pack(session: dict):
    """Crédite le quota acheté (extra) sur la période courante du compte."""
    meta = session.get("metadata") or {}
    tg, action = meta.get("telegram_id"), meta.get("action_type")
    try:
        qty = int(meta.get("quantity") or 0)
    except Exception:
        qty = 0
    if not (tg and action and qty > 0):
        return
    sub = (supabase.table("subscriptions").select("id").eq("user_id", tg)
           .in_("status", ["trialing", "active", "past_due", "suspended"]).order("created_at", desc=True).limit(1).execute())
    if not sub.data:
        logger.warning(f"pack: aucun abonnement pour {tg}")
        return
    supabase.rpc("add_extra_quota", {"p_sub": sub.data[0]["id"], "p_action": action, "p_qty": qty}).execute()
    logger.info(f"pack: +{qty} {action} pour {tg}")


def _uid_by_customer(customer: str):
    if not customer:
        return None
    try:
        r = supabase.table("users").select("telegram_id").eq("stripe_customer_id", customer).limit(1).execute()
        return r.data[0]["telegram_id"] if r.data else None
    except Exception:
        return None


def _raison_echec_paiement(invoice_id: str) -> str | None:
    """Le motif exact du refus (ex. carte insuffisante, expirée...), pour l'email admin.

    Depuis la refonte Invoices de l'API Stripe, l'objet invoice ne porte plus
    directement `charge`/`payment_intent` : il faut redemander l'invoice sur une
    version d'API antérieure pour retrouver le charge, puis lire son échec dessus.
    """
    if not invoice_id:
        return None
    try:
        inv = stripe.Invoice.retrieve(invoice_id, stripe_version="2024-06-20")
        charge_id = inv.get("charge")
        if not charge_id:
            return None
        ch = stripe.Charge.retrieve(charge_id)
        return ch.get("failure_message") or ch.get("failure_code")
    except Exception as e:
        logger.warning(f"raison echec paiement {invoice_id}: {e}")
        return None


def _deja_traite(event_id: str, etype: str) -> bool:
    """Insère l'événement dans evenements_stripe ; True si l'id y était déjà
    (doublon Stripe). Une erreur technique (table absente…) laisse passer : on
    préfère un doublon rare à un webhook bloqué."""
    if not event_id:
        return False
    try:
        supabase.table("evenements_stripe").insert({"stripe_event_id": event_id, "type": etype}).execute()
        return False
    except Exception as e:
        msg = str(e)
        if "23505" in msg or "duplicate" in msg.lower() or "already exists" in msg.lower():
            logger.info(f"stripe webhook: doublon ignoré {event_id} ({etype})")
            return True
        logger.warning(f"stripe webhook: idempotence indisponible ({e})")
        return False


def _client_impaye_payload(uid: str, lien_facture: str = None):
    """Infos pour le mail 1 (échec de prélèvement) au CLIENT : lien direct de
    régularisation (la facture hébergée Stripe si on l'a, sinon Paramètres)."""
    from config import FRONTEND_URL
    try:
        r = supabase.table("users").select("nom, email").eq("telegram_id", uid).limit(1).execute()
        u = r.data[0] if r.data else {}
    except Exception:
        u = {}
    if not u.get("email"):
        return None
    return {"nom": u.get("nom"), "email": u["email"],
            "lien": lien_facture or f"{FRONTEND_URL}/dashboard/parametres?s=abonnement"}


def _notify_payload(uid: str, kind: str, extra=None):
    """Infos pour l'email admin (envoyé par la route, en async)."""
    if not uid:
        return None
    try:
        r = supabase.table("users").select("nom, email").eq("telegram_id", uid).limit(1).execute()
        u = r.data[0] if r.data else {}
    except Exception:
        u = {}
    # Le forfait se lit dans subscriptions (source de vérité depuis la normalisation).
    from services import admin_service
    plan = admin_service._champs_abonnement(admin_service._abonnements().get(uid)).get("plan")
    return {"kind": kind, "nom": u.get("nom"), "email": u.get("email"), "plan": plan, "extra": extra}


def _facture_payload(uid: str, montant_cents: int, devise: str, libelle: str,
                     numero: str = None, url: str = None, pdf: str = None):
    """Infos pour l'email FACTURE envoyé au client (par la route, en async).
    None si le client est introuvable, sans email, ou si le montant est nul (essai)."""
    if not uid or not montant_cents:
        return None
    try:
        r = supabase.table("users").select("nom, email").eq("telegram_id", uid).limit(1).execute()
        u = r.data[0] if r.data else {}
    except Exception:
        u = {}
    if not u.get("email"):
        return None
    return {
        "nom": u.get("nom"), "email": u["email"],
        "montant": montant_cents / 100, "devise": (devise or "eur").upper(),
        "libelle": libelle, "numero": numero, "url": url, "pdf": pdf,
    }


def _commission(type_: str, ref_id, montant_cents, devise, telegram_id=None,
                email=None, libelle=None, code_affilie=None):
    """Cree la commission d'affiliation liee a un encaissement.

    Isole et silencieux : une erreur d'affiliation ne doit jamais empecher
    l'activation d'un abonnement ni l'envoi d'une facture.
    """
    try:
        from services import affiliation_service
        affiliation_service.creer_commission(
            type_, ref_id, montant_cents, devise, telegram_id=telegram_id,
            email=email, libelle=libelle, code_force=code_affilie)
    except Exception as e:
        logger.warning(f"commission affiliation ignoree ({ref_id}): {e}")


def _abonnement_apres_pack(customer: str, telegram_id: str = None, email: str = None) -> None:
    """Cree l'abonnement Pro des l'encaissement du Pack, premier prelevement differe.

    C'est STRIPE qui tient le compteur, pas nous. Un minuteur cote serveur —
    une boucle quotidienne qui cherche les Packs a echeance — dependrait de
    notre disponibilite : Railway qui redemarre, et la facturation glisse.
    Ici, l'abonnement existe des le premier jour et Stripe preleve au terme,
    que nous soyons la ou non.

    Le mot « essai » n'est qu'un mecanisme : ce n'est pas une periode gratuite,
    c'est un abonnement dont le premier paiement attend la livraison du
    parametrage. Le client a deja paye son Pack.

    L'equipe peut ecourter ce delai a tout moment depuis la fiche client
    (`demarrer_abonnement`), le jour ou le parametrage est livre.
    """
    if not customer or PACK_DELAI_JOURS <= 0:
        return
    try:
        # Un abonnement vivant : on ne double pas.
        deja = stripe.Subscription.list(customer=customer, status="all", limit=10)
        if any(x.status in ("active", "trialing", "past_due", "suspended") for x in deja.data):
            return

        # La carte laissee au paiement du Pack. Sans elle, rien a prelever au
        # terme : on s'arrete la plutot que de creer un abonnement mort-ne.
        pms = stripe.Customer.list_payment_methods(customer, type="card", limit=1)
        if not pms.data:
            logger.warning(f"Pack paye sans carte enregistree ({customer}) — abonnement non cree")
            return

        row = {}
        if telegram_id or email:
            q = supabase.table("users").select("telegram_id, langue, timezone")
            q = q.eq("telegram_id", telegram_id) if telegram_id else q.eq("email", (email or "").lower())
            r = q.execute()
            row = r.data[0] if r.data else {}
        devise = devise_du_marche(row.get("langue"), row.get("timezone"))

        sub = stripe.Subscription.create(
            customer=customer,
            items=[{"price": _price_for("pro", devise)}],
            default_payment_method=pms.data[0].id,
            trial_period_days=PACK_DELAI_JOURS,
            metadata={"telegram_id": str(row.get("telegram_id") or telegram_id or ""),
                      "origine": "pack_fondations"},
        )
        _apply_subscription(sub)
        logger.info(f"Abonnement cree apres le Pack ({customer}) — premier prelevement "
                    f"dans {PACK_DELAI_JOURS} jours, en {devise.upper()}")
    except Exception as e:
        logger.error(f"_abonnement_apres_pack {customer}: {e}")


def _rappel_payload(sub: dict) -> dict | None:
    """Ce qu'il faut pour ecrire le rappel J-3, lu sur l'abonnement Stripe.

    Le montant vient du PRIX de l'abonnement, pas d'une constante : le client
    latino-americain paie 140 USD, l'europeen 279 EUR, et un rappel qui
    annoncerait le mauvais montant vaudrait mieux ne pas etre envoye.

    `origine` distingue les deux parcours : on ne dit pas « ton essai se
    termine » a quelqu'un qui a deja regle 1 499 EUR de Pack.
    """
    uid = _uid_by_customer(sub.get("customer"))
    if not uid:
        return None
    try:
        u = (supabase.table("users").select("email, nom").eq("telegram_id", uid).execute())
        if not u.data or not u.data[0].get("email"):
            return None
        items = (sub.get("items") or {}).get("data") or []
        prix = (items[0].get("price") or {}) if items else {}
        fin = sub.get("trial_end")
        return {
            "email": u.data[0]["email"],
            "nom": u.data[0].get("nom"),
            "montant": (prix.get("unit_amount") or 0) / 100,
            "devise": (prix.get("currency") or "eur").upper(),
            "date": datetime.fromtimestamp(fin, tz=timezone.utc).strftime("%d/%m/%Y") if fin else "",
            "apres_pack": (sub.get("metadata") or {}).get("origine") == "pack_fondations",
        }
    except Exception as e:
        logger.warning(f"_rappel_payload: {e}")
        return None


RAISONS = {"prix", "temps", "resultats", "complexite", "fonctionnalite",
           "concurrent", "test", "autre"}
PAUSE_MOIS_MAX = 3


def ouvrir_parcours(telegram_id: str, raison: str, commentaire: str = None) -> dict:
    """Enregistre la raison DES QU'ELLE EST DONNEE, avant toute decision.

    C'est le coeur du dispositif, et il etait manquant. Le journal n'ecrivait
    qu'au moment de la decision finale — resiliation, remise, pause. Quelqu'un
    qui cochait « trop cher », ecrivait un commentaire, puis cliquait « Rester
    actif » ne laissait AUCUNE trace : il venait pourtant de dire pourquoi il
    avait voulu partir, et il est encore client, ce qui rend l'information
    d'autant plus utile.

    La ligne nait donc « entamee » et son issue est mise a jour ensuite. Le
    compte des parcours entames devient exact du meme coup — il ne comptait
    jusqu'ici que ceux qui avaient pris une offre, et flattait mecaniquement le
    taux de retention.
    """
    if raison not in RAISONS:
        raison = "autre"
    try:
        r = supabase.table("resiliations").insert({
            "telegram_id": telegram_id, "raison": raison,
            "commentaire": (commentaire or "").strip()[:2000] or None,
            "issue": "entamee",
        }).execute()
        return {"ok": True, "id": (r.data or [{}])[0].get("id")}
    except Exception as e:
        logger.warning(f"ouverture du parcours ({telegram_id}) : {e}")
        return {"ok": True, "id": None}   # jamais bloquant


def _journal_depart(telegram_id: str, raison: str, commentaire: str = None,
                    issue: str = "partie", detail: str = None, fin=None,
                    parcours: str = None) -> None:
    """Note l'issue du parcours : partie, retenue, pause.

    Met a jour la ligne ouverte a l'ecran de la raison quand on en connait
    l'identifiant ; en cree une sinon — un appel direct a l'API, ou un parcours
    dont l'ouverture a echoue, ne doit pas disparaitre des statistiques.

    Une erreur ici ne doit jamais empecher la resiliation. Retenir quelqu'un
    parce qu'on n'a pas su ecrire la raison de son depart serait le comble.
    """
    champs = {"issue": issue, "detail": detail, "fin_acces_le": fin}
    try:
        if parcours:
            supabase.table("resiliations").update(champs) \
                .eq("id", parcours).eq("telegram_id", telegram_id).execute()
            return
        supabase.table("resiliations").insert({
            "telegram_id": telegram_id, "raison": raison or "autre",
            "commentaire": (commentaire or "").strip()[:2000] or None,
            **champs,
        }).execute()
    except Exception as e:
        logger.warning(f"journal de depart ({telegram_id}) : {e}")


def _abonnement_courant(telegram_id: str):
    """(ligne locale, abonnement Stripe) de l'abonnement vivant du compte."""
    r = (supabase.table("subscriptions").select("*").eq("user_id", telegram_id)
         .in_("status", ["active", "trialing", "past_due", "suspended"])
         .order("created_at", desc=True).limit(1).execute())
    if not r.data:
        return None, None
    ligne = r.data[0]
    sid = ligne.get("stripe_subscription_id")
    if not sid or not _ready():
        return ligne, None
    try:
        return ligne, stripe.Subscription.retrieve(sid)
    except Exception as e:
        logger.error(f"lecture abonnement {sid}: {e}")
        return ligne, None


def resilier(telegram_id: str, raison: str, commentaire: str = None,
             parcours: str = None) -> dict:
    """Arrete le renouvellement. L'acces reste ouvert jusqu'au terme deja paye.

    On ne supprime rien et on ne coupe rien tout de suite : la periode a ete
    reglee, elle est due. C'est aussi ce qui laisse une porte ouverte — une
    reactivation avant le terme ne coute qu'un clic.
    """
    ligne, sub = _abonnement_courant(telegram_id)
    if not ligne:
        return {"ok": False, "error": "Aucun abonnement à résilier."}
    if raison not in RAISONS:
        raison = "autre"

    fin = ligne.get("current_period_end")
    if sub:
        try:
            maj = stripe.Subscription.modify(sub.id, cancel_at_period_end=True)
            fin = _ts(maj.get("cancel_at")) or fin
            _apply_subscription(maj)
        except Exception as e:
            logger.error(f"resiliation {telegram_id}: {e}")
            return {"ok": False, "error": "Résiliation impossible pour le moment."}
    else:
        # Abonnement local (aucun identifiant Stripe) : on le termine chez nous.
        try:
            supabase.table("subscriptions").update({"status": "canceled"}) \
                .eq("id", ligne["id"]).execute()
        except Exception as e:
            logger.error(f"resiliation locale {telegram_id}: {e}")
            return {"ok": False, "error": "Résiliation impossible pour le moment."}

    _journal_depart(telegram_id, raison, commentaire, issue="partie", fin=fin,
                    parcours=parcours)
    return {"ok": True, "fin_acces_le": fin}


def mettre_en_pause(telegram_id: str, mois: int, raison: str = None,
                    commentaire: str = None, parcours: str = None) -> dict:
    """Suspend la facturation ET l'acces, pour un a trois mois.

    L'acces est suspendu : sans cela, la pause serait un abonnement gratuit et
    tout le monde la choisirait. La configuration, le ton de marque et les
    gabarits sont conserves — c'est tout l'interet par rapport a une
    resiliation.
    """
    mois = max(1, min(PAUSE_MOIS_MAX, int(mois or 1)))
    ligne, sub = _abonnement_courant(telegram_id)
    if not ligne:
        return {"ok": False, "error": "Aucun abonnement à mettre en pause."}
    if not sub:
        return {"ok": False, "error": "Pause indisponible sur cet abonnement."}

    reprise = datetime.now(timezone.utc) + timedelta(days=30 * mois)
    try:
        stripe.Subscription.modify(sub.id, pause_collection={
            "behavior": "void", "resumes_at": int(reprise.timestamp())})
    except Exception as e:
        logger.error(f"pause {telegram_id}: {e}")
        return {"ok": False, "error": "Mise en pause impossible pour le moment."}

    try:
        supabase.table("subscriptions").update({"pause_jusqu_au": reprise.isoformat()}) \
            .eq("id", ligne["id"]).execute()
    except Exception as e:
        # La colonne manque (migration non passee) : Stripe a deja suspendu la
        # facturation, mais nous ne saurions pas bloquer l'acces. On revient en
        # arriere plutot que d'offrir le produit.
        logger.error(f"pause : colonne pause_jusqu_au absente ({e}) — annulation")
        try:
            stripe.Subscription.modify(sub.id, pause_collection="")
        except Exception:
            pass
        return {"ok": False, "error": "Pause indisponible (configuration incomplète)."}

    _journal_depart(telegram_id, raison or "autre", commentaire,
                    issue="pause", detail=f"{mois} mois", fin=reprise.isoformat(),
                    parcours=parcours)
    return {"ok": True, "reprise_le": reprise.isoformat(), "mois": mois}


def noter_retenue(telegram_id: str, parcours: str, detail: str = None) -> dict:
    """Le parcours s'arrete parce que la personne RESTE, sans prendre d'offre.

    Cas le plus frequent apres la remise, et le plus silencieux : elle ferme la
    fenetre et continue. Sans cette note, sa raison resterait « entamee » pour
    toujours et on la compterait comme indecise alors qu'elle est restee.
    """
    _journal_depart(telegram_id, None, None, issue="retenue", detail=detail,
                    parcours=parcours)
    return {"ok": True}


def reprendre(telegram_id: str) -> dict:
    """Reprend un compte en pause, ou annule une resiliation programmee.

    Un seul geste pour les deux : de l'endroit ou se tient le client, « je
    reviens » ne se decline pas en deux boutons selon l'etat technique.
    """
    ligne, sub = _abonnement_courant(telegram_id)
    if not ligne:
        return {"ok": False, "error": "Aucun abonnement à reprendre."}
    if sub:
        try:
            stripe.Subscription.modify(sub.id, pause_collection="",
                                       cancel_at_period_end=False)
        except Exception as e:
            logger.error(f"reprise {telegram_id}: {e}")
            return {"ok": False, "error": "Reprise impossible pour le moment."}
    try:
        supabase.table("subscriptions").update({"pause_jusqu_au": None}) \
            .eq("id", ligne["id"]).execute()
    except Exception as e:
        logger.warning(f"reprise (colonne pause) {telegram_id}: {e}")
    return {"ok": True}


def handle_webhook(payload_bytes: bytes, signature: str) -> dict:
    if not _ready():
        return {"ok": False}
    # Fail-closed : sans secret configuré, on REFUSE (jamais de payload non signé -> pas de faux abo).
    if not STRIPE_WEBHOOK_SECRET:
        logger.error("stripe webhook reçu mais STRIPE_WEBHOOK_SECRET absent -> rejeté")
        return {"ok": False, "error": "webhook non configuré"}
    try:
        event = stripe.Webhook.construct_event(payload_bytes, signature, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.warning(f"stripe webhook signature invalide: {e}")
        return {"ok": False, "error": "bad signature"}

    etype = event["type"]
    # Idempotence : Stripe rejoue légitimement un événement. Un doublon ne doit ni
    # créditer, ni notifier, ni suspendre deux fois -> 200 et on s'arrête là.
    if _deja_traite(event.get("id"), etype):
        return {"ok": True, "event": etype, "duplicate": True}
    obj = event["data"]["object"]
    canceled_uid = None  # à déconnecter (abo terminé) -> géré async par la route
    client_impaye = None  # mail 1 (échec de prélèvement) au client -> envoyé par la route
    notify = None        # {"kind","nom","email",...} -> email admin envoyé par la route (async)
    facture = None       # {"email","montant",...} -> email facture CLIENT envoyé par la route (async)
    rappel = None        # {"email","montant","date",...} -> rappel J-3 au CLIENT (async)
    try:
        if etype == "checkout.session.completed":
            meta = obj.get("metadata") or {}
            if meta.get("pack_id"):
                _apply_pack(obj)                       # achat de pack (one-time)
                notify = _notify_payload(meta.get("telegram_id"), "pack", meta.get("action_type"))
                # Reçu client : les packs (paiement one-time) n'ont pas de facture Stripe,
                # on envoie le reçu depuis la session.
                facture = _facture_payload(meta.get("telegram_id"), obj.get("amount_total"),
                                           obj.get("currency"), f"Pack {meta.get('action_type') or 'crédits'}")
            elif (meta.get("produit") or "").lower() in ("fondations", "pack_fondations"):
                # Pack Fondations paye par lien Stripe : commission setup (25 %).
                # Le code de l'affilie est depose dans la metadata du lien ;
                # sinon on retombe sur le parrain connu du client.
                _commission("setup", obj.get("id"), obj.get("amount_total"),
                            obj.get("currency"), meta.get("telegram_id"),
                            (obj.get("customer_details") or {}).get("email"),
                            "Pack Fondations", meta.get("affilie"))
                # Le client Stripe est rattache au compte : c'est lui qui porte
                # la carte enregistree, et sans ce lien on ne saurait plus a qui
                # elle appartient au moment de declencher l'abonnement.
                _lier_client_stripe(meta.get("telegram_id"),
                                    (obj.get("customer_details") or {}).get("email"),
                                    obj.get("customer"))
                # L'abonnement demarre ici, avec son premier prelevement
                # differe. Stripe tient le compteur a partir de maintenant.
                _abonnement_apres_pack(obj.get("customer"), meta.get("telegram_id"),
                                       (obj.get("customer_details") or {}).get("email"))
                facture = _facture_payload(meta.get("telegram_id"), obj.get("amount_total"),
                                           obj.get("currency"), "Pack Fondations")
            elif obj.get("subscription"):
                # active l'abo tout de suite ; la notif "nouvel abonnement" est gérée
                # par customer.subscription.created (évite le doublon + ne dépend pas de cet event).
                _apply_subscription(stripe.Subscription.retrieve(obj["subscription"]))
        elif etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
            res = _apply_subscription(obj)
            if res:
                if etype == "customer.subscription.created" and res.get("status") in ("active", "trialing"):
                    notify = _notify_payload(res["uid"], "new_sub", res.get("status"))
                elif res.get("status") == "canceled":
                    canceled_uid = res["uid"]          # fin de cycle -> on libère les réseaux Late
                    notify = _notify_payload(res["uid"], "canceled")
                elif res.get("newly_canceling"):       # résiliation PROGRAMMÉE (actif jusqu'à la fin)
                    end = (res.get("cancel_at") or "")[:10]
                    notify = _notify_payload(res["uid"], "canceling", f"Fin le {end} · raison : {_cancel_reason(obj)}")
        elif etype == "invoice.payment_succeeded":
            # Facture d'abonnement payée (1er paiement ET renouvellements mensuels)
            # -> email au client avec lien Stripe + PDF. Montant nul (essai) : pas d'envoi.
            lignes = ((obj.get("lines") or {}).get("data") or [])
            libelle = (lignes[0].get("description") if lignes else None) or "Abonnement Postorico"
            uid = _uid_by_customer(obj.get("customer"))
            # Commission recurrente (10 %) : a chaque mensualite encaissee, tant
            # que le client reste. Le montant suit la devise de la facture.
            _commission("recurrent", obj.get("id"), obj.get("amount_paid"),
                        obj.get("currency"), uid, obj.get("customer_email"), libelle)
            facture = _facture_payload(
                uid, obj.get("amount_paid"), obj.get("currency"),
                libelle, numero=obj.get("number"),
                url=obj.get("hosted_invoice_url"), pdf=obj.get("invoice_pdf"))
        elif etype == "customer.subscription.trial_will_end":
            # Stripe previent trois jours avant le premier prelevement. On s'y
            # branche plutot que de tenir notre propre minuteur : c'est la meme
            # raison qui nous a fait confier le compteur a Stripe.
            rappel = _rappel_payload(obj)
        elif etype == "invoice.paid":
            # Le SEUL chemin qui ramène un compte impayé à « actif » : un
            # encaissement effectif. Jamais une date, jamais un cron.
            uid = _uid_by_customer(obj.get("customer"))
            if uid:
                from services import impaye_service
                reprise = impaye_service.regulariser(uid)
                if reprise.get("changement"):
                    logger.info(f"stripe: {uid} régularisé (reconnexion à faire: {reprise.get('reconnexion')})")
                    if reprise.get("etait_suspendu"):
                        try:
                            from services import notification_service
                            notification_service.notifier(
                                uid, None, None, "billing.regularise", "Paiement reçu, merci",
                                "Ton compte est de nouveau actif. Reconnecte tes réseaux pour reprendre la publication.",
                                type_="facturation")
                        except Exception as e:
                            logger.warning(f"stripe: notification reprise {uid}: {e}")
        elif etype == "invoice.payment_failed":
            raison = _raison_echec_paiement(obj.get("id"))
            uid = _uid_by_customer(obj.get("customer"))
            notify = _notify_payload(uid, "payment_failed", raison)
            if uid:
                # Cran 1 : le compte passe en grâce (génération bloquée), impaye_depuis
                # posé au PREMIER échec seulement. Mail 1 au client, une seule fois.
                from services import impaye_service
                echec = impaye_service.marquer_echec(uid)
                if echec.get("premier_echec"):
                    client_impaye = _client_impaye_payload(uid, obj.get("hosted_invoice_url"))
    except Exception as e:
        logger.error(f"stripe webhook handle error: {e}")
    return {"ok": True, "event": etype, "canceled_uid": canceled_uid, "notify": notify, "client_impaye": client_impaye,
            "facture": facture, "rappel": rappel}
