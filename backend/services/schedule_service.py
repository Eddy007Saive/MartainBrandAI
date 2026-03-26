from datetime import datetime, timezone
from config import supabase, logger

VALID_FREQUENCIES = ['daily', '3_per_week', 'weekly', 'biweekly', 'custom']
VALID_SCHEDULE_PLATFORMS = ['linkedin', 'instagram', 'facebook', 'tiktok', 'youtube']


def get_schedules(telegram_id: int) -> list:
    result = supabase.table("publication_schedules").select("*").eq("telegram_id", telegram_id).execute()
    return result.data


def update_schedules(telegram_id: int, schedules: list) -> dict:
    for item in schedules:
        if item.platform not in VALID_SCHEDULE_PLATFORMS:
            return {"error": f"Invalid platform: {item.platform}"}
        if item.frequency not in VALID_FREQUENCIES:
            return {"error": f"Invalid frequency: {item.frequency}"}

    logger.info(f"Schedules received: {[{'platform': s.platform, 'frequency': s.frequency, 'is_active': s.is_active} for s in schedules]}")

    for item in schedules:
        row = {
            "telegram_id": telegram_id,
            "platform": item.platform,
            "frequency": item.frequency,
            "days_of_week": item.days_of_week,
            "preferred_time": item.preferred_time,
            "is_active": item.is_active,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table("publication_schedules").upsert(
            row, on_conflict="telegram_id,platform"
        ).execute()

    result = supabase.table("publication_schedules").select("*").eq("telegram_id", telegram_id).execute()
    return {"data": result.data}
