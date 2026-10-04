import base64
import time
import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from datetime import datetime, timezone
from dependencies import verify_token
from services import agent_service, credit_service, quota_service, usage_service, image_service, planning_service, plan_service, carrousel_service, demarrage_service
from config import supabase, logger, CLAUDE_MODEL, OPENROUTER_IMAGE_MODEL

router = APIRouter(prefix="/agent", tags=["agent"])


def _refus(q: dict) -> HTTPException:
    """Le refus d'une generation, avec sa RAISON lisible par l'interface.

    Les neuf points de generation renvoyaient deja 402, mais un simple texte :
    l'interface ne pouvait pas distinguer « ce compte n'a jamais donne sa
    carte » de « ce compte a epuise ses posts du mois ». Le premier appelle un
    mur de paiement, le second un message et rien d'autre.

    Le message reste dans `message` : tout le code existant qui lit
    `detail.message` — ou que l'intercepteur ramene a une chaine — continue de
    fonctionner sans changement.
    """
    return HTTPException(status_code=402, detail={
        "raison": q.get("reason") or "quota",
        "message": q.get("message") or "Génération indisponible.",
    })

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
        # Même forme d'objet que le garde demarrage_service.exiger_profil (filet de
        # sécurité si la garde en tête de route n'a pas joué) : l'intercepteur front
        # sait la traiter (toast + visite guidée sur l'étape profil).
        raise HTTPException(status_code=400, detail={
            "raison": "profil_incomplet",
            "message": "Complète ton profil de marque (secteur, voix, audience, piliers) avant de générer.",
            "manquants": ["secteur"],
        })


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
def sujets(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
    q = quota_service.consume(telegram_id, "subject")
    if not q.get("ok"):
        raise _refus(q)
    try:
        result = agent_service.generer_sujets(
            telegram_id, int(body.get("nombre", 6)), body.get("filtres"))
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent sujets error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        quota_service.refund(q)
        _map_agent_error(result)
    quota_service.confirm(q)

    usage_service.log(telegram_id, "sujets", agent_service.SUJETS_MODEL, result.get("usage"), q.get("unit_cost", 0))

    # Sauvegarde des sujets comme brouillons (sans réseau — choisi à la transformation).
    # Chaque sujet porte ses dimensions {objectif, angle, cible, format} : un brief, pas un thème.
    def _dims(s):
        return {k: s.get(k) for k in ("objectif", "angle", "cible", "format", "offre") if s.get(k)}
    sujets = [s for s in result.get("sujets", []) if s.get("sujet")]
    # dimensions = valeur EFFECTIVE (modifiable) ; dimensions_reco = reco d'origine de l'IA (fige l'⭐).
    rows = [{"telegram_id": telegram_id, "titre": s["sujet"][:200], "statut": "Brouillon",
             "dimensions": _dims(s) or None, "dimensions_reco": _dims(s) or None} for s in sujets]
    saved = []
    if rows:
        try:
            ins = supabase.table("brouillons").insert(rows).execute()
            saved = [{"id": r["id"], "titre": r["titre"], "dimensions": r.get("dimensions"),
                      "dimensions_reco": r.get("dimensions_reco")} for r in (ins.data or [])]
        except Exception as e:
            logger.error(f"Save sujets error: {e}")
            saved = [{"id": None, "titre": s["sujet"], "dimensions": _dims(s), "dimensions_reco": _dims(s)} for s in sujets]
    return {"sujets": saved, "quota": {"action": "subject", "used": q.get("used"), "limit": q.get("limit")}}


@router.get("/dimensions")
def dimensions(payload: dict = Depends(verify_token)):
    """Les listes de valeurs des 4 dimensions d'un sujet (objectif/angle/cible/format).
    Sert au Studio : filtres optionnels de génération + rendu des tags sur chaque sujet.
    Le 'format' est filtré sur les réseaux connectés (pas de Reel sans compte adapté)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return agent_service.dimensions_pour(telegram_id)


@router.get("/plan")
def plan(year: int = None, month: int = None, payload: dict = Depends(verify_token)):
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

    def occ_for(reseau_cap: str, famille: str = "feed", mode: str = None):
        # Occupation PAR FAMILLE en rythme « cumulé » (un reel peut partager le jour
        # d'un post) ; en « à la suite », tous les formats sont dans la même file.
        key = (reseau_cap, famille)
        if key not in occupied:
            occupied[key] = {dp[:10] for dp in plan_service._dates_occupees(
                telegram_id, reseau_cap, start, end, famille, mode)}
        return occupied[key]

    created, errors = 0, []
    for it in items:
        sujet = (it.get("sujet") or "").strip()
        dims = it.get("dimensions") if isinstance(it.get("dimensions"), dict) else None  # brief du sujet
        reseau_low = (it.get("reseau") or "").lower()
        qualite = "equilibre"  # un seul modèle de rédaction : le paramètre reçu est ignoré
        reseau_cap = RESEAU_MAP.get(reseau_low)
        if not sujet or not reseau_cap:
            errors.append({"sujet": sujet, "reseau": reseau_low, "err": "invalide"})
            continue
        # format : choisi par l'utilisateur (par réseau), sinon cadence du réseau
        fmt = (it.get("format") or formats.get(reseau_low) or "post")
        # story = texte court (accroche du visuel) -> même pipeline que post ; le visuel 9:16 suit
        action = "post" if fmt in ("post", "story") else "carrousel" if fmt == "carrousel" else "script"
        qtype = "carousel" if action == "carrousel" else "post"  # script compte comme un post
        demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
        q = quota_service.consume(telegram_id, qtype)
        if not q.get("ok"):
            errors.append({"sujet": sujet, "reseau": reseau_low, "err": "quota", "message": q.get("message")})
            break  # quota atteint -> on arrête la rafale
        try:
            model = agent_service.MODELE_REDACTION
            ccontent = None
            if action == "post":
                r = agent_service.rediger_post(telegram_id, sujet, reseau_low, model, cache=True, dimensions=dims)
                texte = r.get("contenu", "")
            elif action == "carrousel":
                r = agent_service.rediger_carrousel(telegram_id, sujet, 5, model, cache=True, dimensions=dims)
                ccontent = r.get("content")
                texte = _carrousel_legende(ccontent) if ccontent else ""
            else:
                tv = "Reel" if fmt == "reel" else "Video"
                r = agent_service.rediger_script(telegram_id, sujet, tv, model, cache=True, dimensions=dims)
                texte = r.get("script", "")
            if r.get("error"):
                quota_service.refund(q)
                errors.append({"sujet": sujet, "reseau": reseau_low, "err": r["error"]})
                continue
            usage_service.log(telegram_id, action, model, r.get("usage"), q.get("unit_cost", 0), qualite)

            mode_reseau = planning_service.mode_du_reseau(telegram_id, reseau_low)
            type_pour_famille = ("Video" if action == "script"
                                 else "Story" if fmt == "story" else "Carrousel")
            famille = planning_service.famille_de(type_pour_famille, mode_reseau)
            oc = occ_for(reseau_cap, famille, mode_reseau)
            slots = plan_service.creneaux_libres(telegram_id, reseau_cap, year, month, oc)
            date_pub = slots[0] if slots else None
            if date_pub:
                oc.add(date_pub[:10])

            row = {
                "telegram_id": telegram_id, "titre": sujet[:120], "contenu": texte,
                "reseau_cible": reseau_cap, "statut": "A valider",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if action in ("post", "carrousel"):
                # Base de comparaison pour le taux de réécriture (H2) — voir migration
                # contenu_original.sql. Absente pour les scripts (contenu mis à None plus bas).
                row["contenu_original"] = texte
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
            if cid:
                from services.contenu_service import log_evenement
                log_evenement(cid, "genere", acteur=telegram_id, texte=row.get("contenu_original") or texte)

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
                except carrousel_service.AtelierSature:
                    logger.warning("rafale carrousel : atelier sature")
                    errors.append({"sujet": sujet, "reseau": reseau_low, "err": "atelier_sature"})
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
def list_sujets(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        r = (supabase.table("brouillons")
             .select("id, titre, reseau_cible, dimensions, dimensions_reco, created_at")
             .eq("telegram_id", telegram_id).eq("statut", "Brouillon")
             .order("created_at", desc=True).execute())
        return r.data or []
    except Exception as e:
        logger.error(f"List sujets error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/sujets/{sujet_id}")
def maj_sujet(sujet_id: str, body: dict, payload: dict = Depends(verify_token)):
    """Enregistre les dimensions EFFECTIVES d'un sujet (override utilisateur).
    dimensions_reco (l'⭐) n'est jamais touché : on garde la reco d'origine de l'IA."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    dims_in = body.get("dimensions") or {}
    # Ne garde que des valeurs valides des listes figées.
    dims = {k: v for k in ("objectif", "angle", "cible", "format")
            if (v := agent_service._valider_dimension(k, dims_in.get(k)))}
    offre = agent_service._valider_offre(telegram_id, dims_in.get("offre"))  # offre dynamique
    if offre:
        dims["offre"] = offre
    try:
        supabase.table("brouillons").update({"dimensions": dims or None}) \
            .eq("id", sujet_id).eq("telegram_id", telegram_id).execute()
        return {"success": True, "dimensions": dims}
    except Exception as e:
        logger.error(f"Maj sujet dimensions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sujets/{sujet_id}")
def delete_sujet(sujet_id: str, payload: dict = Depends(verify_token)):
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
def get_drafts(payload: dict = Depends(verify_token)):
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
def put_drafts(body: dict, payload: dict = Depends(verify_token)):
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
def list_gabarits(payload: dict = Depends(verify_token)):
    from services import gabarit_service
    return {"gabarits": gabarit_service.GABARITS, "labels": gabarit_service.GAB_LABELS}


@router.get("/carrousel-templates")
def list_carrousel_templates(payload: dict = Depends(verify_token)):
    """Templates de carrousel proposables à ce compte (les sur-mesure non attribués sont exclus)."""
    from services import carrousel_service, carrousel_custom
    tid = payload.get("telegram_id")
    autorises = carrousel_service.templates_autorises(tid)
    # Les templates importés n'ont pas d'aperçu JS : on renvoie leur vignette.
    importes = [{"id": t["id"], "label": t["label"], "preview_url": t.get("preview_url")}
                for t in carrousel_custom.lister() if t["id"] in autorises]
    # Modèles créés par le client : leur gabarit sert à l'aperçu en direct dans Contenus.
    for t in carrousel_custom.lister_du_compte(tid):
        row = carrousel_custom.charger(t["id"]) or {}
        importes.append({"id": t["id"], "label": t["label"], "preview_url": t.get("preview_url"),
                         "perso": True, "html": row.get("html")})
    return {"templates": autorises, "importes": importes}


@router.get("/usage")
def usage_gauge(payload: dict = Depends(verify_token)):
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
    demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
    q = quota_service.consume(telegram_id, "image_standard")
    if not q.get("ok"):
        raise _refus(q)
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
def list_templates(payload: dict = Depends(verify_token)):
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
def create_template(body: dict, payload: dict = Depends(verify_token)):
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
def delete_template(template_id: str, payload: dict = Depends(verify_token)):
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
def rediger(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    sujet = (body.get("sujet") or "").strip()
    if not sujet:
        raise HTTPException(status_code=400, detail="sujet requis")
    qualite = "equilibre"  # un seul modèle de rédaction : le paramètre reçu est ignoré
    demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
    q = quota_service.consume(telegram_id, "post")
    if not q.get("ok"):
        raise _refus(q)
    depart = time.monotonic()
    try:
        result = agent_service.rediger_post(telegram_id, sujet, body.get("reseau", "linkedin"),
                                            agent_service.MODELE_REDACTION,
                                            dimensions=body.get("dimensions"))
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent rediger error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    duree = time.monotonic() - depart
    if result.get("error"):
        quota_service.refund(q)
        _map_agent_error(result)
    quota_service.confirm(q)
    usage_service.log(telegram_id, "post", agent_service.MODELE_REDACTION, result.get("usage"), q.get("unit_cost", 0), qualite, duree_s=duree)
    if body.get("save") or body.get("brouillon"):
        row = {"telegram_id": telegram_id, "titre": sujet[:120], "contenu": result["contenu"],
               "contenu_original": result["contenu"],
               "created_at": datetime.now(timezone.utc).isoformat()}
        if body.get("brouillon"):
            # Studio IA : le post est en base DES sa redaction, au statut Brouillon (ni date ni
            # creneau : il n'entre dans le planning qu'a la validation, via /agent/enregistrer).
            row["statut"] = "Brouillon"
            if body.get("reseau") in RESEAU_MAP:
                row["reseau_cible"] = RESEAU_MAP[body.get("reseau")]
            if body.get("type") == "Story":
                row["type"] = "Story"
        if result.get("formule_accroche"):
            row["formule_accroche"] = result["formule_accroche"]  # formule d'accroche retenue par l'IA
        ins = supabase.table("contenu").insert(row).execute()
        result["contenu_id"] = ins.data[0]["id"] if ins.data else None
        if result["contenu_id"]:
            from services.contenu_service import log_evenement
            log_evenement(result["contenu_id"], "genere", acteur=telegram_id, texte=result["contenu"])
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
    qualite = "equilibre"  # un seul modèle de rédaction : le paramètre reçu est ignoré
    demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
    q = quota_service.consume(telegram_id, "post")
    if not q.get("ok"):
        raise _refus(q)
    depart = time.monotonic()
    try:
        r = agent_service.rediger_depuis_photo(
            telegram_id, base64.b64encode(data).decode(), file.content_type,
            reseau, agent_service.MODELE_REDACTION)
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"rediger-photo error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    duree = time.monotonic() - depart
    if r.get("error"):
        quota_service.refund(q)
        _map_agent_error(r)
    quota_service.confirm(q)
    usage_service.log(telegram_id, "post", agent_service.MODELE_REDACTION, r.get("usage"), q.get("unit_cost", 0), qualite, duree_s=duree)

    texte = r["contenu"]
    lien = None
    try:  # la photo devient le visuel du post
        up = cloudinary.uploader.upload(data, resource_type="image", folder=f"contenus/{telegram_id}", invalidate=True)
        lien = up["secure_url"]
    except Exception as e:
        logger.error(f"rediger-photo cloudinary error: {e}")
    titre = ((texte.split("\n", 1)[0] if texte else "") or "Post photo")[:120]
    row = {"telegram_id": telegram_id, "titre": titre, "contenu": texte, "contenu_original": texte,
           "statut": "A valider", "created_at": datetime.now(timezone.utc).isoformat()}
    if reseau in RESEAU_MAP:
        row["reseau_cible"] = RESEAU_MAP[reseau]
        creneau = planning_service.prochain_creneau(telegram_id, row["reseau_cible"])
        if creneau:
            row["date_publication"] = creneau
    if lien:
        row["lien_visuel"] = lien
    ins = supabase.table("contenu").insert(row).execute()
    cid = ins.data[0]["id"] if ins.data else None
    if cid:
        from services.contenu_service import log_evenement
        log_evenement(cid, "genere", acteur=telegram_id, texte=texte)
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
    qualite = "equilibre"  # un seul modèle de rédaction : le paramètre reçu est ignoré
    # template du carrousel : override explicite sinon celui configuré pour ce réseau
    tmpl = body.get("template")
    if not tmpl:
        tmpl = next((sch.get("carrousel_template") or "bold"
                     for sch in plan_service._schedules(telegram_id) if sch.get("platform") == reseau), "bold")
    demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
    q = quota_service.consume(telegram_id, "carousel")
    if not q.get("ok"):
        raise _refus(q)
    depart = time.monotonic()
    try:
        result = agent_service.rediger_carrousel(telegram_id, sujet, nb, agent_service.MODELE_REDACTION,
                                                 dimensions=body.get("dimensions"))
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Carrousel texte error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    duree = time.monotonic() - depart
    if result.get("error"):
        quota_service.refund(q)
        if result["error"] == "parse":
            raise HTTPException(status_code=502, detail="Échec de génération des slides")
        _map_agent_error(result)
    quota_service.confirm(q)
    usage_service.log(telegram_id, "carrousel", agent_service.MODELE_REDACTION, result.get("usage"), q.get("unit_cost", 0), qualite, duree_s=duree)

    content = result["content"]
    texte = _carrousel_legende(content)
    existing_id = body.get("contenu_id")
    if existing_id:
        # Régénération : met à jour le contenu existant (+ slides structurées pour la retouche live).
        # contenu_original suit la régénération : c'est une nouvelle proposition de l'IA, pas
        # une retouche du client, donc la base de comparaison pour le taux de modification (H2)
        # doit repartir de ce nouveau texte.
        supabase.table("contenu").update(
            {"contenu": texte, "contenu_original": texte, "type": "Carrousel", "carrousel_data": content}
        ).eq("id", existing_id).eq("telegram_id", telegram_id).execute()
        contenu_id = existing_id
    else:
        row = {"telegram_id": telegram_id, "titre": sujet[:120], "contenu": texte, "contenu_original": texte,
               "statut": "A valider", "type": "Carrousel", "carrousel_data": content,
               "created_at": datetime.now(timezone.utc).isoformat()}
        if result.get("formule_accroche"):
            row["formule_accroche"] = result["formule_accroche"]  # formule de la couverture
        if reseau in RESEAU_MAP:
            row["reseau_cible"] = RESEAU_MAP[reseau]
            # Réservation du créneau DÈS la création : évite que deux contenus non
            # encore datés calculent le même "prochain jour libre" (chevauchements).
            creneau = planning_service.prochain_creneau(telegram_id, row["reseau_cible"], "Carrousel")
            if creneau:
                row["date_publication"] = creneau
        ins = supabase.table("contenu").insert(row).execute()
        contenu_id = ins.data[0]["id"] if ins.data else None

    if contenu_id:
        from services.contenu_service import log_evenement
        log_evenement(contenu_id, "genere", acteur=telegram_id, texte=texte)

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
def script(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    sujet = (body.get("sujet") or "").strip()
    if not sujet:
        raise HTTPException(status_code=400, detail="sujet requis")
    qualite = "equilibre"  # un seul modèle de rédaction : le paramètre reçu est ignoré
    demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
    q = quota_service.consume(telegram_id, "post")  # script vidéo compte comme un post
    if not q.get("ok"):
        raise _refus(q)
    try:
        result = agent_service.rediger_script(telegram_id, sujet, body.get("type_video", "Reel"),
                                              agent_service.MODELE_REDACTION,
                                              dimensions=body.get("dimensions"))
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent script error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    if result.get("error"):
        quota_service.refund(q)
        _map_agent_error(result)
    quota_service.confirm(q)
    usage_service.log(telegram_id, "script", agent_service.MODELE_REDACTION, result.get("usage"), q.get("unit_cost", 0), qualite)
    if body.get("brouillon") and (result.get("script") or "").strip():
        # Studio IA : le script vit en base des sa redaction, au statut Brouillon ; il passe
        # « A tourner » a la validation (/video/draft avec contenu_id).
        row = {"telegram_id": telegram_id, "titre": sujet[:120], "type": "Reel", "statut": "Brouillon",
               "script": result["script"], "created_at": datetime.now(timezone.utc).isoformat()}
        if (body.get("reseau") or "").lower() in RESEAU_MAP:
            row["reseau_cible"] = RESEAU_MAP[body["reseau"].lower()]
        ins = supabase.table("contenu").insert(row).execute()
        result["contenu_id"] = ins.data[0]["id"] if ins.data else None
        if result["contenu_id"]:
            from services.contenu_service import log_evenement
            log_evenement(result["contenu_id"], "genere", acteur=telegram_id, texte=result["script"])
    result["quota"] = {"action": "post", "used": q.get("used"), "limit": q.get("limit")}
    return result


@router.post("/enregistrer-script")
def enregistrer_script(body: dict, payload: dict = Depends(verify_token)):
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


# --- Brouillons du Studio IA : posts rediges, en base au statut « Brouillon », pas encore valides ---
@router.get("/brouillons-contenus")
def brouillons_contenus(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    r = (supabase.table("contenu")
         .select("id, titre, contenu, contenu_original, script, reseau_cible, type, created_at")
         .eq("telegram_id", telegram_id).eq("statut", "Brouillon")
         .order("created_at", desc=True).limit(50).execute())
    return r.data or []


@router.post("/brouillons-contenus")
def creer_brouillon_contenu(body: dict, payload: dict = Depends(verify_token)):
    """Reprise d'une ancienne carte du Studio (texte deja redige, gardee seulement dans
    studio_drafts) : la range dans contenu au statut Brouillon. Sans IA, sans quota."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    contenu = (body.get("contenu") or "").strip()
    script_txt = (body.get("script") or "").strip()
    if not contenu and not script_txt:
        raise HTTPException(status_code=400, detail="contenu requis")
    row = {
        "telegram_id": telegram_id,
        "titre": ((body.get("titre") or (contenu or script_txt)[:80]).strip())[:120],
        "statut": "Brouillon",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if script_txt:  # script video : prend le chemin « A tourner » a la validation
        row.update({"type": "Reel", "script": script_txt})
    else:
        row.update({"contenu": contenu, "contenu_original": (body.get("contenu_original") or "").strip() or contenu})
    reseau = (body.get("reseau") or "").lower()  # une ancienne carte peut porter « LinkedIn »
    if reseau in RESEAU_MAP:
        row["reseau_cible"] = RESEAU_MAP[reseau]
    if body.get("type") == "Story":
        row["type"] = "Story"
    # Reprise idempotente : la meme carte reprise deux fois (deux onglets, double montage React)
    # renvoie le brouillon deja cree au lieu d'en faire un doublon.
    champ, valeur = ("script", script_txt) if script_txt else ("contenu", contenu)
    deja = (supabase.table("contenu").select("id").eq("telegram_id", telegram_id).eq("statut", "Brouillon")
            .eq("titre", row["titre"]).eq(champ, valeur).limit(1).execute()).data
    if deja:
        return {"success": True, "contenu_id": deja[0]["id"]}
    ins = supabase.table("contenu").insert(row).execute()
    cid = ins.data[0]["id"] if ins.data else None
    if cid:
        from services.contenu_service import log_evenement
        log_evenement(cid, "genere", acteur=telegram_id, texte=row.get("contenu_original") or script_txt)
    return {"success": True, "contenu_id": cid}


@router.patch("/brouillons-contenus/{contenu_id}")
def maj_brouillon_contenu(contenu_id: str, body: dict, payload: dict = Depends(verify_token)):
    """Retouche du texte d'un brouillon (sauvegarde auto du Studio). Ne touche QUE les brouillons."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    maj = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if isinstance(body.get("contenu"), str):
        maj["contenu"] = body["contenu"]
    if isinstance(body.get("contenu_original"), str) and body["contenu_original"].strip():
        maj["contenu_original"] = body["contenu_original"]  # regeneration : nouvelle proposition de l'IA
    if isinstance(body.get("script"), str):
        maj["script"] = body["script"]
    if isinstance(body.get("formule_accroche"), int):
        maj["formule_accroche"] = body["formule_accroche"]  # régénération : nouvelle formule
    r = (supabase.table("contenu").update(maj).eq("id", contenu_id).eq("telegram_id", telegram_id)
         .eq("statut", "Brouillon").execute())
    if not r.data:
        raise HTTPException(status_code=404, detail="Brouillon introuvable")
    # Suivi de la rédaction : nouvelle proposition de l'IA, ou retouche (une par session)
    from services.contenu_service import log_evenement, log_retouche
    if "contenu_original" in maj or body.get("regenere"):
        log_evenement(contenu_id, "regenere", acteur=telegram_id, texte=maj.get("contenu_original") or maj.get("script"))
    elif "contenu" in maj or "script" in maj:
        log_retouche(contenu_id, telegram_id, maj.get("contenu", maj.get("script")))
    return {"success": True}


@router.delete("/brouillons-contenus/{contenu_id}")
def supprimer_brouillon_contenu(contenu_id: str, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    (supabase.table("contenu").delete().eq("id", contenu_id).eq("telegram_id", telegram_id)
     .eq("statut", "Brouillon").execute())
    return {"success": True}


@router.post("/enregistrer")
def enregistrer(body: dict, payload: dict = Depends(verify_token)):
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
        # Texte IA tel que généré, jamais retouché (mémoire d'évaluation, H2) : le frontend le
        # renvoie tel qu'il l'a reçu à la génération — absent pour un post rédigé à la main.
        contenu_original = (body.get("contenu_original") or "").strip()
        if contenu_original:
            row["contenu_original"] = contenu_original
        reseau = body.get("reseau")
        # Story (Instagram/Facebook uniquement) : publiée en éphémère 24h chez Zernio
        if body.get("type") == "Story":
            if reseau not in ("instagram", "facebook"):
                raise HTTPException(status_code=400, detail="Les stories ne sont possibles que sur Instagram ou Facebook.")
            row["type"] = "Story"
        if reseau in RESEAU_MAP:
            row["reseau_cible"] = RESEAU_MAP[reseau]  # enum single value (LinkedIn, Instagram…)
            # Réservation du créneau DÈS la création (anti-chevauchement, famille story/feed)
            creneau = planning_service.prochain_creneau(telegram_id, row["reseau_cible"], row.get("type"))
            if creneau:
                row["date_publication"] = creneau
        # Brouillon du Studio IA deja en base : on le PROMEUT (meme ligne, meme id) en « A valider »
        # au lieu d'en creer une nouvelle. Le texte d'origine de l'IA est conserve tel qu'enregistre.
        brouillon_id = body.get("contenu_id")
        if brouillon_id:
            ex = (supabase.table("contenu").select("id, statut, contenu").eq("id", brouillon_id)
                  .eq("telegram_id", telegram_id).limit(1).execute()).data
            if ex and ex[0].get("statut") == "Brouillon":
                maj = {k: v for k, v in row.items() if k not in ("telegram_id", "created_at", "contenu_original")}
                maj["statut"] = "A valider"
                maj["updated_at"] = datetime.now(timezone.utc).isoformat()
                supabase.table("contenu").update(maj).eq("id", brouillon_id).eq("telegram_id", telegram_id).execute()
                from services.contenu_service import log_evenement, log_retouche
                if contenu != (ex[0].get("contenu") or "").strip():
                    log_retouche(brouillon_id, telegram_id, contenu)  # dernière retouche pas encore sauvegardée
                log_evenement(brouillon_id, "soumis", acteur=telegram_id, texte=contenu)  # envoyé « A valider »
                return {"success": True, "contenu_id": brouillon_id}
        ins = supabase.table("contenu").insert(row).execute()
        contenu_id = ins.data[0]["id"] if ins.data else None
        if contenu_id:
            from services.contenu_service import log_evenement
            log_evenement(contenu_id, "genere", acteur=telegram_id, texte=contenu_original or contenu)
        return {"success": True, "contenu_id": contenu_id}
    except Exception as e:
        logger.error(f"Agent enregistrer error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/image-prompt")
def image_prompt(body: dict, payload: dict = Depends(verify_token)):
    """Claude écrit un prompt d'image à partir du post (gratuit, éditable)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    texte = (body.get("texte") or "").strip()
    if not texte:
        raise HTTPException(status_code=400, detail="texte requis")
    style = body.get("style") if body.get("style") in image_service.styles_image() or body.get("style") == "auto" else "photo"
    res = image_service.generer_prompt(telegram_id, texte, body.get("reseau", "linkedin"), avec_photo=bool(body.get("avec_photo")), style=style)
    if res.get("error") == "no_api_key":
        raise HTTPException(status_code=500, detail="Clé API IA non configurée")
    # Sauvegarde immédiate du prompt sur le contenu -> on ne le régénère pas à la réouverture (anti-gaspillage)
    contenu_id = body.get("contenu_id")
    if contenu_id and res.get("prompt"):
        try:
            # le style effectif (celui choisi en Auto compris) est mémorisé avec la description
            supabase.table("contenu").update({"prompt_image": res["prompt"], "style_image": res.get("style")}).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
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
    # Mode template : le TEXTE vient TOUJOURS du post (accroche composée) ; les consignes de
    # l'utilisateur pilotent le VISUEL (fond, décor, ambiance) et s'y AJOUTENT. Elles ne
    # remplacent le texte que si elles le demandent explicitement (« écris plutôt… »).
    # Historique : avant, consignes = rendu seul → le texte n'avait plus rien à voir avec le post.
    if template_mode and contenu_id:
        accroche = ""
        try:
            row = supabase.table("contenu").select("contenu, titre").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
            texte_post = (row.data[0].get("contenu") or row.data[0].get("titre") or "") if row.data else ""
            comp = agent_service.composer_gabarit(telegram_id, "statement", texte_post)
            if not comp.get("error"):
                accroche = " ".join((l.get("t") or "") for l in (comp["slots"].get("title_lines") or [])).strip()
        except Exception as e:
            logger.warning(f"template accroche {contenu_id}: {e}")
        if user_instr and accroche:
            prompt = (
                f"Texte à afficher : {accroche}\n"
                f"Consignes de l'utilisateur (elles concernent le VISUEL — fond, décor, ambiance — et "
                f"s'appliquent EN PLUS du « Texte à afficher », qui reste affiché tel quel, SAUF si elles "
                f"demandent explicitement un autre texte) : {user_instr}"
            )
        elif user_instr:
            prompt = f"Consignes de l'utilisateur : {user_instr}"
        elif accroche:
            prompt = f"Texte à afficher : {accroche}"
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt requis")
    # En template, le front propose HD par défaut (meilleur texte) mais l'utilisateur peut choisir
    # standard (moins cher, parfois des fautes d'orthographe). On respecte donc son choix.
    modele = body.get("modele", "nano2")
    model_id = image_service.IMAGE_MODELS.get(modele, OPENROUTER_IMAGE_MODEL)
    action_type = quota_service.image_action(modele)  # nano2 -> image_standard, nano3 -> image_pro
    demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
    q = quota_service.consume(telegram_id, action_type)
    if not q.get("ok"):
        raise _refus(q)
    refs = body.get("refs") if isinstance(body.get("refs"), list) else None
    integrate_refs = body.get("integrate_refs") if isinstance(body.get("integrate_refs"), list) else None
    ecran_refs = body.get("ecran_refs") if isinstance(body.get("ecran_refs"), list) else None
    style_note = (body.get("style_note") or "").strip() or None
    style = body.get("style") if body.get("style") in image_service.styles_image() else "photo"
    # Story -> visuel vertical 9:16 (sinon 4:5 feed)
    ratio = "4:5"
    if contenu_id:
        try:
            t = supabase.table("contenu").select("type").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
            if t.data and t.data[0].get("type") == "Story":
                ratio = "9:16"
        except Exception:
            pass
    depart = time.monotonic()
    try:
        res = await image_service.generer_image(telegram_id, prompt, bool(body.get("avec_photo")), model_id, contenu_id, refs=refs, style_note=style_note, template_mode=template_mode, ratio=ratio, integrate_refs=integrate_refs, style=style, ecran_refs=ecran_refs)
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent image error: {e!r}")
        raise HTTPException(status_code=500, detail=str(e))
    duree = time.monotonic() - depart
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
        # prompt_image = la DESCRIPTION du mode IA, mémorisée. En template, on n'y écrit plus les
        # instructions : elles se retrouvaient prérempli es dans la description (et l'inverse : la
        # description IA partait comme consigne du gabarit, d'où un téléphone au « dashboard bizarre »).
        # Les instructions du template sont gardées côté navigateur.
        upd = {"lien_visuel": res["lien_visuel"]}
        if not template_mode:
            upd["prompt_image"] = prompt
            upd["style_image"] = style          # le dernier style utilisé : repris à la prochaine ouverture
        # Le visuel est prêt -> on fixe la date puis on POUSSE vers Zernio. Le statut ne passe
        # PLUS à "Planifie" ici : seul l'event webhook post.scheduled le confirme (source de
        # vérité = Zernio ; fini les posts "Planifié" qui n'existent nulle part).
        cur = (supabase.table("contenu").select("statut, reseau_cible, date_publication, type")
               .eq("id", contenu_id).eq("telegram_id", telegram_id).execute())
        c = cur.data[0] if cur.data else {}
        if not c.get("date_publication"):
            creneau = planning_service.prochain_creneau(telegram_id, c.get("reseau_cible"), c.get("type"))
            if creneau:
                upd["date_publication"] = creneau
        supabase.table("contenu").update(upd).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        res["statut"] = c.get("statut")
        res["date_publication"] = upd.get("date_publication") or c.get("date_publication")
        # BUG CORRIGE : "A valider" ne doit JAMAIS pousser vers Zernio — sinon un brouillon
        # part se programmer des qu'on lui genere/regenere une image, avant toute validation
        # explicite. Seul un contenu deja "Valider" (poste par l'utilisateur) ou deja "Planifie"
        # (deja pousse, on rafraichit juste) declenche l'auto-programmation ici.
        if c.get("statut") in ("Valider", "Planifie") and res["date_publication"]:
            try:
                from services import late_service
                pub = await late_service.programmer_contenu(telegram_id, contenu_id)
                res["publish_status"] = "envoi" if pub.get("ok") else ("ignoré" if pub.get("skipped") else "échec")
            except Exception as e:
                logger.warning(f"auto-programmation après visuel {contenu_id}: {e}")
    usage_service.log(telegram_id, "image", model_id, {}, q.get("unit_cost", 0), cost_override=usage_service.IMAGE_PRICES.get(modele, 0.04), duree_s=duree)
    res["quota"] = {"action": action_type, "used": q.get("used"), "limit": q.get("limit")}
    return res


@router.post("/image/editer")
async def image_editer(body: dict, payload: dict = Depends(verify_token)):
    """Retouche une image DÉJÀ générée avec une instruction libre (« enlève le carton »).
    Consomme un quota image (vrai appel au modèle), comme une génération."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    image_url = (body.get("image_url") or "").strip()
    instruction = (body.get("instruction") or "").strip()
    if not image_url:
        raise HTTPException(status_code=400, detail="image_url requis")
    if len(instruction) < 3:
        raise HTTPException(status_code=400, detail="Décris la modification en quelques mots.")
    contenu_id = body.get("contenu_id")
    modele = body.get("modele", "nano2")
    model_id = image_service.IMAGE_MODELS.get(modele, OPENROUTER_IMAGE_MODEL)
    action_type = quota_service.image_action(modele)
    ratio = "4:5"
    if contenu_id:
        try:
            t = supabase.table("contenu").select("type").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
            if t.data and t.data[0].get("type") == "Story":
                ratio = "9:16"
        except Exception:
            pass
    demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
    q = quota_service.consume(telegram_id, action_type)
    if not q.get("ok"):
        raise _refus(q)
    depart = time.monotonic()
    try:
        res = await image_service.editer_image(telegram_id, image_url, instruction, model_id, contenu_id, ratio=ratio)
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"Agent image editer error: {e!r}")
        raise HTTPException(status_code=500, detail=str(e))
    duree = time.monotonic() - depart
    if res.get("error"):
        quota_service.refund(q)
        raise HTTPException(status_code=502, detail="Échec de la retouche. Réessaie, ou reformule l'instruction.")
    quota_service.confirm(q)
    if contenu_id:
        supabase.table("contenu").update({"lien_visuel": res["lien_visuel"]}).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    usage_service.log(telegram_id, "image_edit", model_id, {}, q.get("unit_cost", 0), cost_override=usage_service.IMAGE_PRICES.get(modele, 0.04), duree_s=duree)
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
    demarrage_service.exiger_profil(telegram_id)  # profil de marque minimum, avant de consommer
    q = quota_service.consume(telegram_id, action_type)
    if not q.get("ok"):
        raise _refus(q)
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
    """Re-rend un carrousel à partir de ses slides stockées, avec de nouvelles couleurs/police
    et, depuis le 2026-10-01, un texte de slides éventuellement retouché à la main
    (`carrousel_data`). Jamais de re-génération IA. Gratuit."""
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
    # Style : choix ponctuel pour CE carrousel s'il est fourni, sinon celui du réseau.
    # template_valide() retombe sur « creme » si le client n'y a pas droit.
    template = (body.get("template")
                or next((s.get("carrousel_template") for s in scheds
                         if (s.get("platform") or "").lower() == reseau), None) or "creme")
    template = carrousel_service.template_valide(template, telegram_id)
    colors = body.get("colors") if isinstance(body.get("colors"), dict) else None
    font = body.get("font")
    font_corps = body.get("font_corps")
    carrousel_data = data["carrousel_data"]
    # Texte des slides retouché à la main (jamais régénéré par l'IA) : normalisé, enregistré,
    # journalisé « modifié » (mémoire d'évaluation), puis rendu avec le reste de la retouche.
    if isinstance(body.get("carrousel_data"), dict):
        nouveau = agent_service.normaliser_carrousel_data(body["carrousel_data"], carrousel_data)
        if nouveau != carrousel_data:
            carrousel_data = nouveau
            supabase.table("contenu").update({"carrousel_data": carrousel_data}) \
                .eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
            from services.contenu_service import log_evenement
            log_evenement(contenu_id, "modifie", acteur=telegram_id,
                          texte="\n".join(f"{sl.get('titre', '')} — {sl.get('texte', '')}" for sl in carrousel_data["slides"]))
    try:
        res = await carrousel_service.generer_carrousel(telegram_id, carrousel_data, contenu_id, template, colors=colors, font=font, font_corps=font_corps)
    except Exception as e:
        logger.error(f"carrousel recolor error: {e}")
        raise HTTPException(status_code=500, detail="Échec du re-rendu du carrousel.")
    imgs = res.get("images", [])
    if imgs:
        supabase.table("contenu").update(
            {"slides_images": imgs, "lien_visuel": imgs[0], "carrousel_pdf": res.get("pdf")}
        ).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    return {"images": imgs, "pdf": res.get("pdf"), "carrousel_data": carrousel_data}


@router.post("/carrousel/{contenu_id}/design")
def enregistrer_design_carrousel(contenu_id: str, body: dict, payload: dict = Depends(verify_token)):
    """Éditeur de carrousel : le client a retouché ou dessiné ses slides ; le navigateur envoie
    les images exportées + le design (pour rouvrir plus tard). Gratuit (aucune IA)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    res = carrousel_service.enregistrer_design(telegram_id, contenu_id, body.get("design") or {}, body.get("images") or [])
    erreur = res.get("error")
    if erreur == "introuvable":
        raise HTTPException(status_code=404, detail="Carrousel introuvable")
    if erreur == "deja_programme":
        raise HTTPException(status_code=409, detail="Ce carrousel est déjà programmé ou publié : annule la programmation avant de modifier le design.")
    if erreur == "trop_lourd":
        raise HTTPException(status_code=413, detail="Une slide est trop lourde (6 Mo maximum).")
    if erreur:
        raise HTTPException(status_code=400, detail="Slides invalides (1 à 10 images attendues).")
    return res


@router.get("/carrousel/modeles")
def lister_modeles_carrousel(payload: dict = Depends(verify_token)):
    """Modèles de carrousel créés par ce client dans l'éditeur."""
    from services import carrousel_custom
    return {"modeles": carrousel_custom.lister_du_compte(payload.get("telegram_id"))}


@router.post("/carrousel/modeles")
async def creer_modele_carrousel(body: dict, payload: dict = Depends(verify_token)):
    """« Enregistrer comme modèle » : trois slides (couverture, étape, finale) dont les textes
    portent un rôle. Le gabarit HTML est construit ici, jamais reçu du navigateur."""
    from services import carrousel_modele_service as modeles
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        return await modeles.creer(telegram_id, body.get("nom") or "", body.get("pages") or [])
    except modeles.ModeleInvalide as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/carrousel/modeles/{modele_id}")
def lire_modele_carrousel(modele_id: str, payload: dict = Depends(verify_token)):
    """Un modèle du client avec son design, pour le rouvrir dans l'éditeur."""
    from services import carrousel_modele_service as modeles
    row = modeles.charger(payload.get("telegram_id"), modele_id)
    if not row:
        raise HTTPException(status_code=404, detail="Modèle introuvable")
    return row


@router.put("/carrousel/modeles/{modele_id}")
async def modifier_modele_carrousel(modele_id: str, body: dict, payload: dict = Depends(verify_token)):
    from services import carrousel_modele_service as modeles
    try:
        res = await modeles.modifier(payload.get("telegram_id"), modele_id, body.get("nom") or "", body.get("pages") or [])
    except modeles.ModeleInvalide as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not res:
        raise HTTPException(status_code=404, detail="Modèle introuvable")
    return res


@router.delete("/carrousel/modeles/{modele_id}")
def supprimer_modele_carrousel(modele_id: str, payload: dict = Depends(verify_token)):
    from services import carrousel_modele_service as modeles
    if not modeles.supprimer(payload.get("telegram_id"), modele_id):
        raise HTTPException(status_code=404, detail="Modèle introuvable")
    return {"success": True}


@router.get("/carrousel/photos")
def photos_carrousel(graine: str = "demo", payload: dict = Depends(verify_token)):
    """Photos (Pexels) d'un carrousel en style photo, pour l'aperçu : mêmes photos qu'au rendu
    final (même secteur, même graine = l'id du contenu)."""
    from services import pexels_service
    u = carrousel_service._charger_marque(payload.get("telegram_id"))
    return {"photos": pexels_service.photos(u.get("secteur"), (graine or "demo")[:64])}
