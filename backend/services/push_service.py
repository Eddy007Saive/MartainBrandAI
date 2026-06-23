"""
Notifications push via Firebase Cloud Messaging (API HTTP v1).

Auth par service account (env FIREBASE_SERVICE_ACCOUNT = JSON, sinon fichier local
backend/firebase-service-account.json). Si non configuré -> no-op (l'app marche sans push).
"""
import os
import json
import httpx
from config import supabase, logger

_FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
_creds = None
_project_id = None
_loaded = False


def _load():
    global _creds, _project_id, _loaded
    if _loaded:
        return _creds
    _loaded = True
    try:
        from google.oauth2 import service_account
        import base64
        info = None
        b64 = os.getenv("FIREBASE_SERVICE_ACCOUNT_B64")
        raw = os.getenv("FIREBASE_SERVICE_ACCOUNT")
        if b64:
            info = json.loads(base64.b64decode(b64).decode("utf-8"))
        elif raw:
            raw = raw.strip()
            # tolère une valeur entourée de guillemets
            if len(raw) >= 2 and raw[0] == raw[-1] == '"':
                raw = raw[1:-1]
            try:
                info = json.loads(raw)
            except json.JSONDecodeError:
                # private_key avec de vrais retours à la ligne -> on les ré-échappe en \n
                import re
                fixed = re.sub(r'(-----BEGIN [^-]+-----)(.*?)(-----END [^-]+-----)',
                               lambda m: (m.group(1) + m.group(2).replace("\n", "\\n") + m.group(3)),
                               raw, flags=re.DOTALL)
                info = json.loads(fixed)
        else:
            path = os.path.join(os.path.dirname(__file__), "..", "firebase-service-account.json")
            if not os.path.exists(path):
                logger.info("Push FCM non configuré (pas de service account) — push désactivé")
                return None
            with open(path, encoding="utf-8") as f:
                info = json.load(f)
        _project_id = info.get("project_id")
        _creds = service_account.Credentials.from_service_account_info(info, scopes=[_FCM_SCOPE])
    except Exception as e:
        logger.warning(f"Push FCM init error: {e}")
        _creds = None
    return _creds


def _access_token():
    creds = _load()
    if not creds:
        return None
    try:
        from google.auth.transport.requests import Request
        if not creds.valid:
            creds.refresh(Request())
        return creds.token
    except Exception as e:
        logger.warning(f"Push FCM token error: {e}")
        return None


def send_to_user(telegram_id: str, title: str, body: str, data: dict | None = None):
    """Envoie un push à tous les appareils de l'utilisateur. Best-effort, jamais bloquant."""
    token = _access_token()
    if not token or not _project_id:
        return
    try:
        rows = supabase.table("device_tokens").select("token").eq("telegram_id", telegram_id).execute()
        device_tokens = [r["token"] for r in (rows.data or []) if r.get("token")]
    except Exception as e:
        logger.warning(f"Push: lecture device_tokens: {e}")
        return
    if not device_tokens:
        return

    url = f"https://fcm.googleapis.com/v1/projects/{_project_id}/messages:send"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload_data = {k: str(v) for k, v in (data or {}).items()}
    for tk in device_tokens:
        msg = {"message": {
            "token": tk,
            "notification": {"title": title, "body": body},
            "data": payload_data,
            "android": {"priority": "high"},
        }}
        try:
            r = httpx.post(url, headers=headers, json=msg, timeout=15)
            if r.status_code >= 400:
                txt = r.text.lower()
                if r.status_code == 404 or "unregistered" in txt or "not-registered" in txt or "invalid-argument" in txt:
                    # token mort -> on le purge
                    supabase.table("device_tokens").delete().eq("token", tk).execute()
                else:
                    logger.warning(f"FCM send {r.status_code}: {r.text[:200]}")
        except Exception as e:
            logger.warning(f"FCM send error: {e}")
