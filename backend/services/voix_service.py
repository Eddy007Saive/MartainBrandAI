"""Voix off des reels (ElevenLabs).

Le scénariste (reel_service) écrit une PHRASE PARLÉE par plan (`voix_texte`),
distincte du texte affiché : un texte karaoké de trois mots ne s'entend pas.
Ici on la fait dire par une voix du catalogue (trois voix françaises natives)
ou par le clone de la voix du client, on dépose le MP3 sur Cloudinary et on
pose sur le plan `voix = {src, dur}` : Remotion étire le plan sur la voix et
passe la musique en fond (ReelSequence.tsx).

Tout se fait dans le worker de rendu (render_service), jamais dans la requête :
six appels ElevenLabs prennent une dizaine de secondes.

Clonage : une à deux minutes d'audio du client, consentement explicite horodaté,
suppression possible (chez nous ET chez ElevenLabs). Réservé au forfait payé.
"""
import json
import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone

import cloudinary
import cloudinary.uploader
import httpx

from config import (supabase, logger, ELEVENLABS_API_KEY,
                    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)

API = "https://api.elevenlabs.io/v1"
MODELE = "eleven_v3"                 # le plus expressif ; multilingual_v2 en repli
MODELE_REPLI = "eleven_multilingual_v2"
TAILLE_MAX_MO = 25
DUREE_MIN_S = 45                     # en dessous, le clone est mauvais : on refuse

# Voix natives françaises de la bibliothèque ElevenLabs, ajoutées au compte le 2026-09-04.
# Les libellés (nom, description) sont dans les locales du front (voixOff.voix.<id>).
CATALOGUE = {
    "victor": {"voice_id": "GPAQQPp9dazaB2bl4zg9", "genre": "homme",
               "apercu": "https://res.cloudinary.com/dy9gp5pim/video/upload/brand/voix-apercus/victor.mp3"},
    "yann":   {"voice_id": "nr2EGJNe96rzn9FRlTId", "genre": "homme",
               "apercu": "https://res.cloudinary.com/dy9gp5pim/video/upload/brand/voix-apercus/yann.mp3"},
    "adina":  {"voice_id": "FvmvwvObRqIHojkEGh5N", "genre": "femme",
               "apercu": "https://res.cloudinary.com/dy9gp5pim/video/upload/brand/voix-apercus/adina.mp3"},
}
VOIX_DEFAUT = "victor"
CLONE = "moi"

REGLAGES = {"stability": 0.45, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": True, "speed": 1.05}
PHRASE_APERCU = ("Bonjour, c'est bien ma voix. Elle dira mes reels : direct, chaleureux, "
                 "sans jargon. On en parle quand tu veux.")

COLONNES_CLONE = "voix_clone_id, voix_clone_le, voix_consentement_le, voix_clone_apercu, voix_clone_duree_s, voix_defaut"


def _cloudinary():
    cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)


def disponible() -> bool:
    return bool(ELEVENLABS_API_KEY)


def _entetes():
    return {"xi-api-key": ELEVENLABS_API_KEY}


# ------------------------------------------------------------------ synthèse
def synthese(texte: str, voice_id: str, modele: str = MODELE) -> bytes:
    """Un MP3 (44,1 kHz, 128 kb/s) pour une phrase. Repli sur multilingual_v2 si
    le modèle v3 refuse (indisponible, texte trop long…)."""
    if not disponible():
        raise RuntimeError("ELEVENLABS_API_KEY absente")
    corps = {"text": texte, "model_id": modele, "voice_settings": REGLAGES}
    if modele != MODELE:
        corps["language_code"] = "fr"
    r = httpx.post(f"{API}/text-to-speech/{voice_id}", headers=_entetes(),
                   params={"output_format": "mp3_44100_128"}, json=corps, timeout=120)
    if r.status_code != 200:
        if modele == MODELE:
            logger.warning(f"voix: {MODELE} a refusé ({r.status_code}), repli {MODELE_REPLI}")
            return synthese(texte, voice_id, MODELE_REPLI)
        raise RuntimeError(f"ElevenLabs {r.status_code} : {r.text[:200]}")
    return r.content


def duree_audio(data: bytes, suffixe: str = ".mp3") -> float:
    """Durée en secondes via ffprobe ; à défaut, estimation grossière."""
    fd, chemin = tempfile.mkstemp(suffix=suffixe)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", chemin],
                           capture_output=True, text=True, timeout=30)
        if r.returncode == 0:
            return float(json.loads(r.stdout)["format"]["duration"])
    except Exception as e:
        logger.warning(f"voix: ffprobe indisponible ({e})")
    finally:
        try:
            os.unlink(chemin)
        except OSError:
            pass
    return max(1.0, len(data) / 16000)   # ~128 kb/s -> 16 Ko par seconde


def _phrase(seg: dict) -> str:
    p = (seg.get("voix_texte") or seg.get("texte") or "").strip()
    if p and p[-1] not in ".!?…":
        p += "."
    return p


def appliquer(telegram_id: str, props: dict, voix: str) -> dict:
    """Pose `voix = {src, dur}` sur chaque plan du scénario (props Remotion).
    Idempotent : un plan qui a déjà sa voix est laissé tel quel (nouvelle tentative
    du worker sans re-payer la synthèse). Lève si la voix est introuvable."""
    voice_id = resoudre(telegram_id, voix)
    if not voice_id:
        raise RuntimeError(f"voix introuvable : {voix}")
    _cloudinary()
    segments = props.get("segments") or []
    for seg in segments:
        if seg.get("voix") and seg["voix"].get("src"):
            continue
        phrase = _phrase(seg)
        if not phrase:
            continue
        data = synthese(phrase, voice_id)
        dur = duree_audio(data)
        up = cloudinary.uploader.upload(data, resource_type="video", folder=f"voix/{telegram_id}",
                                        public_id=uuid.uuid4().hex[:12])
        seg["voix"] = {"src": up["secure_url"], "dur": round(dur, 2)}
    return props


# ------------------------------------------------------------------ catalogue / clone
def _fiche(telegram_id: str) -> dict | None:
    """Colonnes du clone sur la fiche marque ; None si la migration n'est pas passée."""
    try:
        r = supabase.table("marques").select(COLONNES_CLONE).eq("telegram_id", telegram_id).limit(1).execute()
        return r.data[0] if r.data else {}
    except Exception as e:
        if any(m in str(e) for m in ("42703", "PGRST204", "does not exist", "schema cache")):
            return None
        raise


def statut_clone(telegram_id: str) -> dict:
    f = _fiche(telegram_id)
    if f is None:
        return {"migration": False, "existe": False, "defaut": None}
    return {
        "migration": True,
        "existe": bool(f.get("voix_clone_id")),
        "cree_le": f.get("voix_clone_le"),
        "consentement_le": f.get("voix_consentement_le"),
        "apercu": f.get("voix_clone_apercu"),
        "duree_s": f.get("voix_clone_duree_s"),
        "defaut": f.get("voix_defaut"),
    }


def catalogue(telegram_id: str) -> dict:
    from services import quota_service
    clone = statut_clone(telegram_id)
    return {
        "disponible": disponible(),
        "voix": [{"id": k, "genre": v["genre"], "apercu": v["apercu"]} for k, v in CATALOGUE.items()],
        "clone": clone,
        "clone_autorise": quota_service.is_paid(telegram_id),   # clonage : forfait payé uniquement
        "defaut": clone.get("defaut") or VOIX_DEFAUT,
    }


def resoudre(telegram_id: str, voix: str) -> str | None:
    """id de choix (victor|yann|adina|moi) -> voice_id ElevenLabs, ou None."""
    if voix in CATALOGUE:
        return CATALOGUE[voix]["voice_id"]
    if voix == CLONE:
        f = _fiche(telegram_id) or {}
        return f.get("voix_clone_id") or None
    return None


def valider_choix(telegram_id: str, voix: str) -> None:
    """Garde des routes : lève ValueError avec un message client si le choix est impossible."""
    if not disponible():
        raise ValueError("La voix off n'est pas disponible pour le moment.")
    if voix in CATALOGUE:
        return
    if voix == CLONE:
        if not resoudre(telegram_id, voix):
            raise ValueError("Crée d'abord ta voix dans Paramètres › Voix de marque.")
        return
    raise ValueError("Voix inconnue.")


def choisir_defaut(telegram_id: str, voix: str | None) -> dict:
    if voix is not None and voix not in CATALOGUE and voix != CLONE:
        raise ValueError("Voix inconnue.")
    supabase.table("marques").update({"voix_defaut": voix}).eq("telegram_id", telegram_id).execute()
    return statut_clone(telegram_id)


def creer_clone(telegram_id: str, data: bytes, nom_fichier: str, consentement: bool) -> dict:
    """Clone instantané ElevenLabs à partir de l'audio du client. Consentement
    obligatoire (horodaté). Un clone précédent est remplacé (supprimé chez ElevenLabs)."""
    if not consentement:
        raise ValueError("Le consentement est obligatoire pour cloner une voix.")
    if not disponible():
        raise ValueError("La voix off n'est pas disponible pour le moment.")
    if len(data) > TAILLE_MAX_MO * 1024 * 1024:
        raise ValueError(f"Fichier trop lourd (max {TAILLE_MAX_MO} Mo).")
    suffixe = os.path.splitext(nom_fichier or "")[1].lower() or ".webm"
    duree = duree_audio(data, suffixe)
    if duree < DUREE_MIN_S:
        raise ValueError(f"Il faut au moins {DUREE_MIN_S} secondes d'audio (là : {int(duree)} s). Une à deux minutes, c'est l'idéal.")
    if _fiche(telegram_id) is None:
        raise ValueError("La voix personnalisée n'est pas encore activée sur ce serveur.")

    u = supabase.table("users").select("nom, user_name").eq("telegram_id", telegram_id).limit(1).execute().data
    nom = ((u[0].get("nom") or u[0].get("user_name")) if u else None) or telegram_id[:8]
    ancien = (_fiche(telegram_id) or {}).get("voix_clone_id")

    mime = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg",
            ".webm": "audio/webm", ".aac": "audio/aac"}.get(suffixe, "application/octet-stream")
    r = httpx.post(f"{API}/voices/add", headers=_entetes(), timeout=180,
                   data={"name": f"Postorico · {nom}"[:100], "remove_background_noise": "true",
                         "description": f"Clone client Postorico {telegram_id}"},
                   files={"files": (f"voix{suffixe}", data, mime)})
    if r.status_code != 200:
        logger.error(f"voix: clonage refusé ({r.status_code}) : {r.text[:300]}")
        if r.status_code == 402 or "paid_plan" in r.text:
            raise ValueError("Le clonage n'est pas disponible pour le moment (forfait du prestataire).")
        raise ValueError("Le clonage a échoué. Vérifie que l'audio est net et réessaie.")
    voice_id = r.json().get("voice_id")
    if not voice_id:
        raise ValueError("Le clonage a échoué (réponse invalide).")

    # Extrait d'écoute : la même phrase pour tout le monde, comparable au catalogue.
    apercu = None
    try:
        _cloudinary()
        up = cloudinary.uploader.upload(synthese(PHRASE_APERCU, voice_id), resource_type="video",
                                        public_id=f"voix/{telegram_id}/apercu", overwrite=True, invalidate=True)
        apercu = up["secure_url"]
    except Exception as e:
        logger.warning(f"voix: extrait du clone non généré : {e}")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("marques").update({
        "voix_clone_id": voice_id, "voix_clone_le": now, "voix_consentement_le": now,
        "voix_clone_apercu": apercu, "voix_clone_duree_s": int(duree), "voix_defaut": CLONE,
    }).eq("telegram_id", telegram_id).execute()

    if ancien and ancien != voice_id:
        _supprimer_chez_eleven(ancien)
    logger.info(f"voix: clone créé pour {telegram_id} ({int(duree)} s d'audio)")
    return statut_clone(telegram_id)


def _supprimer_chez_eleven(voice_id: str) -> None:
    try:
        r = httpx.delete(f"{API}/voices/{voice_id}", headers=_entetes(), timeout=60)
        if r.status_code not in (200, 404):
            logger.warning(f"voix: suppression ElevenLabs {voice_id} -> {r.status_code}")
    except Exception as e:
        logger.warning(f"voix: suppression ElevenLabs {voice_id} : {e}")


def supprimer_clone(telegram_id: str) -> dict:
    """Droit à l'oubli : la voix disparaît chez nous et chez ElevenLabs."""
    f = _fiche(telegram_id) or {}
    if f.get("voix_clone_id"):
        _supprimer_chez_eleven(f["voix_clone_id"])
    maj = {"voix_clone_id": None, "voix_clone_le": None, "voix_consentement_le": None,
           "voix_clone_apercu": None, "voix_clone_duree_s": None}
    if f.get("voix_defaut") == CLONE:
        maj["voix_defaut"] = None
    supabase.table("marques").update(maj).eq("telegram_id", telegram_id).execute()
    try:
        _cloudinary()
        cloudinary.uploader.destroy(f"voix/{telegram_id}/apercu", resource_type="video", invalidate=True)
    except Exception:
        pass
    return statut_clone(telegram_id)
