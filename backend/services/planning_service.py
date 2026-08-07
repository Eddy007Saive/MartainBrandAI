"""
Planification automatique.

Pose une date de publication sur un contenu à partir des créneaux préférés
de l'utilisateur (table publication_schedules).

Règle : on prend le PROCHAIN jour préféré du réseau qui n'a pas déjà un contenu
de la MÊME FAMILLE (feed / vidéo / story), à l'heure préférée. Les familles
peuvent cohabiter le même jour (surfaces différentes chez les plateformes),
avec des heures décalées pour ne pas tout publier à la même minute :

    feed  (Post écrit, Carrousel)  -> 1 max/jour, à l'heure préférée
    video (Reel, Short, Video)     -> 1 max/jour, heure préférée +6 h
    story (Story)                  -> 1 max/jour, heure préférée +3 h

Si le réseau n'a pas de cadence active, on retombe sur le prochain jour ouvré à 09:00.

Convention des jours (identique au front, constants/schedules.js) :
    Lun=1, Mar=2, Mer=3, Jeu=4, Ven=5, Sam=6, Dim=0   ==  date.isoweekday() % 7
"""
from datetime import datetime, timezone, timedelta, time
from config import supabase, logger

# contenu.reseau_cible (enum capitalisé) -> publication_schedules.platform (minuscule)
RESEAU_TO_PLATFORM = {
    "LinkedIn": "linkedin",
    "Instagram": "instagram",
    "Facebook": "facebook",
    "TikTok": "tiktok",
    "YouTube": "youtube",
    "GoogleBusiness": "googlebusiness",
    "Twitter": "twitter",
}

DEFAULT_TIME = time(9, 0)
HORIZON_DAYS = 120  # on cherche un créneau dans les ~4 prochains mois

# Famille d'un contenu selon son type (contenu.type ; None/Post/autre => feed)
_TYPE_TO_FAMILLE = {
    "Carrousel": "feed",
    "Reel": "video", "Short": "video", "Video": "video",
    "Story": "story",
}
# Décalage horaire de chaque famille par rapport à l'heure préférée du réseau
_FAMILLE_OFFSET_H = {"feed": 0, "story": 3, "video": 6}


def famille_de(type_contenu: str | None) -> str:
    return _TYPE_TO_FAMILLE.get(type_contenu or "", "feed")


def _parse_time(val) -> time:
    if not val:
        return DEFAULT_TIME
    try:
        parts = str(val).split(":")
        return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    except Exception:
        return DEFAULT_TIME


def _jours_occupes(telegram_id: str, reseau_cible: str, famille: str) -> set:
    """Dates (YYYY-MM-DD) déjà prises par un contenu daté du même réseau ET de la
    même famille (feed/vidéo/story), hors refusés. Deux familles différentes
    peuvent partager un jour — c'est voulu."""
    try:
        r = (supabase.table("contenu")
             .select("date_publication, type, statut")
             .eq("telegram_id", telegram_id).eq("reseau_cible", reseau_cible)
             .not_.is_("date_publication", "null").execute())
    except Exception as e:
        logger.error(f"planning _jours_occupes error: {e}")
        return set()
    return {row["date_publication"][:10] for row in (r.data or [])
            if row.get("date_publication")
            and row.get("statut") != "Refuse"
            and famille_de(row.get("type")) == famille}


def prochain_creneau(telegram_id: str, reseau_cible: str | None,
                     type_contenu: str | None = None) -> str | None:
    """Renvoie une date_publication ISO (UTC) pour le prochain créneau libre de la
    famille du contenu (feed par défaut), ou None."""
    if not reseau_cible:
        return None
    platform = RESEAU_TO_PLATFORM.get(reseau_cible)
    if not platform:
        return None
    famille = famille_de(type_contenu)

    # Créneau préféré du réseau
    try:
        sched = (supabase.table("publication_schedules")
                 .select("days_of_week, preferred_time, is_active")
                 .eq("telegram_id", telegram_id).eq("platform", platform).execute())
        row = sched.data[0] if sched.data else None
    except Exception as e:
        logger.error(f"planning schedule lookup error: {e}")
        row = None

    ptime = _parse_time(row.get("preferred_time")) if row else DEFAULT_TIME
    days = set(row.get("days_of_week") or []) if row else set()

    # Heure décalée selon la famille (cohabitation le même jour sans collision d'heure)
    heure = (ptime.hour + _FAMILLE_OFFSET_H[famille]) % 24

    occ = _jours_occupes(telegram_id, reseau_cible, famille)
    today = datetime.now(timezone.utc).date()

    for i in range(1, HORIZON_DAYS + 1):
        d = today + timedelta(days=i)
        jour_num = d.isoweekday() % 7  # Lun=1 … Ven=5, Sam=6, Dim=0
        if days:
            # Jours préférés définis -> on les respecte tels quels (même un week-end choisi exprès)
            if jour_num not in days:
                continue
        else:
            # Pas de jours définis -> jours ouvrés seulement (on saute samedi & dimanche)
            if jour_num == 6 or jour_num == 0:
                continue
        if d.isoformat() in occ:
            continue
        dt = datetime(d.year, d.month, d.day, heure, ptime.minute, tzinfo=timezone.utc)
        return dt.isoformat()

    logger.warning(f"planning: aucun créneau libre trouvé pour {reseau_cible}/{famille} (tg {telegram_id})")
    return None
