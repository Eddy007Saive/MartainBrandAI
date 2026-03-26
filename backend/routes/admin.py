from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from dependencies import verify_admin_token
from services import admin_service
from services import heygen_service
from services.auth_service import sanitize_user
from services.social_service import create_late_profile
from config import supabase, logger

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
async def get_users(filter: str = "all", payload: dict = Depends(verify_admin_token)):
    try:
        return admin_service.get_users(filter)
    except Exception as e:
        logger.error(f"Get users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{telegram_id}")
async def get_user_detail(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        user = admin_service.get_user_detail(telegram_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user detail error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{telegram_id}/contenus")
async def get_user_contenus(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        return admin_service.get_user_contenus(telegram_id)
    except Exception as e:
        logger.error(f"Get user contenus error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_admin_stats(payload: dict = Depends(verify_admin_token)):
    try:
        return admin_service.get_global_stats()
    except Exception as e:
        logger.error(f"Get admin stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/users")
async def export_users_csv(payload: dict = Depends(verify_admin_token)):
    try:
        csv_content = admin_service.export_users_csv()
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=users_export.csv"}
        )
    except Exception as e:
        logger.error(f"Export users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity")
async def get_activity_logs(limit: int = 50, payload: dict = Depends(verify_admin_token)):
    try:
        return admin_service.get_activity(limit)
    except Exception as e:
        logger.error(f"Get activity error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/users/{telegram_id}/activate")
async def activate_user(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").update({"actif": True}).eq("telegram_id", telegram_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = result.data[0]

        late_profile_created = False
        late_error = None
        try:
            late_result = await create_late_profile(telegram_id, user.get("nom", ""))
            late_profile_created = late_result["created"]
            late_error = late_result.get("error")
        except Exception as e:
            late_error = str(e)
            logger.warning(f"Failed to create Late profile for {telegram_id}: {e}")

        response = sanitize_user(user)
        response["late_profile_created"] = late_profile_created
        if late_error:
            response["late_error"] = late_error
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Activate user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users/{telegram_id}/retry-late")
async def retry_late_profile(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = result.data[0]
        if not user.get("actif"):
            raise HTTPException(status_code=400, detail="L'utilisateur doit être actif pour créer un profil Late")

        try:
            late_result = await create_late_profile(telegram_id, user.get("nom", ""))
            return {"late_profile_created": late_result["created"], "late_error": late_result.get("error")}
        except Exception as e:
            logger.warning(f"Retry Late profile failed for {telegram_id}: {e}")
            return {"late_profile_created": False, "late_error": str(e)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retry Late error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/users/{telegram_id}/deactivate")
async def deactivate_user(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").update({"actif": False}).eq("telegram_id", telegram_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return sanitize_user(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Deactivate user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{telegram_id}")
async def delete_user(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").delete().eq("telegram_id", telegram_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return {"success": True, "message": "User deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Avatar management ---

class AvatarUpdate(BaseModel):
    avatar_id: Optional[str] = None
    status: Optional[str] = None
    consent_url: Optional[str] = None
    error_message: Optional[str] = None


@router.get("/avatars")
async def get_all_avatars(payload: dict = Depends(verify_admin_token)):
    """List all avatar requests."""
    try:
        avatars = heygen_service.get_all_avatars()
        return avatars
    except Exception as e:
        logger.error(f"Get avatars error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/avatars/{telegram_id}")
async def update_avatar(
    telegram_id: int,
    body: AvatarUpdate,
    payload: dict = Depends(verify_admin_token),
):
    """Admin updates avatar info."""
    try:
        update_data = body.model_dump(exclude_none=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")

        result = heygen_service.update_avatar_by_admin(telegram_id, update_data)
        if not result:
            raise HTTPException(status_code=404, detail="Avatar non trouvé")

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update avatar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/avatars/{telegram_id}")
async def admin_delete_avatar(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    """Admin deletes an avatar request."""
    try:
        supabase.table("heygen_avatars").delete().eq("telegram_id", telegram_id).execute()
        return {"success": True, "message": "Avatar supprimé"}
    except Exception as e:
        logger.error(f"Admin delete avatar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
