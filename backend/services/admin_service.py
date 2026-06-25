import io
import csv
from datetime import datetime, timezone, timedelta
from config import supabase, logger
from services.auth_service import sanitize_user

PLAN_CREDITS = {"gratuit": 100, "pro": 1000, "business": 3000}
PLAN_PRICE = {"gratuit": 0, "pro": 19, "business": 49}
_RESEAUX = ["linkedin", "instagram", "facebook", "tiktok", "youtube"]


def _reseaux_connectes(user: dict) -> list:
    return [r for r in _RESEAUX if user.get(f"late_account_{r}")]


def get_users(filter: str = "all", q: str = None) -> list:
    query = supabase.table("users").select("*")
    if filter == "pending":
        query = query.eq("actif", False)
    elif filter == "active":
        query = query.eq("actif", True)
    elif filter in ("gratuit", "pro", "business"):
        query = query.eq("plan", filter)
    result = query.order("created_at", desc=True).execute()
    users = [sanitize_user(user) for user in result.data]
    if q:
        ql = q.lower().strip()
        users = [u for u in users if ql in (u.get("nom") or "").lower()
                 or ql in (u.get("email") or "").lower()
                 or ql in (u.get("username") or "").lower()]
    for u in users:
        u["reseaux_connectes"] = _reseaux_connectes(u)
    return users


def get_user_detail(telegram_id: str) -> dict | None:
    user_result = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
    if not user_result.data:
        return None

    user = sanitize_user(user_result.data[0])

    contenus = supabase.table("contenu").select("id, statut, updated_at, created_at").eq("telegram_id", telegram_id).order("updated_at", desc=True).execute()
    contenus_stats = {}
    for c in contenus.data:
        statut = c.get("statut", "Inconnu")
        contenus_stats[statut] = contenus_stats.get(statut, 0) + 1

    commentaires = supabase.table("commentaires").select("id").eq("telegram_id", telegram_id).execute()

    user["reseaux_connectes"] = _reseaux_connectes(user)
    user["derniere_activite"] = (contenus.data[0].get("updated_at") or contenus.data[0].get("created_at")) if contenus.data else None
    user["stats"] = {
        "total_contenus": len(contenus.data),
        "contenus_par_statut": contenus_stats,
        "total_commentaires": len(commentaires.data)
    }
    return user


def update_credits(telegram_id: str, amount: int, mode: str = "set") -> dict | None:
    """mode 'set' = définit le solde, 'add' = ajoute (peut être négatif)."""
    if mode == "add":
        cur = supabase.table("users").select("credits").eq("telegram_id", telegram_id).execute()
        base = (cur.data[0].get("credits") or 0) if cur.data else 0
        new_val = base + amount
    else:
        new_val = amount
    new_val = max(0, int(new_val))
    res = supabase.table("users").update({"credits": new_val}).eq("telegram_id", telegram_id).execute()
    return sanitize_user(res.data[0]) if res.data else None


def update_plan(telegram_id: str, plan: str, reset_credits: bool = True) -> dict | None:
    if plan not in PLAN_CREDITS:
        return None
    upd = {"plan": plan}
    if reset_credits:
        upd["credits"] = PLAN_CREDITS[plan]
    res = supabase.table("users").update(upd).eq("telegram_id", telegram_id).execute()
    return sanitize_user(res.data[0]) if res.data else None


def reset_monthly_credits() -> dict:
    """Réinitialise le solde de crédits de chaque user au quota de son forfait."""
    done = {}
    for plan, cr in PLAN_CREDITS.items():
        res = supabase.table("users").update({"credits": cr}).eq("plan", plan).execute()
        done[plan] = len(res.data or [])
    return done


def system_info() -> dict:
    """Paramètres globaux : intégrations, barème crédits, coûts & marges (usage_log)."""
    from config import (
        LATE_API_KEY, STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, ANALYTICS_CRON_HOURS,
        CLOUDINARY_CLOUD_NAME, HEYGEN_API_KEY, CLAUDE_API_KEY, OPENROUTER_API_KEY,
    )
    from services import credit_service

    firebase_ok = False
    try:
        from services import push_service
        firebase_ok = bool(push_service._load())
    except Exception:
        firebase_ok = False

    integrations = {
        "Publication (Late)": bool(LATE_API_KEY),
        "Paiements (Stripe)": bool(STRIPE_SECRET_KEY and STRIPE_PRICE_PRO),
        "Notifications push (Firebase)": firebase_ok,
        "Médias (Cloudinary)": bool(CLOUDINARY_CLOUD_NAME),
        "Avatar vidéo (HeyGen)": bool(HEYGEN_API_KEY),
        "Génération IA": bool(CLAUDE_API_KEY or OPENROUTER_API_KEY),
    }

    # Coûts & marges depuis usage_log
    EUR_PER_CREDIT = PLAN_PRICE["pro"] / PLAN_CREDITS["pro"]  # valeur de vente d'un crédit (€)
    USD_TO_EUR = 0.92
    rows = supabase.table("usage_log").select("action, credits, cost_usd").execute().data or []
    per = {}
    tot_credits, tot_cost = 0, 0.0
    for r in rows:
        a = r.get("action") or "?"
        c = int(r.get("credits") or 0)
        cost = float(r.get("cost_usd") or 0)
        d = per.setdefault(a, {"n": 0, "credits": 0, "cost_usd": 0.0})
        d["n"] += 1; d["credits"] += c; d["cost_usd"] += cost
        tot_credits += c; tot_cost += cost

    def _margin(credits, cost_usd):
        revenue = credits * EUR_PER_CREDIT
        cost_eur = cost_usd * USD_TO_EUR
        return round((1 - cost_eur / revenue) * 100, 1) if revenue else 0

    usage = {
        "par_action": [
            {"action": a, "n": d["n"], "credits": d["credits"],
             "cost_usd": round(d["cost_usd"], 4), "marge": _margin(d["credits"], d["cost_usd"])}
            for a, d in sorted(per.items())
        ],
        "total": {
            "credits": tot_credits,
            "cost_usd": round(tot_cost, 4),
            "marge": _margin(tot_credits, tot_cost),
            "eur_par_credit": round(EUR_PER_CREDIT, 4),
        },
    }

    return {
        "integrations": integrations,
        "cron_analytics_h": ANALYTICS_CRON_HOURS,
        "bareme": credit_service.COUTS,
        "plans": {"credits": PLAN_CREDITS, "prix": PLAN_PRICE},
        "usage": usage,
    }


def broadcast_push(title: str, body: str, telegram_id: str = None) -> dict:
    """Envoie un push à un user (telegram_id) ou à tous ceux ayant un appareil enregistré."""
    from services import push_service
    if telegram_id:
        targets = [telegram_id]
    else:
        rows = supabase.table("device_tokens").select("telegram_id").execute()
        targets = list({r["telegram_id"] for r in (rows.data or []) if r.get("telegram_id")})
    sent = 0
    for t in targets:
        try:
            if push_service.send_to_user(t, title, body, {"type": "admin"}):
                sent += 1
        except Exception as e:
            logger.warning(f"broadcast push {t}: {e}")
    return {"targets": len(targets), "sent": sent}


def get_user_contenus(telegram_id: str) -> list:
    result = supabase.table("contenu").select("*").eq("telegram_id", telegram_id).order("created_at", desc=True).execute()
    return result.data


def get_global_stats() -> dict:
    users = supabase.table("users").select("telegram_id, actif, created_at, plan, credits").execute()
    total_users = len(users.data)
    active_users = len([u for u in users.data if u.get("actif")])
    pending_users = total_users - active_users

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    new_users_week = len([u for u in users.data if u.get("created_at", "") > week_ago])

    # Forfaits + revenus
    par_plan = {"gratuit": 0, "pro": 0, "business": 0}
    for u in users.data:
        p = u.get("plan") or "gratuit"
        par_plan[p] = par_plan.get(p, 0) + 1
    mrr = sum(PLAN_PRICE.get(u.get("plan") or "gratuit", 0) for u in users.data)
    abonnes = par_plan.get("pro", 0) + par_plan.get("business", 0)
    credits_total = sum(int(u.get("credits") or 0) for u in users.data)

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
        "revenus": {
            "mrr": mrr,
            "abonnes_payants": abonnes,
            "par_plan": par_plan,
            "credits_total": credits_total
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
