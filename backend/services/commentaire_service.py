from config import supabase, logger


def get_commentaires(telegram_id: int, statut: str = None) -> list:
    query = supabase.table("commentaires").select("*").eq("telegram_id", telegram_id)
    if statut:
        query = query.eq("statut", statut)
    result = query.order("created_at", desc=True).execute()
    comments = result.data or []

    # Enrichir chaque commentaire avec le titre + réseau du contenu associé
    ids = list({c["contenu_id"] for c in comments if c.get("contenu_id")})
    infos = {}
    if ids:
        cont = supabase.table("contenu").select("id, titre, reseau_cible").in_("id", ids).execute()
        for row in (cont.data or []):
            infos[row["id"]] = row
    for c in comments:
        info = infos.get(c.get("contenu_id"))
        c["contenu_titre"] = info.get("titre") if info else None
        c["contenu_reseau"] = info.get("reseau_cible") if info else None

    return comments


def update_commentaire(commentaire_id: str, telegram_id: int, update_data: dict) -> dict | None:
    result = supabase.table("commentaires").update(update_data).eq("id", commentaire_id).eq("telegram_id", telegram_id).execute()
    return result.data[0] if result.data else None
