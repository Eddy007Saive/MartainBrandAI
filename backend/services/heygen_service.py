import httpx
import cloudinary
import cloudinary.uploader
from config import (
    HEYGEN_API_KEY,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    supabase,
    logger,
)

# Configure Cloudinary
cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET,
)


async def upload_to_cloudinary(file_bytes: bytes, filename: str, folder: str = "heygen_avatars"):
    """Upload video bytes to Cloudinary, return the secure URL."""
    result = cloudinary.uploader.upload(
        file_bytes,
        resource_type="video",
        folder=folder,
        public_id=filename,
        overwrite=True,
    )
    return result["secure_url"]


def delete_from_cloudinary(url: str):
    """Delete a video from Cloudinary by its URL."""
    try:
        parts = url.split("/upload/")
        if len(parts) < 2:
            return
        path = parts[1].split("/", 1)[1]  # skip version
        public_id = path.rsplit(".", 1)[0]  # remove extension
        cloudinary.uploader.destroy(public_id, resource_type="video")
        logger.info(f"Deleted from Cloudinary: {public_id}")
    except Exception as e:
        logger.warning(f"Failed to delete from Cloudinary: {e}")


async def fetch_preview_images(avatar_id: str):
    """Fetch avatar preview images from HeyGen API via avatar_group endpoint."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"https://api.heygen.com/v2/avatar_group/{avatar_id}/avatars",
            headers={
                "accept": "application/json",
                "x-api-key": HEYGEN_API_KEY,
            },
        )
        resp.raise_for_status()
        data = resp.json()

        avatars_list = data.get("data", {}).get("avatars", [])

        # Collect all preview image URLs from all avatars
        image_urls = []
        for av in avatars_list:
            if av.get("preview_image_url"):
                image_urls.append(av["preview_image_url"])
            if av.get("thumbnail_url"):
                image_urls.append(av["thumbnail_url"])

        # Deduplicate
        seen = set()
        unique = []
        for u in image_urls:
            if u not in seen:
                seen.add(u)
                unique.append(u)

        return unique


async def auto_fill_preview(telegram_id: int, avatar: dict):
    """If avatar_id exists but preview_image_url is empty, fetch from HeyGen and save."""
    if not avatar.get("avatar_id") or avatar.get("preview_image_url"):
        return avatar

    try:
        image_urls = await fetch_preview_images(avatar["avatar_id"])
        if image_urls:
            preview_str = ",".join(image_urls)
            supabase.table("heygen_avatars").update(
                {"preview_image_url": preview_str}
            ).eq("telegram_id", telegram_id).execute()
            avatar["preview_image_url"] = preview_str
            logger.info(f"Auto-filled preview images for user {telegram_id}")
    except Exception as e:
        logger.warning(f"Auto-fetch preview failed for {telegram_id}: {e}")

    return avatar


async def save_avatar_request(
    telegram_id: int,
    avatar_name: str,
    description: str,
    training_video_url: str,
):
    """Save a new avatar request with status 'pending'."""
    result = supabase.table("heygen_avatars").insert(
        {
            "telegram_id": telegram_id,
            "avatar_name": avatar_name,
            "description": description,
            "status": "pending",
            "training_video_url": training_video_url,
        }
    ).execute()
    return result.data


async def get_avatar_from_db(telegram_id: int):
    """Get user's avatar from DB."""
    result = supabase.table("heygen_avatars").select("*").eq(
        "telegram_id", telegram_id
    ).execute()
    return result.data[0] if result.data else None


def get_all_avatars():
    """Get all avatar requests (for admin)."""
    result = supabase.table("heygen_avatars").select(
        "*, users!inner(nom, username, email)"
    ).order("created_at", desc=True).execute()
    return result.data or []


def update_avatar_by_admin(telegram_id: int, update_data: dict):
    """Admin updates avatar info (avatar_id, status, error_message, consent_url)."""
    allowed_fields = {
        "avatar_id", "status", "error_message", "consent_url",
    }
    filtered = {k: v for k, v in update_data.items() if k in allowed_fields}
    if not filtered:
        return None

    # If status changes to complete, delete training video from Cloudinary
    if filtered.get("status") == "complete":
        avatar = supabase.table("heygen_avatars").select("training_video_url").eq(
            "telegram_id", telegram_id
        ).execute()
        if avatar.data and avatar.data[0].get("training_video_url"):
            delete_from_cloudinary(avatar.data[0]["training_video_url"])

    result = supabase.table("heygen_avatars").update(filtered).eq(
        "telegram_id", telegram_id
    ).execute()
    return result.data[0] if result.data else None
