from datetime import datetime, timezone
import cloudinary
import cloudinary.uploader
from config import (
    supabase, logger,
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
)
from services.auth_service import sanitize_user

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)


def _public_id_from_cloudinary_url(url: str) -> str | None:
    """Extrait le public_id (avec dossier, sans extension/version) d'une URL Cloudinary."""
    if not url or "cloudinary.com" not in url or "/upload/" not in url:
        return None
    after = url.split("/upload/", 1)[1]
    parts = after.split("/")
    if parts and parts[0].startswith("v") and parts[0][1:].isdigit():
        parts = parts[1:]  # enlève le préfixe de version vNNNN
    path = "/".join(parts).rsplit(".", 1)[0]  # enlève l'extension
    return path or None


def _delete_old_photo(old_url: str | None, keep_public_id: str) -> None:
    """Supprime l'ancien asset Cloudinary (sauf si c'est le même public_id qu'on vient d'écrire)."""
    pid = _public_id_from_cloudinary_url(old_url or "")
    if not pid or pid == keep_public_id:
        return  # rien à supprimer, ou déjà écrasé par l'upload (overwrite)
    try:
        cloudinary.uploader.destroy(pid, resource_type="image", invalidate=True)
        logger.info(f"Ancienne photo Cloudinary supprimée: {pid}")
    except Exception as e:
        logger.warning(f"Échec suppression ancienne photo Cloudinary ({pid}): {e}")


def upload_photo(telegram_id: int, file_bytes: bytes) -> str:
    """Upload la photo de profil sur Cloudinary et met à jour users.photo_url. Retourne l'URL.

    Remplace l'ancienne photo : même public_id + overwrite (pas d'accumulation), et si
    l'ancienne URL pointait ailleurs sur Cloudinary, on supprime cet asset orphelin.
    """
    prev = supabase.table("users").select("photo_url").eq("telegram_id", telegram_id).execute()
    old_url = prev.data[0].get("photo_url") if prev.data else None

    public_id = f"avatars/{telegram_id}/profil"
    up = cloudinary.uploader.upload(
        file_bytes,
        resource_type="image",
        public_id=public_id,
        overwrite=True,
        invalidate=True,  # purge le cache CDN pour voir la nouvelle image tout de suite
    )
    url = up["secure_url"]
    supabase.table("users").update({"photo_url": url}).eq("telegram_id", telegram_id).execute()

    _delete_old_photo(old_url, keep_public_id=public_id)
    return url


def get_user(telegram_id: int) -> dict | None:
    result = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
    if not result.data:
        return None
    return sanitize_user(result.data[0])


def update_user(telegram_id: int, update_data: dict) -> dict | None:
    result = supabase.table("users").update(update_data).eq("telegram_id", telegram_id).execute()
    if not result.data:
        return None
    return sanitize_user(result.data[0])


def delete_user(telegram_id: int) -> bool:
    result = supabase.table("users").delete().eq("telegram_id", telegram_id).execute()
    return bool(result.data)
