from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from dependencies import verify_token
from services import reel_service, banque_service, music_library, quota_service
from config import logger

router = APIRouter(prefix="/reels", tags=["reels"])


class ReelImage(BaseModel):
    url: str
    desc: str | None = None     # description (fournie par la banque, sinon vision cote serveur)


class ReelRequest(BaseModel):
    contenu_id: str
    template: str = "affiche"   # cle de reel_service.TEMPLATES
    duree: str | None = None    # retro-compat ancien front ("long" -> template long)
    images: list[ReelImage] | None = None   # Sequence : visuels choisis par le CLIENT
    brief: str | None = None                # Sequence : consignes libres du client
    style: str | None = None                # Sequence : habillage (signature/cinema/…)
    musique: str | None = None              # Sequence : piste de fond (bibliotheque partagee)


@router.get("/templates")
def templates(payload: dict = Depends(verify_token)):
    """Templates de reels + bibliotheque musicale (partagee + MP3 importes par le client)."""
    telegram_id = payload.get("telegram_id")
    cats, pistes = music_library.bibliotheque(telegram_id)
    return {"templates": reel_service.liste_templates(),
            "musiques": [{"id": m["id"], "label": m["label"], "category": m.get("category"), "url": m.get("url")}
                         for m in pistes],
            "categories": cats}


@router.post("/musique")
async def importer_musique(file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Import d'un MP3 personnel, utilisable comme musique de fond des reels."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    ct = (file.content_type or "").lower()
    nom = (file.filename or "").lower()
    if not (ct.startswith("audio/") or ct in ("video/mp4", "application/octet-stream")
            or nom.endswith((".mp3", ".m4a", ".wav", ".aac", ".ogg"))):
        raise HTTPException(status_code=400, detail="Le fichier doit etre un audio (MP3, M4A, WAV…)")
    data = await file.read()
    res = reel_service.importer_musique(telegram_id, data, file.filename)
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


class DecoupageMusique(BaseModel):
    debut_s: float | None = None
    duree_s: float | None = None


@router.patch("/musique/{musique_id}")
def decouper_musique(musique_id: str, body: DecoupageMusique, payload: dict = Depends(verify_token)):
    """Enregistre le passage retenu d'une musique importee (les deux a null = piste entiere)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    res = music_library.decouper(telegram_id, musique_id, body.debut_s, body.duree_s)
    if res.get("error"):
        raise HTTPException(status_code=404, detail=res["error"])
    return res


@router.delete("/musique/{musique_id}")
def supprimer_musique(musique_id: str, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    res = reel_service.supprimer_musique(telegram_id, musique_id)
    if res.get("error"):
        raise HTTPException(status_code=404, detail=res["error"])
    return res


@router.get("/recommander/{contenu_id}")
def recommander(contenu_id: str, payload: dict = Depends(verify_token)):
    """L'IA recommande le template le plus adapte au post (badge de la galerie)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return reel_service.recommander_template(telegram_id, contenu_id)


@router.post("/generer")
def generer_reel(body: ReelRequest, payload: dict = Depends(verify_token)):
    """Transforme un post existant en reel MP4 anime a la charte du client (Remotion).
    Cree un contenu jumeau type 'Reel' en 'A valider' — publie ensuite par le flux normal.
    Rendu ~1-2 min : la requete est longue, le front doit prevoir un timeout large."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    quota_service.exiger_abonnement(telegram_id)  # sans carte -> popup mur de paiement
    template = body.template or "affiche"
    if body.duree == "long":  # retro-compat
        template = "long"
    images = [{"url": i.url, "desc": i.desc} for i in (body.images or [])][:8]
    try:
        res = reel_service.generer_reel(telegram_id, body.contenu_id, template=template,
                                        images=images or None, brief=(body.brief or "").strip() or None,
                                        style=body.style, musique=body.musique)
    except Exception as e:
        logger.error(f"generer reel: {e}")
        raise HTTPException(status_code=500, detail="Echec de la generation du reel")
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


class ReelLibreRequest(BaseModel):
    brief: str
    images: list[ReelImage] | None = None
    reseau: str | None = None
    style: str | None = None
    musique: str | None = None


@router.post("/creer")
def creer(body: ReelLibreRequest, payload: dict = Depends(verify_token)):
    """Cree un reel Sequence de zero (sans post source) : le brief est le sujet."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    images = [{"url": i.url, "desc": i.desc} for i in (body.images or [])][:8]
    try:
        res = reel_service.creer_reel_libre(telegram_id, body.brief,
                                            images=images or None, reseau=body.reseau or "Instagram",
                                            style=body.style, musique=body.musique)
    except Exception as e:
        logger.error(f"creer reel libre: {e}")
        raise HTTPException(status_code=500, detail="Echec de la creation du reel")
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


class ReelRegenRequest(BaseModel):
    reel_id: str
    images: list[ReelImage] | None = None
    brief: str | None = None
    style: str | None = None
    musique: str | None = None


@router.post("/regenerer")
def regenerer(body: ReelRegenRequest, payload: dict = Depends(verify_token)):
    """Modifie un reel Sequence existant (A valider) : nouvelles images/brief -> re-rendu SUR PLACE."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    images = [{"url": i.url, "desc": i.desc} for i in (body.images or [])][:8]
    try:
        res = reel_service.regenerer_reel(telegram_id, body.reel_id,
                                          images=images or None, brief=(body.brief or "").strip() or None,
                                          style=body.style, musique=body.musique)
    except Exception as e:
        logger.error(f"regenerer reel: {e}")
        raise HTTPException(status_code=500, detail="Echec de la regeneration du reel")
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@router.post("/upload-image")
async def upload_reel_image(file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Upload d'un visuel source pour un reel Sequence (Cloudinary). Retourne {url, desc}."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit etre une image")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 10 Mo)")
    try:
        return reel_service.upload_image_source(telegram_id, data)
    except Exception as e:
        logger.error(f"reel upload image: {e}")
        raise HTTPException(status_code=500, detail="Echec de l'upload")


@router.get("/banque")
def banque(payload: dict = Depends(verify_token)):
    """La banque de visuels de la marque (selectionnables dans le dialogue Sequence)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return {"images": banque_service.lister(telegram_id)}


@router.post("/banque")
async def banque_ajouter(file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Ajoute une image OU un extrait video a la banque (decrit par IA vision a l'upload)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    ct = (file.content_type or "").lower()
    nom = (file.filename or "").lower()
    est_video = ct.startswith("video/") or nom.endswith((".mp4", ".mov", ".webm", ".m4v"))
    if not (est_video or ct.startswith("image/")):
        raise HTTPException(status_code=400, detail="Le fichier doit etre une image ou une video")
    data = await file.read()
    limite = 60 if est_video else 10
    if len(data) > limite * 1024 * 1024:
        raise HTTPException(status_code=400,
                            detail=f"Fichier trop lourd (max {limite} Mo{' pour une video' if est_video else ''})")
    try:
        res = banque_service.ajouter(telegram_id, data, est_video=est_video)
    except Exception as e:
        logger.error(f"banque ajouter: {e}")
        raise HTTPException(status_code=500, detail="Echec de l'upload")
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@router.delete("/banque/{asset_id}")
def banque_supprimer(asset_id: str, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    res = banque_service.supprimer(telegram_id, asset_id)
    if res.get("error"):
        raise HTTPException(status_code=404, detail=res["error"])
    return res
