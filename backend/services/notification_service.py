"""
Notifications in-app + push pour les evenements hors publication (rendus en
arriere-plan, etc.). `late_service._notify` reste dedie aux evenements Zernio
(type "publication") ; ici le type est libre. Best-effort : ne leve jamais.
"""
from config import supabase, logger


def notifier(telegram_id: str, contenu_id, reseau: str, event: str, titre: str,
             message: str, type_: str = "rendu") -> None:
    """Insere une notification (cloche) et envoie un push a tous les appareils du
    compte. `contenu_id` permet au front de ramener vers la liste Contenus."""
    if not telegram_id:
        return
    try:
        supabase.table("notifications").insert({
            "telegram_id": telegram_id, "type": type_, "event": event,
            "titre": titre, "message": message,
            "contenu_id": str(contenu_id) if contenu_id else None, "reseau": reseau,
        }).execute()
    except Exception as e:
        logger.warning(f"notification insert ({event}): {e}")
    try:
        from services import push_service
        push_service.send_to_user(telegram_id, titre, message,
                                  {"event": event, "contenu_id": str(contenu_id or "")})
    except Exception as e:
        logger.warning(f"notification push ({event}): {e}")
