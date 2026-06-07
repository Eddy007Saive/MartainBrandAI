from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from dependencies import verify_token
from services import agent_service, credit_service, usage_service, image_service, planning_service, plan_service, carrousel_service
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

    usage_service.log(telegram_id, "sujets", agent_service.SUJETS_MODEL, result.get("usage"), cost)

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
async def plan(year: int = None, month: int = None, payload: dict = Depends(verify_token)):
    """Plan éditorial du mois : besoin/rempli/reste/format par réseau actif."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    now = datetime.now(timezone.utc)
    y = year or now.year
    m = month or now.month
    return {"year": y, "month": m, "plan": plan_service.compute_plan(telegram_id, y, m)}


@router.post("/rafale")
async def rafale(body: dict, payload: dict = Depends(verify_token)):
    """Génère en rafale un lot de contenus (sujet × réseau), les enregistre dans Contenus
    (statut 'A valider') et les planifie sur des créneaux libres du mois choisi."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    items = body.get("items") or []
    if not items:
        raise HTTPException(status_code=400, detail="items requis")
    try:
        year = int(body.get("year"))
        month = int(body.get("month"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="year/month requis")

    formats = {s["platform"]: (s.get("format") or "post") for s in plan_service._schedules(telegram_id)}
    start, end = plan_service._month_bounds(year, month)
    occupied: dict = {}

    def occ_for(reseau_cap: str):
        if reseau_cap not in occupied:
            occupied[reseau_cap] = {dp[:10] for dp in plan_service._dates_occupees(telegram_id, reseau_cap, start, end)}
        return occupied[reseau_cap]

    created, errors, solde = 0, [], None
    for it in items:
        sujet = (it.get("sujet") or "").strip()
        reseau_low = (it.get("reseau") or "").lower()
        qualite = it.get("qualite", "equilibre")
        reseau_cap = RESEAU_MAP.get(reseau_low)
        if not sujet or not reseau_cap:
            errors.append({"sujet": sujet, "reseau": reseau_low, "err": "invalide"})
            continue
        # format : choisi par l'utilisateur (par réseau), sinon cadence du réseau
        fmt = (it.get("format") or formats.get(reseau_low) or "post")
        action = "post" if fmt == "post" else "carrousel" if fmt == "carrousel" else "script"
        cost = credit_service.cout(action, qualite)
        s = credit_service.deduct(telegram_id, cost)
        if s < 0:
            errors.append({"sujet": sujet, "reseau": reseau_low, "err": "credits"})
            break  # plus de crédits -> on arrête la rafale
        solde = s
        try:
            model = agent_service.QUALITE_MODELS.get(qualite)
            slides = None
            if action == "post":
                r = agent_service.rediger_post(telegram_id, sujet, reseau_low, model, cache=True)
                texte = r.get("contenu", "")
            elif action == "carrousel":
                r = agent_service.rediger_carrousel(telegram_id, sujet, 5, model, cache=True)
                slides = r.get("slides")
                texte = "\n\n".join(f"{sl['titre']}\n{sl['texte']}".strip() for sl in (slides or []))
            else:
                tv = "Reel" if fmt == "reel" else "Video"
                r = agent_service.rediger_script(telegram_id, sujet, tv, model, cache=True)
                texte = r.get("script", "")
            if r.get("error"):
                credit_service.refund(telegram_id, cost)
                errors.append({"sujet": sujet, "reseau": reseau_low, "err": r["error"]})
                continue
            usage_service.log(telegram_id, action, model, r.get("usage"), cost, qualite)

            oc = occ_for(reseau_cap)
            slots = plan_service.creneaux_libres(telegram_id, reseau_cap, year, month, oc)
            date_pub = slots[0] if slots else None
            if date_pub:
                oc.add(date_pub[:10])

            row = {
                "telegram_id": telegram_id, "titre": sujet[:120], "contenu": texte,
                "reseau_cible": reseau_cap, "statut": "A valider",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if date_pub:
                row["date_publication"] = date_pub
            if action == "carrousel":
                row["type"] = "Carrousel"
            ins = supabase.table("contenu").insert(row).execute()
            cid = ins.data[0]["id"] if ins.data else None

            # carrousel : rendu des images de slides
            if action == "carrousel" and slides and cid:
                try:
                    res = await carrousel_service.generer_carrousel(telegram_id, slides, cid)
                    imgs = res.get("images", [])
                    if imgs:
                        supabase.table("contenu").update(
                            {"slides_images": imgs, "lien_visuel": imgs[0], "carrousel_pdf": res.get("pdf")}
                        ).eq("id", cid).execute()
                    else:
                        errors.append({"sujet": sujet, "reseau": reseau_low, "err": "render_vide"})
                except Exception as e:
                    logger.error(f"rafale carrousel render error: {e}")
                    errors.append({"sujet": sujet, "reseau": reseau_low, "err": "render"})
            created += 1
        except Exception as e:
            credit_service.refund(telegram_id, cost)
            logger.error(f"rafale item error: {e}")
            errors.append({"sujet": sujet, "reseau": reseau_low, "err": "gen"})

    if solde is None:
        solde = credit_service.get_credits(telegram_id)
    return {"created": created, "errors": errors, "credits": solde}


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


@router.post("/carrousel")
async def carrousel(body: dict, payload: dict = Depends(verify_token)):
    """Génère un carrousel : slides (Claude) + rendu images (Playwright) -> Cloudinary -> Contenus."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    sujet = (body.get("sujet") or "").strip()
    if not sujet:
        raise HTTPException(status_code=400, detail="sujet requis")
    reseau = (body.get("reseau") or "linkedin").lower()
    nb = max(3, min(10, int(body.get("nb_slides", 5))))
    qualite = body.get("qualite", "equilibre")
    cost = credit_service.cout("carrousel", qualite)
    solde = credit_service.deduct(telegram_id, cost)
    if solde < 0:
        raise HTTPException(status_code=402, detail="Crédits insuffisants")
    try:
        result = agent_service.rediger_carrousel(telegram_id, sujet, nb, agent_service.QUALITE_MODELS.get(qualite))
    except Exception as e:
        credit_service.refund(telegram_id, cost)
        logger.error(f"Carrousel texte error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        credit_service.refund(telegram_id, cost)
        if result["error"] == "parse":
            raise HTTPException(status_code=502, detail="Échec de génération des slides")
        _map_agent_error(result)
    usage_service.log(telegram_id, "carrousel", agent_service.QUALITE_MODELS.get(qualite), result.get("usage"), cost, qualite)

    slides = result["slides"]
    # Texte assemblé des slides
    texte = "\n\n".join(f"{s['titre']}\n{s['texte']}".strip() for s in slides)
    existing_id = body.get("contenu_id")
    if existing_id:
        # Régénération : met à jour le contenu existant
        supabase.table("contenu").update(
            {"contenu": texte, "type": "Carrousel"}
        ).eq("id", existing_id).eq("telegram_id", telegram_id).execute()
        contenu_id = existing_id
    else:
        row = {"telegram_id": telegram_id, "titre": sujet[:120], "contenu": texte,
               "statut": "A valider", "type": "Carrousel",
               "created_at": datetime.now(timezone.utc).isoformat()}
        if reseau in RESEAU_MAP:
            row["reseau_cible"] = RESEAU_MAP[reseau]
        ins = supabase.table("contenu").insert(row).execute()
        contenu_id = ins.data[0]["id"] if ins.data else None

    # Rendu des slides en images + PDF
    slides_images, pdf_url = [], None
    try:
        res = await carrousel_service.generer_carrousel(telegram_id, slides, contenu_id)
        slides_images = res.get("images", [])
        pdf_url = res.get("pdf")
        if contenu_id and slides_images:
            supabase.table("contenu").update(
                {"slides_images": slides_images, "lien_visuel": slides_images[0], "carrousel_pdf": pdf_url}
            ).eq("id", contenu_id).execute()
    except Exception as e:
        logger.error(f"Carrousel render error: {e}")

    return {"contenu_id": contenu_id, "slides": slides, "slides_images": slides_images,
            "carrousel_pdf": pdf_url, "credits": solde}


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
    usage_service.log(telegram_id, "image", model_id, {}, cost, cost_override=usage_service.IMAGE_PRICES.get(modele, 0.04))
    res["credits"] = solde
    return res
