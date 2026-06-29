"""
Abonnements Stripe -> plan utilisateur + crédits mensuels.

No-op propre si Stripe non configuré (l'app marche en mode gratuit sans Stripe).
"""
import json
from datetime import datetime, timezone
import stripe
from config import (
    supabase, logger, FRONTEND_URL,
    STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS,
)

# Statut Stripe -> statut interne de l'abonnement (pilote les quotas)
STATUS_MAP = {
    "active": "active", "trialing": "trialing", "past_due": "past_due",
    "incomplete": "past_due", "canceled": "canceled", "unpaid": "canceled",
    "incomplete_expired": "canceled",
}


def _ready() -> bool:
    if not STRIPE_SECRET_KEY:
        return False
    stripe.api_key = STRIPE_SECRET_KEY
    return True


def _price_for(plan: str):
    return {"pro": STRIPE_PRICE_PRO, "business": STRIPE_PRICE_BUSINESS}.get(plan)


def _plan_for_price(price_id: str):
    if price_id and price_id == STRIPE_PRICE_PRO:
        return "pro"
    if price_id and price_id == STRIPE_PRICE_BUSINESS:
        return "business"
    return None


def create_checkout(telegram_id: str, plan: str) -> dict:
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
            subscription_data={"metadata": {"telegram_id": telegram_id, "plan": plan}},
            allow_promotion_codes=True,
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


def _pro_plan_id():
    r = supabase.table("plans").select("id").eq("name", "Pro").limit(1).execute()
    return r.data[0]["id"] if r.data else None


def _ts(v):
    return datetime.fromtimestamp(v, tz=timezone.utc).isoformat() if v else None


def _upsert_subscription(uid: str, status: str, period_start, period_end, stripe_sub_id):
    """Écrit l'abonnement dans la table `subscriptions` (source de vérité des quotas).
    Mettre à jour current_period_start/end = nouvelle période -> compteurs repartis à zéro
    (les usage_counters sont créés par période ; les packs `extra` ne se reportent pas)."""
    plan_id = _pro_plan_id()
    if not plan_id:
        logger.warning("stripe: offre Pro absente de la table plans")
        return
    row = {"plan_id": plan_id, "status": status, "stripe_subscription_id": stripe_sub_id}
    if period_start:
        row["current_period_start"] = period_start
    if period_end:
        row["current_period_end"] = period_end
    existing = (supabase.table("subscriptions").select("id").eq("user_id", uid)
                .order("created_at", desc=True).limit(1).execute())
    if existing.data:
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
        return

    ps = _ts(sub.get("current_period_start"))
    pe = _ts(sub.get("current_period_end"))
    _upsert_subscription(uid, status, ps, pe, sub.get("id"))

    # Compat affichage (ParametresPage) : plan + date de renouvellement
    actif = status in ("active", "trialing")
    supabase.table("users").update({
        "plan": "pro" if actif else "gratuit",
        "stripe_subscription_id": sub.get("id") if actif else None,
        "plan_renews_at": pe,
    }).eq("telegram_id", uid).execute()
    logger.info(f"stripe: {uid} -> {status}")


def handle_webhook(payload_bytes: bytes, signature: str) -> dict:
    if not _ready():
        return {"ok": False}
    try:
        if STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload_bytes, signature, STRIPE_WEBHOOK_SECRET)
        else:
            event = json.loads(payload_bytes)
    except Exception as e:
        logger.warning(f"stripe webhook signature invalide: {e}")
        return {"ok": False, "error": "bad signature"}

    etype = event["type"]
    obj = event["data"]["object"]
    try:
        if etype == "checkout.session.completed":
            sub_id = obj.get("subscription")
            if sub_id:
                _apply_subscription(stripe.Subscription.retrieve(sub_id))
        elif etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
            _apply_subscription(obj)
    except Exception as e:
        logger.error(f"stripe webhook handle error: {e}")
    return {"ok": True, "event": etype}
