import httpx
import cloudinary
import cloudinary.uploader
from datetime import datetime, timezone
from config import supabase, logger, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
from services import planning_service
from services.user_service import _public_id_from_cloudinary_url

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)


def upload_visuel(telegram_id: int, contenu_id: str, file_bytes: bytes) -> dict | None:
    """Importe une image fournie par l'utilisateur comme visuel du contenu.
    Upload Cloudinary, met à jour lien_visuel, confirme la planification, remplace l'ancien asset."""
    cur = get_contenu(contenu_id, telegram_id)
    if not cur:
        return None
    old = cur.get("lien_visuel")
    # public_id déterministe par contenu -> un ré-import ÉCRASE le même asset (pas d'accumulation)
    public_id = f"contenus/{telegram_id}/{contenu_id}"
    up = cloudinary.uploader.upload(file_bytes, resource_type="image", public_id=public_id, overwrite=True, invalidate=True)
    url = up["secure_url"]

    upd = {"lien_visuel": url}
    if cur.get("statut") in ("A valider", "Valider"):
        upd["statut"] = "Planifie"
    if not cur.get("date_publication"):
        creneau = planning_service.prochain_creneau(telegram_id, cur.get("reseau_cible"))
        if creneau:
            upd["date_publication"] = creneau
    supabase.table("contenu").update(upd).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()

    # Supprime l'ancien asset SEULEMENT s'il a un public_id différent (sinon on vient de l'écraser)
    if old:
        pid = _public_id_from_cloudinary_url(old)
        if pid and pid != public_id:
            try:
                cloudinary.uploader.destroy(pid, invalidate=True)
            except Exception as e:
                logger.warning(f"destroy old visuel: {e}")

    return {"lien_visuel": url,
            "statut": upd.get("statut", cur.get("statut")),
            "date_publication": upd.get("date_publication") or cur.get("date_publication")}


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

    # Auto-planification : à la validation, pose une date provisoire si absente
    if (update_data.get("statut") == "Valider"
            and not update_data.get("date_publication")
            and not contenu_data.get("date_publication")):
        creneau = planning_service.prochain_creneau(telegram_id, contenu_data.get("reseau_cible"))
        if creneau:
            update_data["date_publication"] = creneau
            logger.info(f"Auto-planif contenu {contenu_id} -> {creneau}")

    # If validating content and callback_url exists, call the webhook
    webhook_result = None
    if update_data.get("statut") == "Valider" and contenu_data.get("callback_url"):
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
                        "statut": "Valider"
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


def _raw_public_id(url: str) -> str | None:
    """public_id (avec extension) d'un asset Cloudinary raw, ex. carrousels/<tg>/<base>_doc.pdf"""
    import re
    m = re.search(r"/upload/(?:v\d+/)?(.+)$", url or "")
    return m.group(1) if m else None


def _cleanup_assets(c: dict) -> None:
    """Supprime les assets Cloudinary liés au contenu (best-effort, pas d'accumulation)."""
    imgs = []
    if c.get("lien_visuel"):
        imgs.append(c["lien_visuel"])
    if isinstance(c.get("slides_images"), list):
        imgs += c["slides_images"]
    for u in imgs:
        pid = _public_id_from_cloudinary_url(u)
        if pid:
            try:
                cloudinary.uploader.destroy(pid, resource_type="image", invalidate=True)
            except Exception as e:
                logger.warning(f"cleanup image {pid}: {e}")
    if c.get("carrousel_pdf"):
        pid = _raw_public_id(c["carrousel_pdf"])
        if pid:
            try:
                cloudinary.uploader.destroy(pid, resource_type="raw", invalidate=True)
            except Exception as e:
                logger.warning(f"cleanup pdf {pid}: {e}")


async def delete_contenu(contenu_id: str, telegram_id: int) -> bool:
    """Suppression complète : retire le post de Late, nettoie Cloudinary, supprime la ligne."""
    cur = get_contenu(contenu_id, telegram_id)
    if not cur:
        return False
    if cur.get("late_post_id"):
        try:
            from services import late_service
            await late_service.cancel_post(cur["late_post_id"])  # Zernio deletePost
        except Exception as e:
            logger.warning(f"delete: suppression post Late échouée: {e}")
    _cleanup_assets(cur)
    result = supabase.table("contenu").delete().eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    return bool(result.data)
