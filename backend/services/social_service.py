import httpx
from zernio import Zernio, ZernioError
from config import N8N_WEBHOOK_BASE, LATE_API_KEY, supabase, logger

VALID_PLATFORMS = {"instagram", "facebook", "linkedin", "tiktok", "youtube"}

FIELD_MAP = {
    "instagram": "late_account_instagram",
    "facebook": "late_account_facebook",
    "linkedin": "late_account_linkedin",
    "youtube": "late_account_youtube",
    "tiktok": "late_account_tiktok",
}


def _err_from_response(resp) -> str:
    """Extrait un message d'erreur lisible de la réponse n8n (qui renvoie souvent le message
    de l'erreur levée dans son body), sinon retombe sur le texte brut / le statut."""
    try:
        d = resp.json()
        if isinstance(d, dict):
            msg = d.get("message") or d.get("error") or (d.get("detail") if isinstance(d.get("detail"), str) else None)
            if msg:
                return str(msg)[:300]
    except Exception:
        pass
    txt = (resp.text or "").strip()
    if txt:
        return txt[:300]
    return f"Le service a répondu avec le statut {resp.status_code}."


async def create_late_profile(telegram_id: str, nom: str) -> dict:
    """Crée le profil Late directement via le SDK (plus de dépendance n8n) et enregistre
    late_profile_id en base. Retourne {created: bool, late_profile_id?, error?}."""
    if not LATE_API_KEY:
        return {"created": False, "error": "Service de publication non configuré (contacte le support)."}
    name = (nom or "").strip() or f"Profil {str(telegram_id)[:8]}"

    def _link(pid: str, reused: bool):
        supabase.table("users").update({"late_profile_id": pid}).eq("telegram_id", telegram_id).execute()
        logger.info(f"Profil Late {'réutilisé' if reused else 'créé'} pour {telegram_id}: {pid} ({name})")
        return {"created": True, "late_profile_id": pid, "reused": reused}

    try:
        async with Zernio(api_key=LATE_API_KEY) as client:
            # 1) Réutiliser un profil existant du même nom (évite doublons + limite de profils)
            try:
                lst = await client.profiles.alist()
                ld = lst.model_dump() if hasattr(lst, "model_dump") else (lst or {})
                for p in (ld.get("profiles") or ld.get("data") or []):
                    pid = p.get("_id") or p.get("field_id")
                    if pid and (p.get("name") or "").strip().lower() == name.lower():
                        return _link(pid, reused=True)
            except Exception as e:
                logger.warning(f"create_late_profile: liste profils impossible ({e}) — on tente la création")

            # 2) Sinon, créer un nouveau profil
            r = await client.profiles.acreate(name=name)
            pid = getattr(getattr(r, "profile", None), "field_id", None)
            if not pid:
                d = r.model_dump() if hasattr(r, "model_dump") else {}
                prof = d.get("profile") or {}
                pid = prof.get("_id") or prof.get("field_id")
            if not pid:
                logger.error(f"create_late_profile: id absent dans la réponse pour {telegram_id}: {str(r)[:300]}")
                return {"created": False, "error": "Le profil de publication n'a pas pu être créé (réponse invalide)."}
            return _link(pid, reused=False)
    except ZernioError as e:
        msg = str(getattr(e, "message", "") or e)
        logger.error(f"create_late_profile ZernioError pour {telegram_id}: {msg}")
        if getattr(e, "status_code", None) == 403 or "limit" in msg.lower():
            return {"created": False, "error": "Limite de profils atteinte sur le compte de publication (le plan gratuit n'autorise que 2 profils). Libère un profil inutilisé ou passe à un plan supérieur."}
        return {"created": False, "error": "Impossible de créer le profil de publication. Réessaie dans un instant."}
    except Exception as e:
        logger.error(f"create_late_profile error pour {telegram_id}: {e}")
        return {"created": False, "error": "Impossible de créer le profil de publication. Réessaie dans un instant."}


async def _ensure_late_profile(telegram_id: str) -> tuple:
    """Filet de sécurité : crée le profil Late s'il manque, puis attend qu'il soit enregistré.
    Retourne (ok: bool, error: str | None)."""
    try:
        res = supabase.table("users").select("late_profile_id, nom").eq("telegram_id", telegram_id).execute()
    except Exception as e:
        logger.error(f"_ensure_late_profile lecture user {telegram_id}: {e}")
        return False, "Impossible de lire ton compte pour le moment. Réessaie."
    row = res.data[0] if res.data else {}
    if not row:
        return False, "Compte introuvable."
    if row.get("late_profile_id"):
        return True, None

    logger.info(f"connect: profil Late manquant pour {telegram_id} -> création automatique (backend/SDK)")
    cr = await create_late_profile(telegram_id, row.get("nom") or "")
    if cr.get("created") and cr.get("late_profile_id"):
        return True, None
    return False, cr.get("error") or "Impossible de créer le profil de publication."


async def connect_platform(telegram_id: str, platform: str) -> dict:
    # Filet de sécurité : garantir l'existence du profil Late avant toute connexion
    ok, err = await _ensure_late_profile(telegram_id)
    if not ok:
        return {"success": False, "error": err}

    webhook_url = f"{N8N_WEBHOOK_BASE}/late-connect"
    webhook_body = {"telegram_id": telegram_id, "platform": platform}
    logger.info(f"Social connect: POST {webhook_url} body={webhook_body}")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(webhook_url, json=webhook_body)
        logger.info(f"Social connect response: status={response.status_code} body={response.text[:300]}")
        if response.status_code != 200:
            return {"success": False, "error": _err_from_response(response)}
        result = response.json() if response.text else {}
        if result.get("success") and result.get("authUrl"):
            return {"success": True, "authUrl": result["authUrl"]}
        return {"success": False, "error": result.get("message") or result.get("error") or "Réponse inattendue du service de connexion."}
    except httpx.TimeoutException:
        logger.error(f"connect timeout for {telegram_id}/{platform}")
        return {"success": False, "error": "Le service de connexion n'a pas répondu à temps. Réessaie."}
    except Exception as e:
        logger.error(f"connect error for {telegram_id}/{platform}: {e}")
        return {"success": False, "error": "Impossible de joindre le service de connexion. Réessaie."}


async def disconnect_platform(telegram_id: str, platform: str) -> dict:
    webhook_url = f"{N8N_WEBHOOK_BASE}/late-disconnect"
    webhook_body = {"telegram_id": telegram_id, "platform": platform}
    logger.info(f"Social disconnect: POST {webhook_url} body={webhook_body}")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(webhook_url, json=webhook_body)
        logger.info(f"Social disconnect response: status={response.status_code} body={response.text[:300]}")
        if response.status_code != 200:
            return {"success": False, "error": _err_from_response(response)}
    except httpx.TimeoutException:
        logger.error(f"disconnect timeout for {telegram_id}/{platform}")
        return {"success": False, "error": "Le service de déconnexion n'a pas répondu à temps. Réessaie."}
    except Exception as e:
        logger.error(f"disconnect error for {telegram_id}/{platform}: {e}")
        return {"success": False, "error": "Impossible de joindre le service de déconnexion. Réessaie."}

    # Nettoie le champ en base (best-effort)
    field = FIELD_MAP.get(platform)
    if field:
        try:
            supabase.table("users").update({field: None}).eq("telegram_id", telegram_id).execute()
        except Exception as e:
            logger.warning(f"disconnect cleanup {telegram_id}/{platform}: {e}")

    return {"success": True}
