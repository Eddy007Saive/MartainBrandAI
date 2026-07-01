from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File, Form
from dependencies import verify_admin_token
from services import onboarding_service, mail_service, turnstile_service, rate_limit
from config import logger, ADMIN_NOTIF_EMAIL, FRONTEND_URL

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

# Limites de capacité pour les uploads publics
MAX_UPLOAD_BYTES = 5 * 1024 * 1024          # 5 Mo par fichier
_UPLOAD_MAX = 20                            # max 20 uploads
_UPLOAD_WINDOW = 10 * 60                    # par 10 min
_UPLOAD_LOCK = 10 * 60                      # verrou 10 min


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/upload")
async def upload_asset(request: Request, file: UploadFile = File(...), kind: str = Form("image")):
    """Upload public (logo / image) pour le formulaire d'audit. Limité en taille et en débit."""
    ip = _client_ip(request)
    key = f"onboarding_upload:{ip}"
    left = rate_limit.locked_for(key)
    if left:
        raise HTTPException(status_code=429, detail=f"Trop d'envois. Réessaie dans {left // 60 + 1} min.")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image (png, jpg, svg, webp…)")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Fichier trop lourd (5 Mo maximum).")

    rate_limit.fail(key, _UPLOAD_MAX, _UPLOAD_WINDOW, _UPLOAD_LOCK)  # compte cet upload
    try:
        url = onboarding_service.upload_asset(data, kind)
        return {"url": url}
    except Exception as e:
        logger.error(f"Onboarding upload error: {e}")
        raise HTTPException(status_code=500, detail="Échec de l'upload.")


@router.post("/audit")
async def submit_audit(body: dict, request: Request):
    """Réception publique du questionnaire d'audit de marque (lead anonyme).

    Aucune auth : formulaire public. Un honeypot `_hp` filtre les bots basiques.
    """
    # Honeypot anti-bot : champ caché qui doit rester vide.
    if (body.get("_hp") or "").strip():
        return {"success": True}  # on fait semblant d'accepter, sans rien stocker

    # Cloudflare Turnstile : vérifie que ce n'est pas un bot.
    token = body.get("cf_turnstile_token") or body.get("turnstile_token") or ""
    if not await turnstile_service.verify(token, _client_ip(request)):
        raise HTTPException(status_code=403, detail="Vérification anti-bot échouée. Recharge la page et réessaie.")

    answers = body.get("answers") or {}
    if not isinstance(answers, dict):
        raise HTTPException(status_code=400, detail="Format invalide")

    marque = body.get("marque") or answers.get("marque") or ""
    email = body.get("email") or ""
    recap = body.get("recap") or ""

    # Garde-fou minimal : il faut au moins un email ou une marque + un peu de contenu.
    if not (email.strip() or marque.strip()) or len(answers) == 0:
        raise HTTPException(status_code=400, detail="Réponses incomplètes")

    try:
        ua = request.headers.get("user-agent", "")
        result = onboarding_service.save_audit(marque, email, answers, recap, ua)
    except Exception as e:
        logger.error(f"Save audit error: {e}")
        raise HTTPException(status_code=500, detail="Impossible d'enregistrer le questionnaire")

    # Notification interne (best-effort : un échec d'email ne casse pas la soumission)
    try:
        admin_url = f"{FRONTEND_URL}/admin"
        html = mail_service.audit_notification_html(marque, email, recap, admin_url)
        await mail_service.send_email(ADMIN_NOTIF_EMAIL, f"Nouvel audit de marque — {marque or 'Sans nom'}", html)
    except Exception as e:
        logger.error(f"Audit notification email failed: {e}")

    return result


# ---- Admin : consultation des leads ----

@router.get("/audits")
async def list_audits(payload: dict = Depends(verify_admin_token)):
    return {"audits": onboarding_service.list_audits()}


@router.get("/audits/{audit_id}")
async def get_audit(audit_id: str, payload: dict = Depends(verify_admin_token)):
    audit = onboarding_service.get_audit(audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Introuvable")
    return audit


@router.post("/audits/{audit_id}/reply")
async def reply_audit(audit_id: str, body: dict, payload: dict = Depends(verify_admin_token)):
    """Répondre au prospect par email depuis l'admin."""
    audit = onboarding_service.get_audit(audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Introuvable")
    to = (audit.get("email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Ce lead n'a pas d'email.")
    subject = (body.get("subject") or "").strip() or f"Réponse à ton audit de marque — PresenceOS"
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Le message est vide.")
    html = mail_service.audit_reply_html(audit.get("marque") or "", message)
    res = await mail_service.send_email(to, subject, html)
    if res.get("error"):
        raise HTTPException(status_code=502, detail="L'email n'a pas pu être envoyé. Vérifie la config Resend.")
    onboarding_service.update_status(audit_id, "traite")
    return {"success": True}


@router.patch("/audits/{audit_id}/status")
async def set_audit_status(audit_id: str, body: dict, payload: dict = Depends(verify_admin_token)):
    status = (body.get("status") or "").strip()
    if status not in ("nouveau", "en_cours", "traite"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    onboarding_service.update_status(audit_id, status)
    return {"success": True}
