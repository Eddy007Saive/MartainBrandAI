"""
Inbox commentaires via l'API Late/Zernio (add-on Inbox requis -> 403 addon_required).
Deux niveaux : list_inbox (posts avec commentaires) -> post_comments (fil d'un post).
Webhook `comment.received` -> notification push (temps réel, pas de polling).
"""
from config import supabase, logger, LATE_API_KEY
from zernio import Zernio, ZernioError

PLATFORMS = ["linkedin", "instagram", "facebook", "tiktok", "youtube"]


def _client():
    return Zernio(api_key=LATE_API_KEY)


def _norm_platform(p: str) -> str:
    return (p or "").lower().split(".")[-1]


def user_by_account(platform: str, account_id: str) -> str | None:
    """Retrouve le telegram_id du user propriétaire d'un compte social (late_account_<platform>)."""
    platform = _norm_platform(platform)
    if not account_id:
        return None
    cols = [f"late_account_{platform}"] if platform in PLATFORMS else [f"late_account_{p}" for p in PLATFORMS]
    for col in cols:
        try:
            res = supabase.table("users").select("telegram_id").eq(col, account_id).execute()
            if res.data:
                return res.data[0]["telegram_id"]
        except Exception:
            continue
    return None


def handle_comment_webhook(payload: dict) -> dict:
    """Traite l'event `comment.received` : notifie le user par push."""
    event = (payload.get("event") or payload.get("type") or "").lower()
    if event != "comment.received":
        return {"ok": True, "ignored": event}
    comment = payload.get("comment") or {}
    account = payload.get("account") or {}
    author = comment.get("author") or {}

    platform = _norm_platform(account.get("platform") or comment.get("platform"))
    account_id = account.get("id")
    # Ignore nos propres commentaires/réponses
    if author.get("username") and account.get("username") and author["username"] == account["username"]:
        return {"ok": True, "ignored": "self"}

    telegram_id = user_by_account(platform, account_id)
    if not telegram_id:
        logger.info(f"comment webhook: user introuvable pour {platform}/{account_id}")
        return {"ok": True, "no_user": True}

    author_name = author.get("name") or author.get("username") or "Quelqu'un"
    text = (comment.get("text") or "").strip()
    title = f"💬 Nouveau commentaire · {platform.capitalize()}"
    body = f"{author_name}: {text[:90]}" if text else f"{author_name} a commenté ton post"
    try:
        from services import push_service
        push_service.send_to_user(telegram_id, title, body, {
            "type": "comment",
            "platform": platform,
            "post_id": str(comment.get("postId") or comment.get("platformPostId") or ""),
            "account_id": str(account_id or ""),
        })
    except Exception as e:
        logger.warning(f"comment webhook push: {e}")
    return {"ok": True, "telegram_id": telegram_id, "platform": platform}


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
