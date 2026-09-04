from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from dependencies import verify_token
from config import supabase
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
    voix: str | None = None                 # Sequence : voix off (victor|yann|adina|moi), None = muet


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


def _consommer_voix(telegram_id: str, voix: str | None, q_reel: dict) -> dict | None:
    """Voix off demandée : valide le choix, puis consomme 1 « voix ». En cas de refus,
    le quota reel déjà réservé est rendu (rien n'a été produit)."""
    if not voix or voix == "none":
        return None
    from services import voix_service
    try:
        voix_service.valider_choix(telegram_id, voix)
    except ValueError as e:
        quota_service.refund(q_reel)
        raise HTTPException(status_code=400, detail=str(e))
    qv = quota_service.consume(telegram_id, "voix")
    if not qv.get("ok"):
        quota_service.refund(q_reel)
        raise HTTPException(status_code=402, detail={
            "raison": qv.get("reason") or "quota",
            "message": qv.get("message") or "Voix off indisponible.",
        })
    return qv


def _rendre_voix(qv: dict | None) -> None:
    if qv:
        quota_service.refund(qv)


def _confirmer_voix(qv: dict | None) -> None:
    if qv:
        quota_service.confirm(qv)


@router.post("/generer")
def generer_reel(body: ReelRequest, payload: dict = Depends(verify_token)):
    """Transforme un post existant en reel MP4 anime a la charte du client (Remotion).
    Cree un contenu jumeau type 'Reel' en 'A valider' — publie ensuite par le flux normal.
    Rendu ~1-2 min : la requete est longue, le front doit prevoir un timeout large."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    quota_service.exiger_abonnement(telegram_id)  # sans carte -> popup mur de paiement
    q = quota_service.consume(telegram_id, "reel")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail={
            "raison": q.get("reason") or "quota",
            "message": q.get("message") or "Génération indisponible.",
        })
    template = body.template or "affiche"
    if body.duree == "long":  # retro-compat
        template = "long"
    voix = body.voix if template.startswith("sequence") else None
    qv = _consommer_voix(telegram_id, voix, q)
    images = [{"url": i.url, "desc": i.desc} for i in (body.images or [])][:8]
    try:
        res = reel_service.generer_reel(telegram_id, body.contenu_id, template=template,
                                        images=images or None, brief=(body.brief or "").strip() or None,
                                        style=body.style, musique=body.musique, voix=voix)
    except Exception as e:
        quota_service.refund(q); _rendre_voix(qv)
        logger.error(f"generer reel: {e}")
        raise HTTPException(status_code=500, detail="Echec de la generation du reel")
    if res.get("error"):
        quota_service.refund(q); _rendre_voix(qv)
        raise HTTPException(status_code=400, detail=res["error"])
    quota_service.confirm(q); _confirmer_voix(qv)
    return res


class ReelLibreRequest(BaseModel):
    brief: str
    images: list[ReelImage] | None = None
    reseau: str | None = None
    style: str | None = None
    musique: str | None = None
    voix: str | None = None


@router.post("/creer")
def creer(body: ReelLibreRequest, payload: dict = Depends(verify_token)):
    """Cree un reel Sequence de zero (sans post source) : le brief est le sujet."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    quota_service.exiger_abonnement(telegram_id)  # sans carte -> popup mur de paiement
    q = quota_service.consume(telegram_id, "reel")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail={
            "raison": q.get("reason") or "quota",
            "message": q.get("message") or "Génération indisponible.",
        })
    qv = _consommer_voix(telegram_id, body.voix, q)
    images = [{"url": i.url, "desc": i.desc} for i in (body.images or [])][:8]
    try:
        res = reel_service.creer_reel_libre(telegram_id, body.brief,
                                            images=images or None, reseau=body.reseau or "Instagram",
                                            style=body.style, musique=body.musique, voix=body.voix)
    except Exception as e:
        quota_service.refund(q); _rendre_voix(qv)
        logger.error(f"creer reel libre: {e}")
        raise HTTPException(status_code=500, detail="Echec de la creation du reel")
    if res.get("error"):
        quota_service.refund(q); _rendre_voix(qv)
        raise HTTPException(status_code=400, detail=res["error"])
    quota_service.confirm(q); _confirmer_voix(qv)
    return res


class ReelRegenRequest(BaseModel):
    reel_id: str
    images: list[ReelImage] | None = None
    brief: str | None = None
    style: str | None = None
    musique: str | None = None
    voix: str | None = None                 # None = garder celle du reel ; "none" = retirer


@router.post("/regenerer")
def regenerer(body: ReelRegenRequest, payload: dict = Depends(verify_token)):
    """Modifie un reel Sequence existant (A valider) : nouvelles images/brief -> re-rendu SUR PLACE.
    Consomme aussi un quota 'reel' : Claude reecrit le scenario et Remotion re-rend a chaque appel,
    sinon regenerer en boucle contournerait le plafond de /generer."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    quota_service.exiger_abonnement(telegram_id)  # sans carte -> popup mur de paiement
    q = quota_service.consume(telegram_id, "reel")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail={
            "raison": q.get("reason") or "quota",
            "message": q.get("message") or "Génération indisponible.",
        })
    voix = body.voix
    if voix is None:
        # Non précisée : on garde celle du reel, et elle se re-synthétise -> elle compte.
        try:
            cur = supabase.table("contenu").select("reel_data").eq("id", body.reel_id) \
                .eq("telegram_id", telegram_id).limit(1).execute().data
            voix = ((cur[0].get("reel_data") or {}).get("voix") if cur else None) or None
        except Exception:
            voix = None
    qv = _consommer_voix(telegram_id, voix, q)
    images = [{"url": i.url, "desc": i.desc} for i in (body.images or [])][:8]
    try:
        res = reel_service.regenerer_reel(telegram_id, body.reel_id,
                                          images=images or None, brief=(body.brief or "").strip() or None,
                                          style=body.style, musique=body.musique,
                                          voix=(body.voix if body.voix is not None else voix) or "none")
    except Exception as e:
        quota_service.refund(q); _rendre_voix(qv)
        logger.error(f"regenerer reel: {e}")
        raise HTTPException(status_code=500, detail="Echec de la regeneration du reel")
    if res.get("error"):
        quota_service.refund(q); _rendre_voix(qv)
        raise HTTPException(status_code=400, detail=res["error"])
    quota_service.confirm(q); _confirmer_voix(qv)
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


# ---------------------------------------------------------------- voix off
@router.get("/voix")
def voix_catalogue(payload: dict = Depends(verify_token)):
    """Catalogue des voix (extraits à écouter), état du clone du client, voix par défaut."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    from services import voix_service
    return voix_service.catalogue(telegram_id)


@router.post("/voix/clone")
async def voix_cloner(file: UploadFile = File(...), consentement: bool = Form(False),
                      payload: dict = Depends(verify_token)):
    """Crée (ou remplace) le clone de la voix du client. Forfait payé + consentement."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not quota_service.is_paid(telegram_id):
        raise HTTPException(status_code=402, detail={"raison": "quota", "message": "La voix personnalisée est réservée à l'offre Pro."})
    data = await file.read()
    from services import voix_service
    try:
        return voix_service.creer_clone(telegram_id, data, file.filename, bool(consentement))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"voix clone {telegram_id}: {e}")
        raise HTTPException(status_code=500, detail="Le clonage a échoué, réessaie.")


@router.delete("/voix/clone")
def voix_supprimer(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    from services import voix_service
    return voix_service.supprimer_clone(telegram_id)


class VoixDefaut(BaseModel):
    voix: str | None = None


@router.patch("/voix/defaut")
def voix_defaut(body: VoixDefaut, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    from services import voix_service
    try:
        return voix_service.choisir_defaut(telegram_id, body.voix)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
