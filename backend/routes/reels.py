from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from dependencies import verify_token
from services import reel_service
from config import logger

router = APIRouter(prefix="/reels", tags=["reels"])


class ReelRequest(BaseModel):
    contenu_id: str


@router.post("/generer")
def generer_reel(body: ReelRequest, payload: dict = Depends(verify_token)):
    """Transforme un post existant en reel MP4 anime a la charte du client (Remotion).
    Cree un contenu jumeau type 'Reel' en 'A valider' — publie ensuite par le flux normal.
    Rendu ~1-2 min : la requete est longue, le front doit prevoir un timeout large."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        res = reel_service.generer_reel(telegram_id, body.contenu_id)
    except Exception as e:
        logger.error(f"generer reel: {e}")
        raise HTTPException(status_code=500, detail="Echec de la generation du reel")
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res
