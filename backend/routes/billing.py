from fastapi import APIRouter, HTTPException, Depends, Request
from dependencies import verify_token
from services import billing_service
from config import logger

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/checkout")
async def checkout(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    plan = (body.get("plan") or "pro").lower()  # offre unique pour l'instant
    if plan != "pro":
        raise HTTPException(status_code=400, detail="Offre invalide")
    r = billing_service.create_checkout(telegram_id, plan)
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("error"))
    return {"url": r["url"]}


@router.post("/portal")
async def portal(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    r = billing_service.create_portal(telegram_id)
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("error"))
    return {"url": r["url"]}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    raw = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        return billing_service.handle_webhook(raw, sig)
    except Exception as e:
        logger.error(f"stripe webhook error: {e}")
        return {"ok": False}
