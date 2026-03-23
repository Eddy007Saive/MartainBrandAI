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
import httpx
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

class ScheduleItem(BaseModel):
    platform: str
    frequency: str = "weekly"
    days_of_week: List[int] = []
    preferred_time: str = "09:00"
    is_active: bool = True

class ScheduleUpdate(BaseModel):
    schedules: List[ScheduleItem]

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

VALID_PLATFORMS = {"instagram", "facebook", "linkedin", "tiktok", "youtube"}

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

@admin_router.get("/users/{telegram_id}")
async def get_user_detail(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    """Get detailed user profile"""
    try:
        user_result = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
        
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user = sanitize_user(user_result.data[0])
        
        # Get user's contenus count
        contenus = supabase.table("contenu").select("id, statut").eq("telegram_id", telegram_id).execute()
        contenus_stats = {}
        for c in contenus.data:
            statut = c.get("statut", "Inconnu")
            contenus_stats[statut] = contenus_stats.get(statut, 0) + 1
        
        # Get user's commentaires count
        commentaires = supabase.table("commentaires").select("id").eq("telegram_id", telegram_id).execute()
        
        user["stats"] = {
            "total_contenus": len(contenus.data),
            "contenus_par_statut": contenus_stats,
            "total_commentaires": len(commentaires.data)
        }
        
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user detail error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@admin_router.get("/users/{telegram_id}/contenus")
async def get_user_contenus(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    """Get all contenus for a specific user"""
    try:
        result = supabase.table("contenu").select("*").eq("telegram_id", telegram_id).order("created_at", desc=True).execute()
        return result.data
    except Exception as e:
        logger.error(f"Get user contenus error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@admin_router.get("/stats")
async def get_admin_stats(payload: dict = Depends(verify_admin_token)):
    """Get global platform statistics"""
    try:
        # Users stats
        users = supabase.table("users").select("telegram_id, actif, created_at").execute()
        total_users = len(users.data)
        active_users = len([u for u in users.data if u.get("actif")])
        pending_users = total_users - active_users
        
        # New users this week
        from datetime import timedelta
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        new_users_week = len([u for u in users.data if u.get("created_at", "") > week_ago])
        
        # Contenus stats
        contenus = supabase.table("contenu").select("id, statut, reseau_cible, created_at").execute()
        total_contenus = len(contenus.data)
        contenus_par_statut = {}
        contenus_par_reseau = {}
        for c in contenus.data:
            statut = c.get("statut", "Inconnu")
            contenus_par_statut[statut] = contenus_par_statut.get(statut, 0) + 1
            reseau = c.get("reseau_cible", "Autre")
            if reseau:
                contenus_par_reseau[reseau] = contenus_par_reseau.get(reseau, 0) + 1
        
        # Commentaires stats
        commentaires = supabase.table("commentaires").select("id, statut").execute()
        total_commentaires = len(commentaires.data)
        commentaires_nouveaux = len([c for c in commentaires.data if c.get("statut") == "Nouveau"])
        
        # Analytics totals
        analytics = supabase.table("analytics_performance").select("vues, likes, partages").execute()
        total_vues = sum(float(a.get("vues", 0) or 0) for a in analytics.data)
        total_likes = sum(float(a.get("likes", 0) or 0) for a in analytics.data)
        total_partages = sum(float(a.get("partages", 0) or 0) for a in analytics.data)
        
        return {
            "users": {
                "total": total_users,
                "actifs": active_users,
                "en_attente": pending_users,
                "nouveaux_semaine": new_users_week
            },
            "contenus": {
                "total": total_contenus,
                "par_statut": contenus_par_statut,
                "par_reseau": contenus_par_reseau
            },
            "commentaires": {
                "total": total_commentaires,
                "nouveaux": commentaires_nouveaux
            },
            "engagement": {
                "vues": int(total_vues),
                "likes": int(total_likes),
                "partages": int(total_partages)
            }
        }
    except Exception as e:
        logger.error(f"Get admin stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@admin_router.get("/export/users")
async def export_users_csv(payload: dict = Depends(verify_admin_token)):
    """Export all users as CSV"""
    try:
        from fastapi.responses import StreamingResponse
        import io
        import csv
        
        users = supabase.table("users").select("*").order("created_at", desc=True).execute()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Headers
        headers = ["telegram_id", "nom", "email", "username", "actif", "sexe", "style_vestimentaire", "created_at"]
        writer.writerow(headers)
        
        # Data
        for user in users.data:
            row = [user.get(h, "") for h in headers]
            writer.writerow(row)
        
        output.seek(0)
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=users_export.csv"}
        )
    except Exception as e:
        logger.error(f"Export users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@admin_router.get("/activity")
async def get_activity_logs(limit: int = 50, payload: dict = Depends(verify_admin_token)):
    """Get recent activity (contenus and users created)"""
    try:
        # Recent contenus
        contenus = supabase.table("contenu").select("id, titre, statut, telegram_id, created_at, updated_at").order("updated_at", desc=True).limit(limit).execute()
        
        # Recent users
        users = supabase.table("users").select("telegram_id, nom, email, actif, created_at").order("created_at", desc=True).limit(limit).execute()
        
        # Combine into activity feed
        activities = []
        
        for c in contenus.data:
            activities.append({
                "type": "contenu",
                "action": f"Contenu {c.get('statut', 'créé')}",
                "title": c.get("titre") or "Sans titre",
                "user_id": c.get("telegram_id"),
                "date": c.get("updated_at") or c.get("created_at"),
                "id": c.get("id")
            })
        
        for u in users.data:
            activities.append({
                "type": "user",
                "action": "Inscription" if not u.get("actif") else "Utilisateur actif",
                "title": u.get("nom") or u.get("email"),
                "user_id": u.get("telegram_id"),
                "date": u.get("created_at"),
                "id": u.get("telegram_id")
            })
        
        # Sort by date
        activities.sort(key=lambda x: x.get("date", ""), reverse=True)
        
        return activities[:limit]
    except Exception as e:
        logger.error(f"Get activity error: {e}")
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

@admin_router.post("/users/{telegram_id}/retry-late")
async def retry_late_profile(telegram_id: int, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = result.data[0]
        if not user.get("actif"):
            raise HTTPException(status_code=400, detail="L'utilisateur doit être actif pour créer un profil Late")

        late_profile_created = False
        late_error = None
        try:
            webhook_url = f"{N8N_WEBHOOK_BASE}/late-create-profile"
            webhook_body = {"telegram_id": telegram_id, "nom": user.get("nom", "")}
            logger.info(f"Retry Late profile: POST {webhook_url} body={webhook_body}")
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(webhook_url, json=webhook_body)
                logger.info(f"Retry Late response: status={resp.status_code} body={resp.text}")
                if resp.status_code == 200:
                    late_profile_created = True
                else:
                    late_error = f"Late a répondu avec le statut {resp.status_code}"
        except Exception as e:
            late_error = str(e)
            logger.warning(f"Retry Late profile failed for {telegram_id}: {e}")

        return {"late_profile_created": late_profile_created, "late_error": late_error}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retry Late error: {e}")
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

# ============ SCHEDULES ROUTES ============

VALID_FREQUENCIES = ['daily', '3_per_week', 'weekly', 'biweekly', 'custom']
VALID_SCHEDULE_PLATFORMS = ['linkedin', 'instagram', 'facebook', 'tiktok', 'youtube']

@users_router.get("/me/schedules")
async def get_schedules(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        result = supabase.table("publication_schedules").select("*").eq("telegram_id", telegram_id).execute()
        return result.data
    except Exception as e:
        logger.error(f"Get schedules error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@users_router.put("/me/schedules")
async def update_schedules(data: ScheduleUpdate, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        logger.info(f"Schedules received: {[{'platform': s.platform, 'frequency': s.frequency, 'is_active': s.is_active} for s in data.schedules]}")
        for item in data.schedules:
            if item.platform not in VALID_SCHEDULE_PLATFORMS:
                logger.error(f"Invalid platform rejected: '{item.platform}' (valid: {VALID_SCHEDULE_PLATFORMS})")
                raise HTTPException(status_code=400, detail=f"Invalid platform: {item.platform}")
            if item.frequency not in VALID_FREQUENCIES:
                logger.error(f"Invalid frequency rejected: '{item.frequency}' for platform '{item.platform}' (valid: {VALID_FREQUENCIES})")
                raise HTTPException(status_code=400, detail=f"Invalid frequency: {item.frequency}")

            row = {
                "telegram_id": telegram_id,
                "platform": item.platform,
                "frequency": item.frequency,
                "days_of_week": item.days_of_week,
                "preferred_time": item.preferred_time,
                "is_active": item.is_active,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            supabase.table("publication_schedules").upsert(
                row, on_conflict="telegram_id,platform"
            ).execute()

        result = supabase.table("publication_schedules").select("*").eq("telegram_id", telegram_id).execute()
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update schedules error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ CONTENUS ROUTES ============
contenus_router = APIRouter(prefix="/contenus", tags=["contenus"])

@contenus_router.get("")
async def get_contenus(statut: str = None, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        query = supabase.table("contenu").select("*").eq("telegram_id", telegram_id)
        
        if statut:
            query = query.eq("statut", statut)
        
        result = query.order("created_at", desc=True).execute()
        return result.data
    except Exception as e:
        logger.error(f"Get contenus error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@contenus_router.get("/{contenu_id}")
async def get_contenu(contenu_id: str, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        result = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Contenu not found")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get contenu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ContenuUpdate(BaseModel):
    statut: Optional[str] = None
    titre: Optional[str] = None
    contenu: Optional[str] = None
    date_publication: Optional[str] = None

@contenus_router.patch("/{contenu_id}")
async def update_contenu(contenu_id: str, updates: ContenuUpdate, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        
        # Get current content to check callback_url
        current = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Contenu not found")
        
        contenu_data = current.data[0]
        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # If validating content and callback_url exists, call the webhook
        webhook_result = None
        if updates.statut == "Validé" and contenu_data.get("callback_url"):
            callback_url = contenu_data["callback_url"]
            try:
                logger.info(f"Calling validation webhook: {callback_url}")
                async with httpx.AsyncClient(timeout=30) as client:
                    webhook_response = await client.post(
                        callback_url,
                        json={
                            "contenu_id": contenu_id,
                            "telegram_id": telegram_id,
                            "action": "validate",
                            "statut": "Validé"
                        }
                    )
                    logger.info(f"Webhook response: {webhook_response.status_code}")
                    webhook_result = {
                        "success": webhook_response.status_code == 200,
                        "status_code": webhook_response.status_code
                    }
            except Exception as webhook_error:
                logger.error(f"Webhook error: {webhook_error}")
                webhook_result = {"success": False, "error": str(webhook_error)}
        
        # Update in database
        result = supabase.table("contenu").update(update_data).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        
        response = result.data[0] if result.data else contenu_data
        if webhook_result:
            response["webhook_result"] = webhook_result
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update contenu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@contenus_router.delete("/{contenu_id}")
async def delete_contenu(contenu_id: str, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        result = supabase.table("contenu").delete().eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Contenu not found")
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete contenu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ COMMENTAIRES ROUTES ============
commentaires_router = APIRouter(prefix="/commentaires", tags=["commentaires"])

@commentaires_router.get("")
async def get_commentaires(statut: str = None, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        query = supabase.table("commentaires").select("*").eq("telegram_id", telegram_id)
        
        if statut:
            query = query.eq("statut", statut)
        
        result = query.order("created_at", desc=True).execute()
        return result.data
    except Exception as e:
        logger.error(f"Get commentaires error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CommentaireUpdate(BaseModel):
    statut: Optional[str] = None
    reponse_ia: Optional[str] = None

@commentaires_router.patch("/{commentaire_id}")
async def update_commentaire(commentaire_id: str, updates: CommentaireUpdate, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
        
        result = supabase.table("commentaires").update(update_data).eq("id", commentaire_id).eq("telegram_id", telegram_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Commentaire not found")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update commentaire error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ ANALYTICS ROUTES ============
analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])

@analytics_router.get("/stats")
async def get_stats(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        
        # Get analytics
        analytics = supabase.table("analytics_performance").select("*").eq("telegram_id", telegram_id).execute()
        
        # Calculate totals
        total_vues = sum(float(a.get("vues", 0) or 0) for a in analytics.data)
        total_likes = sum(float(a.get("likes", 0) or 0) for a in analytics.data)
        total_commentaires = sum(int(a.get("commentaires", 0) or 0) for a in analytics.data)
        total_partages = sum(float(a.get("partages", 0) or 0) for a in analytics.data)
        
        # Average engagement
        engagements = [float(a.get("taux_engagement", 0) or 0) for a in analytics.data if a.get("taux_engagement")]
        avg_engagement = sum(engagements) / len(engagements) if engagements else 0
        
        # Count contenus by status
        contenus = supabase.table("contenu").select("statut").eq("telegram_id", telegram_id).execute()
        contenus_stats = {}
        for c in contenus.data:
            statut = c.get("statut", "Inconnu")
            contenus_stats[statut] = contenus_stats.get(statut, 0) + 1
        
        # Count new comments
        new_comments = supabase.table("commentaires").select("id").eq("telegram_id", telegram_id).eq("statut", "Nouveau").execute()
        
        return {
            "vues": int(total_vues),
            "likes": int(total_likes),
            "commentaires": total_commentaires,
            "partages": int(total_partages),
            "taux_engagement": round(avg_engagement, 2),
            "contenus_stats": contenus_stats,
            "nouveaux_commentaires": len(new_comments.data),
            "posts_performants": len([a for a in analytics.data if a.get("post_performant")])
        }
    except Exception as e:
        logger.error(f"Get stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@analytics_router.get("/performance")
async def get_performance(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        result = supabase.table("analytics_performance").select("*").eq("telegram_id", telegram_id).order("created_at", desc=True).limit(20).execute()
        return result.data
    except Exception as e:
        logger.error(f"Get performance error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ BROUILLONS ROUTES ============
brouillons_router = APIRouter(prefix="/brouillons", tags=["brouillons"])

@brouillons_router.get("")
async def get_brouillons(payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        result = supabase.table("brouillons").select("*").eq("telegram_id", telegram_id).order("created_at", desc=True).execute()
        return result.data
    except Exception as e:
        logger.error(f"Get brouillons error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Root route
@api_router.get("/")
async def root():
    return {"message": "API is running"}

# Include routers
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(admin_router)
api_router.include_router(contenus_router)
api_router.include_router(commentaires_router)
api_router.include_router(analytics_router)
api_router.include_router(brouillons_router)
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
