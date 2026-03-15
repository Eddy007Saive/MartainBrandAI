from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from supabase import create_client, Client
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Supabase connection
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_ANON_KEY')
supabase: Client = create_client(supabase_url, supabase_key)

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
N8N_WEBHOOK_BASE = os.environ.get('N8N_WEBHOOK_BASE', 'https://n8n.srv903010.hstgr.cloud/webhook')

# Create the main app
app = FastAPI()

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Models
class UserRegister(BaseModel):
    telegram_id: Optional[int] = None
    nom: str
    email: EmailStr
    username: Optional[str] = None
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class AdminLogin(BaseModel):
    password: str

class UserUpdate(BaseModel):
    nom: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    use_photo: Optional[bool] = None
    user_name: Optional[str] = None
    style_vestimentaire: Optional[str] = None
    sexe: Optional[str] = None
    couleur_principale: Optional[str] = None
    couleur_secondaire: Optional[str] = None
    couleur_accent: Optional[str] = None
    api_key_gemini: Optional[str] = None
    late_profile_id: Optional[str] = None
    late_account_linkedin: Optional[str] = None
    late_account_instagram: Optional[str] = None
    late_account_facebook: Optional[str] = None
    late_account_tiktok: Optional[str] = None
    gpt_url_linkedin: Optional[str] = None
    gpt_url_instagram: Optional[str] = None
    gpt_url_sujets: Optional[str] = None
    gpt_url_default: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_bot_username: Optional[str] = None

class UserResponse(BaseModel):
    telegram_id: Optional[int] = None
    nom: str
    username: Optional[str] = None
    email: str
    actif: bool = False
    photo_url: Optional[str] = None
    use_photo: Optional[bool] = None
    user_name: Optional[str] = None
    style_vestimentaire: Optional[str] = None
    sexe: Optional[str] = None
    couleur_principale: Optional[str] = None
    couleur_secondaire: Optional[str] = None
    couleur_accent: Optional[str] = None
    api_key_gemini: Optional[str] = None
    late_profile_id: Optional[str] = None
    late_account_linkedin: Optional[str] = None
    late_account_instagram: Optional[str] = None
    late_account_facebook: Optional[str] = None
    late_account_tiktok: Optional[str] = None
    gpt_url_linkedin: Optional[str] = None
    gpt_url_instagram: Optional[str] = None
    gpt_url_sujets: Optional[str] = None
    gpt_url_default: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_bot_username: Optional[str] = None
    created_at: Optional[str] = None

# Helper functions
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(data: dict, expires_delta: timedelta = timedelta(days=7)) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm="HS256")

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def verify_admin_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials)
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload

def sanitize_user(user: dict) -> dict:
    """Remove sensitive fields from user data"""
    if user:
        user.pop('password_hash', None)
    return user

# Auth routes
@auth_router.post("/register")
async def register(user_data: UserRegister):
    try:
        # telegram_id is required (must come from Telegram bot link)
        if not user_data.telegram_id:
            raise HTTPException(status_code=400, detail="telegram_id_required")
        
        telegram_id = user_data.telegram_id
        
        # Check if telegram_id already exists
        existing_id = supabase.table("users").select("telegram_id").eq("telegram_id", telegram_id).execute()
        if existing_id.data:
            raise HTTPException(status_code=400, detail="telegram_id_exists")
        
        # Check if email already exists
        existing = supabase.table("users").select("email").eq("email", user_data.email).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="email_exists")
        
        # Hash password and insert user
        password_hash = hash_password(user_data.password)
        new_user = {
            "telegram_id": telegram_id,
            "nom": user_data.nom,
            "email": user_data.email,
            "username": user_data.username,
            "password_hash": password_hash,
            "actif": False,
            "couleur_principale": "#003D2E",
            "couleur_secondaire": "#0077FF",
            "couleur_accent": "#3AFFA3",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        result = supabase.table("users").insert(new_user).execute()
        
        return {"success": True, "message": "Registration successful. Awaiting admin approval."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@auth_router.post("/login")
async def login(credentials: UserLogin):
    try:
        # Find user by email
        result = supabase.table("users").select("*").eq("email", credentials.email).execute()
        
        if not result.data:
            raise HTTPException(status_code=401, detail="invalid")
        
        user = result.data[0]
        
        # Verify password
        if not verify_password(credentials.password, user.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="invalid")

        # Generate token (even for pending users, so they can check their status)
        token = create_token({
            "telegram_id": user["telegram_id"],
            "email": user["email"],
            "is_admin": False
        })

        return {
            "token": token,
            "user": sanitize_user(user),
            "pending": not user.get("actif", False)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@auth_router.post("/admin-login")
async def admin_login(credentials: AdminLogin):
    if credentials.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin password")
    
    token = create_token({
        "is_admin": True,
        "role": "admin"
    }, expires_delta=timedelta(hours=8))
    
    return {"token": token}

# User routes
@users_router.get("/me")
async def get_current_user(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        if not telegram_id:
            raise HTTPException(status_code=400, detail="Invalid token")
        
        result = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        return sanitize_user(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@users_router.delete("/me")
async def delete_current_user(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        if not telegram_id:
            raise HTTPException(status_code=400, detail="Invalid token")

        result = supabase.table("users").delete().eq("telegram_id", telegram_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        return {"success": True, "message": "Account deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete account error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@users_router.patch("/me")
async def update_current_user(updates: UserUpdate, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        if not telegram_id:
            raise HTTPException(status_code=400, detail="Invalid token")
        
        # Filter out None values
        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        result = supabase.table("users").update(update_data).eq("telegram_id", telegram_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        return sanitize_user(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class SocialConnectRequest(BaseModel):
    platform: str

VALID_PLATFORMS = {"instagram", "facebook", "linkedin", "youtube"}

@users_router.post("/me/connect")
async def connect_social(data: SocialConnectRequest, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if data.platform not in VALID_PLATFORMS:
        raise HTTPException(status_code=400, detail="Invalid platform")
    try:
        webhook_url = f"{N8N_WEBHOOK_BASE}/late-connect"
        webhook_body = {"telegram_id": telegram_id, "platform": data.platform}
        logger.info(f"Social connect: POST {webhook_url} body={webhook_body}")
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(webhook_url, json=webhook_body)
            logger.info(f"Social connect response: status={response.status_code} body={response.text}")
            if response.status_code != 200:
                return {"success": False, "error": f"Le service a répondu avec le statut {response.status_code}"}
            result = response.json()
            if result.get("success") and result.get("authUrl"):
                return {"success": True, "authUrl": result["authUrl"]}
            return {"success": False, "error": result.get("message", "Réponse inattendue du service de connexion")}
    except httpx.TimeoutException:
        logger.error(f"Social connect timeout for {telegram_id}/{data.platform}")
        return {"success": False, "error": "Le service de connexion n'a pas répondu à temps"}
    except Exception as e:
        logger.error(f"Social connect error: {e}")
        return {"success": False, "error": f"Erreur de communication: {str(e)}"}

@users_router.post("/me/disconnect")
async def disconnect_social(data: SocialConnectRequest, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if data.platform not in VALID_PLATFORMS:
        raise HTTPException(status_code=400, detail="Invalid platform")
    try:
        webhook_url = f"{N8N_WEBHOOK_BASE}/late-disconnect"
        webhook_body = {"telegram_id": telegram_id, "platform": data.platform}
        logger.info(f"Social disconnect: POST {webhook_url} body={webhook_body}")
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(webhook_url, json=webhook_body)
            logger.info(f"Social disconnect response: status={response.status_code} body={response.text}")
            if response.status_code != 200:
                return {"success": False, "error": f"Le service a répondu avec le statut {response.status_code}"}

        # Clean the field in database
        field_map = {
            "instagram": "late_account_instagram",
            "facebook": "late_account_facebook",
            "linkedin": "late_account_linkedin",
            "youtube": "late_account_youtube",
        }
        field = field_map[data.platform]
        supabase.table("users").update({field: None}).eq("telegram_id", telegram_id).execute()

        return {"success": True}
    except httpx.TimeoutException:
        logger.error(f"Social disconnect timeout for {telegram_id}/{data.platform}")
        return {"success": False, "error": "Le service de déconnexion n'a pas répondu à temps"}
    except Exception as e:
        logger.error(f"Social disconnect error: {e}")
        return {"success": False, "error": f"Erreur de communication: {str(e)}"}

# Admin routes
@admin_router.get("/users")
async def get_users(filter: str = "all", payload: dict = Depends(verify_admin_token)):
    try:
        query = supabase.table("users").select("*")
        
        if filter == "pending":
            query = query.eq("actif", False)
        elif filter == "active":
            query = query.eq("actif", True)
        
        result = query.order("created_at", desc=True).execute()
        
        return [sanitize_user(user) for user in result.data]
    except Exception as e:
        logger.error(f"Get users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@admin_router.patch("/users/{telegram_id}/activate")
async def activate_user(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").update({"actif": True}).eq("telegram_id", telegram_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = result.data[0]

        # Create Late profile via n8n webhook
        late_profile_created = False
        late_error = None
        try:
            webhook_url = f"{N8N_WEBHOOK_BASE}/late-create-profile"
            webhook_body = {"telegram_id": telegram_id, "nom": user.get("nom", "")}
            logger.info(f"Calling Late webhook: POST {webhook_url} with body={webhook_body}")
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(webhook_url, json=webhook_body)
                logger.info(f"Late webhook response: status={resp.status_code} body={resp.text}")
                if resp.status_code == 200:
                    late_profile_created = True
                else:
                    late_error = f"Late a répondu avec le statut {resp.status_code}"
        except Exception as e:
            late_error = str(e)
            logger.warning(f"Failed to create Late profile for {telegram_id}: {e}")

        response = sanitize_user(user)
        response["late_profile_created"] = late_profile_created
        if late_error:
            response["late_error"] = late_error

        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Activate user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@admin_router.patch("/users/{telegram_id}/deactivate")
async def deactivate_user(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").update({"actif": False}).eq("telegram_id", telegram_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        return sanitize_user(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Deactivate user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@admin_router.delete("/users/{telegram_id}")
async def delete_user(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").delete().eq("telegram_id", telegram_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {"success": True, "message": "User deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Root route
@api_router.get("/")
async def root():
    return {"message": "API is running"}

# Include routers
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(admin_router)
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    pass
