"""
Planification automatique.

Pose une date de publication sur un contenu à partir des créneaux préférés
de l'utilisateur (table publication_schedules).

Le RYTHME est choisi par le client, réseau par réseau
(publication_schedules.mode_planification) :

« cumulé » (défaut) — les familles cohabitent le même jour, sur des surfaces
différentes chez les plateformes, à des heures décalées pour ne pas tout
publier à la même minute. Le calendrier se remplit vite :

    feed  (Post écrit, Carrousel)  -> 1 max/jour, à l'heure préférée
    video (Reel, Short, Video)     -> 1 max/jour, heure préférée +6 h
    story (Story)                  -> 1 max/jour, heure préférée +3 h

« à la suite » — UNE SEULE publication par jour, tous formats confondus :
chaque contenu se range derrière le précédent dans la file. Le calendrier
s'étale, mais rien ne se cannibalise.

Dans les deux cas, on prend le prochain jour préféré du réseau qui est libre.

Si le réseau n'a pas de cadence active, on retombe sur le prochain jour ouvré à 09:00.

Convention des jours (identique au front, constants/schedules.js) :
    Lun=1, Mar=2, Mer=3, Jeu=4, Ven=5, Sam=6, Dim=0   ==  date.isoweekday() % 7
"""
import random
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

# Rythme « à la suite » : tout est dans la même file, la notion de famille disparaît.
FILE_UNIQUE = "tout"
MODE_DEFAUT = "cumule"

# Humanisation de l'heure de publication. Les plateformes repèrent les motifs
# « même minute exacte tous les jours » ; on décale de quelques minutes, de façon
# DÉTERMINISTE (même seed -> même heure, pour que le sweep ne fasse pas dériver le
# créneau déjà annoncé) mais variable d'un jour / réseau / famille à l'autre.
JITTER_MIN_MINUTES = -12
JITTER_MAX_MINUTES = 14


def _heure_humanisee(base_hour: int, base_minute: int, *seed) -> tuple:
    """Renvoie (heure, minute, seconde) décalées de quelques minutes autour de
    l'heure préférée. Jamais l'heure ronde pile. Déterministe pour un seed donné."""
    rng = random.Random("|".join(str(p) for p in seed))
    total = (base_hour * 60 + base_minute + rng.randint(JITTER_MIN_MINUTES, JITTER_MAX_MINUTES)) % (24 * 60)
    h, m = divmod(total, 60)
    if m == 0:                       # évite 12:00:00, 09:00:00… trop « robot »
        m = rng.randint(3, 9)
    return h, m, rng.randint(0, 59)


def famille_de(type_contenu: str | None, mode: str = MODE_DEFAUT) -> str:
    """Famille d'un contenu. En mode « à la suite », tous les formats partagent
    la même file : un seul contenu par jour et par réseau."""
    if mode == "suite":
        return FILE_UNIQUE
    return _TYPE_TO_FAMILLE.get(type_contenu or "", "feed")


def mode_du_reseau(telegram_id: str, platform: str) -> str:
    """Rythme choisi par le client pour ce réseau (« cumule » par défaut)."""
    try:
        r = (supabase.table("publication_schedules").select("mode_planification")
             .eq("telegram_id", telegram_id).eq("platform", platform).limit(1).execute())
        return (r.data[0].get("mode_planification") if r.data else None) or MODE_DEFAUT
    except Exception as e:
        logger.warning(f"mode planification {platform}: {e}")
        return MODE_DEFAUT


def _parse_time(val) -> time:
    if not val:
        return DEFAULT_TIME
    try:
        parts = str(val).split(":")
        return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    except Exception:
        return DEFAULT_TIME


def _jours_occupes(telegram_id: str, reseau_cible: str, famille: str,
                   mode: str = MODE_DEFAUT) -> set:
    """Dates (YYYY-MM-DD) déjà prises sur ce réseau, hors refusés.

    En « cumulé », seuls les contenus de la MÊME famille bloquent le jour : deux
    familles différentes peuvent le partager. En « à la suite », n'importe quel
    contenu bloque le jour."""
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
            and famille_de(row.get("type"), mode) == famille}


def prochain_creneau(telegram_id: str, reseau_cible: str | None,
                     type_contenu: str | None = None) -> str | None:
    """Renvoie une date_publication ISO (UTC) pour le prochain créneau libre de la
    famille du contenu (feed par défaut), ou None."""
    if not reseau_cible:
        return None
    platform = RESEAU_TO_PLATFORM.get(reseau_cible)
    if not platform:
        return None
    # Créneau préféré du réseau + rythme choisi par le client
    try:
        sched = (supabase.table("publication_schedules")
                 .select("days_of_week, preferred_time, is_active, mode_planification")
                 .eq("telegram_id", telegram_id).eq("platform", platform).execute())
        row = sched.data[0] if sched.data else None
    except Exception as e:
        logger.error(f"planning schedule lookup error: {e}")
        row = None

    mode = (row.get("mode_planification") if row else None) or MODE_DEFAUT
    famille = famille_de(type_contenu, mode)
    ptime = _parse_time(row.get("preferred_time")) if row else DEFAULT_TIME
    days = set(row.get("days_of_week") or []) if row else set()

    # « cumulé » : heure décalée par famille pour éviter deux publications à la même
    # minute. « à la suite » : un seul contenu par jour, donc l'heure préférée suffit.
    heure = (ptime.hour + _FAMILLE_OFFSET_H.get(famille, 0)) % 24

    occ = _jours_occupes(telegram_id, reseau_cible, famille, mode)
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
        h, m, s = _heure_humanisee(heure, ptime.minute, telegram_id, platform, famille, d.isoformat())
        dt = datetime(d.year, d.month, d.day, h, m, s, tzinfo=timezone.utc)
        return dt.isoformat()

    logger.warning(f"planning: aucun créneau libre trouvé pour {reseau_cible}/{famille} (tg {telegram_id})")
    return None
