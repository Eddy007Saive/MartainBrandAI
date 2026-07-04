"""
Abonnements Stripe -> plan utilisateur + crédits mensuels.

No-op propre si Stripe non configuré (l'app marche en mode gratuit sans Stripe).
"""
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
    prev = supabase.table("users").select("plan_cancel_at").eq("telegram_id", uid).execute().data
    was_canceling = bool(prev and prev[0].get("plan_cancel_at"))
    newly_canceling = bool(cancel_at) and actif and not was_canceling

    supabase.table("users").update({
        "plan": "pro" if actif else "gratuit",
        "stripe_subscription_id": sub.get("id") if actif else None,
        "plan_renews_at": pe,
        "plan_cancel_at": cancel_at if actif else None,   # date de fin si résilié, sinon None
    }).eq("telegram_id", uid).execute()
    logger.info(f"stripe: {uid} -> {status}" + (" (résiliation programmée)" if cancel_at else ""))
    return {"uid": uid, "status": status, "newly_canceling": newly_canceling, "cancel_at": cancel_at}


# ----------------------------------------------------------------- Packs de rachat
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
           .in_("status", ["trialing", "active", "past_due"]).order("created_at", desc=True).limit(1).execute())
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


def _notify_payload(uid: str, kind: str, extra=None):
    """Infos pour l'email admin (envoyé par la route, en async)."""
    if not uid:
        return None
    try:
        r = supabase.table("users").select("nom, email, plan").eq("telegram_id", uid).limit(1).execute()
        u = r.data[0] if r.data else {}
    except Exception:
        u = {}
    return {"kind": kind, "nom": u.get("nom"), "email": u.get("email"), "plan": u.get("plan"), "extra": extra}


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
    obj = event["data"]["object"]
    canceled_uid = None  # à déconnecter (abo terminé) -> géré async par la route
    notify = None        # {"kind","nom","email",...} -> email admin envoyé par la route (async)
    try:
        if etype == "checkout.session.completed":
            meta = obj.get("metadata") or {}
            if meta.get("pack_id"):
                _apply_pack(obj)                       # achat de pack (one-time)
                notify = _notify_payload(meta.get("telegram_id"), "pack", meta.get("action_type"))
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
                    reason = ((obj.get("cancellation_details") or {}).get("feedback")) or "—"
                    end = (res.get("cancel_at") or "")[:10]
                    notify = _notify_payload(res["uid"], "canceling", f"Fin le {end} · raison : {reason}")
        elif etype == "invoice.payment_failed":
            notify = _notify_payload(_uid_by_customer(obj.get("customer")), "payment_failed")
    except Exception as e:
        logger.error(f"stripe webhook handle error: {e}")
    return {"ok": True, "event": etype, "canceled_uid": canceled_uid, "notify": notify}
