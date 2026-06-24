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

# plan -> crédits mensuels
PLAN_CREDITS = {"gratuit": 100, "pro": 1000, "business": 3000}


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


def _apply_subscription(sub: dict):
    """Met à jour plan + crédits + dates selon l'état de l'abonnement Stripe."""
    meta = sub.get("metadata") or {}
    tg = meta.get("telegram_id")
    customer = sub.get("customer")
    status = sub.get("status")
    items = (sub.get("items") or {}).get("data") or []
    price_id = items[0]["price"]["id"] if items else None
    plan = _plan_for_price(price_id) or meta.get("plan")

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

    if status in ("active", "trialing") and plan in ("pro", "business"):
        upd = {"plan": plan, "stripe_subscription_id": sub.get("id"), "credits": PLAN_CREDITS.get(plan, 50)}
        cpe = sub.get("current_period_end")
        if cpe:
            upd["plan_renews_at"] = datetime.fromtimestamp(cpe, tz=timezone.utc).isoformat()
        supabase.table("users").update(upd).eq("telegram_id", uid).execute()
        logger.info(f"stripe: {uid} -> {plan} ({status})")
    elif status in ("canceled", "unpaid", "incomplete_expired"):
        supabase.table("users").update({"plan": "gratuit", "stripe_subscription_id": None}).eq("telegram_id", uid).execute()
        logger.info(f"stripe: {uid} -> gratuit ({status})")


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
