from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from dependencies import verify_token
from models.contenu import ContenuUpdate
from services import contenu_service
from config import logger

router = APIRouter(prefix="/contenus", tags=["contenus"])


@router.post("/{contenu_id}/image")
async def upload_contenu_image(contenu_id: str, file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Importe une image fournie par l'utilisateur comme visuel du contenu."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image (jpg, png, webp…)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 10 Mo)")
    try:
        res = contenu_service.upload_visuel(telegram_id, contenu_id, data)
    except Exception as e:
        logger.error(f"Upload contenu image error: {e}")
        raise HTTPException(status_code=500, detail="Échec de l'import de l'image")
    if not res:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    return res


@router.get("")
async def get_contenus(statut: str = None, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        return contenu_service.get_contenus(telegram_id, statut)
    except Exception as e:
        logger.error(f"Get contenus error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{contenu_id}")
async def get_contenu(contenu_id: str, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        contenu = contenu_service.get_contenu(contenu_id, telegram_id)
        if not contenu:
            raise HTTPException(status_code=404, detail="Contenu not found")
        return contenu
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get contenu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{contenu_id}")
async def update_contenu(contenu_id: str, updates: ContenuUpdate, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}

        result = await contenu_service.update_contenu(contenu_id, telegram_id, update_data)
        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Contenu not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update contenu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{contenu_id}")
async def delete_contenu(contenu_id: str, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        if not contenu_service.delete_contenu(contenu_id, telegram_id):
            raise HTTPException(status_code=404, detail="Contenu not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete contenu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
