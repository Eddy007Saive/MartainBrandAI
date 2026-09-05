"""Gestion des impayés : on coupe les coûts variables dans l'ordre inverse de
leur réversibilité, sans perdre le client.

    actif (active/trialing) ──(invoice.payment_failed)──> grâce (past_due)
    grâce ──(invoice.paid)────────────────────────────────> actif
    grâce ──(J+10, cron)──────────────────────────────────> suspendu (suspended)
    suspendu ──(invoice.paid)─────────────────────────────> actif + reconnexion guidée
    suspendu ──(J+30, cron)───────────────────────────────> résilié (canceled)

- Cran 1, immédiat : la génération IA est bloquée (quota_service.consume refuse
  « impaye »). Le client garde tout le reste : lecture, calendrier, et ce qui
  était déjà validé continue de se publier.
- Cran 2, J+10 : sauvegarde des réseaux, annulation des publications
  programmées, déconnexion Zernio (le prorata journalier s'arrête le jour même).
- Cran 3, J+30 : résiliation de l'abonnement Stripe.

L'état vit dans `subscriptions.status` (déjà pilote des quotas) ; les crans
sont pilotés par NOTRE colonne `impaye_depuis`, jamais par le statut Stripe :
la séquence de relance Stripe est configurable, notre calendrier n'en dépend pas.
Règle absolue : on ne revient à « actif » que sur un encaissement (invoice.paid),
jamais sur une date ou un cron.

Exception : le plan « Boss » (comptes internes) est hors de tout ce mécanisme.
Un échec de paiement Stripe sur un Boss est journalisé mais n'entame rien.
"""
from datetime import datetime, timezone

from fastapi import HTTPException

from config import supabase, logger, FRONTEND_URL, ADMIN_NOTIF_EMAIL, STRIPE_SECRET_KEY
from services import quota_service

STATUTS_VIVANTS = ("trialing", "active", "past_due", "suspended")
J_AVERTISSEMENT = 9     # mail 2 : la veille de la coupure
J_SUSPENSION = 10       # cran 2
J_DERNIER_AVIS = 29     # mail 4
J_RESILIATION = 30      # cran 3

LIEN_ABONNEMENT = f"{FRONTEND_URL}/dashboard/parametres?s=abonnement"
LIEN_RESEAUX = f"{FRONTEND_URL}/dashboard/parametres?s=connections"

RAISON_SUSPENSION = ("Paiement en attente : tes réseaux ont été déconnectés, la publication a été "
                     "annulée. Régularise ton paiement, reconnecte tes réseaux puis clique "
                     "« Réessayer » pour la reprogrammer.")


def _now():
    return datetime.now(timezone.utc)


def _sub(telegram_id: str) -> dict | None:
    r = (supabase.table("subscriptions").select("*").eq("user_id", telegram_id)
         .in_("status", list(STATUTS_VIVANTS)).order("created_at", desc=True).limit(1).execute())
    return r.data[0] if r.data else None


def _client(telegram_id: str) -> dict:
    try:
        r = supabase.table("users").select("nom, email").eq("telegram_id", telegram_id).limit(1).execute()
        return r.data[0] if r.data else {}
    except Exception:
        return {}


def _oublier_demarrage(telegram_id: str) -> None:
    try:
        from services import demarrage_service
        demarrage_service.oublier(telegram_id)
    except Exception:
        pass


def etat_facturation(telegram_id: str) -> str:
    """actif / grace / suspendu / resilie / aucun, dérivé de subscriptions.status."""
    s = _sub(telegram_id)
    if s and quota_service.est_boss(telegram_id):
        return "actif"
    if not s:
        # Plus d'abonnement vivant : résilié (il en a eu un) ou jamais abonné.
        r = supabase.table("subscriptions").select("id").eq("user_id", telegram_id).limit(1).execute()
        return "resilie" if r.data else "aucun"
    return {"active": "actif", "trialing": "actif", "past_due": "grace", "suspended": "suspendu"}.get(s["status"], "resilie")


# ------------------------------------------------------------------ cran 1
def marquer_echec(telegram_id: str) -> dict:
    """invoice.payment_failed : premier échec -> impaye_depuis = maintenant ; les
    échecs suivants (relances Stripe) ne le réinitialisent pas. Un compte déjà
    suspendu le reste (ne pas le « remonter » en grâce)."""
    s = _sub(telegram_id)
    if not s:
        return {"premier_echec": False, "statut": None}
    if quota_service.est_boss(telegram_id):
        logger.info(f"impayé: {telegram_id} est Boss, échec Stripe ignoré")
        return {"premier_echec": False, "statut": s["status"], "boss": True}
    premier = not s.get("impaye_depuis")
    row = {}
    if s["status"] in ("active", "trialing"):
        row["status"] = "past_due"
    if premier:
        row["impaye_depuis"] = _now().isoformat()
    if row:
        supabase.table("subscriptions").update(row).eq("id", s["id"]).execute()
        _oublier_demarrage(telegram_id)
    logger.info(f"impayé: {telegram_id} -> grâce (premier échec: {premier})")
    return {"premier_echec": premier, "statut": row.get("status") or s["status"]}


def regulariser(telegram_id: str) -> dict:
    """invoice.paid : le SEUL chemin vers « actif ». Efface l'épisode d'impayé.
    Si le compte était suspendu, ses réseaux sauvegardés attendent la
    reconnexion guidée (reseaux_sauvegardes.retabli_le IS NULL)."""
    s = _sub(telegram_id)
    if not s or (s["status"] in ("active", "trialing") and not s.get("impaye_depuis")):
        return {"changement": False}
    etait_suspendu = s["status"] == "suspended"
    row = {"impaye_depuis": None, "suspendu_le": None, "impaye_mail2_le": None, "impaye_mail4_le": None}
    if s["status"] in ("past_due", "suspended"):
        row["status"] = "active"
    supabase.table("subscriptions").update(row).eq("id", s["id"]).execute()
    _oublier_demarrage(telegram_id)
    logger.info(f"impayé: {telegram_id} régularisé (était suspendu: {etait_suspendu})")
    return {"changement": True, "etait_suspendu": etait_suspendu,
            "reconnexion": [r["plateforme"] for r in sauvegardes_en_attente(telegram_id)]}


# ------------------------------------------------------------------ cran 2
def sauvegardes_en_attente(telegram_id: str) -> list:
    try:
        r = (supabase.table("reseaux_sauvegardes").select("id, plateforme, late_account_id, nom_affiche, deconnecte_le")
             .eq("telegram_id", telegram_id).is_("retabli_le", "null").order("deconnecte_le").execute())
        return r.data or []
    except Exception as e:
        logger.warning(f"sauvegardes_en_attente {telegram_id}: {e}")
        return []


async def suspendre(telegram_id: str) -> dict:
    """Cran 2. Ordre imposé : sauvegarder, annuler les publications, revérifier
    l'état (un paiement peut arriver pendant le cron), déconnecter, puis
    seulement marquer suspendu. Un réseau qui refuse de se déconnecter laisse
    le compte en grâce (on réessaie au prochain cron) et remonte une alerte :
    un compte à moitié suspendu continue de nous coûter."""
    from services import social_service, mail_service, notification_service

    s = _sub(telegram_id)
    if not s or s["status"] != "past_due":
        return {"ok": False, "raison": "etat", "statut": s and s["status"]}

    comptes = social_service.comptes(telegram_id)          # {plateforme: late_account_id}
    deja = {r["plateforme"] for r in sauvegardes_en_attente(telegram_id)}
    for plateforme, account_id in comptes.items():
        if plateforme in deja:
            continue
        # Écrit et committé AVANT toute déconnexion : si le process plante après,
        # on sait encore ce que le client avait.
        supabase.table("reseaux_sauvegardes").insert({
            "telegram_id": telegram_id, "plateforme": plateforme, "late_account_id": account_id,
        }).execute()

    try:
        await social_service._annuler_programmations(telegram_id, raison=RAISON_SUSPENSION,
                                                     titre_notif="Paiement en attente")
    except Exception as e:
        logger.error(f"suspendre {telegram_id}: annulation des programmations: {e}")

    # Paiement arrivé entre-temps ? On ne déconnecte pas, et on efface les
    # sauvegardes posées à l'instant (les réseaux sont toujours là).
    s2 = _sub(telegram_id)
    if not s2 or s2["status"] != "past_due":
        try:
            supabase.table("reseaux_sauvegardes").delete().eq("telegram_id", telegram_id).is_("retabli_le", "null").execute()
        except Exception:
            pass
        return {"ok": False, "raison": "regularise_entre_temps"}

    echecs = []
    for plateforme, account_id in comptes.items():
        if social_service.LATE_API_KEY:
            try:
                async with social_service.Zernio(api_key=social_service.LATE_API_KEY) as client:
                    await client.accounts.adelete_account(account_id)
            except Exception as e:
                logger.warning(f"suspendre {telegram_id}/{plateforme} ({account_id}) : Late a refusé : {e}")
                echecs.append(plateforme)
                continue
        social_service.supprimer_compte(telegram_id, plateforme)

    if echecs:
        await _alerte_admin("Suspension incomplète", telegram_id,
                            f"Réseau(x) non déconnecté(s) côté Zernio : {', '.join(echecs)}. "
                            "Le compte reste en grâce, nouvel essai au prochain cron.")
        return {"ok": False, "raison": "late", "echecs": echecs}

    supabase.table("subscriptions").update({"status": "suspended", "suspendu_le": _now().isoformat()}) \
        .eq("id", s["id"]).execute()
    _oublier_demarrage(telegram_id)

    c = _client(telegram_id)
    reseaux = sorted(comptes)
    try:
        notification_service.notifier(
            telegram_id, None, None, "billing.suspended", "Réseaux déconnectés",
            "Ton paiement n'a pas été régularisé : tes réseaux ont été déconnectés. "
            "Mets à jour ta carte, puis reconnecte-les en trois clics.", type_="facturation")
    except Exception as e:
        logger.warning(f"suspendre notification {telegram_id}: {e}")
    if c.get("email"):
        try:
            sujet, html = mail_service.impaye_suspension_html(c.get("nom"), LIEN_ABONNEMENT, reseaux)
            await mail_service.send_email(c["email"], sujet, html)
        except Exception as e:
            logger.error(f"suspendre mail 3 {telegram_id}: {e}")
    logger.info(f"impayé: {telegram_id} suspendu ({len(reseaux)} réseau(x) déconnecté(s))")
    return {"ok": True, "reseaux": reseaux}


# ------------------------------------------------------------------ cran 3
def resilier(telegram_id: str) -> dict:
    """Cran 3 : résiliation immédiate côté Stripe. Le webhook
    customer.subscription.deleted fera le reste (statut canceled, email admin)."""
    s = _sub(telegram_id)
    if not s or s["status"] != "suspended":
        return {"ok": False, "raison": "etat"}
    if s.get("stripe_subscription_id") and STRIPE_SECRET_KEY:
        import stripe
        try:
            stripe.Subscription.cancel(s["stripe_subscription_id"])
        except Exception as e:
            logger.error(f"resilier {telegram_id}: Stripe a refusé : {e}")
            return {"ok": False, "raison": "stripe", "erreur": str(e)}
    supabase.table("subscriptions").update({"status": "canceled"}).eq("id", s["id"]).execute()
    _oublier_demarrage(telegram_id)
    logger.info(f"impayé: {telegram_id} résilié (J+{J_RESILIATION})")
    return {"ok": True}


# ------------------------------------------------------------------ cron
async def traiter_quotidien() -> dict:
    """Une fois par jour : lit impaye_depuis et applique les crans."""
    from services import mail_service
    try:
        r = (supabase.table("subscriptions").select("id, user_id, status, impaye_depuis, impaye_mail2_le, impaye_mail4_le")
             .not_.is_("impaye_depuis", "null").in_("status", ["past_due", "suspended"]).execute())
    except Exception as e:
        logger.error(f"impayés cron: lecture impossible: {e}")
        return {"erreur": str(e)}
    bilan = {"comptes": 0, "mail2": 0, "suspendus": 0, "mail4": 0, "resilies": 0, "echecs": 0}
    now = _now()
    for s in r.data or []:
        uid = s["user_id"]
        if quota_service.est_boss(uid):
            continue
        bilan["comptes"] += 1
        try:
            depuis = datetime.fromisoformat(str(s["impaye_depuis"]).replace("Z", "+00:00"))
            jours = (now - depuis).days
            c = _client(uid)
            if s["status"] == "past_due":
                if jours >= J_AVERTISSEMENT and not s.get("impaye_mail2_le"):
                    if c.get("email"):
                        sujet, html = mail_service.impaye_avertissement_html(c.get("nom"), LIEN_ABONNEMENT)
                        await mail_service.send_email(c["email"], sujet, html)
                    supabase.table("subscriptions").update({"impaye_mail2_le": now.isoformat()}).eq("id", s["id"]).execute()
                    bilan["mail2"] += 1
                if jours >= J_SUSPENSION:
                    res = await suspendre(uid)
                    bilan["suspendus" if res.get("ok") else "echecs"] += 1
            elif s["status"] == "suspended":
                if jours >= J_DERNIER_AVIS and not s.get("impaye_mail4_le"):
                    if c.get("email"):
                        sujet, html = mail_service.impaye_dernier_avis_html(c.get("nom"), LIEN_ABONNEMENT)
                        await mail_service.send_email(c["email"], sujet, html)
                    supabase.table("subscriptions").update({"impaye_mail4_le": now.isoformat()}).eq("id", s["id"]).execute()
                    bilan["mail4"] += 1
                if jours >= J_RESILIATION:
                    res = resilier(uid)
                    bilan["resilies" if res.get("ok") else "echecs"] += 1
        except Exception as e:
            bilan["echecs"] += 1
            logger.error(f"impayés cron {uid}: {e}")
    logger.info(f"impayés cron: {bilan}")
    return bilan


# ------------------------------------------------------------------ reprise
def reconnexion(telegram_id: str) -> dict:
    """Pour l'écran de reconnexion guidée : ce que le client avait, pas encore
    reconnecté. `a_afficher` seulement une fois le paiement régularisé."""
    etat = etat_facturation(telegram_id)
    en_attente = sauvegardes_en_attente(telegram_id)
    return {"etat": etat, "reseaux": en_attente, "a_afficher": etat == "actif" and bool(en_attente)}


def marquer_retabli(telegram_id: str, plateforme: str, abandonne: bool = False) -> None:
    """Le réseau vient d'être reconnecté (ou ignoré par le client)."""
    try:
        (supabase.table("reseaux_sauvegardes")
         .update({"retabli_le": _now().isoformat(), "abandonne": abandonne})
         .eq("telegram_id", telegram_id).eq("plateforme", plateforme).is_("retabli_le", "null").execute())
    except Exception as e:
        logger.warning(f"marquer_retabli {telegram_id}/{plateforme}: {e}")


def exiger_reconnexion(telegram_id: str) -> None:
    """Garde des routes de génération : après une suspension régularisée, pas de
    génération tant qu'aucun réseau n'est reconnecté (sinon on produit des
    contenus que rien ne peut publier). 400 {raison: reconnexion_requise}."""
    try:
        if etat_facturation(telegram_id) != "actif":
            return
        en_attente = sauvegardes_en_attente(telegram_id)
        if not en_attente:
            return
        from services import social_service
        if social_service.comptes(telegram_id):
            return
    except Exception as e:
        logger.warning(f"exiger_reconnexion {telegram_id}: {e}")
        return
    raise HTTPException(status_code=400, detail={
        "raison": "reconnexion_requise",
        "message": "Reconnecte au moins un réseau avant de générer : rien ne pourrait être publié sinon.",
        "reseaux": [r["plateforme"] for r in en_attente],
    })


async def _alerte_admin(titre: str, telegram_id: str, detail: str) -> None:
    from services import mail_service
    c = _client(telegram_id)
    try:
        sujet, html = mail_service.admin_payment_html("payment_failed", c.get("nom"), c.get("email"),
                                                      f"{titre} : {detail}")
        await mail_service.send_email(ADMIN_NOTIF_EMAIL, f"🚨 {titre} — {c.get('nom') or telegram_id}", html)
    except Exception as e:
        logger.error(f"alerte admin impayés: {e}")
