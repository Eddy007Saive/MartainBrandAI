"""Vérification Cloudflare Turnstile (anti-bot) pour le formulaire public."""
import httpx
from config import TURNSTILE_SECRET_KEY, logger

_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify(token: str, remote_ip: str = "") -> bool:
    """Retourne True si le token Turnstile est valide.

    Sans secret configuré, on laisse passer (dev). Avec secret, un token vide/faux échoue.
    """
    if not TURNSTILE_SECRET_KEY:
        return True
    if not token:
        return False
    data = {"secret": TURNSTILE_SECRET_KEY, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(_VERIFY_URL, data=data)
        return bool(r.json().get("success"))
    except Exception as e:
        logger.error(f"Turnstile verify error: {e}")
        return False
