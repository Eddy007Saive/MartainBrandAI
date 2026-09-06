"""
Double vérification à la connexion (code par email).

Règle : le mot de passe suffit sur un appareil déjà connu ; sur un appareil
inconnu, un code à 6 chiffres envoyé par email est demandé, et l'utilisateur
peut marquer l'appareil « de confiance » pour 30 jours. Un administrateur
donne toujours le code : il voit tous les clients, une session volée coûte trop.
La connexion Google n'en demande pas (Google vérifie déjà de son côté).

Mécanique : le login renvoie un jeton d'ATTENTE (JWT type=mfa, 10 min) au lieu
d'une session ; le code est haché en base (jamais en clair), 5 essais, un seul
code vivant à la fois, un renvoi par minute. L'appareil de confiance est un
secret aléatoire gardé par le navigateur ; on n'en stocke que le hash.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from config import supabase, logger, JWT_SECRET

VALIDITE_CODE_MIN = 10
ESSAIS_MAX = 5
RENVOI_S = 60
CONFIANCE_JOURS = 30


def _now():
    return datetime.now(timezone.utc)


def _hash(valeur: str) -> str:
    return hashlib.sha256(f"{JWT_SECRET}:{valeur}".encode("utf-8")).hexdigest()


def _parse(ts) -> datetime:
    return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))


def masquer_email(email: str) -> str:
    """m***n@gmail.com : assez pour reconnaître sa boîte, pas assez pour la donner."""
    try:
        nom, dom = email.split("@", 1)
        if len(nom) <= 2:
            return f"{nom[0]}***@{dom}"
        return f"{nom[0]}***{nom[-1]}@{dom}"
    except Exception:
        return "***"


# ------------------------------------------------------------------ appareils
def appareil_valide(telegram_id: str, jeton: str | None) -> bool:
    if not jeton or len(jeton) < 20:
        return False
    try:
        r = (supabase.table("appareils_confiance").select("id, telegram_id, expire_le")
             .eq("jeton_hash", _hash(jeton)).limit(1).execute())
    except Exception as e:
        logger.warning(f"mfa appareil: {e}")
        return False
    if not r.data or str(r.data[0]["telegram_id"]) != str(telegram_id):
        return False
    if _parse(r.data[0]["expire_le"]) < _now():
        return False
    try:
        supabase.table("appareils_confiance").update({"vu_le": _now().isoformat()}).eq("id", r.data[0]["id"]).execute()
    except Exception:
        pass
    return True


def creer_appareil(telegram_id: str, libelle: str = None, ip: str = None) -> str:
    """Enregistre un appareil de confiance et renvoie le secret à garder côté navigateur."""
    jeton = secrets.token_urlsafe(32)
    supabase.table("appareils_confiance").insert({
        "telegram_id": telegram_id, "jeton_hash": _hash(jeton), "libelle": (libelle or "")[:160] or None,
        "ip": (ip or "")[:64] or None, "expire_le": (_now() + timedelta(days=CONFIANCE_JOURS)).isoformat(),
    }).execute()
    return jeton


def oublier_appareils(telegram_id: str) -> None:
    """Au changement de mot de passe : tous les appareils redeviennent inconnus."""
    try:
        supabase.table("appareils_confiance").delete().eq("telegram_id", telegram_id).execute()
    except Exception as e:
        logger.warning(f"mfa oublier appareils: {e}")


def exige_code(user: dict, appareil: str | None) -> bool:
    if user.get("is_admin"):
        return True
    return not appareil_valide(user["telegram_id"], appareil)


# ------------------------------------------------------------------ codes
def jeton_attente(telegram_id: str) -> str:
    return jwt.encode({"telegram_id": telegram_id, "type": "mfa",
                       "exp": _now() + timedelta(minutes=VALIDITE_CODE_MIN)}, JWT_SECRET, algorithm="HS256")


def _lire_attente(jeton: str) -> str:
    try:
        p = jwt.decode(jeton, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise ValueError("code_expire")
    except Exception:
        raise ValueError("jeton_invalide")
    if p.get("type") != "mfa" or not p.get("telegram_id"):
        raise ValueError("jeton_invalide")
    return p["telegram_id"]


def creer_code(telegram_id: str) -> str | None:
    """Un nouveau code (les précédents meurent). None si le dernier a moins d'une minute."""
    r = (supabase.table("codes_connexion").select("id, created_at").eq("telegram_id", telegram_id)
         .is_("utilise_le", "null").order("created_at", desc=True).limit(1).execute())
    if r.data and (_now() - _parse(r.data[0]["created_at"])).total_seconds() < RENVOI_S:
        return None
    supabase.table("codes_connexion").delete().eq("telegram_id", telegram_id).is_("utilise_le", "null").execute()
    code = f"{secrets.randbelow(10 ** 6):06d}"
    supabase.table("codes_connexion").insert({
        "telegram_id": telegram_id, "code_hash": _hash(code),
        "expire_le": (_now() + timedelta(minutes=VALIDITE_CODE_MIN)).isoformat(),
    }).execute()
    return code


def renvoyer(jeton: str) -> str | None:
    return creer_code(_lire_attente(jeton))


def verifier(jeton: str, code: str, confiance: bool = False, libelle: str = None, ip: str = None) -> dict:
    """Valide le code et ouvre la session. Lève ValueError : code_expire, code_faux,
    trop_essais, jeton_invalide."""
    from services.auth_service import _jeton_session
    tid = _lire_attente(jeton)
    code = "".join(ch for ch in str(code or "") if ch.isdigit())
    r = (supabase.table("codes_connexion").select("*").eq("telegram_id", tid)
         .is_("utilise_le", "null").order("created_at", desc=True).limit(1).execute())
    if not r.data:
        raise ValueError("code_expire")
    row = r.data[0]
    if _parse(row["expire_le"]) < _now():
        raise ValueError("code_expire")
    if int(row.get("tentatives") or 0) >= ESSAIS_MAX:
        raise ValueError("trop_essais")
    if len(code) != 6 or not secrets.compare_digest(_hash(code), row["code_hash"]):
        supabase.table("codes_connexion").update({"tentatives": int(row.get("tentatives") or 0) + 1}).eq("id", row["id"]).execute()
        if int(row.get("tentatives") or 0) + 1 >= ESSAIS_MAX:
            raise ValueError("trop_essais")
        raise ValueError("code_faux")
    supabase.table("codes_connexion").update({"utilise_le": _now().isoformat()}).eq("id", row["id"]).execute()
    u = supabase.table("users").select("*").eq("telegram_id", tid).limit(1).execute()
    if not u.data:
        raise ValueError("jeton_invalide")
    session = _jeton_session(u.data[0])
    if confiance and not u.data[0].get("is_admin"):
        try:
            session["appareil"] = creer_appareil(tid, libelle, ip)
        except Exception as e:
            logger.warning(f"mfa appareil confiance: {e}")
    return session
