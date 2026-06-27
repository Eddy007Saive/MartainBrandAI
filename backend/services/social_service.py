import asyncio
import httpx
from config import N8N_WEBHOOK_BASE, supabase, logger

VALID_PLATFORMS = {"instagram", "facebook", "linkedin", "tiktok", "youtube"}

FIELD_MAP = {
    "instagram": "late_account_instagram",
    "facebook": "late_account_facebook",
    "linkedin": "late_account_linkedin",
    "youtube": "late_account_youtube",
    "tiktok": "late_account_tiktok",
}


def _err_from_response(resp) -> str:
    """Extrait un message d'erreur lisible de la réponse n8n (qui renvoie souvent le message
    de l'erreur levée dans son body), sinon retombe sur le texte brut / le statut."""
    try:
        d = resp.json()
        if isinstance(d, dict):
            msg = d.get("message") or d.get("error") or (d.get("detail") if isinstance(d.get("detail"), str) else None)
            if msg:
                return str(msg)[:300]
    except Exception:
        pass
    txt = (resp.text or "").strip()
    if txt:
        return txt[:300]
    return f"Le service a répondu avec le statut {resp.status_code}."


async def create_late_profile(telegram_id: str, nom: str) -> dict:
    webhook_url = f"{N8N_WEBHOOK_BASE}/late-create-profile"
    webhook_body = {"telegram_id": telegram_id, "nom": nom}
    logger.info(f"Calling Late webhook: POST {webhook_url} with body={webhook_body}")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(webhook_url, json=webhook_body)
        logger.info(f"Late webhook response: status={resp.status_code} body={resp.text[:300]}")
        if resp.status_code == 200:
            return {"created": True}
        return {"created": False, "error": _err_from_response(resp)}
    except httpx.TimeoutException:
        logger.error(f"create_late_profile timeout for {telegram_id}")
        return {"created": False, "error": "Le service de publication n'a pas répondu à temps. Réessaie dans un instant."}
    except Exception as e:
        logger.error(f"create_late_profile error for {telegram_id}: {e}")
        return {"created": False, "error": "Impossible de joindre le service de publication. Réessaie dans un instant."}


async def _ensure_late_profile(telegram_id: str) -> tuple:
    """Filet de sécurité : crée le profil Late s'il manque, puis attend qu'il soit enregistré.
    Retourne (ok: bool, error: str | None)."""
    try:
        res = supabase.table("users").select("late_profile_id, nom").eq("telegram_id", telegram_id).execute()
    except Exception as e:
        logger.error(f"_ensure_late_profile lecture user {telegram_id}: {e}")
        return False, "Impossible de lire ton compte pour le moment. Réessaie."
    row = res.data[0] if res.data else {}
    if not row:
        return False, "Compte introuvable."
    if row.get("late_profile_id"):
        return True, None

    logger.info(f"connect: profil Late manquant pour {telegram_id} -> création automatique")
    cr = await create_late_profile(telegram_id, row.get("nom") or "")
    if not cr.get("created"):
        return False, cr.get("error") or "Impossible de créer le profil de publication."

    # n8n écrit late_profile_id côté DB : on attend brièvement qu'il apparaisse
    for _ in range(4):
        try:
            chk = supabase.table("users").select("late_profile_id").eq("telegram_id", telegram_id).execute()
            if chk.data and chk.data[0].get("late_profile_id"):
                return True, None
        except Exception as e:
            logger.warning(f"_ensure_late_profile poll {telegram_id}: {e}")
        await asyncio.sleep(1.5)
    return False, "Ton compte de publication est en cours de préparation. Réessaie dans quelques secondes."


async def connect_platform(telegram_id: str, platform: str) -> dict:
    # Filet de sécurité : garantir l'existence du profil Late avant toute connexion
    ok, err = await _ensure_late_profile(telegram_id)
    if not ok:
        return {"success": False, "error": err}

    webhook_url = f"{N8N_WEBHOOK_BASE}/late-connect"
    webhook_body = {"telegram_id": telegram_id, "platform": platform}
    logger.info(f"Social connect: POST {webhook_url} body={webhook_body}")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(webhook_url, json=webhook_body)
        logger.info(f"Social connect response: status={response.status_code} body={response.text[:300]}")
        if response.status_code != 200:
            return {"success": False, "error": _err_from_response(response)}
        result = response.json() if response.text else {}
        if result.get("success") and result.get("authUrl"):
            return {"success": True, "authUrl": result["authUrl"]}
        return {"success": False, "error": result.get("message") or result.get("error") or "Réponse inattendue du service de connexion."}
    except httpx.TimeoutException:
        logger.error(f"connect timeout for {telegram_id}/{platform}")
        return {"success": False, "error": "Le service de connexion n'a pas répondu à temps. Réessaie."}
    except Exception as e:
        logger.error(f"connect error for {telegram_id}/{platform}: {e}")
        return {"success": False, "error": "Impossible de joindre le service de connexion. Réessaie."}


async def disconnect_platform(telegram_id: str, platform: str) -> dict:
    webhook_url = f"{N8N_WEBHOOK_BASE}/late-disconnect"
    webhook_body = {"telegram_id": telegram_id, "platform": platform}
    logger.info(f"Social disconnect: POST {webhook_url} body={webhook_body}")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(webhook_url, json=webhook_body)
        logger.info(f"Social disconnect response: status={response.status_code} body={response.text[:300]}")
        if response.status_code != 200:
            return {"success": False, "error": _err_from_response(response)}
    except httpx.TimeoutException:
        logger.error(f"disconnect timeout for {telegram_id}/{platform}")
        return {"success": False, "error": "Le service de déconnexion n'a pas répondu à temps. Réessaie."}
    except Exception as e:
        logger.error(f"disconnect error for {telegram_id}/{platform}: {e}")
        return {"success": False, "error": "Impossible de joindre le service de déconnexion. Réessaie."}

    # Nettoie le champ en base (best-effort)
    field = FIELD_MAP.get(platform)
    if field:
        try:
            supabase.table("users").update({field: None}).eq("telegram_id", telegram_id).execute()
        except Exception as e:
            logger.warning(f"disconnect cleanup {telegram_id}/{platform}: {e}")

    return {"success": True}
