"""
Quotas PAR TYPE d'action (remplace le système de crédits unique).
On mètre par type (subject/post/image_standard/image_pro/carousel/...), on réserve
atomiquement avant génération, on rembourse en cas d'échec, on journalise tout.
Côté client : jauge de RÉSULTATS (jamais d'euros ni de crédits).
"""
from datetime import datetime, timezone, timedelta
from config import supabase, logger

TRIAL_DAYS = 14

# Libellés client par type (résultats, jamais d'euros)
LABELS = {
    "subject": "sujets",
    "post": "posts",
    "image_standard": "images standard",
    "image_pro": "images HD",
    "carousel": "carrousels",
    "video": "vidéos",
    "story": "stories",
}


def image_action(modele: str) -> str:
    """nano2 -> image_standard ; nano3 -> image_pro."""
    return "image_pro" if modele == "nano3" else "image_standard"


def _parse(ts) -> datetime:
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


def _pro_plan_id():
    r = supabase.table("plans").select("id").eq("name", "Pro").eq("is_active", True).limit(1).execute()
    return r.data[0]["id"] if r.data else None


def _trial_plan_id():
    r = supabase.table("plans").select("id").eq("name", "Essai").eq("is_active", True).limit(1).execute()
    return r.data[0]["id"] if r.data else _pro_plan_id()


def is_paid(telegram_id: str) -> bool:
    """True si le compte a un abonnement payant actif (pas un simple essai trialing)."""
    try:
        r = supabase.table("subscriptions").select("id").eq("user_id", telegram_id).eq("status", "active").limit(1).execute()
        return bool(r.data)
    except Exception:
        return False


def peut_publier(telegram_id: str) -> bool:
    """Droit de connecter un reseau et de publier : abonnement actif OU en essai.

    A ne pas confondre avec `is_paid`, qui exige un paiement encaisse. La
    connexion d'un reseau etait reservee a ce dernier — un compte connecte
    coute chez Late, et on ne voulait pas l'offrir.

    Sauf que quelqu'un en essai a DEJA donne sa carte : il sera preleve au 15e
    jour s'il ne resilie pas. Lui interdire de connecter revient a lui faire
    essayer une moitie de produit — il genere du contenu pendant quatorze
    jours sans jamais pouvoir le publier, donc sans jamais voir ce pour quoi
    il paierait. C'est le meilleur moyen de le perdre au 14e jour.

    Le cout est borne : quatorze jours de reseau connecte pour quelqu'un qui a
    laisse sa carte. C'est le prix d'un essai qui montre le produit entier.
    """
    try:
        r = (supabase.table("subscriptions").select("id").eq("user_id", telegram_id)
             .in_("status", ["active", "trialing"]).limit(1).execute())
        return bool(r.data)
    except Exception:
        return False


# Pendant l'essai, un seul reseau. Un compte connecte coute chez Late a chaque
# jour ou il l'est ; un seul suffit a voir le produit de bout en bout —
# generer, planifier, publier, lire les commentaires. Les cinq autres se
# debloquent au premier prelevement.
RESEAUX_EN_ESSAI = 1


def statut_abonnement(telegram_id: str) -> str | None:
    """« active », « trialing », « past_due »… ou None si le compte n'a rien."""
    try:
        r = (supabase.table("subscriptions").select("status").eq("user_id", telegram_id)
             .in_("status", ["active", "trialing", "past_due"]).limit(1).execute())
        return r.data[0]["status"] if r.data else None
    except Exception:
        return None


def _raison_sans_abonnement(telegram_id: str) -> tuple[str, str]:
    """Un compte sans abonnement actif tombe dans deux cas bien différents :
    jamais abonné (on lui propose l'essai gratuit) ou déjà résilié (il a déjà
    consommé son essai — a_deja_eu_un_abonnement() l'empêche d'en reprendre un,
    donc lui promettre « 14 jours gratuits » serait faux). Le raison distinct
    permet au mur de paiement d'afficher le bon message et le bon CTA."""
    from services.billing_service import a_deja_eu_un_abonnement
    if a_deja_eu_un_abonnement(telegram_id):
        return "canceled", "Réactive ton abonnement pour continuer."
    return "no_subscription", "Ajoute ta carte pour lancer tes 14 jours d'essai."


def exiger_abonnement(telegram_id: str) -> None:
    """Mur de paiement PARTAGE : un compte SANS aucun abonnement ne peut lancer
    aucune action qui produit ou consomme. Lève un 402 { raison, message } que
    l'intercepteur du front transforme en popup (mur de paiement) — raison vaut
    no_subscription (jamais abonné) ou canceled (ex-abonné, plus d'essai offert).

    Un compte en essai (trialing), actif ou past_due passe : il a déjà donné sa
    carte. À poser en tête de tout nouvel endpoint qui produit/consomme, pour que
    TOUTES les actions ressortent le même popup — pas seulement « Générer »."""
    if statut_abonnement(telegram_id) is None:
        from fastapi import HTTPException
        raison, message = _raison_sans_abonnement(telegram_id)
        raise HTTPException(status_code=402, detail={"raison": raison, "message": message})


def reseaux_autorises(telegram_id: str) -> int | None:
    """Nombre de reseaux connectables. None = sans limite, 0 = aucun droit."""
    statut = statut_abonnement(telegram_id)
    if statut is None:
        return 0
    return RESEAUX_EN_ESSAI if statut == "trialing" else None


def ensure_subscription(telegram_id: str) -> None:
    """Pose un essai local si le compte n'a aucun abonnement.

    UNIQUEMENT quand Stripe n'est pas configure. Depuis que l'essai passe par
    Stripe avec carte, accorder ici quatorze jours gratuits sans carte serait
    une porte derobee : il suffirait de refermer la page de paiement pour
    obtenir la meme chose sans rien donner.

    Le compte sans abonnement n'est pas casse pour autant : le tableau de bord
    lit cet etat et affiche « Ajoute ta carte pour demarrer », avec un bouton
    qui renvoie vers Stripe. Rien n'est perdu, la carte est simplement due.
    """
    from config import STRIPE_SECRET_KEY
    try:
        r = supabase.table("subscriptions").select("id").eq("user_id", telegram_id).limit(1).execute()
        if r.data:
            return
        if STRIPE_SECRET_KEY:
            return
        plan_id = _trial_plan_id()
        if not plan_id:
            return
        now = datetime.now(timezone.utc)
        supabase.table("subscriptions").insert({
            "user_id": telegram_id, "plan_id": plan_id, "status": "trialing",
            "current_period_start": now.isoformat(),
            "current_period_end": (now + timedelta(days=TRIAL_DAYS)).isoformat(),
        }).execute()
    except Exception as e:
        logger.warning(f"ensure_subscription {telegram_id}: {e}")


def _message(action_type: str, reason: str, limit=None) -> str:
    label = LABELS.get(action_type, "générations")
    if reason == "no_subscription":
        # Ce compte n'a JAMAIS eu d'abonnement : il vient de s'inscrire en
        # libre-service. Lui dire « ton essai est termine » est faux et
        # decourageant — il n'a rien commence.
        return "Ajoute ta carte pour lancer tes 14 jours d'essai."
    if reason == "canceled":
        # Ex-abonne (resilie/echec de paiement abandonne) : a_deja_eu_un_abonnement()
        # lui bloque deja tout nouvel essai gratuit cote checkout, donc lui promettre
        # « 14 jours gratuits » ici serait faux.
        return "Réactive ton abonnement pour continuer."
    if reason == "expired":
        return "Ton essai est terminé. Passe à l'offre Pro pour continuer."
    if reason == "not_in_plan":
        return f"Les {label} sont inclus dans l'offre Pro."
    if reason == "quota":
        # limite == 0 -> type réservé au Pro (ex. images HD / carrousels en essai)
        if limit == 0:
            return f"Les {label} sont réservés à l'offre Pro — passe Pro pour les débloquer."
        return f"Tu as utilisé tous tes {label} de la période."
    return "Quota indisponible."


def en_pause(telegram_id: str):
    """La date de fin de pause, ou None si le compte n'est pas en pause.

    Stripe suspend la facturation SANS toucher au statut : l'abonnement reste
    « active » pendant une pause_collection. On ne peut donc pas lire cet etat
    dans `status` — sans cette colonne, un compte en pause garderait l'acces
    tout en ne payant plus.
    """
    try:
        r = (supabase.table("subscriptions").select("pause_jusqu_au").eq("user_id", telegram_id)
             .in_("status", ["active", "trialing", "past_due"]).limit(1).execute())
        return (r.data[0].get("pause_jusqu_au") if r.data else None) or None
    except Exception:
        return None   # colonne absente (migration non passee) : on ne bloque personne


def consume(telegram_id: str, action_type: str, qty: int = 1) -> dict:
    """Réserve atomiquement qty pour (compte, type). Retourne {ok, reason, message?, subscription_id, ...}."""
    ensure_subscription(telegram_id)
    # Un compte en pause ne consomme rien : il ne paie plus, il n'a plus acces.
    # Le refus est pose ICI et pas seulement dans l'interface — le mur affiche
    # a l'ecran n'empeche personne d'appeler l'API directement.
    if en_pause(telegram_id):
        return {"ok": False, "reason": "pause", "action_type": action_type, "qty": qty,
                "message": "Ton compte est en pause. Reprends-le quand tu veux, tout est conservé."}
    try:
        res = supabase.rpc("consume_quota", {"p_user": telegram_id, "p_action": action_type, "p_qty": qty}).execute()
        data = res.data if isinstance(res.data, dict) else {}
    except Exception as e:
        logger.error(f"consume_quota error: {e}")
        return {"ok": False, "reason": "error", "message": "Erreur de quota.", "action_type": action_type, "qty": qty}
    data["action_type"] = action_type
    data["qty"] = qty
    if not data.get("ok"):
        # La RPC ne distingue pas jamais-abonne / ex-abonne (elle ne voit que
        # l'absence d'abonnement actif) — affine ici, meme logique que exiger_abonnement().
        if data.get("reason") == "no_subscription":
            data["reason"], _ = _raison_sans_abonnement(telegram_id)
        data["message"] = _message(action_type, data.get("reason"), data.get("limit"))
    return data


def refund_by_user(telegram_id: str, action_type: str, qty: int = 1) -> None:
    """Rembourse un quota pour un échec ASYNC (ex. montage vidéo qui échoue plus tard),
    quand on n'a plus le ctx du consume — on retrouve l'abonnement du compte."""
    try:
        r = (supabase.table("subscriptions").select("id").eq("user_id", telegram_id)
             .in_("status", ["trialing", "active", "past_due"]).order("created_at", desc=True).limit(1).execute())
        sub_id = r.data[0]["id"] if r.data else None
        if sub_id:
            refund({"subscription_id": sub_id, "action_type": action_type, "qty": qty})
    except Exception as e:
        logger.warning(f"refund_by_user {telegram_id}/{action_type}: {e}")


def confirm(ctx: dict) -> None:
    """Journalise un succès (le débit a déjà été réservé par consume)."""
    try:
        supabase.table("usage_events").insert({
            "subscription_id": ctx.get("subscription_id"),
            "action_type": ctx.get("action_type"),
            "quantity": ctx.get("qty", 1),
            "internal_cost_cents": (ctx.get("unit_cost") or 0) * ctx.get("qty", 1),
            "status": "success",
        }).execute()
    except Exception as e:
        logger.warning(f"usage_event success: {e}")


def refund(ctx: dict) -> None:
    """Rembourse (échec de génération) + journalise."""
    if not ctx or not ctx.get("subscription_id"):
        return
    try:
        supabase.rpc("refund_quota", {"p_sub": ctx["subscription_id"], "p_action": ctx.get("action_type"), "p_qty": ctx.get("qty", 1)}).execute()
        supabase.table("usage_events").insert({
            "subscription_id": ctx["subscription_id"], "action_type": ctx.get("action_type"),
            "quantity": ctx.get("qty", 1), "status": "failed",
        }).execute()
    except Exception as e:
        logger.warning(f"refund_quota: {e}")


def usage(telegram_id: str) -> dict:
    """Jauge de résultats pour la période courante + état de l'abonnement."""
    ensure_subscription(telegram_id)
    # Matérialise les compteurs de la période (avec REPORT des restes de la période
    # précédente) pour que la jauge affiche le cumul même avant toute consommation.
    try:
        supabase.rpc("ensure_period_counters", {"p_user": telegram_id}).execute()
    except Exception as e:
        logger.warning(f"ensure_period_counters {telegram_id}: {e}")
    try:
        sub = (supabase.table("subscriptions").select("*").eq("user_id", telegram_id)
               .in_("status", ["trialing", "active", "past_due"]).order("created_at", desc=True).limit(1).execute())
        if not sub.data:
            return {"subscription": None, "gauges": []}
        s = sub.data[0]
        ps = _parse(s["current_period_start"])
        quotas = supabase.table("plan_quotas").select("action_type, included_quantity").eq("plan_id", s["plan_id"]).execute().data or []
        counters = supabase.table("usage_counters").select("action_type, used_quantity, extra_quantity, period_start").eq("subscription_id", s["id"]).execute().data or []
        cmap = {c["action_type"]: c for c in counters if abs((_parse(c["period_start"]) - ps).total_seconds()) < 5}
        gauges = []
        for q in quotas:
            at = q["action_type"]
            c = cmap.get(at, {})
            used = c.get("used_quantity", 0)
            limit = q["included_quantity"] + c.get("extra_quantity", 0)
            gauges.append({"action_type": at, "label": LABELS.get(at, at), "used": used,
                           "limit": limit, "remaining": max(0, limit - used),
                           "included": q["included_quantity"], "extra": c.get("extra_quantity", 0)})
        return {"subscription": {"status": s["status"],
                                 "current_period_end": s["current_period_end"],
                                 "cancel_at": s.get("cancel_at"),
                                 "pause_jusqu_au": s.get("pause_jusqu_au")},
                "gauges": gauges}
    except Exception as e:
        logger.error(f"usage {telegram_id}: {e}")
        return {"subscription": None, "gauges": []}
