from datetime import datetime, timezone
from config import supabase, logger
from services.auth_service import sanitize_user


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
