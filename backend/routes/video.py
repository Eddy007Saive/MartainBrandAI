"""Studio Vidéo / Reels — montage via Studio Montage (submagic-poc, self-hosted).

Flux : upload vidéo brute (Cloudinary) → démarrage d'un job Studio Montage (sous-titres +
b-roll + zooms + musique optionnelle) → rendu async (polling, pas de webhook côté
submagic-poc) → le MP4 est déjà sur Cloudinary (studio-montage/{job_id}/video) une fois
`done`, on l'attache directement au contenu.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
import cloudinary
import cloudinary.uploader
from dependencies import verify_token
from services import montage_poc_service as submagic_service, quota_service
from config import (
    supabase, logger,
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
)

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

router = APIRouter(prefix="/video", tags=["video"])

MAX_VIDEO_BYTES = 300 * 1024 * 1024  # 300 Mo

RESEAU_MAP = {"instagram": "Instagram", "tiktok": "TikTok", "youtube": "YouTube", "facebook": "Facebook", "linkedin": "LinkedIn", "googlebusiness": "GoogleBusiness"}

# Bibliothèque de sons : PARTAGÉE avec les reels Remotion (services/music_library.py) ET
# submagic-poc/music.py (mêmes `id` de piste des deux côtés).
from services.music_library import MUSIC_CATEGORIES, MUSIC_LIBRARY


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


def _poster(video_url: str | None) -> str | None:
    """Miniature d'une vidéo Cloudinary : une frame à ~1,5s (évite une 1ʳᵉ frame noire) + q_auto."""
    if not video_url or "/upload/" not in video_url:
        return None
    stem = video_url.rsplit(".", 1)[0]  # retire l'extension
    return stem.replace("/upload/", "/upload/so_1.5,q_auto/") + ".jpg"


@router.get("/options")
async def options(payload: dict = Depends(verify_token)):
    """Presets de sous-titres (fixes, Studio Montage) + bibliothèque de sons."""
    # 12 presets réels de submagic-poc, pas d'appel réseau (contrairement à
    # l'ancienne liste "live" Submagic) ; pas de thème perso — sans équivalent
    # côté Studio Montage.
    utilisables = MUSIC_LIBRARY
    cats_ok = {m.get("category") for m in utilisables}
    return {
        "templates": submagic_service.PRESETS,
        "custom": [],
        "music_categories": [c for c in MUSIC_CATEGORIES if c["id"] in cats_ok],
        "music": [{"id": m["id"], "label": m["label"], "category": m.get("category"), "url": m.get("url")} for m in utilisables],
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
def draft(body: dict, payload: dict = Depends(verify_token)):
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
    """Lance le montage Studio Montage sur une vidéo déjà uploadée. Consomme un quota 'video'.

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
        # Meme refus que les generations de l'agent : l'interface a besoin de
        # la raison pour choisir entre le mur de paiement et un simple message.
        raise HTTPException(status_code=402, detail={
            "raison": q.get("reason") or "quota",
            "message": q.get("message") or "Génération indisponible.",
        })

    title = (body.get("titre") or "Vidéo")[:120]
    targets = _targets(body) or ["Instagram"]
    res = await submagic_service.create_project(
        title=title,
        video_url=video_url,
        template_name=body.get("template", "classic"),
        magic_brolls=bool(body.get("brolls", True)),
        magic_brolls_percentage=int(body["broll_pct"]) if body.get("broll_pct") is not None else None,
        magic_zooms=bool(body.get("zooms", True)),
        remove_silence_pace=(body.get("silence_pace") or None),
        clean_audio=bool(body.get("clean_audio", False)),
        music_id=body.get("music", "none"),
        music_volume=int(body.get("music_volume", 25)),
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
def import_video(body: dict, payload: dict = Depends(verify_token)):
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


async def _finalize(contenu: dict) -> dict:
    """Si le montage Studio Montage est prêt : attache le MP4 (déjà sur Cloudinary,
    studio-montage/{job_id}/video) au contenu.

    Idempotent : si déjà 'pret'/'echec', ne refait rien.
    """
    if contenu.get("video_status") in ("pret", "echec"):
        return {"video_status": contenu.get("video_status"), "video_url": contenu.get("video_url"),
                "video_preview_url": contenu.get("video_preview_url")}
    pid = contenu.get("submagic_project_id")
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

    # submagic-poc a déjà uploadé le MP4 sur Cloudinary (même compte) -> on pointe
    # directement dessus, pas de second passage ffmpeg ni de copie redondante.
    video_url = info.get("direct_url") or info.get("download_url")
    if not video_url:
        return {"video_status": "en_traitement"}

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
    """Notification Submagic (traitement terminé). Route héritée : submagic-poc n'a pas de
    webhook (polling only via /status), donc jamais appelée dans le flux actuel — laissée en
    place, inoffensive, au cas où Submagic serait un jour réactivé."""
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
