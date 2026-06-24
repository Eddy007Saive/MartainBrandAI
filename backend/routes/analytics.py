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


@router.get("/insights")
async def get_insights(days: int = 30, platform: str = None, refresh: bool = False, payload: dict = Depends(verify_token)):
    """Performances réelles depuis l'API Late (analytics add-on requis).

    Vue par défaut (30 j, tous réseaux) servie depuis le cache alimenté par le cron horaire.
    `refresh=true` ou une vue filtrée force un appel live.
    """
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")

    is_default = (days == 30 and not platform)
    if is_default and not refresh:
        cached = analytics_service.get_cached(telegram_id)
        if cached and cached.get("data"):
            return {**cached["data"], "cached_at": cached.get("updated_at")}

    data = await analytics_service.performance(telegram_id, days=days, platform=platform)
    if is_default and data.get("ok") and data.get("connected"):
        analytics_service.store_cache(telegram_id, data)
    return data
