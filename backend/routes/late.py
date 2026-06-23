import json
from fastapi import APIRouter, HTTPException, Depends, Request
from dependencies import verify_token
from services import late_service, contenu_service
from config import supabase, logger

router = APIRouter(prefix="/late", tags=["late"])


@router.post("/publier/{contenu_id}")
async def publier(contenu_id: str, payload: dict = Depends(verify_token)):
    """Pousse un contenu validé dans Late (programmé à sa date). Anti-doublon via late_post_id."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    contenu = contenu_service.get_contenu(contenu_id, telegram_id)
    if not contenu:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    if contenu.get("late_post_id") and contenu.get("publish_status") in ("programmé", "publié"):
        raise HTTPException(status_code=409, detail="Ce contenu est déjà programmé ou publié.")

    res = await late_service.publish_contenu(telegram_id, contenu)
    if res.get("ok"):
        supabase.table("contenu").update({
            "late_post_id": res.get("late_post_id"),
            "publish_status": "programmé",
            "publish_error": None,
        }).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        return {"publish_status": "programmé", "late_post_id": res.get("late_post_id")}

    # échec -> on stocke la raison (visible dans l'app) et on remonte un message clair
    supabase.table("contenu").update({
        "publish_status": "échec", "publish_error": res.get("error"),
    }).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    raise HTTPException(status_code=502, detail=res.get("error") or "Échec de la publication")


@router.post("/webhook")
async def webhook(request: Request):
    """Webhook Late (public, vérifié par signature HMAC) : met à jour le statut de publication."""
    raw = await request.body()
    sig = request.headers.get("X-Late-Signature", "") or request.headers.get("x-late-signature", "")
    if not late_service.verify_signature(raw, sig):
        raise HTTPException(status_code=401, detail="Signature invalide")
    try:
        payload = json.loads(raw.decode() or "{}")
    except Exception:
        payload = {}
    try:
        res = late_service.handle_webhook(payload)
    except Exception as e:
        logger.error(f"Late webhook error: {e}")
        res = {"ok": False, "error": str(e)}
    return {"received": True, **res}
