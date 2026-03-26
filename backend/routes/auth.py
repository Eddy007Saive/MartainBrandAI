from fastapi import APIRouter, HTTPException
from datetime import timedelta
from models.auth import UserRegister, UserLogin, AdminLogin
from services.auth_service import login_user, register_user, create_token
from config import ADMIN_PASSWORD, logger

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


@router.post("/admin-login")
async def admin_login(credentials: AdminLogin):
    if credentials.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin password")

    token = create_token({
        "is_admin": True,
        "role": "admin"
    }, expires_delta=timedelta(hours=8))

    return {"token": token}
