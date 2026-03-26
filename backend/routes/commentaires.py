from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from models.commentaire import CommentaireUpdate
from services import commentaire_service
from config import logger

router = APIRouter(prefix="/commentaires", tags=["commentaires"])


@router.get("")
async def get_commentaires(statut: str = None, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        return commentaire_service.get_commentaires(telegram_id, statut)
    except Exception as e:
        logger.error(f"Get commentaires error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{commentaire_id}")
async def update_commentaire(commentaire_id: str, updates: CommentaireUpdate, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}

        result = commentaire_service.update_commentaire(commentaire_id, telegram_id, update_data)
        if not result:
            raise HTTPException(status_code=404, detail="Commentaire not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update commentaire error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
