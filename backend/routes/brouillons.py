from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from config import supabase, logger

router = APIRouter(prefix="/brouillons", tags=["brouillons"])


@router.get("")
async def get_brouillons(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        result = supabase.table("brouillons").select("*").eq("telegram_id", telegram_id).order("created_at", desc=True).execute()
        return result.data
    except Exception as e:
        logger.error(f"Get brouillons error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
