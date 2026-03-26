from config import supabase, logger


def get_stats(telegram_id: int) -> dict:
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


def get_performance(telegram_id: int) -> list:
    result = supabase.table("analytics_performance").select("*").eq("telegram_id", telegram_id).order("created_at", desc=True).limit(20).execute()
    return result.data
