from datetime import datetime, timezone, timedelta
from config import supabase, logger, LATE_API_KEY
from zernio import Zernio, ZernioError

_METRICS = ("impressions", "reach", "likes", "comments", "shares", "saves", "clicks", "views")


async def performance(telegram_id: str, days: int = 30, platform: str | None = None) -> dict:
    """Performances réelles via l'API analytics de Late (add-on requis -> 402/403)."""
    if not LATE_API_KEY:
        return {"ok": False, "error": "Analytics indisponible (non configuré)."}
    res = supabase.table("users").select("late_profile_id").eq("telegram_id", telegram_id).execute()
    profile = res.data[0].get("late_profile_id") if res.data else None
    if not profile:
        return {"ok": True, "connected": False}

    to_d = datetime.now(timezone.utc)
    fr = (to_d - timedelta(days=days)).date().isoformat()
    to = to_d.date().isoformat()
    common = {"profile_id": profile, "from_date": fr, "to_date": to}
    if platform:
        common["platform"] = platform.lower()

    try:
        async with Zernio(api_key=LATE_API_KEY) as c:
            an = await c.analytics.aget_analytics(limit=100, **common)
            try:
                daily = await c.analytics.aget_daily_metrics(**common)
            except Exception:
                daily = {}
            try:
                best = await c.analytics.aget_best_time_to_post(profile_id=profile)
            except Exception:
                best = {}
    except ZernioError as e:
        if getattr(e, "status_code", None) in (402, 403):
            return {"ok": True, "addon_required": True}
        logger.error(f"analytics error: {getattr(e, 'message', e)}")
        return {"ok": False, "error": "Analytics indisponible pour le moment."}
    except Exception as e:
        logger.error(f"analytics error: {e}")
        return {"ok": False, "error": "Analytics indisponible pour le moment."}

    posts_raw = an.get("posts") or []
    agg = {k: 0 for k in _METRICS}
    posts = []
    for p in posts_raw:
        a = p.get("analytics") or {}
        for k in _METRICS:
            agg[k] += a.get(k) or 0
        posts.append({
            "id": p.get("_id"), "content": p.get("content"), "platform": p.get("platform"),
            "publishedAt": p.get("publishedAt"), "thumbnailUrl": p.get("thumbnailUrl"),
            "url": p.get("platformPostUrl"),
            "metrics": {k: (a.get(k) or 0) for k in _METRICS},
            "engagementRate": a.get("engagementRate") or 0,
        })
    posts.sort(key=lambda x: x["metrics"]["impressions"], reverse=True)
    engagements = agg["likes"] + agg["comments"] + agg["shares"] + agg["saves"]
    eng_rate = round(engagements / agg["impressions"] * 100, 1) if agg["impressions"] else 0
    return {
        "ok": True, "connected": True,
        "kpis": {**agg, "engagements": engagements, "engagementRate": eng_rate},
        "overview": an.get("overview") or {},
        "posts": posts,
        "daily": daily.get("dailyData") or [],
        "platformBreakdown": daily.get("platformBreakdown") or [],
        "bestSlots": (best or {}).get("slots") or [],
    }


# --- Cache (alimenté par le cron horaire) ---

def get_cached(telegram_id: str) -> dict | None:
    """Retourne {'data':..., 'updated_at':...} ou None."""
    try:
        res = supabase.table("analytics_cache").select("data, updated_at").eq("telegram_id", telegram_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.warning(f"analytics cache read: {e}")
        return None


def store_cache(telegram_id: str, data: dict):
    try:
        supabase.table("analytics_cache").upsert({
            "telegram_id": telegram_id,
            "data": data,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.warning(f"analytics cache write: {e}")


async def refresh_user(telegram_id: str) -> dict:
    """Récupère les analytics (30 j) et les met en cache. Cron + refresh manuel."""
    data = await performance(telegram_id, days=30)
    if data.get("ok") and data.get("connected"):
        store_cache(telegram_id, data)
    return data


async def refresh_all() -> dict:
    """Cron : rafraîchit le cache analytics de tous les users actifs ayant un profil Late."""
    if not LATE_API_KEY:
        return {"ok": False, "skipped": "no_late_key"}
    try:
        res = supabase.table("users").select("telegram_id").eq("actif", True).not_.is_("late_profile_id", "null").execute()
        users = res.data or []
    except Exception as e:
        logger.error(f"refresh_all users query: {e}")
        return {"ok": False, "error": str(e)}
    done, errors = 0, 0
    for u in users:
        try:
            await refresh_user(u["telegram_id"])
            done += 1
        except Exception as e:
            errors += 1
            logger.warning(f"refresh_all {u['telegram_id']}: {e}")
    logger.info(f"analytics cron: {done} users rafraîchis, {errors} erreurs")
    return {"ok": True, "refreshed": done, "errors": errors}


def get_stats(telegram_id: str) -> dict:
    analytics = supabase.table("analytics_performance").select("*").eq("telegram_id", telegram_id).execute()

    total_vues = sum(float(a.get("vues", 0) or 0) for a in analytics.data)
    total_likes = sum(float(a.get("likes", 0) or 0) for a in analytics.data)
    total_commentaires = sum(int(a.get("commentaires", 0) or 0) for a in analytics.data)
    total_partages = sum(float(a.get("partages", 0) or 0) for a in analytics.data)

    engagements = [float(a.get("taux_engagement", 0) or 0) for a in analytics.data if a.get("taux_engagement")]
    avg_engagement = sum(engagements) / len(engagements) if engagements else 0

    contenus = supabase.table("contenu").select("statut").eq("telegram_id", telegram_id).execute()
    contenus_stats = {}
    for c in contenus.data:
        statut = c.get("statut", "Inconnu")
        contenus_stats[statut] = contenus_stats.get(statut, 0) + 1

    new_comments = supabase.table("commentaires").select("id").eq("telegram_id", telegram_id).eq("statut", "Nouveau").execute()

    return {
        "vues": int(total_vues),
        "likes": int(total_likes),
        "commentaires": total_commentaires,
        "partages": int(total_partages),
        "taux_engagement": round(avg_engagement, 2),
        "contenus_stats": contenus_stats,
        "nouveaux_commentaires": len(new_comments.data),
        "posts_performants": len([a for a in analytics.data if a.get("post_performant")])
    }


def get_performance(telegram_id: str) -> list:
    result = supabase.table("analytics_performance").select("*").eq("telegram_id", telegram_id).order("created_at", desc=True).limit(20).execute()
    return result.data
