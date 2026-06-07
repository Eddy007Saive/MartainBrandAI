from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from dependencies import verify_token
from services import agent_service, credit_service, usage_service, image_service, planning_service, plan_service
from config import supabase, logger, CLAUDE_MODEL, OPENROUTER_IMAGE_MODEL

router = APIRouter(prefix="/agent", tags=["agent"])

# Le réseau côté front est en minuscule ; l'enum brouillons.reseau_cible est capitalisé
RESEAU_MAP = {
    "linkedin": "LinkedIn", "instagram": "Instagram",
    "facebook": "Facebook", "tiktok": "TikTok", "youtube": "YouTube",
}


def _map_agent_error(result: dict):
    """Convertit une erreur métier de l'agent en HTTPException."""
    if result.get("error") == "no_api_key":
        raise HTTPException(status_code=500, detail="Clé API IA non configurée")
    if result.get("error") == "profil_incomplet":
        raise HTTPException(status_code=400, detail="Renseignez votre secteur dans Paramètres → Voix de marque avant de générer.")


@router.post("/sujets")
async def sujets(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    cost = credit_service.cout("sujets")
    solde = credit_service.deduct(telegram_id, cost)
    if solde < 0:
        raise HTTPException(status_code=402, detail="Crédits insuffisants")
    try:
        result = agent_service.generer_sujets(telegram_id, int(body.get("nombre", 6)))
    except Exception as e:
        credit_service.refund(telegram_id, cost)
        logger.error(f"Agent sujets error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        credit_service.refund(telegram_id, cost)
        _map_agent_error(result)

    usage_service.log(telegram_id, "sujets", CLAUDE_MODEL, result.get("usage"), cost)

    # Sauvegarde des sujets comme brouillons (sans réseau — choisi à la transformation)
    rows = [{"telegram_id": telegram_id, "titre": s[:200], "statut": "Brouillon"}
            for s in result.get("sujets", []) if s]
    saved = []
    if rows:
        try:
            ins = supabase.table("brouillons").insert(rows).execute()
            saved = [{"id": r["id"], "titre": r["titre"]} for r in (ins.data or [])]
        except Exception as e:
            logger.error(f"Save sujets error: {e}")
            saved = [{"id": None, "titre": s} for s in result.get("sujets", [])]
    return {"sujets": saved, "credits": solde}


@router.get("/plan")
async def plan(payload: dict = Depends(verify_token)):
    """Plan éditorial glissant 30j : besoin/rempli/reste par réseau actif."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return {"plan": plan_service.compute_plan(telegram_id)}


@router.get("/sujets")
async def list_sujets(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        r = (supabase.table("brouillons")
             .select("id, titre, reseau_cible, created_at")
             .eq("telegram_id", telegram_id).eq("statut", "Brouillon")
             .order("created_at", desc=True).execute())
        return r.data or []
    except Exception as e:
        logger.error(f"List sujets error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sujets/{sujet_id}")
async def delete_sujet(sujet_id: str, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        supabase.table("brouillons").delete().eq("id", sujet_id).eq("telegram_id", telegram_id).execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete sujet error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rediger")
async def rediger(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    sujet = (body.get("sujet") or "").strip()
    if not sujet:
        raise HTTPException(status_code=400, detail="sujet requis")
    qualite = body.get("qualite", "equilibre")
    cost = credit_service.cout("post", qualite)
    solde = credit_service.deduct(telegram_id, cost)
    if solde < 0:
        raise HTTPException(status_code=402, detail="Crédits insuffisants")
    try:
        result = agent_service.rediger_post(telegram_id, sujet, body.get("reseau", "linkedin"),
                                            agent_service.QUALITE_MODELS.get(qualite))
    except Exception as e:
        credit_service.refund(telegram_id, cost)
        logger.error(f"Agent rediger error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        credit_service.refund(telegram_id, cost)
        _map_agent_error(result)
    usage_service.log(telegram_id, "post", agent_service.QUALITE_MODELS.get(qualite), result.get("usage"), cost, qualite)
    if body.get("save"):
        row = {"telegram_id": telegram_id, "titre": sujet[:120], "contenu": result["contenu"],
               "created_at": datetime.now(timezone.utc).isoformat()}
        ins = supabase.table("contenu").insert(row).execute()
        result["contenu_id"] = ins.data[0]["id"] if ins.data else None
    result["credits"] = solde
    return result


@router.post("/script")
async def script(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    sujet = (body.get("sujet") or "").strip()
    if not sujet:
        raise HTTPException(status_code=400, detail="sujet requis")
    qualite = body.get("qualite", "equilibre")
    cost = credit_service.cout("script", qualite)
    solde = credit_service.deduct(telegram_id, cost)
    if solde < 0:
        raise HTTPException(status_code=402, detail="Crédits insuffisants")
    try:
        result = agent_service.rediger_script(telegram_id, sujet, body.get("type_video", "Reel"),
                                              agent_service.QUALITE_MODELS.get(qualite))
    except Exception as e:
        credit_service.refund(telegram_id, cost)
        logger.error(f"Agent script error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        credit_service.refund(telegram_id, cost)
        _map_agent_error(result)
    usage_service.log(telegram_id, "script", agent_service.QUALITE_MODELS.get(qualite), result.get("usage"), cost, qualite)
    result["credits"] = solde
    return result


@router.post("/enregistrer-script")
async def enregistrer_script(body: dict, payload: dict = Depends(verify_token)):
    """Enregistre le script (éventuellement édité) dans la table studio. Gratuit."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    script_txt = (body.get("script") or "").strip()
    if not script_txt:
        raise HTTPException(status_code=400, detail="script requis")
    titre = (body.get("titre") or script_txt[:80]).strip()
    try:
        row = {
            "telegram_id": telegram_id,
            "titre": titre[:120],
            "script": script_txt,
            "type_video": body.get("type_video", "Reel"),
        }
        ins = supabase.table("studio").insert(row).execute()
        return {"success": True, "studio_id": ins.data[0]["id"] if ins.data else None}
    except Exception as e:
        logger.error(f"Agent enregistrer-script error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/enregistrer")
async def enregistrer(body: dict, payload: dict = Depends(verify_token)):
    """Enregistre le texte (éventuellement édité) dans la table contenu. Gratuit."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    contenu = (body.get("contenu") or "").strip()
    if not contenu:
        raise HTTPException(status_code=400, detail="contenu requis")
    titre = (body.get("titre") or contenu[:80]).strip()
    try:
        row = {
            "telegram_id": telegram_id,
            "titre": titre[:120],
            "contenu": contenu,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        reseau = body.get("reseau")
        if reseau in RESEAU_MAP:
            row["reseau_cible"] = RESEAU_MAP[reseau]  # enum single value (LinkedIn, Instagram…)
        ins = supabase.table("contenu").insert(row).execute()
        return {"success": True, "contenu_id": ins.data[0]["id"] if ins.data else None}
    except Exception as e:
        logger.error(f"Agent enregistrer error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/image-prompt")
async def image_prompt(body: dict, payload: dict = Depends(verify_token)):
    """Claude écrit un prompt d'image à partir du post (gratuit, éditable)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    texte = (body.get("texte") or "").strip()
    if not texte:
        raise HTTPException(status_code=400, detail="texte requis")
    res = image_service.generer_prompt(telegram_id, texte, body.get("reseau", "linkedin"))
    if res.get("error") == "no_api_key":
        raise HTTPException(status_code=500, detail="Clé API IA non configurée")
    # Sauvegarde immédiate du prompt sur le contenu -> on ne le régénère pas à la réouverture (anti-gaspillage)
    contenu_id = body.get("contenu_id")
    if contenu_id and res.get("prompt"):
        try:
            supabase.table("contenu").update({"prompt_image": res["prompt"]}).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        except Exception as e:
            logger.warning(f"save prompt_image error: {e}")
    return res


@router.post("/image")
async def image(body: dict, payload: dict = Depends(verify_token)):
    """Génère l'image (nano-banana) → Cloudinary → contenu.lien_visuel."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt requis")
    modele = body.get("modele", "nano2")
    model_id = image_service.IMAGE_MODELS.get(modele, OPENROUTER_IMAGE_MODEL)
    cost = credit_service.cout("image", modele)
    solde = credit_service.deduct(telegram_id, cost)
    if solde < 0:
        raise HTTPException(status_code=402, detail="Crédits insuffisants")
    try:
        res = await image_service.generer_image(telegram_id, prompt, bool(body.get("avec_photo")), model_id)
    except Exception as e:
        credit_service.refund(telegram_id, cost)
        logger.error(f"Agent image error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if res.get("error"):
        credit_service.refund(telegram_id, cost)
        if res["error"] == "no_openrouter_key":
            raise HTTPException(status_code=500, detail="Clé image (OpenRouter) non configurée")
        raise HTTPException(status_code=502, detail="Échec de la génération d'image")

    contenu_id = body.get("contenu_id")
    if contenu_id:
        upd = {"lien_visuel": res["lien_visuel"], "prompt_image": prompt}  # garde le prompt finalement utilisé
        # Le visuel est prêt -> on confirme la planification (statut Planifie + date si absente)
        cur = (supabase.table("contenu").select("statut, reseau_cible, date_publication")
               .eq("id", contenu_id).eq("telegram_id", telegram_id).execute())
        c = cur.data[0] if cur.data else {}
        if c.get("statut") in ("A valider", "Valider"):
            upd["statut"] = "Planifie"
        if not c.get("date_publication"):
            creneau = planning_service.prochain_creneau(telegram_id, c.get("reseau_cible"))
            if creneau:
                upd["date_publication"] = creneau
        supabase.table("contenu").update(upd).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        res["statut"] = upd.get("statut")
        res["date_publication"] = upd.get("date_publication") or c.get("date_publication")
    usage_service.log(telegram_id, "image", model_id, {}, cost)
    res["credits"] = solde
    return res
