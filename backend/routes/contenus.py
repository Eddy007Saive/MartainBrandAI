from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from dependencies import verify_token
from models.contenu import ContenuUpdate
from services import contenu_service
from config import logger

router = APIRouter(prefix="/contenus", tags=["contenus"])


@router.post("/{contenu_id}/image")
async def upload_contenu_image(contenu_id: str, file: UploadFile = File(...), payload: dict = Depends(verify_token)):
    """Importe une image fournie par l'utilisateur comme visuel du contenu."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image (jpg, png, webp…)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 10 Mo)")
    try:
        res = contenu_service.upload_visuel(telegram_id, contenu_id, data)
    except Exception as e:
        logger.error(f"Upload contenu image error: {e}")
        raise HTTPException(status_code=500, detail="Échec de l'import de l'image")
    if not res:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    # Visuel prêt + date -> on programme sur Zernio (le webhook post.scheduled posera le statut Planifie)
    if res.get("date_publication"):
        try:
            from services import late_service
            pub = await late_service.programmer_contenu(telegram_id, contenu_id)
            res["publish_status"] = "envoi" if pub.get("ok") else ("ignoré" if pub.get("skipped") else "échec")
        except Exception as e:
            logger.warning(f"auto-programmation après import visuel {contenu_id}: {e}")
    return res


@router.post("/{contenu_id}/replanifier")
async def replanifier_contenu(contenu_id: str, payload: dict = Depends(verify_token)):
    """Replanifie le contenu sur le PROCHAIN créneau libre (jours/heure de la planification
    du réseau + dates déjà occupées), puis le reprogramme sur Zernio. Un clic, zéro saisie."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    cur = contenu_service.get_contenu(contenu_id, telegram_id)
    if not cur:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    if cur.get("publish_status") == "publié":
        raise HTTPException(status_code=409, detail="Déjà publié — rien à replanifier.")
    from services import planning_service, late_service
    from config import supabase
    slot = planning_service.prochain_creneau(telegram_id, cur.get("reseau_cible"), cur.get("type"))
    if not slot:
        raise HTTPException(status_code=409, detail="Aucun créneau libre trouvé — vérifie ta planification (jours actifs) pour ce réseau.")
    # Nettoie l'ancien post Zernio (échoué ou programmé) avant de reprogrammer
    if cur.get("late_post_id"):
        try:
            await late_service.cancel_post(cur["late_post_id"])
        except Exception as e:
            logger.warning(f"replanifier: annulation ancien post Zernio {contenu_id}: {e}")
    supabase.table("contenu").update({
        "date_publication": slot, "late_post_id": None,
        "publish_status": None, "publish_error": None,
    }).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    pub = await late_service.programmer_contenu(telegram_id, contenu_id)
    return {"date_publication": slot,
            "publish_status": "envoi" if pub.get("ok") else "échec",
            "error": None if pub.get("ok") else pub.get("error")}


def _story_contenu(cur: dict, body: dict) -> dict:
    """Assemble le contenu de la story {accroche, sous, cta, image, rico_pose}
    à partir du post et des valeurs éditées côté client (retouche)."""
    from services import story_service
    base = story_service.parts_depuis_contenu(cur)
    return {
        "accroche": (body.get("accroche") if body.get("accroche") is not None else base["accroche"]) or "",
        "sous": (body.get("sous") if body.get("sous") is not None else base["sous"]) or "",
        "cta": (body.get("cta") or base["cta"] or "Réponds en DM 👉").strip(),
        "image": cur.get("lien_visuel") or None,
        "rico_pose": body.get("rico_pose") or None,
        # Blocs du modèle « signature » (édités côté client)
        "points": body.get("points") if isinstance(body.get("points"), list) else None,
        "baseline": body.get("baseline"),
    }


@router.get("/{contenu_id}/story/options")
def story_options(contenu_id: str, payload: dict = Depends(verify_token)):
    """Ce dont le sélecteur a besoin : le texte pré-rempli (tiré du post), les modèles
    proposés à ce compte, et les couleurs de marque par défaut."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    cur = contenu_service.get_contenu(contenu_id, telegram_id)
    if not cur:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    if cur.get("reseau_cible") not in ("Instagram", "Facebook"):
        raise HTTPException(status_code=409, detail="Les stories ne sont possibles que sur Instagram ou Facebook.")
    # Cet appel écrit le texte via Claude (et bientôt choisit le gabarit) : ça consomme,
    # comme post/carrousel/image — jusqu'ici seul le mur d'abonnement générique gardait
    # cette route, sans jamais compter dans le quota du compte.
    q = quota_service.consume(telegram_id, "story")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail={
            "raison": q.get("reason") or "quota",
            "message": q.get("message") or "Génération indisponible.",
        })
    from services import story_service
    from services.agent_service import _charger_marque
    u = _charger_marque(telegram_id)
    # L'IA choisit le GABARIT le mieux adapté au contenu (pas seulement le texte) —
    # l'utilisateur peut toujours changer de modèle dans le sélecteur ensuite.
    choix = story_service.choisir_story_ia(telegram_id, cur)
    quota_service.confirm(q)
    return {
        "parts": {"accroche": choix["accroche"], "sous": choix["sous"], "cta": choix["cta"]},
        "template_suggere": choix["template"],
        "points_suggeres": choix.get("points"),
        "a_un_visuel": bool(cur.get("lien_visuel")),
        "modeles": story_service.modeles_pour(telegram_id, bool(cur.get("lien_visuel"))),
        "signature": story_service.DEFAULT_SIGNATURE,
        "couleurs": {
            "p": u.get("carrousel_couleur_principale") or u.get("couleur_principale") or "#003D2E",
            "s": u.get("carrousel_couleur_secondaire") or u.get("couleur_secondaire") or "#0077FF",
            "a": u.get("carrousel_couleur_accent") or u.get("couleur_accent") or "#3AFFA3",
        },
    }


@router.post("/{contenu_id}/story/apercu")
async def story_apercu(contenu_id: str, body: dict, payload: dict = Depends(verify_token)):
    """Rend UNE story 9:16 (modèle + texte + couleurs) et renvoie son URL — pour la
    prévisualisation live du sélecteur/retouche, sans encore créer de contenu."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    cur = contenu_service.get_contenu(contenu_id, telegram_id)
    if not cur:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    from services import story_service
    content = _story_contenu(cur, body or {})
    template = story_service.template_valide((body or {}).get("template"))
    try:
        res = await story_service.generer_story(telegram_id, content, template,
                                                (body or {}).get("colors"), contenu_id=contenu_id)
    except story_service.AtelierSature:
        raise HTTPException(status_code=503, detail="Trop de rendus en cours, réessaie dans un instant.")
    if not res.get("image"):
        raise HTTPException(status_code=500, detail="Le rendu de la story a échoué, réessaie.")
    return res


@router.post("/{contenu_id}/story")
async def decliner_story(contenu_id: str, body: dict = None, payload: dict = Depends(verify_token)):
    """Crée la STORY (Instagram/Facebook) à partir du post : visuel 9:16 rendu (modèle
    choisi + texte + couleurs), statut « À valider », créneau famille story. Le post
    d'origine n'est PAS modifié."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    cur = contenu_service.get_contenu(contenu_id, telegram_id)
    if not cur:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    if cur.get("reseau_cible") not in ("Instagram", "Facebook"):
        raise HTTPException(status_code=409, detail="Les stories ne sont possibles que sur Instagram ou Facebook.")
    body = body or {}
    from services import story_service
    template = story_service.template_valide(body.get("template"))
    tinfo = next((t for t in story_service.TEMPLATES if t["id"] == template), None)
    if tinfo and tinfo["image"] and not cur.get("lien_visuel"):
        raise HTTPException(status_code=409,
                            detail="Ce modèle utilise le visuel du post — ajoute une image ou choisis un modèle texte.")
    # On réutilise l'image du dernier aperçu si le client la renvoie ; sinon on rend.
    image_url = body.get("image")
    content = _story_contenu(cur, body)
    if not image_url:
        try:
            res = await story_service.generer_story(telegram_id, content, template, body.get("colors"), contenu_id=contenu_id)
        except story_service.AtelierSature:
            raise HTTPException(status_code=503, detail="Trop de rendus en cours, réessaie dans un instant.")
        image_url = res.get("image")
    if not image_url:
        raise HTTPException(status_code=500, detail="Le rendu de la story a échoué, réessaie.")
    from services import planning_service
    from datetime import datetime, timezone
    from config import supabase as sb
    row = {
        "telegram_id": telegram_id,
        "titre": (cur.get("titre") or "")[:120],
        "contenu": cur.get("contenu"),
        "lien_visuel": image_url,
        "reseau_cible": cur["reseau_cible"],
        "type": "Story",
        "statut": "A valider",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    creneau = planning_service.prochain_creneau(telegram_id, cur["reseau_cible"], "Story")
    if creneau:
        row["date_publication"] = creneau
    ins = sb.table("contenu").insert(row).execute()
    new_id = ins.data[0]["id"] if ins.data else None
    return {"contenu_id": new_id, "date_publication": row.get("date_publication"), "lien_visuel": image_url}


@router.post("/{contenu_id}/story-anime")
async def decliner_story_animee(contenu_id: str, body: dict = None, payload: dict = Depends(verify_token)):
    """Crée une STORY ANIMÉE (Remotion, ~5s, gabarit « StoryAnime ») à partir du texte
    déjà écrit/édité dans le dialog (même accroche/sous/cta/couleurs que l'aperçu
    statique — aucun nouvel appel IA ici). Contenu jumeau séparé (type « Story » avec
    video_url en plus du poster), comme les Reels : le post d'origine et une
    éventuelle story statique déjà créée restent intacts. Rendu ~1-2 min, comme les
    Reels — pas de quota par génération (même logique que les Reels : seul le mur
    d'abonnement bloque, le coût réel est journalisé en interne)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    quota_service.exiger_abonnement(telegram_id)  # sans carte -> popup mur de paiement
    cur = contenu_service.get_contenu(contenu_id, telegram_id)
    if not cur:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    if cur.get("reseau_cible") not in ("Instagram", "Facebook"):
        raise HTTPException(status_code=409, detail="Les stories ne sont possibles que sur Instagram ou Facebook.")
    body = body or {}
    accroche = (body.get("accroche") or "").strip()
    if not accroche:
        raise HTTPException(status_code=400, detail="Accroche requise.")
    from services import story_service, planning_service
    from datetime import datetime, timezone
    from config import supabase as sb
    row = {
        "telegram_id": telegram_id,
        "titre": (cur.get("titre") or "")[:120],
        "contenu": cur.get("contenu"),
        "reseau_cible": cur["reseau_cible"],
        "type": "Story",
        "statut": "A valider",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    creneau = planning_service.prochain_creneau(telegram_id, cur["reseau_cible"], "Story")
    if creneau:
        row["date_publication"] = creneau
    ins = sb.table("contenu").insert(row).execute()
    new_id = ins.data[0]["id"] if ins.data else None
    if not new_id:
        raise HTTPException(status_code=500, detail="Création du contenu impossible.")
    res = await story_service.generer_story_animee(
        telegram_id, accroche, body.get("sous"), body.get("cta"),
        colors=body.get("colors"), mot_accent=body.get("mot_accent"), contenu_id=new_id)
    if not res.get("video_url"):
        sb.table("contenu").delete().eq("id", new_id).execute()
        raise HTTPException(status_code=500, detail="Le rendu de la story animée a échoué, réessaie.")
    sb.table("contenu").update({
        "video_url": res["video_url"], "video_status": "ready",
        "video_preview_url": res["video_preview_url"], "lien_visuel": res["video_preview_url"],
    }).eq("id", new_id).execute()
    return {"id": new_id, "video_url": res["video_url"], "video_preview_url": res["video_preview_url"],
            "date_publication": row.get("date_publication")}


@router.post("/{contenu_id}/recycler")
async def recycler_contenu(contenu_id: str, body: dict, payload: dict = Depends(verify_token)):
    """Recycle un post vers d'autres réseaux (une copie par réseau, créneau propre)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    reseaux = body.get("reseaux") if isinstance(body.get("reseaux"), list) else []
    try:
        res = await contenu_service.recycler_contenu(telegram_id, contenu_id, reseaux)
    except Exception as e:
        logger.error(f"Recycler contenu error: {e}")
        raise HTTPException(status_code=500, detail="Échec du recyclage")
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@router.get("")
def get_contenus(statut: str = None, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        return contenu_service.get_contenus(telegram_id, statut)
    except Exception as e:
        logger.error(f"Get contenus error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{contenu_id}")
def get_contenu(contenu_id: str, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        contenu = contenu_service.get_contenu(contenu_id, telegram_id)
        if not contenu:
            raise HTTPException(status_code=404, detail="Contenu not found")
        return contenu
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get contenu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{contenu_id}")
async def update_contenu(contenu_id: str, updates: ContenuUpdate, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}

        result = await contenu_service.update_contenu(contenu_id, telegram_id, update_data)
        if result.get("error") == "not_found":
            raise HTTPException(status_code=404, detail="Contenu not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update contenu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{contenu_id}")
async def delete_contenu(contenu_id: str, payload: dict = Depends(verify_token)):
    try:
        telegram_id = payload.get("telegram_id")
        if not await contenu_service.delete_contenu(contenu_id, telegram_id):
            raise HTTPException(status_code=404, detail="Contenu not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete contenu error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
