from fastapi import APIRouter, HTTPException, Request
from datetime import timedelta
from models.auth import UserRegister, UserLogin, AdminLogin, GoogleLogin, CodeVerifier, CodeRenvoyer
from services.auth_service import (
    login_user, login_admin, register_user, create_token,
    find_user_by_email, create_reset_token, reset_password, login_google,
)
from services import mail_service, rate_limit, affiliation_service, mfa_service
from services.social_service import create_late_profile
from config import FRONTEND_URL, GOOGLE_CLIENT_ID, logger

router = APIRouter(prefix="/auth", tags=["auth"])

# Anti-bruteforce : verrou par (ip+email) après 5 échecs/15 min ; par ip après 20 échecs/15 min.
_LOGIN = (5, 900, 900)       # max_fails, window, lock (s)
_LOGIN_IP = (20, 900, 1800)


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "?"


def _guard_login(request: Request, email: str):
    """Lève 429 si l'ip ou (ip+email) est verrouillé. Retourne les clés pour fail/clear."""
    ip = _client_ip(request)
    k = f"login:{ip}:{(email or '').lower()}"
    ki = f"loginip:{ip}"
    rem = max(rate_limit.locked_for(k), rate_limit.locked_for(ki))
    if rem > 0:
        raise HTTPException(status_code=429, detail=f"Trop de tentatives. Réessaie dans {rem // 60 + 1} min.")
    return k, ki


def _record_login_fail(keys):
    rate_limit.fail(keys[0], *_LOGIN)
    rate_limit.fail(keys[1], *_LOGIN_IP)


@router.post("/register")
async def register(user_data: UserRegister, request: Request):
    try:
        result = register_user(
            nom=user_data.nom,
            email=user_data.email,
            username=user_data.username,
            password=user_data.password,
            langue=user_data.langue,
            fuseau=user_data.fuseau,
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        telegram_id = result["telegram_id"]

        # Parrainage : le front transmet le code capté dans l'URL. Best-effort,
        # une attribution ratée ne doit jamais faire échouer une inscription.
        if user_data.ref:
            try:
                affiliation_service.attribuer(user_data.ref, telegram_id=telegram_id,
                                              email=result.get("email"),
                                              ip=_client_ip(request))
            except Exception as e:
                logger.warning(f"attribution affiliation ignorée pour {telegram_id}: {e}")

        # Compte actif immédiatement -> on crée son profil Late (best-effort)
        try:
            await create_late_profile(telegram_id, result.get("nom", ""))
        except Exception as e:
            logger.warning(f"Late profile creation failed for {telegram_id}: {e}")

        # Auto-login : on renvoie un token pour aller direct au dashboard
        token = create_token({"telegram_id": telegram_id, "email": result.get("email"), "is_admin": False})
        return {"success": True, "token": token, "pending": False}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _demander_code(result: dict, request: Request) -> dict:
    """Le mot de passe est bon mais l'appareil est inconnu (ou compte admin) :
    on envoie le code et on rend un jeton d'attente, pas une session."""
    tid = result["telegram_id"]
    code = mfa_service.creer_code(tid)
    if code:
        sujet, html = mail_service.code_connexion_html(result.get("nom"), code)
        envoi = await mail_service.send_email(result["email"], sujet, html)
        if envoi.get("error"):
            logger.error(f"mfa: envoi du code impossible pour {tid}: {envoi}")
            raise HTTPException(status_code=503, detail="envoi_code_impossible")
    return {"code_requis": True, "jeton": mfa_service.jeton_attente(tid),
            "email": mfa_service.masquer_email(result["email"])}


@router.post("/login")
async def login(credentials: UserLogin, request: Request):
    keys = _guard_login(request, credentials.email)
    try:
        result = login_user(credentials.email, credentials.password, appareil=credentials.appareil)
        if "error" in result:
            _record_login_fail(keys)
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
        rate_limit.clear(keys[0])
        if result.get("code_requis"):
            return await _demander_code(result, request)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/google/config")
def google_config():
    """Le client OAuth Google, lu au chargement par le bouton (vide = bouton masqué).
    Une seule variable à poser, côté serveur, plutôt qu'une par déploiement du front."""
    return {"client_id": GOOGLE_CLIENT_ID}


@router.post("/google")
async def google(body: GoogleLogin, request: Request):
    """Connexion / inscription « Continuer avec Google ». Même jeton que /login."""
    ip = _client_ip(request)
    ki = f"loginip:{ip}"
    if rate_limit.locked_for(ki) > 0:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Réessaie dans quelques minutes.")
    try:
        result = login_google(body.access_token, langue=body.langue, fuseau=body.fuseau)
    except ValueError as e:
        rate_limit.fail(ki, *_LOGIN_IP)
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        logger.error(f"auth google: {e}")
        raise HTTPException(status_code=500, detail="Connexion Google impossible")
    if result.get("nouveau"):
        # Mêmes suites qu'une inscription classique (best-effort, jamais bloquant).
        tid = result["telegram_id"]
        if body.ref:
            try:
                affiliation_service.attribuer(body.ref, telegram_id=tid, email=result["user"].get("email"), ip=ip)
            except Exception as e:
                logger.warning(f"attribution affiliation ignorée pour {tid}: {e}")
        try:
            await create_late_profile(tid, result["user"].get("nom", ""))
        except Exception as e:
            logger.warning(f"Late profile creation failed for {tid}: {e}")
    rate_limit.clear(ki)
    return {"token": result["token"], "is_admin": result["is_admin"], "pending": result["pending"],
            "nouveau": result["nouveau"]}


@router.post("/code/verifier")
def code_verifier(body: CodeVerifier, request: Request):
    """Deuxième temps de la connexion : le code reçu par email -> la session.
    `confiance` : l'appareil est retenu 30 jours (secret `appareil` à garder côté navigateur)."""
    ip = _client_ip(request)
    ki = f"loginip:{ip}"
    if rate_limit.locked_for(ki) > 0:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Réessaie dans quelques minutes.")
    try:
        res = mfa_service.verifier(body.jeton, body.code, confiance=body.confiance,
                                   libelle=request.headers.get("user-agent", "")[:160], ip=ip)
    except ValueError as e:
        if str(e) in ("code_faux", "trop_essais"):
            rate_limit.fail(ki, *_LOGIN_IP)
        raise HTTPException(status_code=401, detail=str(e))
    rate_limit.clear(ki)
    return {"token": res["token"], "is_admin": res["is_admin"], "pending": res["pending"],
            "appareil": res.get("appareil")}


@router.post("/code/renvoyer")
async def code_renvoyer(body: CodeRenvoyer, request: Request):
    """Un nouveau code, au plus un par minute."""
    try:
        code = mfa_service.renvoyer(body.jeton)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    if not code:
        raise HTTPException(status_code=429, detail="renvoi_trop_tot")
    u = supabase_user(mfa_service._lire_attente(body.jeton))
    sujet, html = mail_service.code_connexion_html(u.get("nom"), code)
    envoi = await mail_service.send_email(u["email"], sujet, html)
    if envoi.get("error"):
        raise HTTPException(status_code=503, detail="envoi_code_impossible")
    return {"ok": True, "email": mfa_service.masquer_email(u["email"])}


def supabase_user(telegram_id: str) -> dict:
    from config import supabase
    r = supabase.table("users").select("telegram_id, email, nom").eq("telegram_id", telegram_id).limit(1).execute()
    if not r.data:
        raise HTTPException(status_code=401, detail="jeton_invalide")
    return r.data[0]


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
                "Réinitialisation de votre mot de passe — Postorico",
                mail_service.reset_email_html(nom, link),
            )
            if res.get("error"):
                logger.error(f"Reset email non envoyé ({email}): {res['error']}")
    except Exception as e:
        logger.error(f"forgot-password error: {e}")
    # On ne révèle jamais si l'email existe
    return {"success": True, "message": "Si un compte est associé à cet email, un lien vient d'être envoyé."}


@router.post("/reset-password")
def reset_pw(body: dict):
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
async def admin_login(credentials: AdminLogin, request: Request):
    keys = _guard_login(request, credentials.email)
    result = login_admin(credentials.email, credentials.password, appareil=credentials.appareil)
    if "error" in result:
        _record_login_fail(keys)
        raise HTTPException(status_code=401, detail="Identifiants administrateur invalides.")
    rate_limit.clear(keys[0])
    if result.get("code_requis"):
        return await _demander_code(result, request)
    return result
