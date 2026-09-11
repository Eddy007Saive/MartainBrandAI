"""Montage vidéo IA via Studio Montage (submagic-poc), self-hosted (Railway séparé).

Remplace Submagic (payant) : même flux — vidéo brute (Cloudinary) -> POST /process ->
rendu async (whisper + ffmpeg local, pas de webhook côté submagic-poc, polling only) ->
le MP4 monté est DÉJÀ sur Cloudinary (studio-montage/{job_id}/video, même compte) quand
le job passe à "done".

Interface volontairement MIROIR de submagic_service.py (mêmes noms de fonctions/kwargs,
mêmes constantes DONE/FAILED) pour que routes/video.py n'ait presque rien à changer.
"""
import asyncio
import json
import time

import httpx
from config import MONTAGE_POC_URL, MONTAGE_POC_INTERNAL_KEY, logger

# submagic-poc tourne en un seul worker (thread de whisper/ffmpeg partageant le GIL
# avec la boucle asyncio) : sous charge (un autre montage en cours de transcription),
# répondre à une requête peut prendre largement plus de 30s même si le job démarre
# bien côté serveur (vérifié : log "200 OK" côté poc alors que le client avait déjà
# abandonné) -> CREATE_TIMEOUT généreux pour ne pas rater un job_id pourtant créé.
# POLL_TIMEOUT reste modeste : _finalize() tolère déjà un échec de polling (retente
# au prochain cycle), pas besoin d'attendre longtemps une réponse qui n'arrive pas.
CREATE_TIMEOUT = 90
POLL_TIMEOUT = 20
DONE = "done"
FAILED = "error"

# Les 12 presets réels de submagic-poc (pipeline.py::PRESETS) — remplacent les 45
# templates Submagic, source de vérité pour /video/options.
PRESETS = ["classic", "hormozi", "neon", "leon", "molly", "caleb", "william",
           "beast", "duo", "noah", "brandin", "bahn"]

# step (fine, ~12 valeurs) -> stage (3 paliers, ceux que _finalize()/StudioVideo.jsx
# connaissent déjà : processing|transcribing|exporting).
_STEP_TO_STAGE = {
    "file d'attente": "processing", "transcription": "processing",
    "correction": "transcribing", "hook": "transcribing", "emojis": "transcribing",
    "brolls": "transcribing", "analyse": "transcribing",
    "musique": "exporting", "rendu": "exporting", "miniature": "exporting",
    "stockage": "exporting", "fini": "exporting",
}


def enabled() -> bool:
    return bool(MONTAGE_POC_URL)


def _headers() -> dict:
    return {"X-Internal-Key": MONTAGE_POC_INTERNAL_KEY} if MONTAGE_POC_INTERNAL_KEY else {}


def _brolls_count(pct: int | None) -> int:
    """0-100 (curseur densité StudioVideo.jsx) -> 1-8 (brolls_count poc), linéaire."""
    if pct is None:
        return 4
    return max(1, min(8, round(1 + (max(0, min(100, pct)) / 100) * 7)))


async def create_project(
    *,
    title: str,                                    # sans équivalent poc (pas de "titre" de projet) — ignoré
    video_url: str,
    language: str = "fr",                          # sans équivalent (whisper autodétecte) — ignoré
    template_name: str = "classic",
    user_theme_id: str | None = None,               # sans équivalent poc (thèmes perso Submagic) — ignoré
    preset_id: str | None = None,                   # sans équivalent poc (presets complets Submagic) — ignoré
    hook_title: dict | None = None,                 # volontairement PAS transmis en v1 (hors scope)
    magic_brolls: bool = True,
    magic_brolls_percentage: int | None = None,
    magic_zooms: bool = True,
    remove_silence_pace: str | None = None,         # "natural"|"fast"|"extra-fast"
    remove_bad_takes: bool = False,                 # sans équivalent poc — ignoré
    clean_audio: bool = False,
    music_media_id: str | None = None,              # sans équivalent (Submagic userMediaId) — ignoré
    music_id: str | None = "none",
    music_volume: int = 25,
    webhook_url: str | None = None,                 # submagic-poc n'a pas de webhook -> ignoré, polling only
    hook: str = "",
    hook_auto: bool = False,
    hook_position: str = "top",
    hook_fontscale: float = 1.0,
    emojis: bool = False,
    font: str | None = None,
    hl_color: str | None = None,
    fontscale: float = 1.0,
    position: float = 0.30,
    uppercase: bool = True,
) -> dict:
    """Démarre un montage. Retourne {ok, id, status} ou {ok:False, error}."""
    if not enabled():
        return {"ok": False, "error": "Montage vidéo indisponible (service non configuré)."}
    options = {
        "preset": template_name if template_name in PRESETS else "classic",
        "music_id": music_id or "none",
        "music_volume": max(1, min(100, music_volume)),
        "brolls": bool(magic_brolls),
        "brolls_count": _brolls_count(magic_brolls_percentage) if magic_brolls else 4,
        "zoom": bool(magic_zooms),
        "cuts": bool(remove_silence_pace),
        "cuts_pace": remove_silence_pace if remove_silence_pace in
                     ("natural", "fast", "extra-fast") else "natural",
        "audio_clean": bool(clean_audio),
        # hook_preset volontairement absent (None côté poc) : le hook reprend
        # toujours le style des sous-titres -> une seule grille de presets à
        # gérer côté UI plutôt que deux.
        "hook": (hook or "").strip()[:80],
        "hook_auto": bool(hook_auto),
        "hook_position": hook_position if hook_position in ("top", "center", "bottom") else "top",
        "hook_fontscale": max(0.5, min(1.6, hook_fontscale or 1.0)),
        "emojis": bool(emojis),
        "fontscale": max(0.7, min(1.4, fontscale or 1.0)),
        "position": max(0.1, min(0.45, position if position is not None else 0.30)),
        "uppercase": bool(uppercase) if uppercase is not None else True,
    }
    # font/hl_color : seulement si fournis -> sinon on laisse les DEFAULTS du poc
    # s'appliquer (envoyer explicitement `null` écraserait "Arial Black"/"#3AFFA3").
    if font:
        options["font"] = font
    if hl_color:
        options["hl_color"] = hl_color
    try:
        async with httpx.AsyncClient(timeout=CREATE_TIMEOUT) as c:
            r = await c.post(f"{MONTAGE_POC_URL}/process",
                              data={"video_url": video_url, "options": json.dumps(options)},
                              headers=_headers())
    except Exception as e:
        # str(e) est souvent vide sur un timeout httpx -> le type de l'exception
        # est l'info utile pour distinguer timeout/connexion refusée/etc.
        logger.error(f"montage-poc create exception: {type(e).__name__}: {e}")
        return {"ok": False, "error": "Service de montage injoignable, réessaie."}
    if r.status_code >= 300:
        logger.error(f"montage-poc create error {r.status_code}: {r.text[:200]}")
        return {"ok": False, "error": "Le montage n'a pas pu démarrer."}
    d = r.json()
    return {"ok": True, "id": d.get("job_id"), "status": "processing"}


async def get_project(job_id: str) -> dict:
    """État d'un job + URL de sortie quand `done` (déjà sur Cloudinary)."""
    async with httpx.AsyncClient(timeout=POLL_TIMEOUT) as c:
        r = await c.get(f"{MONTAGE_POC_URL}/jobs/{job_id}", headers=_headers())
    r.raise_for_status()
    d = r.json()
    raw = d.get("status")  # "processing" | "done" | "error" | "unknown"
    if raw == "done":
        status = DONE
    elif raw == "error":
        status = FAILED
    else:
        status = _STEP_TO_STAGE.get(d.get("step"), "processing")
    video_url = d.get("video_url")
    return {
        "status": status,
        "download_url": video_url,
        "direct_url": video_url,
        "preview_url": None,  # pas d'équivalent "previewUrl" éditeur chez le poc
        "meta": {"error": d.get("error"), "warnings": d.get("warnings"), "thumb_url": d.get("thumb_url")},
    }


async def suggest_hooks(file_bytes: bytes, filename: str, content_type: str | None) -> dict:
    """Transcrit la vidéo (upload direct, pas encore sur Cloudinary à ce stade du
    flux StudioVideo.jsx) et propose 3 accroches. Retourne {ok, hooks} ou
    {ok:False, error}."""
    if not enabled():
        return {"ok": False, "error": "Service de montage indisponible."}
    try:
        async with httpx.AsyncClient(timeout=CREATE_TIMEOUT) as c:
            r = await c.post(
                f"{MONTAGE_POC_URL}/suggest_hooks",
                files={"video": (filename, file_bytes, content_type or "video/mp4")},
                headers=_headers(),
            )
        if r.status_code >= 300:
            logger.error(f"montage-poc suggest_hooks error {r.status_code}: {r.text[:200]}")
            return {"ok": False, "error": "Suggestion indisponible."}
        job_id = r.json().get("job_id")
        deadline = time.monotonic() + 90
        async with httpx.AsyncClient(timeout=POLL_TIMEOUT) as c:
            while time.monotonic() < deadline:
                await asyncio.sleep(2)
                jr = await c.get(f"{MONTAGE_POC_URL}/jobs/{job_id}", headers=_headers())
                jd = jr.json()
                if jd.get("status") == "done":
                    return {"ok": True, "hooks": jd.get("hooks") or []}
                if jd.get("status") == "error":
                    return {"ok": False, "error": jd.get("error") or "Échec de la transcription."}
        return {"ok": False, "error": "Délai dépassé, réessaie."}
    except Exception as e:
        logger.error(f"montage-poc suggest_hooks exception: {type(e).__name__}: {e}")
        return {"ok": False, "error": "Service de montage injoignable, réessaie."}
