"""Montage vidéo IA via Submagic (Studio Vidéo / Reels).

Flux : l'utilisateur fournit une vidéo brute (hébergée sur Cloudinary) → on crée un
projet Submagic (sous-titres + b-roll + zooms, musique optionnelle fournie par nous) →
Submagic rend en async et nous notifie par webhook → on rapatrie le MP4 monté.

POC validé le 2026-07-02. Points clés :
- Auth : header `x-api-key`.
- Pas de musique auto : on ajoute une piste via /user-media puis `music.userMediaId`.
- Statuts : processing → transcribing → exporting → completed (downloadUrl dispo).
"""
import httpx
from config import SUBMAGIC_API_KEY, SUBMAGIC_BASE, logger

TIMEOUT = 60
# Statuts renvoyés par Submagic
DONE = "completed"
FAILED = "failed"


def _headers(json: bool = True) -> dict:
    h = {"x-api-key": SUBMAGIC_API_KEY}
    if json:
        h["Content-Type"] = "application/json"
    return h


def enabled() -> bool:
    return bool(SUBMAGIC_API_KEY)


async def list_templates() -> list:
    """Liste des templates de sous-titres disponibles (name utilisé comme templateName)."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.get(f"{SUBMAGIC_BASE}/templates", headers=_headers(False))
    r.raise_for_status()
    d = r.json()
    return d if isinstance(d, list) else (d.get("templates") or d.get("data") or [])


async def add_music_from_url(url: str) -> str | None:
    """Ajoute une piste audio (URL publique) à la bibliothèque Submagic → renvoie userMediaId.

    ⚠️ Seul le champ `url` est accepté (name/type rejetés par l'API).
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.post(f"{SUBMAGIC_BASE}/user-media", headers=_headers(), json={"url": url})
    if r.status_code >= 300:
        logger.error(f"Submagic add music error {r.status_code}: {r.text[:200]}")
        return None
    return r.json().get("userMediaId") or r.json().get("id")


async def create_project(
    *,
    title: str,
    video_url: str,
    language: str = "fr",
    template_name: str = "Matt",
    user_theme_id: str | None = None,
    preset_id: str | None = None,
    hook_title: dict | None = None,
    magic_brolls: bool = True,
    magic_brolls_percentage: int | None = None,
    magic_zooms: bool = True,
    remove_silence_pace: str | None = None,   # "natural" | "fast" | "extra-fast"
    remove_bad_takes: bool = False,
    clean_audio: bool = False,
    music_media_id: str | None = None,
    music_volume: int = 25,
    webhook_url: str | None = None,
) -> dict:
    """Crée un projet de montage. Retourne {ok, id, status} ou {ok:False, error}.

    Style des sous-titres, par ordre de priorité :
      - preset_id  : preset COMPLET créé dans l'éditeur (exclusif : porte template + b-roll + zooms + musique).
      - user_theme_id : thème PERSO créé dans l'éditeur (positionnement/polices/couleurs sur mesure).
      - template_name : un des 45 styles préfaits.
    hook_title : titre en overlay {text, template?, top?, size?}.
    """
    if not enabled():
        return {"ok": False, "error": "Montage vidéo indisponible (clé non configurée)."}
    payload = {
        "title": (title or "Vidéo")[:100],
        "language": language or "fr",
        "videoUrl": video_url,
        "autoRender": True,
    }
    if preset_id:
        # Preset complet : exclusif, Submagic applique tout (pas de template/b-roll/zoom/musique à part).
        payload["presetId"] = preset_id
    else:
        if user_theme_id:
            payload["userThemeId"] = user_theme_id
        else:
            payload["templateName"] = template_name
        payload["magicBrolls"] = magic_brolls
        payload["magicZooms"] = magic_zooms
        if magic_brolls and magic_brolls_percentage is not None:
            payload["magicBrollsPercentage"] = max(0, min(100, magic_brolls_percentage))
        # Montage pro
        if remove_silence_pace in ("natural", "fast", "extra-fast"):
            payload["removeSilencePace"] = remove_silence_pace
        if remove_bad_takes:
            payload["removeBadTakes"] = True
        if clean_audio:
            payload["cleanAudio"] = True
        if music_media_id:
            payload["music"] = {"userMediaId": music_media_id, "volume": max(1, min(100, music_volume)), "fade": True}
        if hook_title:
            payload["hookTitle"] = hook_title
    if webhook_url:
        payload["webhookUrl"] = webhook_url
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as c:
            r = await c.post(f"{SUBMAGIC_BASE}/projects", headers=_headers(), json=payload)
    except Exception as e:
        logger.error(f"Submagic create exception: {e}")
        return {"ok": False, "error": "Service de montage injoignable, réessaie."}
    if r.status_code >= 300:
        logger.error(f"Submagic create error {r.status_code}: {r.text[:200]}")
        return {"ok": False, "error": "Le montage n'a pas pu démarrer."}
    d = r.json()
    return {"ok": True, "id": d.get("id"), "status": d.get("status")}


async def get_project(project_id: str) -> dict:
    """État d'un projet + URLs de sortie quand `completed`."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.get(f"{SUBMAGIC_BASE}/projects/{project_id}", headers=_headers(False))
    r.raise_for_status()
    d = r.json()
    return {
        "status": d.get("status"),
        "download_url": d.get("downloadUrl"),
        "direct_url": d.get("directUrl"),
        "preview_url": d.get("previewUrl"),
        "meta": d.get("videoMetaData") or {},
    }
