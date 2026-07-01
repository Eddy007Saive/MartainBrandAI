"""Audit de marque / onboarding public (lead anonyme).

Stocke les réponses du questionnaire public dans la table `brand_audits`.
Aucune authentification : c'est un formulaire de capture de lead.
"""
import uuid
from datetime import datetime, timezone
import cloudinary
import cloudinary.uploader
from config import (
    supabase, logger,
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
)

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)


def upload_asset(file_bytes: bytes, kind: str = "image") -> str:
    """Upload public (logo / image d'inspiration) sur Cloudinary. Retourne l'URL.

    Anonyme : pas de telegram_id. Rangé sous onboarding_audits/<kind>/<uuid>.
    """
    safe_kind = kind if kind in ("logo", "image") else "image"
    public_id = f"onboarding_audits/{safe_kind}/{uuid.uuid4().hex}"
    up = cloudinary.uploader.upload(
        file_bytes, resource_type="image", public_id=public_id, overwrite=True,
    )
    return up["secure_url"]


def save_audit(marque: str, email: str, answers: dict, recap: str, user_agent: str = "") -> dict:
    row = {
        "marque": (marque or "").strip()[:200] or None,
        "email": (email or "").strip()[:200] or None,
        "answers": answers or {},
        "recap": (recap or "")[:60000] or None,
        "user_agent": (user_agent or "")[:400] or None,
        "status": "nouveau",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = supabase.table("brand_audits").insert(row).execute()
    audit_id = res.data[0]["id"] if res.data else None
    logger.info(f"Nouvel audit de marque enregistré: {row['marque']} ({row['email']}) -> {audit_id}")
    return {"success": True, "id": audit_id}


def list_audits(limit: int = 100) -> list:
    res = (
        supabase.table("brand_audits")
        .select("id, marque, email, status, created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_audit(audit_id: str) -> dict | None:
    res = supabase.table("brand_audits").select("*").eq("id", audit_id).execute()
    return res.data[0] if res.data else None


def update_status(audit_id: str, status: str) -> None:
    supabase.table("brand_audits").update({"status": status}).eq("id", audit_id).execute()
