"""Éditeur vidéo manuel : projets de montage (CRUD), médias mobilisables, export."""
from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from services import editeur_service, quota_service, demarrage_service
from models.montage import MontageCreer, MontageModifier, MontageRendre, MontageTranscrire

router = APIRouter(prefix="/editeur", tags=["editeur"])


def _tid(payload: dict) -> str:
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return telegram_id


@router.get("/montages")
def lister(payload: dict = Depends(verify_token)):
    return {"montages": editeur_service.lister(_tid(payload))}


@router.post("/montages")
def creer(body: MontageCreer, payload: dict = Depends(verify_token)):
    m = editeur_service.creer(_tid(payload), titre=body.titre, projet=body.projet, source_contenu_id=body.source_contenu_id)
    return m


@router.post("/montages/depuis-contenu/{contenu_id}")
def depuis_contenu(contenu_id: str, payload: dict = Depends(verify_token)):
    """Ouvre un reel ou une vidéo de Contenus dans l'éditeur (crée le montage ou rouvre l'existant)."""
    res = editeur_service.depuis_contenu(_tid(payload), contenu_id)
    if res.get("error"):
        raise HTTPException(status_code=404 if "introuvable" in res["error"] else 400, detail=res["error"])
    return res


@router.get("/medias")
def medias(payload: dict = Depends(verify_token)):
    return editeur_service.medias(_tid(payload))


@router.get("/montages/{montage_id}")
def lire(montage_id: str, payload: dict = Depends(verify_token)):
    m = editeur_service.lire(_tid(payload), montage_id)
    if not m:
        raise HTTPException(status_code=404, detail="Montage introuvable.")
    return m


@router.put("/montages/{montage_id}")
def modifier(montage_id: str, body: MontageModifier, payload: dict = Depends(verify_token)):
    m = editeur_service.modifier(_tid(payload), montage_id, projet=body.projet, titre=body.titre)
    if not m:
        raise HTTPException(status_code=404, detail="Montage introuvable.")
    return {"id": m["id"], "statut": m.get("statut"), "updated_at": m.get("updated_at")}


@router.delete("/montages/{montage_id}")
def supprimer(montage_id: str, payload: dict = Depends(verify_token)):
    if not editeur_service.supprimer(_tid(payload), montage_id):
        raise HTTPException(status_code=404, detail="Montage introuvable.")
    return {"success": True}


@router.post("/montages/{montage_id}/rendre")
def rendre(montage_id: str, body: MontageRendre, payload: dict = Depends(verify_token)):
    """Exporte le montage en vidéo (1 reel de quota) : la ligne Contenus passe en rendu en cours."""
    telegram_id = _tid(payload)
    demarrage_service.exiger_profil(telegram_id)
    quota_service.exiger_abonnement(telegram_id)
    res = editeur_service.rendre(telegram_id, montage_id, reseau=body.reseau, titre=body.titre)
    if res.get("error_quota"):
        q = res["error_quota"]
        raise HTTPException(status_code=402, detail={"raison": q.get("reason") or "quota",
                                                     "message": q.get("message") or "Quota de reels épuisé."})
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@router.post("/montages/{montage_id}/transcrire")
async def transcrire(montage_id: str, body: MontageTranscrire, payload: dict = Depends(verify_token)):
    """« Générer les sous-titres » d'un plan vidéo : transcription Whisper par Studio Montage,
    sous-titres posés sur la piste dédiée. Gratuit, plafonné à 10 par heure et par compte."""
    telegram_id = _tid(payload)
    from services import rate_limit
    cle = f"transcrire:{telegram_id}"
    if rate_limit.locked_for(cle) > 0:
        raise HTTPException(status_code=429, detail="Beaucoup de transcriptions d'un coup. Réessaie dans quelques minutes.")
    rate_limit.fail(cle, 10, 3600, 600)
    res = await editeur_service.transcrire(telegram_id, montage_id, body.element_id)
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res
