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


def ensure_subscription(telegram_id: str) -> None:
    """Crée un essai 14 jours (plan Essai) si le compte n'a aucun abonnement."""
    try:
        r = supabase.table("subscriptions").select("id").eq("user_id", telegram_id).limit(1).execute()
        if r.data:
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
    if reason in ("no_subscription", "expired"):
        return "Ton essai est terminé. Passe à l'offre Pro pour continuer."
    if reason == "not_in_plan":
        return f"Les {label} sont inclus dans l'offre Pro."
    if reason == "quota":
        # limite == 0 -> type réservé au Pro (ex. images HD / carrousels en essai)
        if limit == 0:
            return f"Les {label} sont réservés à l'offre Pro — passe Pro pour les débloquer."
        return f"Tu as utilisé tous tes {label} de la période."
    return "Quota indisponible."


def consume(telegram_id: str, action_type: str, qty: int = 1) -> dict:
    """Réserve atomiquement qty pour (compte, type). Retourne {ok, reason, message?, subscription_id, ...}."""
    ensure_subscription(telegram_id)
    try:
        res = supabase.rpc("consume_quota", {"p_user": telegram_id, "p_action": action_type, "p_qty": qty}).execute()
        data = res.data if isinstance(res.data, dict) else {}
    except Exception as e:
        logger.error(f"consume_quota error: {e}")
        return {"ok": False, "reason": "error", "message": "Erreur de quota.", "action_type": action_type, "qty": qty}
    data["action_type"] = action_type
    data["qty"] = qty
    if not data.get("ok"):
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
                           "limit": limit, "remaining": max(0, limit - used)})
        return {"subscription": {"status": s["status"], "current_period_end": s["current_period_end"]}, "gauges": gauges}
    except Exception as e:
        logger.error(f"usage {telegram_id}: {e}")
        return {"subscription": None, "gauges": []}
