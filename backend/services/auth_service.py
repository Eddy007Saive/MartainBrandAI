import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from config import JWT_SECRET, supabase, logger


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


def sanitize_user(user: dict) -> dict:
    if user:
        user.pop('password_hash', None)
    return user


def register_user(telegram_id: int, nom: str, email: str, username: str, password: str) -> dict:
    # Check if telegram_id already exists
    existing_id = supabase.table("users").select("telegram_id").eq("telegram_id", telegram_id).execute()
    if existing_id.data:
        return {"error": "telegram_id_exists"}

    # Check if email already exists
    existing = supabase.table("users").select("email").eq("email", email).execute()
    if existing.data:
        return {"error": "email_exists"}

    password_hash = hash_password(password)
    new_user = {
        "telegram_id": telegram_id,
        "nom": nom,
        "email": email,
        "username": username,
        "password_hash": password_hash,
        "actif": False,
        "couleur_principale": "#003D2E",
        "couleur_secondaire": "#0077FF",
        "couleur_accent": "#3AFFA3",
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    supabase.table("users").insert(new_user).execute()
    return {"success": True}


def login_user(email: str, password: str) -> dict:
    result = supabase.table("users").select("*").eq("email", email).execute()

    if not result.data:
        return {"error": "invalid"}

    user = result.data[0]

    if not verify_password(password, user.get("password_hash", "")):
        return {"error": "invalid"}

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
