from config import supabase, logger


def get_commentaires(telegram_id: int, statut: str = None) -> list:
    query = supabase.table("commentaires").select("*").eq("telegram_id", telegram_id)
    if statut:
        query = query.eq("statut", statut)
    result = query.order("created_at", desc=True).execute()
    return result.data


def update_commentaire(commentaire_id: str, telegram_id: int, update_data: dict) -> dict | None:
    result = supabase.table("commentaires").update(update_data).eq("id", commentaire_id).eq("telegram_id", telegram_id).execute()
    return result.data[0] if result.data else None
