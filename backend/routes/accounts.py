"""
Comptes liés : un master gère plusieurs sous-comptes (marques), pool de crédits partagé.
- master_id sur users : un sous-compte pointe vers son master.
- Bascule : on émet un token scopé sur le sous-compte (toutes les routes existantes marchent),
  en conservant l'identité du master dans le claim `master_id` pour autoriser les bascules suivantes.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import timedelta
from dependencies import verify_token
from services import auth_service, credit_service
from config import supabase, logger, ADMIN_SESSION_HEURES

router = APIRouter(prefix="/accounts", tags=["accounts"])

# Tables portant un telegram_id, purgées à la suppression d'un sous-compte.
# (Nettoyage 2026-08-13 : tables archivées retirées, brand_assets ajoutée — elle manquait.)
_CHILD_TABLES = [
    "analytics_cache", "analytics_performance", "brand_assets", "brand_templates", "brouillons",
    "commentaires", "comptes_sociaux", "contenu", "device_tokens", "heygen_avatars",
    "notifications", "publication_schedules",
    "studio", "studio_drafts", "usage_log",
]


def _effective_master(payload: dict) -> str:
    """Le master de la « famille » : le compte qui possede les autres.

    Le jeton ne porte `master_id` qu'apres une bascule ; celui qu'on recoit en
    se connectant ne l'a pas. Un compte qui est LUI-MEME une sous-marque se
    croyait donc seul au monde : son selecteur ne montrait que lui, et toute
    bascule vers une marque soeur repartait en 403. On relit le rattachement
    en base quand le jeton se tait.
    """
    if payload.get("master_id"):
        return payload["master_id"]
    me = payload.get("telegram_id")
    try:
        r = (supabase.table("users").select("master_id")
             .eq("telegram_id", me).limit(1).execute())
        if r.data and r.data[0].get("master_id"):
            return r.data[0]["master_id"]
    except Exception as e:
        logger.warning(f"_effective_master {me}: {e}")
    return me


@router.get("")
def list_accounts(payload: dict = Depends(verify_token)):
    """Liste les comptes de la famille (le master + ses sous-comptes) pour le sélecteur."""
    me = payload.get("telegram_id")
    if not me:
        raise HTTPException(status_code=400, detail="Invalid token")
    master = _effective_master(payload)
    try:
        res = (supabase.table("users")
               .select("telegram_id, nom, email, photo_url, master_id")
               .or_(f"telegram_id.eq.{master},master_id.eq.{master}")
               .execute())
        rows = res.data or []
    except Exception as e:
        logger.error(f"list_accounts error: {e}")
        rows = []
    # Le logo appartient à la fiche de marque depuis la normalisation : une seule
    # requête pour toute la famille (pas d'appel par compte).
    logos = {}
    if rows:
        try:
            lm = (supabase.table("marques").select("telegram_id, logo_url")
                  .in_("telegram_id", [r["telegram_id"] for r in rows]).execute())
            logos = {m["telegram_id"]: m.get("logo_url") for m in (lm.data or [])}
        except Exception as e:
            logger.warning(f"list_accounts logos: {e}")
    accounts = [{
        "telegram_id": r["telegram_id"],
        "nom": r.get("nom"),
        "email": r.get("email"),
        "photo_url": r.get("photo_url"),
        "logo_url": logos.get(r["telegram_id"]),
        "is_master": r["telegram_id"] == master,
        "is_current": r["telegram_id"] == me,
    } for r in rows]
    # master en premier
    accounts.sort(key=lambda a: (not a["is_master"], (a["nom"] or "").lower()))
    return {"master_id": master, "accounts": accounts}


@router.post("")
def create_account(body: dict, payload: dict = Depends(verify_token)):
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
def switch_account(body: dict, payload: dict = Depends(verify_token)):
    """Bascule vers un compte de la famille : renvoie un token scopé sur ce compte."""
    target = body.get("telegram_id")
    if not target:
        raise HTTPException(status_code=400, detail="telegram_id requis")
    master = _effective_master(payload)

    res = (supabase.table("users").select("telegram_id, email, master_id, nom, is_admin")
           .eq("telegram_id", target).execute())
    if not res.data:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    row = res.data[0]
    # Autorisé si la cible est le master lui-même, ou un sous-compte du master
    if not (target == master or row.get("master_id") == master):
        raise HTTPException(status_code=403, detail="Accès non autorisé à ce compte")

    is_sub = target != master

    # La qualite d'administrateur suit la PERSONNE connectee, pas la marque
    # qu'elle regarde. Elle etait ecrite en dur a False : un administrateur qui
    # basculait vers une de ses marques la perdait, et definitivement — en
    # revenant sur son compte principal il recevait encore un jeton sans la
    # revendication. Il fallait se deconnecter pour la retrouver.
    #
    # On la relit donc sur « origine », le compte qui s'est authentifie. La
    # relire sur la CIBLE serait une elevation de privilege : une sous-marque
    # ordinaire a le droit de basculer vers son master, et si ce master est
    # administrateur, elle repartirait avec ses droits.
    origine = payload.get("origine") or payload.get("telegram_id")
    if origine == target:
        est_admin = bool(row.get("is_admin"))
    else:
        o = supabase.table("users").select("is_admin").eq("telegram_id", origine).execute()
        est_admin = bool(o.data and o.data[0].get("is_admin"))

    token = auth_service.create_token({
        "telegram_id": target,
        "email": row.get("email"),
        "is_admin": est_admin,
        "origine": origine,
        "master_id": master if is_sub else None,
    }, expires_delta=timedelta(hours=ADMIN_SESSION_HEURES) if est_admin else timedelta(days=7))
    return {"token": token, "telegram_id": target, "nom": row.get("nom")}


@router.delete("/{telegram_id}")
def delete_account(telegram_id: str, payload: dict = Depends(verify_token)):
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
