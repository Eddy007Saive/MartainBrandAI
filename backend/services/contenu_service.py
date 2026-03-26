import httpx
from datetime import datetime, timezone
from config import supabase, logger


def get_contenus(telegram_id: int, statut: str = None) -> list:
    query = supabase.table("contenu").select("*").eq("telegram_id", telegram_id)
    if statut:
        query = query.eq("statut", statut)
    result = query.order("created_at", desc=True).execute()
    return result.data


def get_contenu(contenu_id: str, telegram_id: int) -> dict | None:
    result = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    return result.data[0] if result.data else None


async def update_contenu(contenu_id: str, telegram_id: int, update_data: dict) -> dict:
    # Get current content to check callback_url
    current = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    if not current.data:
        return {"error": "not_found"}

    contenu_data = current.data[0]
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    # If validating content and callback_url exists, call the webhook
    webhook_result = None
    if update_data.get("statut") == "Validé" and contenu_data.get("callback_url"):
        callback_url = contenu_data["callback_url"]
        try:
            logger.info(f"Calling validation webhook: {callback_url}")
            async with httpx.AsyncClient(timeout=30) as client:
                webhook_response = await client.post(
                    callback_url,
                    json={
                        "contenu_id": contenu_id,
                        "telegram_id": telegram_id,
                        "action": "validate",
                        "statut": "Validé"
                    }
                )
                logger.info(f"Webhook response: {webhook_response.status_code}")
                webhook_result = {
                    "success": webhook_response.status_code == 200,
                    "status_code": webhook_response.status_code
                }
        except Exception as webhook_error:
            logger.error(f"Webhook error: {webhook_error}")
            webhook_result = {"success": False, "error": str(webhook_error)}

    result = supabase.table("contenu").update(update_data).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    response = result.data[0] if result.data else contenu_data
    if webhook_result:
        response["webhook_result"] = webhook_result
    return response


def delete_contenu(contenu_id: str, telegram_id: int) -> bool:
    result = supabase.table("contenu").delete().eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    return bool(result.data)
