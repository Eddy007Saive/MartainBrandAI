"""
Codes promotionnels Stripe (admin) : creation complete (pourcentage ou montant,
duree once / repeating / forever, limite d'utilisations, expiration), liste et
activation/desactivation. Un code promo = un coupon Stripe + un promotion code.
"""
import time
import stripe
from config import logger, STRIPE_SECRET_KEY

# Les nouveaux comptes Stripe (API 2025+) ont change les params des promotion codes ;
# on epingle une version qui accepte `coupon=` (voir test manuel du 31/07).
_API_VERSION = "2024-06-20"


def _ready() -> bool:
    return bool(STRIPE_SECRET_KEY)


def list_promos() -> list:
    """Codes promo (actifs et inactifs) avec le detail de leur coupon."""
    if not _ready():
        return []
    try:
        res = stripe.PromotionCode.list(
            limit=50, expand=["data.coupon"],
            api_key=STRIPE_SECRET_KEY, stripe_version=_API_VERSION,
        )
        out = []
        for p in res.get("data", []):
            c = p.get("coupon") or {}
            out.append({
                "id": p["id"],
                "code": p.get("code"),
                "active": p.get("active"),
                "times_redeemed": p.get("times_redeemed", 0),
                "max_redemptions": p.get("max_redemptions"),
                "expires_at": p.get("expires_at"),
                "percent_off": c.get("percent_off"),
                "amount_off": c.get("amount_off"),
                "currency": c.get("currency"),
                "duration": c.get("duration"),
                "duration_in_months": c.get("duration_in_months"),
                "coupon_valid": c.get("valid", True),
                "created": p.get("created"),
            })
        return out
    except Exception as e:
        logger.error(f"list promos: {e}")
        return []


def create_promo(data: dict) -> dict:
    """Cree coupon + promotion code.
    data = { code, type: 'percent'|'amount', valeur, duration: 'once'|'repeating'|'forever',
             duration_in_months?, max_redemptions?, expires_at? (epoch s), name? }"""
    if not _ready():
        return {"error": "Stripe non configure."}
    code = (data.get("code") or "").strip().upper().replace(" ", "")
    if not code or len(code) < 3:
        return {"error": "Code invalide (3 caracteres minimum)."}
    try:
        valeur = float(data.get("valeur") or 0)
    except (TypeError, ValueError):
        return {"error": "Valeur de reduction invalide."}
    if valeur <= 0:
        return {"error": "La reduction doit etre positive."}

    duration = data.get("duration") or "once"
    if duration not in ("once", "repeating", "forever"):
        return {"error": "Duree invalide."}

    coupon_params = {
        "duration": duration,
        "name": (data.get("name") or code)[:40],
        "api_key": STRIPE_SECRET_KEY,
        "stripe_version": _API_VERSION,
    }
    if duration == "repeating":
        try:
            months = int(data.get("duration_in_months") or 0)
        except (TypeError, ValueError):
            months = 0
        if months < 1:
            return {"error": "Indique le nombre de mois pour une reduction repetee."}
        coupon_params["duration_in_months"] = months

    if data.get("type") == "amount":
        coupon_params["amount_off"] = int(round(valeur * 100))
        coupon_params["currency"] = "eur"
    else:
        if valeur > 100:
            return {"error": "Un pourcentage ne peut pas depasser 100."}
        coupon_params["percent_off"] = valeur

    expires_at = data.get("expires_at")
    if expires_at:
        try:
            expires_at = int(expires_at)
            if expires_at <= int(time.time()):
                return {"error": "La date d'expiration est deja passee."}
        except (TypeError, ValueError):
            return {"error": "Date d'expiration invalide."}

    try:
        coupon = stripe.Coupon.create(**coupon_params)
        promo_params = {
            "coupon": coupon["id"],
            "code": code,
            "api_key": STRIPE_SECRET_KEY,
            "stripe_version": _API_VERSION,
        }
        if data.get("max_redemptions"):
            promo_params["max_redemptions"] = int(data["max_redemptions"])
        if expires_at:
            promo_params["expires_at"] = expires_at
        promo = stripe.PromotionCode.create(**promo_params)
        logger.info(f"admin promo cree: {code} ({coupon['id']})")
        return {"ok": True, "id": promo["id"], "code": promo["code"]}
    except stripe.error.StripeError as e:  # noqa: attribute exists in lib
        msg = getattr(e, "user_message", None) or str(e)
        if "already exists" in msg:
            return {"error": f"Le code {code} existe deja."}
        logger.error(f"create promo: {e}")
        return {"error": f"Stripe a refuse : {msg[:140]}"}
    except Exception as e:
        logger.error(f"create promo: {e}")
        return {"error": "Creation impossible."}


def toggle_promo(promo_id: str, active: bool) -> dict:
    """Active/desactive un promotion code (un code desactive ne peut plus etre saisi)."""
    if not _ready():
        return {"error": "Stripe non configure."}
    try:
        p = stripe.PromotionCode.modify(
            promo_id, active=active,
            api_key=STRIPE_SECRET_KEY, stripe_version=_API_VERSION,
        )
        return {"ok": True, "id": p["id"], "active": p["active"]}
    except Exception as e:
        logger.error(f"toggle promo {promo_id}: {e}")
        return {"error": "Modification impossible."}
