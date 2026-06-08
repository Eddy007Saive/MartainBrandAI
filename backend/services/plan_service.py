"""
Plan éditorial par MOIS (calendrier).

Pour un mois donné et chaque réseau actif :
  - needed   : nb de publications attendues dans le mois (depuis la cadence)
  - filled   : nb de contenus déjà datés dans le mois (non refusés)
  - remaining: needed - filled
  - format   : post | reel | video (depuis publication_schedules.format)

Fournit aussi `creneaux_libres()` : les dates libres du mois pour un réseau
(utilisé par la génération en rafale pour planifier les contenus).
"""
import calendar
from datetime import datetime, timezone, timedelta, date, time
from config import supabase, logger
from services.planning_service import RESEAU_TO_PLATFORM

PLATFORM_TO_RESEAU = {v: k for k, v in RESEAU_TO_PLATFORM.items()}

# Repli si la cadence n'a pas de jours précis
FREQ_PER_MONTH = {"daily": 30, "3_per_week": 13, "weekly": 4, "biweekly": 2, "custom": 4}
DEFAULT_TIME = time(9, 0)


def _month_bounds(year: int, month: int):
    last = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


def _parse_time(val) -> time:
    if not val:
        return DEFAULT_TIME
    try:
        p = str(val).split(":")
        return time(int(p[0]), int(p[1]) if len(p) > 1 else 0)
    except Exception:
        return DEFAULT_TIME


def _schedules(telegram_id: int) -> list:
    try:
        return (supabase.table("publication_schedules")
                .select("platform, days_of_week, frequency, is_active, format, preferred_time, carrousel_template")
                .eq("telegram_id", telegram_id).execute()).data or []
    except Exception as e:
        logger.error(f"plan _schedules error: {e}")
        return []


def _candidate_days(start: date, end: date, days: set) -> list:
    """Jours du mois correspondant à la cadence (jours préférés, sinon jours ouvrés)."""
    out, d = [], start
    while d <= end:
        jn = d.isoweekday() % 7  # Lun=1..Ven=5, Sam=6, Dim=0
        if days:
            if jn in days:
                out.append(d)
        elif jn not in (0, 6):
            out.append(d)
        d += timedelta(days=1)
    return out


def _dates_occupees(telegram_id: int, reseau: str, start: date, end: date) -> list:
    """Dates (ISO) déjà prises par un contenu daté du réseau dans le mois (non refusé)."""
    try:
        r = (supabase.table("contenu").select("date_publication, statut")
             .eq("telegram_id", telegram_id).eq("reseau_cible", reseau)
             .gte("date_publication", start.isoformat())
             .lt("date_publication", (end + timedelta(days=1)).isoformat())
             .not_.is_("date_publication", "null").execute())
    except Exception as e:
        logger.warning(f"plan _dates_occupees error: {e}")
        return []
    return [row["date_publication"] for row in (r.data or [])
            if row.get("date_publication") and row.get("statut") != "Refuse"]


def compute_plan(telegram_id: int, year: int, month: int) -> list:
    start, end = _month_bounds(year, month)
    out = []
    for s in _schedules(telegram_id):
        if not s.get("is_active"):
            continue
        reseau = PLATFORM_TO_RESEAU.get(s.get("platform"))
        if not reseau:
            continue
        days = set(s.get("days_of_week") or [])
        cand = _candidate_days(start, end, days)
        needed = len(cand) if days else FREQ_PER_MONTH.get(s.get("frequency"), 4)
        filled = len(_dates_occupees(telegram_id, reseau, start, end))
        out.append({
            "platform": s.get("platform"),
            "reseau": reseau,
            "label": reseau,
            "format": s.get("format") or "post",
            "needed": needed,
            "filled": filled,
            "remaining": max(0, needed - filled),
        })
    return out


def creneaux_libres(telegram_id: int, reseau: str, year: int, month: int, occupied: set) -> list:
    """Dates libres (ISO datetime UTC) du mois pour ce réseau, hors `occupied` (set de 'YYYY-MM-DD')."""
    start, end = _month_bounds(year, month)
    sched = next((s for s in _schedules(telegram_id)
                  if PLATFORM_TO_RESEAU.get(s.get("platform")) == reseau), {})
    days = set(sched.get("days_of_week") or [])
    ptime = _parse_time(sched.get("preferred_time"))
    today = datetime.now(timezone.utc).date()
    res = []
    for d in _candidate_days(start, end, days):
        if d < today:
            continue
        if d.isoformat() in occupied:
            continue
        res.append(datetime(d.year, d.month, d.day, ptime.hour, ptime.minute, tzinfo=timezone.utc).isoformat())
    return res
