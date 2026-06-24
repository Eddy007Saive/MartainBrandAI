"""
Inbox commentaires via l'API Late/Zernio (add-on Inbox requis -> 403 addon_required).
Deux niveaux : list_inbox (posts avec commentaires) -> post_comments (fil d'un post).
"""
from config import supabase, logger, LATE_API_KEY
from zernio import Zernio, ZernioError


def _client():
    return Zernio(api_key=LATE_API_KEY)


def _profile(telegram_id):
    res = supabase.table("users").select("late_profile_id").eq("telegram_id", telegram_id).execute()
    return res.data[0].get("late_profile_id") if res.data else None


async def list_inbox(telegram_id: str, platform: str | None = None) -> dict:
    if not LATE_API_KEY:
        return {"ok": False, "error": "Indisponible (non configuré)."}
    profile = _profile(telegram_id)
    if not profile:
        return {"ok": True, "connected": False}
    kw = {"profile_id": profile, "limit": 50}
    if platform:
        kw["platform"] = platform.lower()
    try:
        async with _client() as c:
            r = await c.comments.alist_inbox_comments(**kw)
    except ZernioError as e:
        if getattr(e, "status_code", None) in (402, 403):
            return {"ok": True, "addon_required": True}
        logger.error(f"inbox list error: {getattr(e, 'message', e)}")
        return {"ok": False, "error": "Inbox indisponible pour le moment."}
    except Exception as e:
        logger.error(f"inbox list error: {e}")
        return {"ok": False, "error": "Inbox indisponible pour le moment."}
    return {"ok": True, "connected": True, "items": r.get("data") or []}


async def post_comments(post_id: str, account_id: str) -> dict:
    try:
        async with _client() as c:
            r = await c.comments.aget_inbox_post_comments(post_id, account_id, limit=50)
        return {"ok": True, "comments": r.get("comments") or []}
    except ZernioError as e:
        if getattr(e, "status_code", None) in (402, 403):
            return {"ok": True, "addon_required": True}
        return {"ok": False, "error": "Commentaires indisponibles."}
    except Exception as e:
        logger.error(f"post comments error: {e}")
        return {"ok": False, "error": "Commentaires indisponibles."}


async def reply(post_id: str, account_id: str, message: str, comment_id: str | None = None) -> dict:
    try:
        async with _client() as c:
            await c.comments.areply_to_inbox_post(post_id, account_id, message, comment_id=comment_id)
        return {"ok": True}
    except Exception as e:
        logger.error(f"reply error: {e}")
        return {"ok": False, "error": "Échec de l'envoi de la réponse."}


async def _action(kind: str, post_id: str, comment_id: str, account_id: str) -> dict:
    try:
        async with _client() as c:
            if kind == "like":
                await c.comments.alike_inbox_comment(post_id, comment_id, account_id)
            elif kind == "unlike":
                await c.comments.aunlike_inbox_comment(post_id, comment_id, account_id)
            elif kind == "hide":
                await c.comments.ahide_inbox_comment(post_id, comment_id, account_id)
            elif kind == "unhide":
                await c.comments.aunhide_inbox_comment(post_id, comment_id, account_id)
            elif kind == "delete":
                await c.comments.adelete_inbox_comment(post_id, account_id, comment_id)
            else:
                return {"ok": False, "error": "Action inconnue."}
        return {"ok": True}
    except Exception as e:
        logger.error(f"comment {kind} error: {e}")
        return {"ok": False, "error": f"Échec de l'action ({kind})."}
