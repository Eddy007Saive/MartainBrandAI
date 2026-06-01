from fastapi import APIRouter, HTTPException
from datetime import timedelta
from models.auth import UserRegister, UserLogin, AdminLogin
from services.auth_service import (
    login_user, register_user, create_token,
    find_user_by_email, create_reset_token, reset_password,
)
from services import mail_service
from config import ADMIN_PASSWORD, FRONTEND_URL, logger

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(user_data: UserRegister):
    try:
        if not user_data.telegram_id:
            raise HTTPException(status_code=400, detail="telegram_id_required")

        result = register_user(
            telegram_id=user_data.telegram_id,
            nom=user_data.nom,
            email=user_data.email,
            username=user_data.username,
            password=user_data.password
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return {"success": True, "message": "Registration successful. Awaiting admin approval."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login")
async def login(credentials: UserLogin):
    try:
        result = login_user(credentials.email, credentials.password)

        if "error" in result:
            raise HTTPException(status_code=401, detail=result["error"])

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/forgot-password")
async def forgot_password(body: dict):
    """Envoie un email de réinitialisation via Resend. Réponse toujours identique (anti-énumération)."""
    email = (body.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email requis")
    try:
        user = find_user_by_email(email)
        if user:
            token = create_reset_token(user["telegram_id"], user.get("password_hash", ""))
            link = f"{FRONTEND_URL}/reset-password?token={token}"
            nom = user.get("nom") or user.get("username") or ""
            res = await mail_service.send_email(
                user["email"],
                "Réinitialisation de votre mot de passe — PresenceOS",
                mail_service.reset_email_html(nom, link),
            )
            if res.get("error"):
                logger.error(f"Reset email non envoyé ({email}): {res['error']}")
    except Exception as e:
        logger.error(f"forgot-password error: {e}")
    # On ne révèle jamais si l'email existe
    return {"success": True, "message": "Si un compte est associé à cet email, un lien vient d'être envoyé."}


@router.post("/reset-password")
async def reset_pw(body: dict):
    token = (body.get("token") or "").strip()
    password = body.get("password") or ""
    if not token:
        raise HTTPException(status_code=400, detail="Lien invalide")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit faire au moins 6 caractères")
    result = reset_password(token, password)
    if result.get("error") == "expired":
        raise HTTPException(status_code=400, detail="Ce lien a expiré. Refaites une demande de réinitialisation.")
    if result.get("error") == "used":
        raise HTTPException(status_code=400, detail="Ce lien a déjà été utilisé.")
    if result.get("error"):
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré.")
    return {"success": True, "message": "Mot de passe réinitialisé avec succès."}


@router.post("/admin-login")
async def admin_login(credentials: AdminLogin):
    if credentials.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin password")

    token = create_token({
        "is_admin": True,
        "role": "admin"
    }, expires_delta=timedelta(hours=8))

    return {"token": token}
