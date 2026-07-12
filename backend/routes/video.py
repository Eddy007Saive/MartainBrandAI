"""Studio Vidéo / Reels — montage via Submagic.

Flux : upload vidéo brute (Cloudinary) → création d'un job Submagic (sous-titres + b-roll
+ zooms + musique optionnelle) → Submagic rend en async → webhook (ou polling) → on
rapatrie le MP4 monté sur Cloudinary et on l'attache au contenu.
"""
import asyncio
import os
import shutil
import subprocess
import tempfile
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
import httpx
import cloudinary
import cloudinary.uploader
from dependencies import verify_token
from services import submagic_service, quota_service
from config import (
    supabase, logger, BACKEND_URL,
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
    SUBMAGIC_DEFAULT_THEME_ID, SUBMAGIC_DEFAULT_THEME_LABEL,
)

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

router = APIRouter(prefix="/video", tags=["video"])

MAX_VIDEO_BYTES = 300 * 1024 * 1024  # 300 Mo

RESEAU_MAP = {"instagram": "Instagram", "tiktok": "TikTok", "youtube": "YouTube", "facebook": "Facebook", "linkedin": "LinkedIn", "googlebusiness": "GoogleBusiness"}

# Bibliothèque de sons : chaque piste est hébergée sur Cloudinary (preview écoutable) et
# pré-enregistrée dans Submagic (userMediaId). Seed via scripts/seed_submagic_music_drive.py.
# `category` regroupe les pistes dans le sélecteur (menu 2 niveaux) ; "none" = pas de musique.
MUSIC_CATEGORIES = [
    {"id": "calme", "label": "Calme"},
    {"id": "optimiste", "label": "Optimiste"},
    {"id": "funky", "label": "Funky / Groove"},
    {"id": "epique", "label": "Épique"},
    {"id": "emotion", "label": "Émotion"},
    {"id": "country", "label": "Country"},
]

_MUS = "https://res.cloudinary.com/dy9gp5pim/video/upload/submagic_music"
MUSIC_LIBRARY = [
    {"id": "none", "label": "Aucune musique", "category": None, "user_media_id": None, "url": None},
    {"id": "calme", "label": "Calme", "category": "calme", "user_media_id": "638c9a7f-2cb9-41ff-bb99-fae4e0c73c1d", "url": f"{_MUS}/calme.mp3"},
    {"id": "in-the-morning", "label": "In The Morning", "category": "calme", "user_media_id": "16624be5-3758-4293-9291-92c3106f4c7d", "url": f"{_MUS}/in-the-morning.mp3"},
    {"id": "visible-invisible", "label": "Make The Visible Invisible", "category": "calme", "user_media_id": "b9114ed4-d11e-4118-a3af-9a1049fa741e", "url": f"{_MUS}/visible-invisible.mp3"},
    {"id": "optimiste", "label": "Optimiste", "category": "optimiste", "user_media_id": "ac12a379-88a9-4c99-add1-f826a92c5cd8", "url": f"{_MUS}/optimiste.mp3"},
    {"id": "butterfly", "label": "Butterfly", "category": "optimiste", "user_media_id": "7c9a8720-84e2-407e-a062-2ca79a44997a", "url": f"{_MUS}/butterfly.mp3"},
    {"id": "funky", "label": "Funky", "category": "funky", "user_media_id": "be0ae396-bed5-4f8a-b721-d741521c6371", "url": f"{_MUS}/funky.mp3"},
    {"id": "claim-to-fame", "label": "Claim To Fame", "category": "funky", "user_media_id": "dce42cc3-510c-44f1-83d1-98949f7fa3d9", "url": f"{_MUS}/claim-to-fame.mp3"},
    {"id": "drop-of-a-hat", "label": "Drop Of A Hat", "category": "funky", "user_media_id": "3ca88017-c9b2-4320-977a-58968ba9d3b7", "url": f"{_MUS}/drop-of-a-hat.mp3"},
    {"id": "frame-dragging", "label": "Frame-Dragging", "category": "epique", "user_media_id": "8e8fd1f4-0ff6-47c8-9290-c35daf7f3004", "url": f"{_MUS}/frame-dragging.mp3"},
    {"id": "level", "label": "Level", "category": "epique", "user_media_id": "631d3eb3-21f2-401e-9f86-eac664866bf7", "url": f"{_MUS}/level.mp3"},
    {"id": "dyin-breed", "label": "A Dyin' Breed", "category": "emotion", "user_media_id": "ec851863-3887-43cd-a0f5-a4ea781caa30", "url": f"{_MUS}/dyin-breed.mp3"},
    {"id": "missed-my-chance", "label": "Missed My Chance", "category": "emotion", "user_media_id": "8a4ae600-4586-4926-85ae-a7dd16c7ba23", "url": f"{_MUS}/missed-my-chance.mp3"},
    {"id": "triste", "label": "Triste", "category": "emotion", "user_media_id": "0cfc6fdf-a29e-4f49-8d74-e821b29d2b7a", "url": f"{_MUS}/triste.mp3"},
    {"id": "country", "label": "Country", "category": "country", "user_media_id": "96d986ed-e831-4f5c-b0fc-7f360eeb2e85", "url": f"{_MUS}/country.mp3"},
]

# Thèmes / presets PERSO créés dans l'éditeur Submagic (pas d'API pour les lister → coller les IDs ici).
#   type "theme"  -> userThemeId (ton positionnement/polices/couleurs)
#   type "preset" -> presetId (config complète : template + b-roll + zooms + musique)
CUSTOM_TEMPLATES = [
    # {"id": "brand", "label": "Ma marque", "type": "theme", "value": "<userThemeId>"},
    # {"id": "reel-pro", "label": "Reel Pro (preset)", "type": "preset", "value": "<presetId>"},
]


def _targets(body: dict) -> list:
    """Réseaux cibles capitalisés + dédupliqués. Accepte `reseaux` (liste) ou `reseau` (str)."""
    raw = body.get("reseaux")
    if not isinstance(raw, list):
        raw = [body.get("reseau")] if body.get("reseau") else []
    out = []
    for r in raw:
        cap = RESEAU_MAP.get(str(r).lower())
        if cap and cap not in out:
            out.append(cap)
    return out


def _music_media_id(music_id: str) -> str | None:
    for m in MUSIC_LIBRARY:
        if m["id"] == music_id:
            return m["user_media_id"]
    return None


def _custom(cid: str) -> dict | None:
    for t in CUSTOM_TEMPLATES:
        if t["id"] == cid:
            return t
    return None


def _poster(video_url: str | None) -> str | None:
    """Miniature d'une vidéo Cloudinary : une frame à ~1,5s (évite une 1ʳᵉ frame noire) + q_auto."""
    if not video_url or "/upload/" not in video_url:
        return None
    stem = video_url.rsplit(".", 1)[0]  # retire l'extension
    return stem.replace("/upload/", "/upload/so_1.5,q_auto/") + ".jpg"


@router.get("/options")
async def options(payload: dict = Depends(verify_token)):
    """Templates (live) + thème de marque du compte + bibliothèque de sons."""
    telegram_id = payload.get("telegram_id")
    try:
        tpls = await submagic_service.list_templates()
        # L'API renvoie une liste de chaînes (noms) ; tolère aussi des objets {name}.
        templates = [(t if isinstance(t, str) else t.get("name")) for t in tpls if t]
        templates = [t for t in templates if t]
    except Exception as e:
        logger.error(f"video options templates: {e}")
        templates = ["Matt", "Jess", "Nick", "Laura", "Kelly 2", "Michael"]

    # Thème de marque : perso du compte (assigné par l'admin) sinon thème GLOBAL par défaut.
    custom = []
    theme_id, theme_label = None, None
    try:
        u = (supabase.table("users").select("submagic_theme_id, submagic_theme_label")
             .eq("telegram_id", telegram_id).limit(1).execute().data or [])
        if u and u[0].get("submagic_theme_id"):
            theme_id, theme_label = u[0]["submagic_theme_id"], u[0].get("submagic_theme_label")
    except Exception as e:
        logger.warning(f"video options theme: {e}")
    if not theme_id and SUBMAGIC_DEFAULT_THEME_ID:
        theme_id, theme_label = SUBMAGIC_DEFAULT_THEME_ID, SUBMAGIC_DEFAULT_THEME_LABEL
    if theme_id:
        custom.append({"id": "brand", "label": theme_label or "Thème de ta marque", "type": "theme"})
    custom += [{"id": t["id"], "label": t["label"], "type": t["type"]} for t in CUSTOM_TEMPLATES]

    return {
        "templates": templates,
        "custom": custom,
        "music_categories": MUSIC_CATEGORIES,
        "music": [{"id": m["id"], "label": m["label"], "category": m.get("category"), "url": m.get("url")} for m in MUSIC_LIBRARY],
    }


@router.post("/upload")
async def upload_raw(file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Upload la vidéo brute de l'utilisateur → Cloudinary (video) → { video_url }."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une vidéo (mp4, mov…)")
    data = await file.read()
    if len(data) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=400, detail="Vidéo trop lourde (300 Mo max).")
    try:
        up = cloudinary.uploader.upload_large(
            data, resource_type="video", folder=f"videos_raw/{telegram_id}", overwrite=True,
        ) if len(data) > 90 * 1024 * 1024 else cloudinary.uploader.upload(
            data, resource_type="video", folder=f"videos_raw/{telegram_id}", overwrite=True,
        )
        return {"video_url": up["secure_url"], "public_id": up.get("public_id"),
                "duration": up.get("duration"), "width": up.get("width"), "height": up.get("height")}
    except Exception as e:
        logger.error(f"raw video upload error: {e}")
        raise HTTPException(status_code=500, detail="Échec de l'upload de la vidéo.")


@router.post("/draft")
async def draft(body: dict, payload: dict = Depends(verify_token)):
    """Crée un contenu-script (statut « À tourner ») depuis un script — apparaît dans Contenus.

    Gratuit : c'est le montage (/create) qui consomme le quota. Renvoie { contenu_id }.
    """
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    script = (body.get("script") or "").strip()
    titre = (body.get("titre") or (script[:80] if script else "Vidéo")).strip()[:120]
    row = {"telegram_id": telegram_id, "titre": titre, "type": "Reel", "statut": "A tourner", "script": script or None}
    reseau = (body.get("reseau") or "").lower()
    if reseau in RESEAU_MAP:
        row["reseau_cible"] = RESEAU_MAP[reseau]
    ins = supabase.table("contenu").insert(row).execute()
    return {"contenu_id": ins.data[0]["id"] if ins.data else None}


@router.post("/create")
async def create(body: dict, payload: dict = Depends(verify_token)):
    """Lance le montage Submagic sur une vidéo déjà uploadée. Consomme un quota 'video'.

    Si `contenu_id` est fourni (script « À tourner »), on met à jour CE contenu au lieu d'en créer un.
    """
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    video_url = (body.get("video_url") or "").strip()
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url requise (upload d'abord).")

    q = quota_service.consume(telegram_id, "video")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail=q.get("message"))

    title = (body.get("titre") or "Vidéo")[:120]
    targets = _targets(body) or ["Instagram"]
    webhook = f"{BACKEND_URL}/api/video/webhook" if BACKEND_URL.startswith("https://") else None
    # Template : thème de marque du compte (body.custom == "brand"), thème/preset global, ou un des 45.
    custom = _custom(body.get("custom")) if body.get("custom") else None
    user_theme_id = custom["value"] if custom and custom.get("type") == "theme" else None
    preset_id = custom["value"] if custom and custom.get("type") == "preset" else None
    if body.get("custom") == "brand" and not user_theme_id:
        ur = (supabase.table("users").select("submagic_theme_id")
              .eq("telegram_id", telegram_id).limit(1).execute().data or [])
        if ur and ur[0].get("submagic_theme_id"):
            user_theme_id = ur[0]["submagic_theme_id"]
        elif SUBMAGIC_DEFAULT_THEME_ID:
            user_theme_id = SUBMAGIC_DEFAULT_THEME_ID
    res = await submagic_service.create_project(
        title=title,
        video_url=video_url,
        language=body.get("langue", "fr"),
        template_name=body.get("template", "Matt"),
        user_theme_id=user_theme_id,
        preset_id=preset_id,
        magic_brolls=bool(body.get("brolls", True)),
        magic_brolls_percentage=int(body["broll_pct"]) if body.get("broll_pct") is not None else None,
        magic_zooms=bool(body.get("zooms", True)),
        remove_silence_pace=(body.get("silence_pace") or None),
        remove_bad_takes=bool(body.get("bad_takes", False)),
        clean_audio=bool(body.get("clean_audio", False)),
        music_media_id=_music_media_id(body.get("music", "none")),
        music_volume=int(body.get("music_volume", 25)),
        webhook_url=webhook,
    )
    if not res.get("ok"):
        quota_service.refund(q)
        raise HTTPException(status_code=502, detail=res.get("error") or "Le montage n'a pas pu démarrer.")

    pid = res["id"]
    patch = {"type": "Reel", "statut": "A valider", "submagic_project_id": pid,
             "video_status": "en_traitement", "video_raw_id": (body.get("raw_public_id") or None)}
    existing_id = (body.get("contenu_id") or "").strip() if isinstance(body.get("contenu_id"), str) else body.get("contenu_id")
    script_txt = None
    if existing_id:
        # Montage d'un script « À tourner » existant → on met à jour CE contenu.
        ex = (supabase.table("contenu").select("script, reseau_cible")
              .eq("id", existing_id).eq("telegram_id", telegram_id).limit(1).execute().data or [{}])[0]
        script_txt = ex.get("script")
        primary_net = ex.get("reseau_cible") or targets[0]
        p = dict(patch)
        if not ex.get("reseau_cible"):
            p["reseau_cible"] = primary_net
        supabase.table("contenu").update(p).eq("id", existing_id).eq("telegram_id", telegram_id).execute()
        contenu_id = existing_id
    else:
        primary_net = targets[0]
        row = {"telegram_id": telegram_id, "titre": title, "reseau_cible": primary_net, **patch}
        ins = supabase.table("contenu").insert(row).execute()
        contenu_id = ins.data[0]["id"] if ins.data else None
    # Réseaux supplémentaires → contenus « jumeaux » (même montage, publiés/planifiés séparément).
    for net in targets:
        if net == primary_net:
            continue
        supabase.table("contenu").insert({
            "telegram_id": telegram_id, "titre": title, "type": "Reel", "statut": "A valider",
            "submagic_project_id": pid, "video_status": "en_traitement",
            "reseau_cible": net, "script": script_txt,
        }).execute()
    return {"contenu_id": contenu_id, "submagic_project_id": pid, "video_status": "en_traitement"}


@router.post("/import")
async def import_video(body: dict, payload: dict = Depends(verify_token)):
    """Import DIRECT d'une vidéo déjà prête — SANS montage Submagic, SANS quota vidéo.

    Pour l'utilisateur qui a déjà sa vidéo montée et veut juste la publier telle quelle.
    """
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    video_url = (body.get("video_url") or "").strip()
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url requise (upload d'abord).")
    title = (body.get("titre") or "Vidéo")[:120]
    targets = _targets(body) or ["Instagram"]
    poster = _poster(video_url)
    # Story vidéo (éphémère 24h) : Instagram/Facebook uniquement (support Zernio) ;
    # les autres réseaux de la même rafale restent des Reels classiques.
    as_story = bool(body.get("as_story"))

    def type_for(net: str) -> str:
        return "Story" if (as_story and net in ("Instagram", "Facebook")) else "Reel"

    patch = {"statut": "A valider", "video_status": "pret",
             "video_url": video_url, "video_preview_url": None, "lien_visuel": poster,
             "submagic_project_id": None, "video_raw_id": None}
    existing_id = body.get("contenu_id")
    script_txt = None
    if existing_id:
        ex = (supabase.table("contenu").select("script, reseau_cible")
              .eq("id", existing_id).eq("telegram_id", telegram_id).limit(1).execute().data or [{}])[0]
        script_txt = ex.get("script")
        primary_net = ex.get("reseau_cible") or targets[0]
        p = dict(patch)
        p["type"] = type_for(primary_net)
        if not ex.get("reseau_cible"):
            p["reseau_cible"] = primary_net
        supabase.table("contenu").update(p).eq("id", existing_id).eq("telegram_id", telegram_id).execute()
        contenu_id = existing_id
    else:
        primary_net = targets[0]
        row = {"telegram_id": telegram_id, "titre": title, "reseau_cible": primary_net,
               "type": type_for(primary_net), **patch}
        ins = supabase.table("contenu").insert(row).execute()
        contenu_id = ins.data[0]["id"] if ins.data else None
    # Réseaux supplémentaires → contenus « jumeaux » (même vidéo, publiés séparément).
    for net in targets:
        if net == primary_net:
            continue
        supabase.table("contenu").insert({
            "telegram_id": telegram_id, "titre": title, "type": type_for(net), "statut": "A valider",
            "video_status": "pret", "video_url": video_url, "video_preview_url": None,
            "lien_visuel": poster, "reseau_cible": net, "script": script_txt,
        }).execute()
    return {"contenu_id": contenu_id, "video_status": "pret", "video_url": video_url}


def _compress(src_url: str) -> str | None:
    """Télécharge la vidéo montée et la compresse avec ffmpeg. Retourne un chemin local, ou
    None si ffmpeg est absent (ex. local) → le caller retombe sur le fetch Cloudinary direct.

    H.264 CRF 26 + largeur plafonnée à 1080 (jamais d'upscale) + audio AAC 128k + faststart.
    """
    if not shutil.which("ffmpeg"):
        return None
    tmp = tempfile.mkdtemp(prefix="vid_")
    inp, out = os.path.join(tmp, "in.mp4"), os.path.join(tmp, "out.mp4")
    try:
        with httpx.stream("GET", src_url, timeout=180, follow_redirects=True) as r:
            r.raise_for_status()
            with open(inp, "wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
        subprocess.run(
            ["ffmpeg", "-y", "-i", inp, "-c:v", "libx264", "-crf", "26", "-preset", "veryfast",
             "-vf", "scale='min(1080,iw)':-2", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out],
            check=True, capture_output=True, timeout=300,
        )
        return out
    except Exception as e:
        logger.error(f"ffmpeg compress error: {e}")
        shutil.rmtree(tmp, ignore_errors=True)
        return None


async def _finalize(contenu: dict) -> dict:
    """Si le montage Submagic est prêt : rapatrie le MP4 sur Cloudinary et met à jour le contenu.

    Idempotent : si déjà 'pret'/'echec', ne refait rien.
    """
    if contenu.get("video_status") in ("pret", "echec"):
        return {"video_status": contenu.get("video_status"), "video_url": contenu.get("video_url"),
                "video_preview_url": contenu.get("video_preview_url")}
    pid = contenu.get("submagic_project_id")
    cid = contenu.get("id")
    tid = contenu.get("telegram_id")
    if not pid:
        return {"video_status": "en_traitement"}
    try:
        info = await submagic_service.get_project(pid)
    except Exception as e:
        logger.error(f"finalize get_project {pid}: {e}")
        return {"video_status": "en_traitement"}

    st = info.get("status")
    if st == submagic_service.FAILED:
        # tous les contenus (jumeaux) de ce montage échouent ; remboursement unique.
        supabase.table("contenu").update({"video_status": "echec"}).eq("submagic_project_id", pid).execute()
        quota_service.refund_by_user(tid, "video")  # échec async -> on rembourse
        return {"video_status": "echec"}
    if st != submagic_service.DONE:
        return {"video_status": "en_traitement", "stage": st}  # processing|transcribing|exporting

    src = info.get("direct_url") or info.get("download_url")
    if not src:
        return {"video_status": "en_traitement"}
    # Compression ffmpeg AVANT enregistrement (économie de stockage). Repli : fetch direct si ffmpeg absent.
    local = await asyncio.to_thread(_compress, src)
    try:
        # nom d'asset déterministe par MONTAGE (pid) → une seule vidéo partagée par les jumeaux.
        if local:
            up = cloudinary.uploader.upload(local, resource_type="video", folder=f"videos/{tid}",
                                            public_id=str(pid), overwrite=True)
        else:
            up = cloudinary.uploader.upload(src, resource_type="video", folder=f"videos/{tid}",
                                            public_id=str(pid), overwrite=True)
        video_url = up["secure_url"]
    except Exception as e:
        logger.error(f"finalize cloudinary upload {cid}: {e}")
        return {"video_status": "en_traitement"}
    finally:
        if local:
            shutil.rmtree(os.path.dirname(local), ignore_errors=True)

    patch = {
        "video_status": "pret",
        "video_url": video_url,
        "video_preview_url": info.get("preview_url"),
        "lien_visuel": _poster(video_url),  # miniature (frame ~1,5s)
    }
    # Applique à TOUS les contenus de ce montage (multi-réseaux → 1 carte par réseau).
    supabase.table("contenu").update(patch).eq("submagic_project_id", pid).execute()
    # La vidéo brute (portée par le contenu primaire) ne sert plus → suppression pour ne pas gaspiller le stockage.
    raws = (supabase.table("contenu").select("id, video_raw_id")
            .eq("submagic_project_id", pid).execute().data or [])
    for rr in raws:
        rid = rr.get("video_raw_id")
        if rid:
            try:
                cloudinary.uploader.destroy(rid, resource_type="video", invalidate=True)
            except Exception as e:
                logger.warning(f"cleanup vidéo brute {rid}: {e}")
            supabase.table("contenu").update({"video_raw_id": None}).eq("id", rr["id"]).execute()
    return {"video_status": "pret", "video_url": video_url, "video_preview_url": info.get("preview_url")}


@router.post("/webhook")
async def webhook(request: Request):
    """Notification Submagic (traitement terminé). On re-fetch la vérité via l'API (payload non garanti)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    pid = body.get("projectId") or body.get("id") or (body.get("data") or {}).get("id") or (body.get("project") or {}).get("id")
    if not pid:
        return {"ok": True}  # on ignore poliment un payload inconnu
    r = supabase.table("contenu").select("*").eq("submagic_project_id", pid).limit(1).execute()
    if r.data:
        await _finalize(r.data[0])
    return {"ok": True}


@router.get("/status/{contenu_id}")
async def status(contenu_id: str, payload: dict = Depends(verify_token)):
    """Statut du montage (fallback polling pour le front — fonctionne aussi en local sans webhook)."""
    telegram_id = payload.get("telegram_id")
    r = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).limit(1).execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    return await _finalize(r.data[0])
