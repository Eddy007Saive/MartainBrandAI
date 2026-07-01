from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from dependencies import verify_token
from models.user import UserUpdate, SocialConnectRequest
from models.schedule import ScheduleUpdate
from services import user_service, schedule_service, auth_service
from services.social_service import VALID_PLATFORMS, connect_platform, disconnect_platform
from config import logger
import httpx

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_current_user(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        if not telegram_id:
            raise HTTPException(status_code=400, detail="Invalid token")

        user = user_service.get_user(telegram_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/me")
async def delete_current_user(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        if not telegram_id:
            raise HTTPException(status_code=400, detail="Invalid token")

        if not user_service.delete_user(telegram_id):
            raise HTTPException(status_code=404, detail="User not found")

        return {"success": True, "message": "Account deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete account error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/me")
async def update_current_user(updates: UserUpdate, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        if not telegram_id:
            raise HTTPException(status_code=400, detail="Invalid token")

        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No updates provided")

        user = user_service.update_user(telegram_id, update_data)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/me/photo")
async def upload_my_photo(file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Upload la photo de profil (image) -> Cloudinary -> users.photo_url."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image (jpg, png, webp…)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 10 Mo)")
    try:
        url = user_service.upload_photo(telegram_id, data)
        return {"photo_url": url}
    except Exception as e:
        logger.error(f"Upload photo error: {e}")
        raise HTTPException(status_code=500, detail="Échec de l'upload de la photo")


@router.post("/me/password")
async def change_my_password(body: dict, payload: dict = Depends(verify_token)):
    """Change le mot de passe (ancien + nouveau)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    res = auth_service.change_password(telegram_id, body.get("old_password") or "", body.get("new_password") or "")
    if res.get("error") == "wrong_old":
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect.")
    if res.get("error") == "too_short":
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit faire au moins 6 caractères.")
    if res.get("error"):
        raise HTTPException(status_code=400, detail="Impossible de changer le mot de passe.")
    return {"success": True}


@router.post("/me/avatar")
async def upload_my_avatar(file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Upload l'avatar (photo de profil) -> Cloudinary -> users.avatar_url."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image (png, jpg, webp…)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 10 Mo)")
    try:
        url = user_service.upload_avatar(telegram_id, data)
        return {"avatar_url": url}
    except Exception as e:
        logger.error(f"Upload avatar error: {e}")
        raise HTTPException(status_code=500, detail="Échec de l'upload de l'avatar")


@router.post("/me/logo")
async def upload_my_logo(file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Upload le logo de marque (image) -> Cloudinary -> users.logo_url (utilisé dans les carrousels)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image (png, svg, webp…)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 10 Mo)")
    try:
        url = user_service.upload_logo(telegram_id, data)
        return {"logo_url": url}
    except Exception as e:
        logger.error(f"Upload logo error: {e}")
        raise HTTPException(status_code=500, detail="Échec de l'upload du logo")


@router.delete("/me/logo")
async def delete_my_logo(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        user_service.delete_logo(telegram_id)
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete logo error: {e}")
        raise HTTPException(status_code=500, detail="Échec de la suppression du logo")


@router.get("/me/inspirations")
async def list_inspirations(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return {"images": user_service.list_inspirations(telegram_id)}


@router.post("/me/inspirations")
async def add_inspiration(file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Ajoute une image d'inspiration (style aimé) -> Cloudinary."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 10 Mo)")
    try:
        return {"images": user_service.add_inspiration(telegram_id, data)}
    except Exception as e:
        logger.error(f"Add inspiration error: {e}")
        raise HTTPException(status_code=500, detail="Échec de l'upload")


@router.delete("/me/inspirations")
async def remove_inspiration(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url requise")
    return {"images": user_service.remove_inspiration(telegram_id, url)}


@router.post("/me/connect")
async def connect_social(data: SocialConnectRequest, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if data.platform not in VALID_PLATFORMS:
        raise HTTPException(status_code=400, detail="Invalid platform")
    try:
        return await connect_platform(telegram_id, data.platform)
    except httpx.TimeoutException:
        logger.error(f"Social connect timeout for {telegram_id}/{data.platform}")
        return {"success": False, "error": "Le service de connexion n'a pas répondu à temps. Réessaie."}
    except Exception as e:
        logger.error(f"Social connect error: {e}")
        return {"success": False, "error": "Une erreur est survenue lors de la connexion. Réessaie dans un instant."}


@router.post("/me/disconnect")
async def disconnect_social(data: SocialConnectRequest, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if data.platform not in VALID_PLATFORMS:
        raise HTTPException(status_code=400, detail="Invalid platform")
    try:
        return await disconnect_platform(telegram_id, data.platform)
    except httpx.TimeoutException:
        logger.error(f"Social disconnect timeout for {telegram_id}/{data.platform}")
        return {"success": False, "error": "Le service de déconnexion n'a pas répondu à temps. Réessaie."}
    except Exception as e:
        logger.error(f"Social disconnect error: {e}")
        return {"success": False, "error": "Une erreur est survenue lors de la déconnexion. Réessaie dans un instant."}


# ============ SCHEDULES ============

@router.get("/me/schedules")
async def get_schedules(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        return schedule_service.get_schedules(telegram_id)
    except Exception as e:
        logger.error(f"Get schedules error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/me/schedules")
async def update_schedules(data: ScheduleUpdate, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        result = schedule_service.update_schedules(telegram_id, data.schedules)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result["data"]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update schedules error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
