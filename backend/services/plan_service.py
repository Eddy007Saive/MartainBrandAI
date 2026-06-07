"""
Plan éditorial glissant (30 prochains jours).

Pour chaque réseau actif, calcule :
  - needed   : nb de publications attendues sur 30 jours (depuis la cadence)
  - filled   : nb de contenus déjà dans le pipeline (créés, pas encore publiés)
  - remaining: needed - filled (ce qu'il reste à produire)

Un contenu "publié" ne compte plus -> la place se rouvre -> le plan se recomplète
en continu.
"""
from datetime import datetime, timezone, timedelta
from config import supabase, logger
from services.planning_service import RESEAU_TO_PLATFORM

# platform (minuscule) -> reseau_cible (enum capitalisé)
PLATFORM_TO_RESEAU = {v: k for k, v in RESEAU_TO_PLATFORM.items()}

# Statuts comptés comme "déjà dans le pipeline" (donc pas encore publiés)
PIPELINE_STATUTS = ["A valider", "Valider", "Planifie", "Pret a publier"]

# Repli si la cadence n'a pas de jours précis (occurrences / 30 jours)
FREQ_PER_MONTH = {"daily": 30, "3_per_week": 13, "weekly": 4, "biweekly": 2, "custom": 4}

WINDOW_DAYS = 30


def _needed_30j(days_of_week, frequency) -> int:
    days = set(days_of_week or [])
    if days:
        today = datetime.now(timezone.utc).date()
        return sum(1 for i in range(1, WINDOW_DAYS + 1)
                   if ((today + timedelta(days=i)).isoweekday() % 7) in days)
    return FREQ_PER_MONTH.get(frequency, 4) or 4


def _filled(telegram_id: int, reseau: str) -> int:
    try:
        res = (supabase.table("contenu")
               .select("id", count="exact")
               .eq("telegram_id", telegram_id).eq("reseau_cible", reseau)
               .in_("statut", PIPELINE_STATUTS).execute())
        return res.count or 0
    except Exception as e:
        logger.warning(f"plan _filled error ({reseau}): {e}")
        return 0


def compute_plan(telegram_id: int) -> list:
    try:
        scheds = (supabase.table("publication_schedules")
                  .select("platform, days_of_week, frequency, is_active, format")
                  .eq("telegram_id", telegram_id).execute()).data or []
    except Exception as e:
        logger.error(f"compute_plan schedules error: {e}")
        return []

    out = []
    for s in scheds:
        if not s.get("is_active"):
            continue
        platform = s.get("platform")
        reseau = PLATFORM_TO_RESEAU.get(platform)
        if not reseau:
            continue
        needed = _needed_30j(s.get("days_of_week"), s.get("frequency"))
        filled = _filled(telegram_id, reseau)
        out.append({
            "platform": platform,
            "reseau": reseau,
            "label": reseau,
            "format": s.get("format") or "post",
            "needed": needed,
            "filled": filled,
            "remaining": max(0, needed - filled),
        })
    return out
