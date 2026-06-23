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


@router.post("/device-token")
async def register_device_token(body: dict, payload: dict = Depends(verify_token)):
    """Enregistre le token push (FCM) de l'appareil pour l'utilisateur courant."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    token = (body.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token requis")
    platform = body.get("platform") or "android"
    try:
        # upsert sur le token (un token = un appareil), rattaché à l'utilisateur courant
        supabase.table("device_tokens").upsert(
            {"telegram_id": telegram_id, "token": token, "platform": platform},
            on_conflict="token",
        ).execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"register device token error: {e}")
        raise HTTPException(status_code=500, detail="Échec de l'enregistrement du token")
