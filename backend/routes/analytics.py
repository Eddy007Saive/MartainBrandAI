from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from services import analytics_service
from config import logger

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/stats")
async def get_stats(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        return analytics_service.get_stats(telegram_id)
    except Exception as e:
        logger.error(f"Get stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/performance")
async def get_performance(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        return analytics_service.get_performance(telegram_id)
    except Exception as e:
        logger.error(f"Get performance error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
