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


async def connect_platform(telegram_id: int, platform: str) -> dict:
    webhook_url = f"{N8N_WEBHOOK_BASE}/late-connect"
    webhook_body = {"telegram_id": telegram_id, "platform": platform}
    logger.info(f"Social connect: POST {webhook_url} body={webhook_body}")

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(webhook_url, json=webhook_body)
        logger.info(f"Social connect response: status={response.status_code} body={response.text}")
        if response.status_code != 200:
            return {"success": False, "error": f"Le service a répondu avec le statut {response.status_code}"}
        result = response.json()
        if result.get("success") and result.get("authUrl"):
            return {"success": True, "authUrl": result["authUrl"]}
        return {"success": False, "error": result.get("message", "Réponse inattendue du service de connexion")}


async def disconnect_platform(telegram_id: int, platform: str) -> dict:
    webhook_url = f"{N8N_WEBHOOK_BASE}/late-disconnect"
    webhook_body = {"telegram_id": telegram_id, "platform": platform}
    logger.info(f"Social disconnect: POST {webhook_url} body={webhook_body}")

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(webhook_url, json=webhook_body)
        logger.info(f"Social disconnect response: status={response.status_code} body={response.text}")
        if response.status_code != 200:
            return {"success": False, "error": f"Le service a répondu avec le statut {response.status_code}"}

    # Clean the field in database
    field = FIELD_MAP.get(platform)
    if field:
        supabase.table("users").update({field: None}).eq("telegram_id", telegram_id).execute()

    return {"success": True}


async def create_late_profile(telegram_id: int, nom: str) -> dict:
    webhook_url = f"{N8N_WEBHOOK_BASE}/late-create-profile"
    webhook_body = {"telegram_id": telegram_id, "nom": nom}
    logger.info(f"Calling Late webhook: POST {webhook_url} with body={webhook_body}")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(webhook_url, json=webhook_body)
        logger.info(f"Late webhook response: status={resp.status_code} body={resp.text}")
        if resp.status_code == 200:
            return {"created": True}
        return {"created": False, "error": f"Late a répondu avec le statut {resp.status_code}"}
