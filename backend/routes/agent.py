import base64
import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from datetime import datetime, timezone
from dependencies import verify_token
from services import agent_service, credit_service, quota_service, usage_service, image_service, planning_service, plan_service, carrousel_service
from config import supabase, logger, CLAUDE_MODEL, OPENROUTER_IMAGE_MODEL

router = APIRouter(prefix="/agent", tags=["agent"])

# Le réseau côté front est en minuscule ; l'enum brouillons.reseau_cible est capitalisé
RESEAU_MAP = {
    "linkedin": "LinkedIn", "instagram": "Instagram",
    "facebook": "Facebook", "tiktok": "TikTok", "youtube": "YouTube",
    "googlebusiness": "GoogleBusiness",
}


def _map_agent_error(result: dict):
    """Convertit une erreur métier de l'agent en HTTPException."""
    if result.get("error") == "no_api_key":
        raise HTTPException(status_code=500, detail="Clé API IA non configurée")
    if result.get("error") == "profil_incomplet":
        raise HTTPException(status_code=400, detail="Renseignez votre secteur dans Paramètres → Voix de marque avant de générer.")


def _carrousel_texte(content: dict) -> str:
    """Dump texte complet du carrousel (hook + toutes les slides + cta). Réservé au fallback interne."""
    if not content:
        return ""
    parts = [content.get("hook", "")]
    for sl in content.get("slides", []):
        parts.append((f"{sl.get('titre', '')}\n{sl.get('texte', '')}").strip())
    cta = content.get("cta") or {}
    parts.append((f"{cta.get('titre', '')}\n{cta.get('texte', '')}").strip())
    return "\n\n".join(x for x in parts if x)


def _carrousel_legende(content: dict) -> str:
    """Légende COURTE du post carrousel (hook + CTA), publiée au-dessus du carrousel.

    C'est le texte du post : il accroche et invite à swiper, sans recopier le contenu
    des slides (le carrousel porte le fond). L'IA fournit 'legende' ; sinon on retombe
    sur hook + titre du CTA — jamais le dump complet des slides.
    """
    if not content:
        return ""
    leg = (content.get("legende") or "").strip()
    if leg:
        return leg
    cta = content.get("cta") or {}
    parts = [(content.get("hook") or "").strip(), (cta.get("titre") or "").strip()]
    return "\n\n".join(x for x in parts if x)


@router.post("/sujets")
async def sujets(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    q = quota_service.consume(telegram_id, "subject")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail=q.get("message"))
    try:
        result = agent_service.generer_sujets(telegram_id, int(body.get("nombre", 6)))
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent sujets error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        quota_service.refund(q)
        _map_agent_error(result)
    quota_service.confirm(q)

    usage_service.log(telegram_id, "sujets", agent_service.SUJETS_MODEL, result.get("usage"), q.get("unit_cost", 0))

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
    return {"sujets": saved, "quota": {"action": "subject", "used": q.get("used"), "limit": q.get("limit")}}


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

    _scheds = plan_service._schedules(telegram_id)
    formats = {s["platform"]: (s.get("format") or "post") for s in _scheds}
    templates = {s["platform"]: (s.get("carrousel_template") or "bold") for s in _scheds}
    start, end = plan_service._month_bounds(year, month)
    occupied: dict = {}

    def occ_for(reseau_cap: str):
        if reseau_cap not in occupied:
            occupied[reseau_cap] = {dp[:10] for dp in plan_service._dates_occupees(telegram_id, reseau_cap, start, end)}
        return occupied[reseau_cap]

    created, errors = 0, []
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
        # story = texte court (accroche du visuel) -> même pipeline que post ; le visuel 9:16 suit
        action = "post" if fmt in ("post", "story") else "carrousel" if fmt == "carrousel" else "script"
        qtype = "carousel" if action == "carrousel" else "post"  # script compte comme un post
        q = quota_service.consume(telegram_id, qtype)
        if not q.get("ok"):
            errors.append({"sujet": sujet, "reseau": reseau_low, "err": "quota", "message": q.get("message")})
            break  # quota atteint -> on arrête la rafale
        try:
            model = agent_service.QUALITE_MODELS.get(qualite)
            ccontent = None
            if action == "post":
                r = agent_service.rediger_post(telegram_id, sujet, reseau_low, model, cache=True)
                texte = r.get("contenu", "")
            elif action == "carrousel":
                r = agent_service.rediger_carrousel(telegram_id, sujet, 5, model, cache=True)
                ccontent = r.get("content")
                texte = _carrousel_legende(ccontent) if ccontent else ""
            else:
                tv = "Reel" if fmt == "reel" else "Video"
                r = agent_service.rediger_script(telegram_id, sujet, tv, model, cache=True)
                texte = r.get("script", "")
            if r.get("error"):
                quota_service.refund(q)
                errors.append({"sujet": sujet, "reseau": reseau_low, "err": r["error"]})
                continue
            usage_service.log(telegram_id, action, model, r.get("usage"), q.get("unit_cost", 0), qualite)

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
            if fmt == "story":
                # Story : publiée en éphémère 24h (contentType=story chez Zernio), visuel 9:16 requis
                row["type"] = "Story"
            if action == "carrousel":
                row["type"] = "Carrousel"
                if ccontent:
                    row["carrousel_data"] = ccontent  # slides structurées -> re-render sans re-générer le texte
            elif action == "script":
                # Reel/Vidéo : le texte généré est un SCRIPT (téléprompteur), pas un post publiable.
                # La personne doit d'abord TOURNER la vidéo → statut « À tourner » (route vers Studio Vidéo).
                row["type"] = "Reel" if fmt == "reel" else "Video"
                row["statut"] = "A tourner"
                row["script"] = texte or None
                row["contenu"] = None  # le post publiable arrivera après le montage
            ins = supabase.table("contenu").insert(row).execute()
            cid = ins.data[0]["id"] if ins.data else None

            # carrousel : rendu des images de slides
            if action == "carrousel" and ccontent and cid:
                try:
                    res = await carrousel_service.generer_carrousel(
                        telegram_id, ccontent, cid, templates.get(reseau_low, "creme"))
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
            quota_service.confirm(q)
            created += 1
        except Exception as e:
            quota_service.refund(q)
            logger.error(f"rafale item error: {e}")
            errors.append({"sujet": sujet, "reseau": reseau_low, "err": "gen"})

    return {"created": created, "errors": errors, "usage": quota_service.usage(telegram_id)}


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


# --- Brouillons du Studio (persistés côté compte, suivent l'user partout) ---
@router.get("/drafts")
async def get_drafts(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        r = supabase.table("studio_drafts").select("data").eq("telegram_id", telegram_id).execute()
        return r.data[0]["data"] if r.data else []
    except Exception as e:
        logger.error(f"Get drafts error: {e}")
        return []


@router.put("/drafts")
async def put_drafts(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    items = body.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items (liste) requis")
    try:
        supabase.table("studio_drafts").upsert({
            "telegram_id": telegram_id,
            "data": items,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"Put drafts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Gabarits de post (rendu HTML brandé -> PNG) ---
@router.get("/gabarits")
async def list_gabarits(payload: dict = Depends(verify_token)):
    from services import gabarit_service
    return {"gabarits": gabarit_service.GABARITS, "labels": gabarit_service.GAB_LABELS}


@router.get("/usage")
async def usage_gauge(payload: dict = Depends(verify_token)):
    """Jauge de résultats (par type) + état de l'abonnement, pour le dashboard."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return quota_service.usage(telegram_id)


@router.get("/gabarit/previews")
async def gabarit_previews(payload: dict = Depends(verify_token)):
    from services import gabarit_service
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return await gabarit_service.previews(telegram_id)


@router.post("/gabarit/render")
async def render_gabarit(body: dict, payload: dict = Depends(verify_token)):
    from services import gabarit_service
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    gabarit = body.get("gabarit")
    slots = body.get("slots") or {}
    if not gabarit:
        raise HTTPException(status_code=400, detail="gabarit requis")
    res = await gabarit_service.render_gabarit(telegram_id, gabarit, slots)
    if not res.get("ok"):
        raise HTTPException(status_code=502, detail=res.get("error") or "Échec du rendu")
    # Rattache au contenu si fourni
    contenu_id = body.get("contenu_id")
    if contenu_id:
        try:
            supabase.table("contenu").update({"lien_visuel": res["url"]}).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        except Exception as e:
            logger.warning(f"gabarit attach contenu {contenu_id}: {e}")
    return res


@router.post("/gabarit/auto")
async def gabarit_auto(body: dict, payload: dict = Depends(verify_token)):
    """Compose les slots depuis le texte du post (IA) puis rend le visuel et le rattache."""
    from services import gabarit_service
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    gabarit = body.get("gabarit")
    texte = body.get("texte") or ""
    if not gabarit:
        raise HTTPException(status_code=400, detail="gabarit requis")

    # Le gabarit produit un visuel via l'IA (composition du texte) -> décompté comme 1 image standard.
    q = quota_service.consume(telegram_id, "image_standard")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail=q.get("message"))
    try:
        comp = agent_service.composer_gabarit(telegram_id, gabarit, texte)
        if comp.get("error"):
            quota_service.refund(q)
            _map_agent_error(comp)
            raise HTTPException(status_code=502, detail="Impossible de composer le visuel.")
        slots = comp["slots"]
        if body.get("bg_image"):
            slots["bg_image"] = body["bg_image"]
        res = await gabarit_service.render_gabarit(telegram_id, gabarit, slots)
        if not res.get("ok"):
            quota_service.refund(q)
            raise HTTPException(status_code=502, detail=res.get("error") or "Échec du rendu")
    except HTTPException:
        raise
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"gabarit auto error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    quota_service.confirm(q)

    contenu_id = body.get("contenu_id")
    if contenu_id:
        try:
            supabase.table("contenu").update({"lien_visuel": res["url"]}).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        except Exception as e:
            logger.warning(f"gabarit auto attach {contenu_id}: {e}")
    return {"url": res["url"], "slots": slots, "gabarit": gabarit,
            "quota": {"action": "image_standard", "used": q.get("used"), "limit": q.get("limit")}}


# --- Templates de marque (style réutilisable : images de référence + note) ---
@router.get("/templates")
async def list_templates(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        r = (supabase.table("brand_templates")
             .select("id, nom, images, note, created_at")
             .eq("telegram_id", telegram_id).order("created_at", desc=True).execute())
        return r.data or []
    except Exception as e:
        logger.error(f"List templates error: {e}")
        return []


@router.post("/templates")
async def create_template(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    nom = (body.get("nom") or "").strip()
    if not nom:
        raise HTTPException(status_code=400, detail="Nom requis")
    images = body.get("images") if isinstance(body.get("images"), list) else []
    try:
        r = supabase.table("brand_templates").insert({
            "telegram_id": telegram_id, "nom": nom[:80],
            "images": images, "note": (body.get("note") or "").strip() or None,
        }).execute()
        return r.data[0] if r.data else {}
    except Exception as e:
        logger.error(f"Create template error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        supabase.table("brand_templates").delete().eq("id", template_id).eq("telegram_id", telegram_id).execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete template error: {e}")
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
    q = quota_service.consume(telegram_id, "post")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail=q.get("message"))
    try:
        result = agent_service.rediger_post(telegram_id, sujet, body.get("reseau", "linkedin"),
                                            agent_service.QUALITE_MODELS.get(qualite))
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent rediger error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        quota_service.refund(q)
        _map_agent_error(result)
    quota_service.confirm(q)
    usage_service.log(telegram_id, "post", agent_service.QUALITE_MODELS.get(qualite), result.get("usage"), q.get("unit_cost", 0), qualite)
    if body.get("save"):
        row = {"telegram_id": telegram_id, "titre": sujet[:120], "contenu": result["contenu"],
               "created_at": datetime.now(timezone.utc).isoformat()}
        ins = supabase.table("contenu").insert(row).execute()
        result["contenu_id"] = ins.data[0]["id"] if ins.data else None
    result["quota"] = {"action": "post", "used": q.get("used"), "limit": q.get("limit")}
    return result


@router.post("/rediger-photo")
async def rediger_photo(file: UploadFile = File(...), reseau: str = Form("linkedin"),
                        qualite: str = Form("equilibre"), payload: dict = Depends(verify_token)):
    """Vision : génère un post à partir d'une photo (la photo devient aussi le visuel) -> Contenus."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image (jpg, png, webp…)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 10 Mo)")
    reseau = (reseau or "linkedin").lower()
    q = quota_service.consume(telegram_id, "post")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail=q.get("message"))
    try:
        r = agent_service.rediger_depuis_photo(
            telegram_id, base64.b64encode(data).decode(), file.content_type,
            reseau, agent_service.QUALITE_MODELS.get(qualite))
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"rediger-photo error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if r.get("error"):
        quota_service.refund(q)
        _map_agent_error(r)
    quota_service.confirm(q)
    usage_service.log(telegram_id, "post", agent_service.QUALITE_MODELS.get(qualite), r.get("usage"), q.get("unit_cost", 0), qualite)

    texte = r["contenu"]
    lien = None
    try:  # la photo devient le visuel du post
        up = cloudinary.uploader.upload(data, resource_type="image", folder=f"contenus/{telegram_id}", invalidate=True)
        lien = up["secure_url"]
    except Exception as e:
        logger.error(f"rediger-photo cloudinary error: {e}")
    titre = ((texte.split("\n", 1)[0] if texte else "") or "Post photo")[:120]
    row = {"telegram_id": telegram_id, "titre": titre, "contenu": texte, "statut": "A valider",
           "created_at": datetime.now(timezone.utc).isoformat()}
    if reseau in RESEAU_MAP:
        row["reseau_cible"] = RESEAU_MAP[reseau]
    if lien:
        row["lien_visuel"] = lien
    ins = supabase.table("contenu").insert(row).execute()
    cid = ins.data[0]["id"] if ins.data else None
    return {"contenu_id": cid, "contenu": texte, "lien_visuel": lien, "quota": {"action": "post", "used": q.get("used"), "limit": q.get("limit")}}


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
    # template du carrousel : override explicite sinon celui configuré pour ce réseau
    tmpl = body.get("template")
    if not tmpl:
        tmpl = next((sch.get("carrousel_template") or "bold"
                     for sch in plan_service._schedules(telegram_id) if sch.get("platform") == reseau), "bold")
    q = quota_service.consume(telegram_id, "carousel")
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail=q.get("message"))
    try:
        result = agent_service.rediger_carrousel(telegram_id, sujet, nb, agent_service.QUALITE_MODELS.get(qualite))
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Carrousel texte error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        quota_service.refund(q)
        if result["error"] == "parse":
            raise HTTPException(status_code=502, detail="Échec de génération des slides")
        _map_agent_error(result)
    quota_service.confirm(q)
    usage_service.log(telegram_id, "carrousel", agent_service.QUALITE_MODELS.get(qualite), result.get("usage"), q.get("unit_cost", 0), qualite)

    content = result["content"]
    texte = _carrousel_legende(content)
    existing_id = body.get("contenu_id")
    if existing_id:
        # Régénération : met à jour le contenu existant (+ slides structurées pour la retouche live)
        supabase.table("contenu").update(
            {"contenu": texte, "type": "Carrousel", "carrousel_data": content}
        ).eq("id", existing_id).eq("telegram_id", telegram_id).execute()
        contenu_id = existing_id
    else:
        row = {"telegram_id": telegram_id, "titre": sujet[:120], "contenu": texte,
               "statut": "A valider", "type": "Carrousel", "carrousel_data": content,
               "created_at": datetime.now(timezone.utc).isoformat()}
        if reseau in RESEAU_MAP:
            row["reseau_cible"] = RESEAU_MAP[reseau]
        ins = supabase.table("contenu").insert(row).execute()
        contenu_id = ins.data[0]["id"] if ins.data else None

    # Rendu des slides en images + PDF
    slides_images, pdf_url = [], None
    try:
        res = await carrousel_service.generer_carrousel(telegram_id, content, contenu_id, tmpl)
        slides_images = res.get("images", [])
        pdf_url = res.get("pdf")
        if contenu_id and slides_images:
            supabase.table("contenu").update(
                {"slides_images": slides_images, "lien_visuel": slides_images[0], "carrousel_pdf": pdf_url}
            ).eq("id", contenu_id).execute()
    except Exception as e:
        logger.error(f"Carrousel render error: {e}")

    return {"contenu_id": contenu_id, "content": content, "slides_images": slides_images,
            "carrousel_pdf": pdf_url, "quota": {"action": "carousel", "used": q.get("used"), "limit": q.get("limit")}}


@router.post("/script")
async def script(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    sujet = (body.get("sujet") or "").strip()
    if not sujet:
        raise HTTPException(status_code=400, detail="sujet requis")
    qualite = body.get("qualite", "equilibre")
    q = quota_service.consume(telegram_id, "post")  # script vidéo compte comme un post
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail=q.get("message"))
    try:
        result = agent_service.rediger_script(telegram_id, sujet, body.get("type_video", "Reel"),
                                              agent_service.QUALITE_MODELS.get(qualite))
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent script error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        quota_service.refund(q)
        _map_agent_error(result)
    quota_service.confirm(q)
    usage_service.log(telegram_id, "script", agent_service.QUALITE_MODELS.get(qualite), result.get("usage"), q.get("unit_cost", 0), qualite)
    result["quota"] = {"action": "post", "used": q.get("used"), "limit": q.get("limit")}
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
    user_instr = prompt  # instruction BRUTE de l'utilisateur (avant combinaison template -> pour la sauvegarde)
    template_mode = bool(body.get("template_mode"))  # template de marque = modèle fixe, l'IA ne change que le texte
    contenu_id = body.get("contenu_id")
    # Mode template : SOIT l'utilisateur donne des consignes (elles pilotent SEULES le rendu),
    # SOIT on compose l'accroche depuis le post. JAMAIS les deux — sinon le modèle reçoit
    # « affiche X » + « remplace par Y » et rend les DEUX phrases sur le visuel.
    if template_mode and contenu_id:
        if user_instr:
            prompt = f"Consignes de l'utilisateur : {user_instr}"
        else:
            accroche = ""
            try:
                row = supabase.table("contenu").select("contenu, titre").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
                texte_post = (row.data[0].get("contenu") or row.data[0].get("titre") or "") if row.data else ""
                comp = agent_service.composer_gabarit(telegram_id, "statement", texte_post)
                if not comp.get("error"):
                    accroche = " ".join((l.get("t") or "") for l in (comp["slots"].get("title_lines") or [])).strip()
            except Exception as e:
                logger.warning(f"template accroche {contenu_id}: {e}")
            if accroche:
                prompt = f"Texte à afficher : {accroche}"
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt requis")
    # En template, le front propose HD par défaut (meilleur texte) mais l'utilisateur peut choisir
    # standard (moins cher, parfois des fautes d'orthographe). On respecte donc son choix.
    modele = body.get("modele", "nano2")
    model_id = image_service.IMAGE_MODELS.get(modele, OPENROUTER_IMAGE_MODEL)
    action_type = quota_service.image_action(modele)  # nano2 -> image_standard, nano3 -> image_pro
    q = quota_service.consume(telegram_id, action_type)
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail=q.get("message"))
    refs = body.get("refs") if isinstance(body.get("refs"), list) else None
    style_note = (body.get("style_note") or "").strip() or None
    # Story -> visuel vertical 9:16 (sinon 4:5 feed)
    ratio = "4:5"
    if contenu_id:
        try:
            t = supabase.table("contenu").select("type").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
            if t.data and t.data[0].get("type") == "Story":
                ratio = "9:16"
        except Exception:
            pass
    try:
        res = await image_service.generer_image(telegram_id, prompt, bool(body.get("avec_photo")), model_id, contenu_id, refs=refs, style_note=style_note, template_mode=template_mode, ratio=ratio)
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent image error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if res.get("error"):
        quota_service.refund(q)
        err = res["error"]
        if err == "no_openrouter_key":
            raise HTTPException(status_code=500, detail="Génération d'image indisponible : clé image non configurée (contacte le support).")
        if err == "no_image":
            raise HTTPException(status_code=502, detail="Le générateur n'a pas renvoyé d'image. Réessaie, ou simplifie la description.")
        if err.startswith("image_failed_"):
            code = err.replace("image_failed_", "")
            if code == "402":
                raise HTTPException(status_code=502, detail="Service de génération d'image momentanément indisponible (crédit du fournisseur d'IA épuisé). Contacte le support — ton quota n'a pas été décompté.")
            if code == "429":
                raise HTTPException(status_code=502, detail="Trop de demandes d'image en même temps. Réessaie dans un instant.")
            if code == "400":
                raise HTTPException(status_code=502, detail="Le générateur a refusé la requête (image de référence invalide ou description non conforme). Vérifie ta photo/inspirations dans Paramètres.")
            raise HTTPException(status_code=502, detail=f"Le générateur d'image a renvoyé une erreur ({code}). Réessaie — ton quota n'a pas été décompté.")
        raise HTTPException(status_code=502, detail="Échec de la génération d'image. Réessaie.")
    quota_service.confirm(q)

    contenu_id = body.get("contenu_id")
    if contenu_id:
        # En template on sauvegarde l'instruction BRUTE (pas le prompt combiné accroche+consignes),
        # sinon elle se réinjecte dans le champ et s'empile à chaque régénération.
        upd = {"lien_visuel": res["lien_visuel"], "prompt_image": (user_instr if template_mode else prompt)}
        # Le visuel est prêt -> on fixe la date puis on POUSSE vers Zernio. Le statut ne passe
        # PLUS à "Planifie" ici : seul l'event webhook post.scheduled le confirme (source de
        # vérité = Zernio ; fini les posts "Planifié" qui n'existent nulle part).
        cur = (supabase.table("contenu").select("statut, reseau_cible, date_publication")
               .eq("id", contenu_id).eq("telegram_id", telegram_id).execute())
        c = cur.data[0] if cur.data else {}
        if not c.get("date_publication"):
            creneau = planning_service.prochain_creneau(telegram_id, c.get("reseau_cible"))
            if creneau:
                upd["date_publication"] = creneau
        supabase.table("contenu").update(upd).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        res["statut"] = c.get("statut")
        res["date_publication"] = upd.get("date_publication") or c.get("date_publication")
        if c.get("statut") in ("A valider", "Valider", "Planifie") and res["date_publication"]:
            try:
                from services import late_service
                pub = await late_service.programmer_contenu(telegram_id, contenu_id)
                res["publish_status"] = "envoi" if pub.get("ok") else ("ignoré" if pub.get("skipped") else "échec")
            except Exception as e:
                logger.warning(f"auto-programmation après visuel {contenu_id}: {e}")
    usage_service.log(telegram_id, "image", model_id, {}, q.get("unit_cost", 0), cost_override=usage_service.IMAGE_PRICES.get(modele, 0.04))
    res["quota"] = {"action": action_type, "used": q.get("used"), "limit": q.get("limit")}
    return res


@router.post("/photo")
async def generate_photo(body: dict, payload: dict = Depends(verify_token)):
    """Génère une PHOTO à partir d'une description (Nano Banana) et renvoie son URL —
    à utiliser comme photo d'un gabarit / template. Consomme un quota image."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    description = (body.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="Décris la photo à générer.")
    modele = body.get("modele", "nano2")
    model_id = image_service.IMAGE_MODELS.get(modele, OPENROUTER_IMAGE_MODEL)
    action_type = quota_service.image_action(modele)
    q = quota_service.consume(telegram_id, action_type)
    if not q.get("ok"):
        raise HTTPException(status_code=402, detail=q.get("message"))
    try:
        res = await image_service.generer_image(telegram_id, description, False, model_id, None)
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent photo error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if res.get("error"):
        quota_service.refund(q)
        raise HTTPException(status_code=502, detail="Échec de la génération de la photo. Réessaie ou simplifie la description.")
    quota_service.confirm(q)
    return {"url": res["lien_visuel"], "quota": {"action": action_type, "used": q.get("used"), "limit": q.get("limit")}}


@router.post("/carrousel/recolor")
async def carrousel_recolor(body: dict, payload: dict = Depends(verify_token)):
    """Re-rend un carrousel à partir de ses slides stockées, avec de nouvelles couleurs/police.
    Le TEXTE ne change pas (pas de re-génération IA). Gratuit."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    contenu_id = body.get("contenu_id")
    if not contenu_id:
        raise HTTPException(status_code=400, detail="contenu_id requis")
    row = (supabase.table("contenu").select("carrousel_data, reseau_cible")
           .eq("id", contenu_id).eq("telegram_id", telegram_id).execute())
    data = row.data[0] if row.data else None
    if not data or not data.get("carrousel_data"):
        raise HTTPException(status_code=422, detail="Ce carrousel n'a pas ses slides enregistrées (généré avant cette fonction). Régénère-le une fois pour activer la retouche.")
    reseau = (data.get("reseau_cible") or "linkedin").lower()
    scheds = plan_service._schedules(telegram_id) or []
    template = next((s.get("carrousel_template") for s in scheds if (s.get("platform") or "").lower() == reseau), None) or "creme"
    colors = body.get("colors") if isinstance(body.get("colors"), dict) else None
    font = body.get("font")
    try:
        res = await carrousel_service.generer_carrousel(telegram_id, data["carrousel_data"], contenu_id, template, colors=colors, font=font)
    except Exception as e:
        logger.error(f"carrousel recolor error: {e}")
        raise HTTPException(status_code=500, detail="Échec du re-rendu du carrousel.")
    imgs = res.get("images", [])
    if imgs:
        supabase.table("contenu").update(
            {"slides_images": imgs, "lien_visuel": imgs[0], "carrousel_pdf": res.get("pdf")}
        ).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    return {"images": imgs, "pdf": res.get("pdf")}
