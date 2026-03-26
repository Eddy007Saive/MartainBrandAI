from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from dependencies import verify_token
from services import heygen_service
from config import logger, supabase

router = APIRouter(prefix="/heygen", tags=["heygen"])

MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB


@router.post("/create-avatar")
async def create_avatar(
    training_video: UploadFile = File(...),
    description: str = Form(""),
    payload: dict = Depends(verify_token),
):
    """Upload training video with description. Saves as pending for admin review."""
    try:
        telegram_id = payload.get("telegram_id")
        if not telegram_id:
            raise HTTPException(status_code=400, detail="Invalid token")

        # Check if user already has a pending/active avatar
        existing = await heygen_service.get_avatar_from_db(telegram_id)
        if existing and existing["status"] in ("pending", "in_progress", "complete"):
            raise HTTPException(
                status_code=400,
                detail="Vous avez déjà une demande d'avatar en cours ou un avatar actif.",
            )

        # Get user's name
        user_result = supabase.table("users").select("nom, username").eq("telegram_id", telegram_id).execute()
        if not user_result.data:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        user = user_result.data[0]
        avatar_name = user.get("nom") or user.get("username") or f"Avatar_{telegram_id}"

        # Validate file type
        if not training_video.content_type or not training_video.content_type.startswith("video/"):
            raise HTTPException(
                status_code=400,
                detail=f"Le fichier {training_video.filename} n'est pas une vidéo valide",
            )

        # Read file
        training_bytes = await training_video.read()

        if len(training_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail="La vidéo dépasse la taille maximale de 500MB",
            )

        # Upload to Cloudinary for storage
        logger.info(f"Uploading training video to Cloudinary for user {telegram_id}")
        training_cloud_url = await heygen_service.upload_to_cloudinary(
            training_bytes, f"training_{telegram_id}", f"heygen_avatars/{telegram_id}"
        )

        # Save to DB with status "pending"
        await heygen_service.save_avatar_request(
            telegram_id=telegram_id,
            avatar_name=avatar_name,
            description=description,
            training_video_url=training_cloud_url,
        )

        return {
            "message": "Demande d'avatar soumise avec succès",
            "status": "pending",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create avatar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avatar")
async def get_avatar(payload: dict = Depends(verify_token)):
    """Get current user's avatar info."""
    try:
        telegram_id = payload.get("telegram_id")
        if not telegram_id:
            raise HTTPException(status_code=400, detail="Invalid token")

        avatar = await heygen_service.get_avatar_from_db(telegram_id)

        # Auto-fill preview images if avatar_id exists but preview_image_url is empty
        if avatar:
            avatar = await heygen_service.auto_fill_preview(telegram_id, avatar)

        return {"avatar": avatar}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get avatar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/avatar")
async def delete_avatar(payload: dict = Depends(verify_token)):
    """Delete user's avatar record."""
    try:
        telegram_id = payload.get("telegram_id")
        if not telegram_id:
            raise HTTPException(status_code=400, detail="Invalid token")

        supabase.table("heygen_avatars").delete().eq(
            "telegram_id", telegram_id
        ).execute()

        return {"message": "Avatar supprimé"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete avatar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
