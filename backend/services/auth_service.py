import bcrypt
import jwt
import uuid
import hashlib
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


def register_user(nom: str, email: str, username: str, password: str, master_id: str = None) -> dict:
    # Email unique
    existing = supabase.table("users").select("email").eq("email", email).execute()
    if existing.data:
        return {"error": "email_exists"}

    # Identifiant interne généré (uuid) — plus de dépendance Telegram
    password_hash = hash_password(password)
    new_user = {
        "telegram_id": str(uuid.uuid4()),
        "nom": nom,
        "email": email,
        "username": username,
        "password_hash": password_hash,
        "actif": True,
        "plan": "gratuit",
        "credits": 100,
        "couleur_principale": "#003D2E",
        "couleur_secondaire": "#0077FF",
        "couleur_accent": "#3AFFA3",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    # Sous-compte rattaché à un master (regroupement + switch). Facturation PAR COMPTE :
    # le sous-compte garde ses propres crédits + forfait (définis ci-dessus).
    if master_id:
        new_user["master_id"] = master_id

    supabase.table("users").insert(new_user).execute()
    return {"success": True, "telegram_id": new_user["telegram_id"], "nom": nom, "email": email}


def _pwd_fingerprint(password_hash: str) -> str:
    """Empreinte courte du hash actuel — sert à rendre le lien de reset à usage unique."""
    return hashlib.sha256((password_hash or "").encode("utf-8")).hexdigest()[:16]


def create_reset_token(telegram_id: str, password_hash: str) -> str:
    """Token JWT de réinitialisation (1h). Lié au hash courant -> invalide dès que le mdp change."""
    return create_token(
        {"telegram_id": telegram_id, "type": "reset", "fp": _pwd_fingerprint(password_hash)},
        expires_delta=timedelta(hours=1),
    )


def find_user_by_email(email: str) -> dict | None:
    res = supabase.table("users").select("telegram_id, email, nom, username, password_hash").eq("email", email).execute()
    return res.data[0] if res.data else None


def reset_password(token: str, new_password: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return {"error": "expired"}
    except Exception:
        return {"error": "invalid"}
    if payload.get("type") != "reset":
        return {"error": "invalid"}
    telegram_id = payload.get("telegram_id")
    res = supabase.table("users").select("password_hash").eq("telegram_id", telegram_id).execute()
    if not res.data:
        return {"error": "invalid"}
    current_hash = res.data[0].get("password_hash", "")
    # Lien déjà utilisé : le hash a changé donc l'empreinte ne correspond plus
    if payload.get("fp") != _pwd_fingerprint(current_hash):
        return {"error": "used"}
    supabase.table("users").update({"password_hash": hash_password(new_password)}).eq("telegram_id", telegram_id).execute()
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


def change_password(telegram_id: str, old_password: str, new_password: str) -> dict:
    """Change le mot de passe après vérification de l'ancien."""
    r = supabase.table("users").select("password_hash").eq("telegram_id", telegram_id).execute()
    if not r.data:
        return {"error": "not_found"}
    if not verify_password(old_password, r.data[0].get("password_hash", "")):
        return {"error": "wrong_old"}
    if len(new_password) < 6:
        return {"error": "too_short"}
    supabase.table("users").update({"password_hash": hash_password(new_password)}).eq("telegram_id", telegram_id).execute()
    return {"success": True}


def login_admin(email: str, password: str) -> dict:
    """Connexion admin par email + mot de passe (compte avec is_admin=true)."""
    result = supabase.table("users").select("*").eq("email", email).execute()
    if not result.data:
        return {"error": "invalid"}
    user = result.data[0]
    if not verify_password(password, user.get("password_hash", "")):
        return {"error": "invalid"}
    if not user.get("is_admin"):
        return {"error": "not_admin"}
    token = create_token({
        "telegram_id": user["telegram_id"],
        "email": user["email"],
        "is_admin": True,
        "role": "admin",
    }, expires_delta=timedelta(hours=8))
    return {"token": token}
