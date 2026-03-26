import io
import csv
from datetime import datetime, timezone, timedelta
from config import supabase, logger
from services.auth_service import sanitize_user


def get_users(filter: str = "all") -> list:
    query = supabase.table("users").select("*")
    if filter == "pending":
        query = query.eq("actif", False)
    elif filter == "active":
        query = query.eq("actif", True)
    result = query.order("created_at", desc=True).execute()
    return [sanitize_user(user) for user in result.data]


def get_user_detail(telegram_id: int) -> dict | None:
    user_result = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
    if not user_result.data:
        return None

    user = sanitize_user(user_result.data[0])

    contenus = supabase.table("contenu").select("id, statut").eq("telegram_id", telegram_id).execute()
    contenus_stats = {}
    for c in contenus.data:
        statut = c.get("statut", "Inconnu")
        contenus_stats[statut] = contenus_stats.get(statut, 0) + 1

    commentaires = supabase.table("commentaires").select("id").eq("telegram_id", telegram_id).execute()

    user["stats"] = {
        "total_contenus": len(contenus.data),
        "contenus_par_statut": contenus_stats,
        "total_commentaires": len(commentaires.data)
    }
    return user


def get_user_contenus(telegram_id: int) -> list:
    result = supabase.table("contenu").select("*").eq("telegram_id", telegram_id).order("created_at", desc=True).execute()
    return result.data


def get_global_stats() -> dict:
    users = supabase.table("users").select("telegram_id, actif, created_at").execute()
    total_users = len(users.data)
    active_users = len([u for u in users.data if u.get("actif")])
    pending_users = total_users - active_users

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    new_users_week = len([u for u in users.data if u.get("created_at", "") > week_ago])

    contenus = supabase.table("contenu").select("id, statut, reseau_cible, created_at").execute()
    total_contenus = len(contenus.data)
    contenus_par_statut = {}
    contenus_par_reseau = {}
    for c in contenus.data:
        statut = c.get("statut", "Inconnu")
        contenus_par_statut[statut] = contenus_par_statut.get(statut, 0) + 1
        reseau = c.get("reseau_cible", "Autre")
        if reseau:
            contenus_par_reseau[reseau] = contenus_par_reseau.get(reseau, 0) + 1

    commentaires = supabase.table("commentaires").select("id, statut").execute()
    total_commentaires = len(commentaires.data)
    commentaires_nouveaux = len([c for c in commentaires.data if c.get("statut") == "Nouveau"])

    analytics = supabase.table("analytics_performance").select("vues, likes, partages").execute()
    total_vues = sum(float(a.get("vues", 0) or 0) for a in analytics.data)
    total_likes = sum(float(a.get("likes", 0) or 0) for a in analytics.data)
    total_partages = sum(float(a.get("partages", 0) or 0) for a in analytics.data)

    return {
        "users": {
            "total": total_users,
            "actifs": active_users,
            "en_attente": pending_users,
            "nouveaux_semaine": new_users_week
        },
        "contenus": {
            "total": total_contenus,
            "par_statut": contenus_par_statut,
            "par_reseau": contenus_par_reseau
        },
        "commentaires": {
            "total": total_commentaires,
            "nouveaux": commentaires_nouveaux
        },
        "engagement": {
            "vues": int(total_vues),
            "likes": int(total_likes),
            "partages": int(total_partages)
        }
    }


def export_users_csv() -> str:
    users = supabase.table("users").select("*").order("created_at", desc=True).execute()
    output = io.StringIO()
    writer = csv.writer(output)
    headers = ["telegram_id", "nom", "email", "username", "actif", "sexe", "style_vestimentaire", "created_at"]
    writer.writerow(headers)
    for user in users.data:
        row = [user.get(h, "") for h in headers]
        writer.writerow(row)
    output.seek(0)
    return output.getvalue()


def get_activity(limit: int = 50) -> list:
    contenus = supabase.table("contenu").select("id, titre, statut, telegram_id, created_at, updated_at").order("updated_at", desc=True).limit(limit).execute()
    users = supabase.table("users").select("telegram_id, nom, email, actif, created_at").order("created_at", desc=True).limit(limit).execute()

    activities = []
    for c in contenus.data:
        activities.append({
            "type": "contenu",
            "action": f"Contenu {c.get('statut', 'créé')}",
            "title": c.get("titre") or "Sans titre",
            "user_id": c.get("telegram_id"),
            "date": c.get("updated_at") or c.get("created_at"),
            "id": c.get("id")
        })
    for u in users.data:
        activities.append({
            "type": "user",
            "action": "Inscription" if not u.get("actif") else "Utilisateur actif",
            "title": u.get("nom") or u.get("email"),
            "user_id": u.get("telegram_id"),
            "date": u.get("created_at"),
            "id": u.get("telegram_id")
        })

    activities.sort(key=lambda x: x.get("date", ""), reverse=True)
    return activities[:limit]
