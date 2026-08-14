import io
import csv
from datetime import datetime, timezone, timedelta
from config import supabase, logger
from services.auth_service import sanitize_user

PLAN_CREDITS = {"gratuit": 100, "pro": 1000, "business": 3000, "boss": 9999}
PLAN_PRICE = {"gratuit": 0, "pro": 279, "business": 49, "boss": 0}
_RESEAUX = ["linkedin", "instagram", "facebook", "tiktok", "youtube", "googlebusiness"]


def _tous_les_comptes() -> dict:
    """{telegram_id: [réseaux connectés]} — une seule requête pour toute la liste
    d'utilisateurs (la table comptes_sociaux remplace les colonnes late_account_*)."""
    par_user = {}
    try:
        r = supabase.table("comptes_sociaux").select("telegram_id, plateforme").execute()
        for x in (r.data or []):
            par_user.setdefault(x["telegram_id"], []).append(x["plateforme"])
    except Exception as e:
        logger.error(f"lecture comptes_sociaux (admin): {e}")
    return par_user


def _reseaux_connectes(telegram_id: str, cache: dict = None) -> list:
    if cache is not None:
        reseaux = cache.get(telegram_id, [])
    else:
        reseaux = _tous_les_comptes().get(telegram_id, [])
    return [r for r in _RESEAUX if r in reseaux]


def get_users(filter: str = "all", q: str = None) -> list:
    query = supabase.table("users").select("*")
    if filter == "pending":
        query = query.eq("actif", False)
    elif filter == "active":
        query = query.eq("actif", True)
    elif filter in ("gratuit", "pro", "business", "boss"):
        query = query.eq("plan", filter)
    result = query.order("created_at", desc=True).execute()
    users = [sanitize_user(user) for user in result.data]
    if q:
        ql = q.lower().strip()
        users = [u for u in users if ql in (u.get("nom") or "").lower()
                 or ql in (u.get("email") or "").lower()
                 or ql in (u.get("username") or "").lower()]
    comptes = _tous_les_comptes()
    for u in users:
        u["reseaux_connectes"] = _reseaux_connectes(u.get("telegram_id"), comptes)
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

    user["reseaux_connectes"] = _reseaux_connectes(telegram_id)
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


def api_balances() -> dict:
    """Soldes des fournisseurs IA pour l'admin.

    - OpenRouter : solde exact via son API credits (achete / consomme / restant).
    - Anthropic (Claude) : AUCUNE API de solde n'existe (verifie 2026-08). On affiche la
      depense du mois : via la cle Admin (env ANTHROPIC_ADMIN_KEY, format sk-ant-admin...)
      si presente, sinon estimation interne depuis usage_log (modeles claude*).
    """
    import os
    import httpx

    out = {"openrouter": None, "anthropic": None}
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    from config import OPENROUTER_API_KEY
    if OPENROUTER_API_KEY:
        try:
            r = httpx.get("https://openrouter.ai/api/v1/credits",
                          headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"}, timeout=15)
            d = (r.json() or {}).get("data") or {}
            total = float(d.get("total_credits") or 0)
            used = float(d.get("total_usage") or 0)
            out["openrouter"] = {"achete_usd": round(total, 2), "consomme_usd": round(used, 2),
                                 "restant_usd": round(total - used, 2)}
        except Exception as e:
            logger.warning(f"openrouter credits: {e}")

    admin_key = os.environ.get("ANTHROPIC_ADMIN_KEY", "")
    if admin_key:
        try:
            spend = 0.0
            params = {"starting_at": month_start.isoformat().replace("+00:00", "Z"), "limit": 31}
            headers = {"x-api-key": admin_key, "anthropic-version": "2023-06-01"}
            while True:
                r = httpx.get("https://api.anthropic.com/v1/organizations/cost_report",
                              params=params, headers=headers, timeout=20)
                r.raise_for_status()
                data = r.json() or {}
                for bucket in data.get("data") or []:
                    for res in bucket.get("results") or []:
                        try:
                            spend += float(res.get("amount") or 0)
                        except (TypeError, ValueError):
                            pass
                if not data.get("has_more"):
                    break
                params["page"] = data.get("next_page")
            out["anthropic"] = {"mode": "officiel", "mois_usd": round(spend, 2)}
        except Exception as e:
            logger.warning(f"anthropic cost report: {e}")
    if out["anthropic"] is None:
        # Estimation interne : cout reel logge a chaque generation Claude (usage_log)
        try:
            rows = (supabase.table("usage_log").select("cost_usd, model")
                    .gte("created_at", month_start.isoformat())
                    .ilike("model", "claude%").execute().data or [])
            est = sum(float(r.get("cost_usd") or 0) for r in rows)
            out["anthropic"] = {"mode": "estimation", "mois_usd": round(est, 2)}
        except Exception as e:
            logger.warning(f"anthropic estimation usage_log: {e}")
    return out


# ---------------------------------------------------------------------------
# Analytics produit : chiffres PostHog (comportement) + Supabase (business)
# ---------------------------------------------------------------------------
_POSTHOG_HOST = "https://us.posthog.com"
_POSTHOG_PROJECT = 545489
_analytics_cache = {"at": None, "data": None}  # cache 10 min (PostHog est lent + rate-limité)


def _posthog_query(source: dict, api_key: str):
    """Exécute une requête PostHog (Query API) et renvoie `results` (None si échec)."""
    import httpx
    r = httpx.post(f"{_POSTHOG_HOST}/api/projects/{_POSTHOG_PROJECT}/query",
                   headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                   json={"query": source}, timeout=30)
    r.raise_for_status()
    return (r.json() or {}).get("results")


def analytics_produit() -> dict:
    """Synthèse pour l'onglet Analytics de l'admin.

    - business (Supabase, source de vérité argent) : MRR, conversion essai→payant,
      répartition par plan, volumes de contenus.
    - comportement (PostHog, si POSTHOG_API_KEY est définie) : funnel d'activation
      chiffré + séries hebdo. Dégradé proprement si la clé manque ou si PostHog rame.
    """
    import os
    now = datetime.now(timezone.utc)
    if _analytics_cache["at"] and (now - _analytics_cache["at"]).total_seconds() < 600:
        return _analytics_cache["data"]

    # ---- Business (Supabase) ----
    users = supabase.table("users").select("telegram_id, plan, actif, is_admin, created_at").execute().data or []
    clients = [u for u in users if not u.get("is_admin")]
    actifs = [u for u in clients if u.get("actif")]
    par_plan = {}
    for u in actifs:
        p = u.get("plan") or "gratuit"
        par_plan[p] = par_plan.get(p, 0) + 1

    plans = {p["id"]: p for p in (supabase.table("plans").select("id, name, price_cents").execute().data or [])}
    subs = (supabase.table("subscriptions").select("plan_id, status")
            .in_("status", ["active", "trialing"]).execute().data or [])
    mrr = sum((plans.get(s["plan_id"], {}).get("price_cents") or 0) for s in subs) / 100
    payants = sum(1 for s in subs if (plans.get(s["plan_id"], {}).get("price_cents") or 0) > 0)
    conversion = round(payants / len(actifs) * 100, 1) if actifs else 0

    cont = supabase.table("contenu").select("id, statut", count="exact").execute()
    total_contenus = cont.count or len(cont.data or [])
    par_statut = {}
    for c in (cont.data or []):
        s = c.get("statut") or "?"
        par_statut[s] = par_statut.get(s, 0) + 1
    publies = par_statut.get("Publie", 0)

    business = {
        "mrr_eur": round(mrr, 2),
        "clients_actifs": len(actifs),
        "clients_payants": payants,
        "conversion_payant_pct": conversion,
        "par_plan": par_plan,
        "contenus_total": total_contenus,
        "contenus_publies": publies,
        "contenus_par_statut": par_statut,
    }

    # ---- Comportement (PostHog) ----
    posthog = None
    api_key = os.environ.get("POSTHOG_API_KEY", "")
    if api_key:
        posthog = {"funnel": None, "series": None}
        try:
            res = _posthog_query({
                "kind": "FunnelsQuery",
                "series": [
                    {"kind": "EventsNode", "event": "inscription", "name": "Inscription"},
                    {"kind": "EventsNode", "event": "contenu_genere", "name": "Contenu généré"},
                    {"kind": "EventsNode", "event": "post_valide", "name": "Post validé"},
                    {"kind": "EventsNode", "event": "checkout_ouvert", "name": "Checkout ouvert"},
                ],
                "dateRange": {"date_from": "-90d"},
                "funnelsFilter": {"funnelWindowInterval": 30, "funnelWindowIntervalUnit": "day"},
            }, api_key)
            steps = res if isinstance(res, list) else []
            if steps and isinstance(steps[0], list):  # forme avec breakdown -> aplatit
                steps = steps[0]
            funnel = []
            base = None
            for s in steps:
                n = int(s.get("count") or 0)
                base = base if base is not None else (n or 1)
                funnel.append({"etape": s.get("custom_name") or s.get("name") or "?",
                               "n": n, "pct": round(n / base * 100, 1) if base else 0})
            posthog["funnel"] = funnel or None
        except Exception as e:
            logger.warning(f"posthog funnel: {e}")
        try:
            series = {}
            for event, label in (("contenu_genere", "Contenus générés"),
                                 ("post_valide", "Posts validés"),
                                 ("$pageview", "Sessions")):
                res = _posthog_query({
                    "kind": "TrendsQuery",
                    "series": [{"kind": "EventsNode", "event": event,
                                "math": "weekly_active" if event == "$pageview" else "total"}],
                    "interval": "week",
                    "dateRange": {"date_from": "-60d"},
                }, api_key)
                r0 = (res or [{}])[0]
                series[label] = {"labels": r0.get("labels") or [], "data": r0.get("data") or []}
            posthog["series"] = series
        except Exception as e:
            logger.warning(f"posthog trends: {e}")

    data = {"business": business, "posthog": posthog,
            "posthog_configure": bool(api_key), "genere_a": now.isoformat()}
    _analytics_cache["at"] = now
    _analytics_cache["data"] = data
    return data


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
