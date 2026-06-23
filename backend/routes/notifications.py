from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from config import supabase, logger

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        res = (supabase.table("notifications").select("*")
               .eq("telegram_id", telegram_id).order("created_at", desc=True).limit(50).execute())
        items = res.data or []
        return {"items": items, "unread": sum(1 for n in items if not n.get("lu"))}
    except Exception as e:
        logger.error(f"list notifications error: {e}")
        return {"items": [], "unread": 0}


@router.post("/lus")
async def mark_all_read(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    supabase.table("notifications").update({"lu": True}).eq("telegram_id", telegram_id).eq("lu", False).execute()
    return {"ok": True}


@router.post("/{notif_id}/lu")
async def mark_read(notif_id: str, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    supabase.table("notifications").update({"lu": True}).eq("id", notif_id).eq("telegram_id", telegram_id).execute()
    return {"ok": True}
