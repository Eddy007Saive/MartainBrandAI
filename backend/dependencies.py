from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from config import JWT_SECRET
from services import auth_service

security = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    # Invalidation : mot de passe modifié (empreinte `fp`) ou déconnexion posée après
    # l'émission du jeton (`iat` < users.sessions_invalidees_le).
    fp = payload.get("fp")
    tg = payload.get("telegram_id")
    if tg and not auth_service.session_valid(tg, fp, payload.get("iat")):
        raise HTTPException(status_code=401, detail="Session expirée")
    from services import suivi_erreurs
    suivi_erreurs.identifier(tg)
    return payload


def verify_admin_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials)
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload
