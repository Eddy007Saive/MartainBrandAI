"""
Comptes liés : un master gère plusieurs sous-comptes (marques), pool de crédits partagé.
- master_id sur users : un sous-compte pointe vers son master.
- Bascule : on émet un token scopé sur le sous-compte (toutes les routes existantes marchent),
  en conservant l'identité du master dans le claim `master_id` pour autoriser les bascules suivantes.
"""
from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from services import auth_service, credit_service
from config import supabase, logger

router = APIRouter(prefix="/accounts", tags=["accounts"])

_CHILD_TABLES = [
    "analytics_cache", "analytics_performance", "anecdotes", "brand_templates", "brouillons",
    "commentaires", "contenu", "device_tokens", "erreur_log", "heygen_avatars", "interviews",
    "notifications", "plan_editorial", "planning_editorial", "publication_schedules", "settings",
    "studio", "studio_drafts", "usage_log",
]


def _effective_master(payload: dict) -> str:
    """Le master de la "famille" : claim master_id du token (si on a basculé), sinon soi-même."""
    return payload.get("master_id") or payload.get("telegram_id")


@router.get("")
async def list_accounts(payload: dict = Depends(verify_token)):
    """Liste les comptes de la famille (le master + ses sous-comptes) pour le sélecteur."""
    me = payload.get("telegram_id")
    if not me:
        raise HTTPException(status_code=400, detail="Invalid token")
    master = _effective_master(payload)
    try:
        res = (supabase.table("users")
               .select("telegram_id, nom, email, photo_url, logo_url, master_id")
               .or_(f"telegram_id.eq.{master},master_id.eq.{master}")
               .execute())
        rows = res.data or []
    except Exception as e:
        logger.error(f"list_accounts error: {e}")
        rows = []
    accounts = [{
        "telegram_id": r["telegram_id"],
        "nom": r.get("nom"),
        "email": r.get("email"),
        "photo_url": r.get("photo_url"),
        "logo_url": r.get("logo_url"),
        "is_master": r["telegram_id"] == master,
        "is_current": r["telegram_id"] == me,
    } for r in rows]
    # master en premier
    accounts.sort(key=lambda a: (not a["is_master"], (a["nom"] or "").lower()))
    return {"master_id": master, "accounts": accounts}


@router.post("")
async def create_account(body: dict, payload: dict = Depends(verify_token)):
    """Crée une nouvelle marque (sous-compte) rattachée au master courant."""
    master = _effective_master(payload)
    nom = (body.get("nom") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    if not nom or not email or len(password) < 6:
        raise HTTPException(status_code=400, detail="Nom, email et mot de passe (6+ caractères) requis")
    res = auth_service.register_user(nom=nom, email=email, username=nom, password=password, master_id=master)
    if res.get("error") == "email_exists":
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    if not res.get("success"):
        raise HTTPException(status_code=500, detail="Création impossible")
    return {"success": True, "telegram_id": res["telegram_id"], "nom": nom, "email": email}


@router.post("/switch")
async def switch_account(body: dict, payload: dict = Depends(verify_token)):
    """Bascule vers un compte de la famille : renvoie un token scopé sur ce compte."""
    target = body.get("telegram_id")
    if not target:
        raise HTTPException(status_code=400, detail="telegram_id requis")
    master = _effective_master(payload)

    res = supabase.table("users").select("telegram_id, email, master_id, nom").eq("telegram_id", target).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    row = res.data[0]
    # Autorisé si la cible est le master lui-même, ou un sous-compte du master
    if not (target == master or row.get("master_id") == master):
        raise HTTPException(status_code=403, detail="Accès non autorisé à ce compte")

    is_sub = target != master
    token = auth_service.create_token({
        "telegram_id": target,
        "email": row.get("email"),
        "is_admin": False,
        "master_id": master if is_sub else None,
    })
    return {"token": token, "telegram_id": target, "nom": row.get("nom")}


@router.delete("/{telegram_id}")
async def delete_account(telegram_id: str, payload: dict = Depends(verify_token)):
    """Supprime un sous-compte possédé par le master (jamais le master lui-même)."""
    master = _effective_master(payload)
    if telegram_id == master:
        raise HTTPException(status_code=400, detail="Impossible de supprimer le compte principal")
    res = supabase.table("users").select("master_id").eq("telegram_id", telegram_id).execute()
    if not res.data or res.data[0].get("master_id") != master:
        raise HTTPException(status_code=403, detail="Accès non autorisé à ce compte")
    for t in _CHILD_TABLES:
        try:
            supabase.table(t).delete().eq("telegram_id", telegram_id).execute()
        except Exception:
            pass
    supabase.table("users").delete().eq("telegram_id", telegram_id).execute()
    return {"success": True}
