from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from models.user import UserUpdate, SocialConnectRequest
from models.schedule import ScheduleUpdate
from services import user_service, schedule_service
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
        return {"success": False, "error": "Le service de connexion n'a pas répondu à temps"}
    except Exception as e:
        logger.error(f"Social connect error: {e}")
        return {"success": False, "error": f"Erreur de communication: {str(e)}"}


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
        return {"success": False, "error": "Le service de déconnexion n'a pas répondu à temps"}
    except Exception as e:
        logger.error(f"Social disconnect error: {e}")
        return {"success": False, "error": f"Erreur de communication: {str(e)}"}


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
