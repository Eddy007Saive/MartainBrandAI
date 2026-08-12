"""
Studio Reels (Remotion) :
  1. Claude (Haiku) condense un post existant en {hook, points, cta}.
  2. Remotion rend un reel MP4 vertical 1080x1920 a la charte du client
     (template remotion/src/ReelBrand.tsx, rendu par subprocess CLI).
  3. Upload Cloudinary (video) -> nouveau contenu "Reel" en "A valider",
     publie ensuite par le flux normal (validation -> Zernio).

Prerequis serveur : Node + `npm ci` dans le dossier remotion/ (voir REMOTION_DIR).
Env optionnels :
  REMOTION_DIR      chemin du projet Remotion (defaut: <repo>/remotion)
  REMOTION_BROWSER  chemin d'un Chrome/Chromium deja present (evite un telechargement)
"""
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone

import cloudinary
import cloudinary.uploader
from config import (
    supabase, logger,
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
)
from services.agent_service import _charger_marque, _messages_create
from services import planning_service

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTION_DIR = os.environ.get("REMOTION_DIR") or os.path.join(_BACKEND_DIR, "remotion")
REMOTION_BROWSER = os.environ.get("REMOTION_BROWSER")

# ----------------------------------------------------------------- Bibliotheque de templates
# Ajouter un template = 1 composition .tsx dans remotion/src + 1 entree ici.
TEMPLATES = {
    "affiche": {"composition": "ReelAffiche", "label": "Affiche", "duree": 11,
                "desc": "La pub premium : titre accentué, 3 arguments à icônes, ton image, CTA brillant."},
    "impact":  {"composition": "ReelBrand", "label": "Impact", "duree": 8,
                "desc": "Punchy : accroche mot à mot → 3 preuves → CTA. Idéal stories."},
    "stats":   {"composition": "ReelStat", "label": "Gros chiffres", "duree": 10,
                "desc": "Un chiffre géant par écran, qui compte en direct. Pour les posts à résultats."},
    "long":    {"composition": "ReelLong", "label": "Narratif", "duree": 22,
                "desc": "Accroche → contexte → preuves plein écran → leçon en citation → CTA."},
    "sequence": {"composition": "ReelSequence", "label": "Séquence", "duree": 18,
                 "desc": "Le montage pro : plans multiples composés par l'IA — textes animés mot à mot, tes visuels en Ken Burns, CTA. Unique à chaque post."},
}


def liste_templates() -> list:
    return [{"id": k, "label": v["label"], "duree": v["duree"], "desc": v["desc"]}
            for k, v in TEMPLATES.items()]

_ROLE = (
    "Tu es copywriter pour reels courts. A partir d'un post, tu produis le script d'un reel de 8 s :\n"
    "- hook : une phrase choc de 5 a 10 mots (la promesse ou la tension du post)\n"
    "- points : 3 arguments TRES courts (3 a 6 mots chacun)\n"
    "- cta : un appel a l'action de 2 a 5 mots\n"
    "Ecris dans la langue du post. Reponds UNIQUEMENT en JSON strict : "
    '{"hook": "...", "points": ["...", "...", "..."], "cta": "..."}'
)

_ROLE_LONG = (
    "Tu es copywriter pour reels narratifs de 20-25 s. A partir d'un post, tu produis :\n"
    "- hook : une phrase choc de 5 a 10 mots\n"
    "- contexte : 1-2 phrases qui posent le decor (25 mots max)\n"
    "- points : 3 arguments courts (5 a 10 mots chacun)\n"
    "- lecon : la lecon du post en une phrase citation (15 mots max)\n"
    "- cta : un appel a l'action de 2 a 5 mots\n"
    "Ecris dans la langue du post, orthographe irreprochable. Reponds UNIQUEMENT en JSON strict : "
    '{"hook": "...", "contexte": "...", "points": ["...", "...", "..."], "lecon": "...", "cta": "..."}'
)


_ROLE_AFFICHE = (
    "Tu es directeur artistique publicitaire. A partir d'un post, tu produis le contenu d'une affiche video verticale.\n"
    "Regles : les segments a accentuer sont entre [crochets] (1 par ligne maximum, le mot le plus fort).\n"
    "- headline : 2 ou 3 lignes courtes separees par \\n (3-5 mots par ligne), le mot cle de la derniere ligne entre [crochets]\n"
    "- sub : 2 lignes courtes separees par \\n, un mot [marque] par ligne\n"
    "- features : 3 objets {icon: 'bolt'|'star'|'shield', texte: '4-6 mots avec un mot [marque]', sous: '3-6 mots'}\n"
    "- stat : une ligne percutante avec un segment [marque] (chiffre ou promesse)\n"
    "- cta : 2 a 4 mots\n"
    "Ecris dans la langue du post, orthographe irreprochable. Reponds UNIQUEMENT en JSON strict : "
    '{"headline": "...", "sub": "...", "features": [{"icon": "bolt", "texte": "...", "sous": "..."}, ...], "stat": "...", "cta": "..."}'
)


def _script_affiche(texte: str, marque: dict) -> dict:
    """Script du template Affiche ; repli heuristique si l'appel echoue."""
    try:
        resp = _messages_create(
            model="claude-haiku-4-5",
            max_tokens=500,
            system=_ROLE_AFFICHE,
            messages=[{"role": "user", "content": f"Post :\n\n{texte[:4000]}\n\nDonne le JSON."}],
        )
        raw = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
        feats = []
        for f in (data.get("features") or [])[:3]:
            feats.append({
                "icon": f.get("icon") if f.get("icon") in ("bolt", "star", "shield") else "bolt",
                "texte": str(f.get("texte") or "")[:60],
                "sous": str(f.get("sous") or "")[:60],
            })
        if data.get("headline") and len(feats) == 3:
            return {
                "headline": str(data["headline"])[:140],
                "sub": str(data.get("sub") or "")[:160],
                "features": feats,
                "stat": str(data.get("stat") or "")[:120],
                "cta": str(data.get("cta") or "Découvrir")[:32],
            }
    except Exception as e:
        logger.warning(f"reel affiche script LLM: {e}")
    phrases = [s.strip() for s in re.split(r"(?<=[.!?])\s+", texte or "") if s.strip()]
    return {
        "headline": (phrases[0] if phrases else "Un contenu qui travaille pour toi.")[:90],
        "sub": (phrases[1] if len(phrases) > 1 else "")[:120],
        "features": [
            {"icon": "bolt", "texte": (phrases[2] if len(phrases) > 2 else "Simple et rapide")[:60], "sous": ""},
            {"icon": "star", "texte": (phrases[3] if len(phrases) > 3 else "A ta marque")[:60], "sous": ""},
            {"icon": "shield", "texte": (phrases[4] if len(phrases) > 4 else "Tu gardes le controle")[:60], "sous": ""},
        ],
        "stat": "",
        "cta": (marque.get("nom") or "Découvrir")[:32],
    }


_ROLE_SEQUENCE = (
    "Tu es realisateur de reels courts (15-22 s). A partir d'un post et d'une liste de visuels disponibles, "
    "tu ecris le SCENARIO d'un reel : une suite de 4 a 7 plans.\n"
    "Recettes possibles (choisis celle qui colle au post) :\n"
    "- promo : accroche choc -> benefice -> preuve -> offre/CTA\n"
    "- tutoriel : accroche -> 2 a 4 etapes -> CTA\n"
    "- preuve : accroche -> chiffres/resultats -> CTA\n"
    "Types de plans : 'typo' (texte plein ecran), 'image' (un visuel de la liste + texte court), 'cta' (dernier plan, obligatoire).\n"
    "Regles STRICTES :\n"
    "- 4 a 7 plans, duree 2 a 4.5 s chacun, le dernier est TOUJOURS type cta\n"
    "- texte : 2 a 7 mots par plan, percutant, dans la langue du post\n"
    "- accents : 1 a 2 mots du texte a surligner (recopies exactement)\n"
    "- image_id : UNIQUEMENT un id de la liste fournie ; s'il n'y a pas de visuel pertinent, fais un plan typo\n"
    "- varie les effets : zoomIn, zoomOut, panLeft, panRight\n"
    "- bar (plan cta) : 2 a 5 mots (marque, site ou action)\n"
    "Reponds UNIQUEMENT en JSON strict : "
    '{"recette": "...", "segments": [{"type": "typo|image|cta", "dur": 2.8, "texte": "...", '
    '"accents": ["..."], "image_id": "...ou null", "effet": "zoomIn|zoomOut|panLeft|panRight", "bar": "...si cta"}]}'
)


def upload_image_source(telegram_id: str, data: bytes) -> dict:
    """Visuel source d'un reel Sequence : Cloudinary + description vision (une fois)."""
    from services.banque_service import _decrire
    up = cloudinary.uploader.upload(
        data, folder=f"reels-sources/{telegram_id}",
        transformation=[{"width": 1600, "crop": "limit"}, {"quality": "auto"}],
    )
    url = up["secure_url"]
    d = _decrire(url)
    return {"url": url, "desc": d["description"]}


def _est_image_source(url: str) -> bool:
    """Une vraie image : pas un mp4, pas un poster derive d'une video (/video/upload/)."""
    return bool(url) and not url.endswith(".mp4") and "/video/upload/" not in url


def _img_rendu(url: str) -> str:
    """Version 1200px/q_auto d'une image Cloudinary : chargement rapide au rendu."""
    if url and "res.cloudinary.com" in url and "/upload/" in url and "/upload/w_" not in url:
        return url.replace("/upload/", "/upload/w_1200,q_auto/", 1)
    return url


def _pool_visuels(telegram_id: str, cur: dict) -> list:
    """Visuels mobilisables pour le scenario : visuel du post + gabarits de la marque.
    Chaque entree : {id, url, desc} — l'agent ne voit que id + desc, jamais d'URL."""
    pool = []
    lv = cur.get("lien_visuel")
    if lv and "cloudinary" in lv and _est_image_source(lv):
        pool.append({"id": "visuel_post", "url": lv, "desc": "Visuel principal du post"})
    for s_url in (cur.get("slides_images") or [])[:3]:
        pool.append({"id": f"slide_{len(pool)}", "url": s_url, "desc": "Slide du carrousel du post"})
    try:
        r = supabase.table("brand_templates").select("id, nom, note, images").eq("telegram_id", telegram_id).limit(5).execute()
        for row in (r.data or []):
            for i, u in enumerate((row.get("images") or [])[:2]):
                pool.append({
                    "id": f"bt_{str(row['id'])[:8]}_{i}",
                    "url": u,
                    "desc": f"Visuel de marque « {row.get('nom') or 'gabarit'} »" + (f" — {row['note']}" if row.get("note") else ""),
                })
    except Exception as e:
        logger.warning(f"reel pool visuels: {e}")
    return pool[:8]


def _script_sequence(texte: str, marque: dict, pool: list, brief: str = None, imposees: bool = False) -> dict:
    """Scenario de sequence ; validation stricte + repli heuristique.
    imposees=True : les visuels ont ete CHOISIS par le client -> tous utilises."""
    ids = {p["id"] for p in pool}
    urls = {p["id"]: _img_rendu(p["url"]) for p in pool}
    liste = "\n".join(f"- {p['id']} : {p['desc']}" for p in pool) or "(aucun visuel disponible)"
    consigne = ""
    if imposees and pool:
        consigne = ("\nIMPORTANT : ces visuels ont ete choisis par le client. Tu DOIS tous les utiliser, "
                    "un par plan de type image, dans l'ordre le plus logique pour la narration.")
    if brief:
        consigne += f"\nConsignes du client (prioritaires) : {brief[:500]}"
    segments = None
    try:
        resp = _messages_create(
            model="claude-haiku-4-5",
            max_tokens=900,
            system=_ROLE_SEQUENCE,
            messages=[{"role": "user", "content": f"Post :\n\n{texte[:4000]}\n\nVisuels disponibles :\n{liste}{consigne}\n\nDonne le JSON."}],
        )
        raw = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
        segs = []
        for s in (data.get("segments") or [])[:7]:
            t = s.get("type") if s.get("type") in ("typo", "image", "cta") else "typo"
            img_id = s.get("image_id")
            seg = {
                "type": t,
                "dur": max(2.0, min(4.5, float(s.get("dur") or 3))),
                "texte": str(s.get("texte") or "")[:80].strip(),
                "accents": [str(a)[:30] for a in (s.get("accents") or [])[:2]],
            }
            if t == "image":
                if img_id in ids:
                    seg["image"] = urls[img_id]
                    seg["image_id"] = img_id
                    seg["effet"] = s.get("effet") if s.get("effet") in ("zoomIn", "zoomOut", "panLeft", "panRight") else "zoomIn"
                    seg["tilt"] = [-3, 2, -2, 3][len(segs) % 4]
                else:
                    seg["type"] = "typo"   # id inconnu -> jamais d'URL inventee
            if t == "cta":
                seg["bar"] = str(s.get("bar") or marque.get("nom") or "")[:40]
            if seg["texte"]:
                segs.append(seg)
        # invariants : 4-7 plans, le dernier est un cta
        if segs and segs[-1]["type"] != "cta":
            segs.append({"type": "cta", "dur": 3.2, "texte": segs[-1]["texte"][:40] or "Suis-nous",
                         "accents": [], "bar": str(marque.get("nom") or "")[:40]})
        if len(segs) >= 4:
            segments = segs
    except Exception as e:
        logger.warning(f"reel sequence script LLM: {e}")
    if segments is None:
        # Repli : hook -> visuels -> CTA. Si les visuels sont imposes, TOUS y passent.
        phrases = [s.strip() for s in re.split(r"(?<=[.!?])\s+", texte or "") if s.strip()]
        segments = [{"type": "typo", "dur": 2.6, "texte": (phrases[0] if phrases else "Un contenu qui travaille pour toi.")[:70], "accents": []}]
        visuels = pool if imposees else pool[:1]
        effets = ["zoomIn", "panRight", "zoomOut", "panLeft"]
        for i, v in enumerate(visuels[:5]):
            txt = (phrases[1 + i] if len(phrases) > 1 + i else "Regarde.")[:60]
            segments.append({"type": "image", "dur": 3.0, "texte": txt, "accents": [],
                             "image": _img_rendu(v["url"]), "image_id": v["id"], "effet": effets[i % 4], "tilt": [-3, 2, -2, 3][i % 4]})
        if not visuels:
            for p in phrases[2:4]:
                segments.append({"type": "typo", "dur": 2.8, "texte": p[:70], "accents": []})
        segments.append({"type": "cta", "dur": 3.2, "texte": "On en parle ?", "accents": [],
                         "bar": str(marque.get("nom") or "Suis-nous")[:40]})
    return {"recette": "auto", "brief": brief, "segments": segments}


def _script_depuis_post(texte: str, marque: dict, long: bool = False) -> dict:
    """Claude condense le post ; repli heuristique si l'appel echoue."""
    try:
        resp = _messages_create(
            model="claude-haiku-4-5",
            max_tokens=450 if long else 300,
            system=_ROLE_LONG if long else _ROLE,
            messages=[{"role": "user", "content": f"Post :\n\n{texte[:4000]}\n\nDonne le JSON."}],
        )
        raw = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
        if data.get("hook") and isinstance(data.get("points"), list):
            script = {
                "hook": str(data["hook"])[:120],
                "points": [str(p)[:80] for p in data["points"][:3]] or ["Simple.", "Rapide.", "A ta marque."],
                "cta": str(data.get("cta") or "Suis-nous")[:40],
            }
            if long:
                script["contexte"] = str(data.get("contexte") or "")[:220]
                script["lecon"] = str(data.get("lecon") or "")[:140]
            return script
    except Exception as e:
        logger.warning(f"reel script LLM: {e}")
    # Repli : premiere phrase = hook, suivantes = points
    phrases = [s.strip() for s in re.split(r"(?<=[.!?])\s+", texte or "") if s.strip()]
    script = {
        "hook": (phrases[0] if phrases else "Un contenu qui travaille pour toi.")[:120],
        "points": [p[:80] for p in phrases[1:4]] or ["Simple.", "Rapide.", "A ta marque."],
        "cta": (marque.get("nom") or "Suis-nous")[:40],
    }
    if long:
        script["contexte"] = (phrases[1] if len(phrases) > 1 else "")[:220]
        script["lecon"] = (phrases[-1] if len(phrases) > 4 else "")[:140]
    return script


def _props_marque(u: dict, script: dict) -> dict:
    return {
        "brand": {
            "nom": u.get("nom") or u.get("user_name") or "Ma marque",
            "principale": u.get("couleur_principale") or "#5B6CFF",
            "accent": u.get("couleur_accent") or "#3AFFA3",
            "fond": "#0a0a12",
            "logo": u.get("logo_url") or None,
        },
        "hook": script["hook"],
        "points": script["points"],
        "cta": script["cta"],
    }


def _rendre_mp4(props: dict, composition: str = "ReelBrand") -> str:
    """Lance le rendu Remotion en subprocess. Retourne le chemin du MP4.
    composition : "ReelBrand" (8 s) ou "ReelLong" (22 s)."""
    if not os.path.isdir(os.path.join(REMOTION_DIR, "node_modules")):
        raise RuntimeError(f"Remotion non installe ({REMOTION_DIR}) : lancer `npm ci` dans ce dossier.")
    fd, props_path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)
    out_path = os.path.join(tempfile.gettempdir(), f"reel_{next(tempfile._get_candidate_names())}.mp4")
    npx = "npx.cmd" if os.name == "nt" else "npx"
    cmd = [npx, "remotion", "render", "src/index.ts", composition, out_path, f"--props={props_path}", "--timeout=120000"]
    if REMOTION_BROWSER:
        cmd.append(f"--browser-executable={REMOTION_BROWSER}")
    try:
        r = subprocess.run(cmd, cwd=REMOTION_DIR, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=900)
        if r.returncode != 0 or not os.path.exists(out_path):
            tail = (r.stderr or r.stdout or "")[-800:]
            raise RuntimeError(f"rendu remotion (code {r.returncode}) : {tail}")
        return out_path
    finally:
        try:
            os.unlink(props_path)
        except OSError:
            pass


def creer_reel_libre(telegram_id: str, brief: str, images: list = None, reseau: str = "Instagram") -> dict:
    """Cree un reel Sequence SANS contenu source : le brief du client est le sujet.
    Le resultat entre dans Contenus comme un Reel « A valider », planifie normalement."""
    if not (brief or "").strip():
        return {"error": "Decris ton reel : le brief est le sujet."}
    u = _charger_marque(telegram_id)
    imgs = [{"url": im.get("url"), "desc": im.get("desc")}
            for im in (images or []) if _est_image_source(im.get("url"))]
    if imgs:
        pool = [{"id": f"img_{i+1}", "url": im["url"],
                 "desc": (im.get("desc") or f"Visuel fourni n°{i+1}")[:200]}
                for i, im in enumerate(imgs)]
        scenario = _script_sequence(brief, u, pool, brief=brief, imposees=True)
    else:
        scenario = _script_sequence(brief, u, [], brief=brief)
    props = {
        "brand": _props_marque(u, {"hook": "", "points": [], "cta": ""})["brand"],
        "segments": [{k: v for k, v in sg.items() if k != "image_id"} for sg in scenario["segments"]],
    }
    try:
        mp4 = _rendre_mp4(props, composition="ReelSequence")
    except Exception as e:
        logger.error(f"reel libre rendu: {e}")
        return {"error": "Le rendu du reel a echoue. Reessaie dans un instant."}

    hook = (scenario["segments"][0]["texte"] if scenario["segments"] else brief)[:60]
    row = {
        "telegram_id": telegram_id,
        "titre": f"Reel — {hook}",
        "contenu": brief.strip(),
        "type": "Reel",
        "reseau_cible": reseau or "Instagram",
        "statut": "A valider",
        "reel_data": scenario,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    creneau = planning_service.prochain_creneau(telegram_id, row["reseau_cible"], "Reel")
    if creneau:
        row["date_publication"] = creneau
    try:
        ins = supabase.table("contenu").insert(row).execute()
    except Exception as e:
        if any(m in str(e) for m in ("PGRST204", "42703", "does not exist", "schema cache")):
            row.pop("reel_data", None)
            ins = supabase.table("contenu").insert(row).execute()
        else:
            raise
    new_id = ins.data[0]["id"] if ins.data else None
    if not new_id:
        try:
            os.unlink(mp4)
        except OSError:
            pass
        return {"error": "Creation du contenu reel impossible."}
    try:
        up = cloudinary.uploader.upload(
            mp4, resource_type="video",
            public_id=f"reels/{telegram_id}/{new_id}",
            overwrite=True, invalidate=True,
        )
        url = up["secure_url"]
        preview = url.rsplit(".", 1)[0] + ".jpg"
        supabase.table("contenu").update({
            "video_url": url, "video_status": "ready", "video_preview_url": preview,
            "lien_visuel": preview,
        }).eq("id", new_id).execute()
    except Exception as e:
        logger.error(f"reel libre upload: {e}")
        supabase.table("contenu").delete().eq("id", new_id).execute()
        return {"error": "Upload de la video impossible."}
    finally:
        try:
            os.unlink(mp4)
        except OSError:
            pass
    return {"id": new_id, "video_url": url, "hook": hook,
            "reseau": row["reseau_cible"], "date_publication": row.get("date_publication")}


def regenerer_reel(telegram_id: str, reel_id: str, images: list = None, brief: str = None) -> dict:
    """Re-scenarise et re-rend un reel Sequence EXISTANT (statut A valider) : la video
    est remplacee sur place (meme contenu, meme public_id Cloudinary), pas de doublon."""
    res = supabase.table("contenu").select("*").eq("id", reel_id).eq("telegram_id", telegram_id).execute()
    if not res.data:
        return {"error": "Reel introuvable."}
    cur = res.data[0]
    if cur.get("type") != "Reel" or not cur.get("reel_data"):
        return {"error": "Ce contenu n'est pas un reel modifiable."}
    if cur.get("statut") not in ("A valider", "Refuse", "Refusé"):
        return {"error": "Ce reel a deja ete valide : il ne peut plus etre modifie."}
    texte = cur.get("contenu") or cur.get("titre") or ""
    u = _charger_marque(telegram_id)
    old_sc = cur.get("reel_data") or {}
    if brief is None:
        brief = old_sc.get("brief")
    if images is None:
        images = [{"url": sg.get("image"), "desc": None}
                  for sg in old_sc.get("segments", []) if _est_image_source(sg.get("image"))]
    if images:
        pool = [{"id": f"img_{i+1}", "url": im["url"],
                 "desc": (im.get("desc") or f"Visuel fourni n°{i+1}")[:200]}
                for i, im in enumerate(images) if im.get("url")]
        scenario = _script_sequence(texte, u, pool, brief=brief, imposees=True)
    else:
        pool = _pool_visuels(telegram_id, cur)
        scenario = _script_sequence(texte, u, pool, brief=brief)
    props = {
        "brand": _props_marque(u, {"hook": "", "points": [], "cta": ""})["brand"],
        "segments": [{k: v for k, v in sg.items() if k != "image_id"} for sg in scenario["segments"]],
    }
    try:
        mp4 = _rendre_mp4(props, composition="ReelSequence")
    except Exception as e:
        logger.error(f"reel regen rendu: {e}")
        return {"error": "Le rendu du reel a echoue. Reessaie dans un instant."}
    try:
        up = cloudinary.uploader.upload(
            mp4, resource_type="video",
            public_id=f"reels/{telegram_id}/{reel_id}",
            overwrite=True, invalidate=True,
        )
        url = up["secure_url"]
        preview = url.rsplit(".", 1)[0] + ".jpg"
        maj = {"video_url": url, "video_preview_url": preview, "lien_visuel": preview,
               "reel_data": scenario, "video_status": "ready"}
        supabase.table("contenu").update(maj).eq("id", reel_id).execute()
    except Exception as e:
        logger.error(f"reel regen upload: {e}")
        return {"error": "Upload de la video impossible."}
    finally:
        try:
            os.unlink(mp4)
        except OSError:
            pass
    return {"id": reel_id, "video_url": url, "video_preview_url": preview}


def generer_reel(telegram_id: str, contenu_id: str, template: str = "impact",
                 images: list = None, brief: str = None) -> dict:
    """Pipeline complet : post -> script -> rendu -> Cloudinary -> contenu jumeau 'Reel'.
    template : cle de TEMPLATES ('affiche', 'impact', 'stats', 'long')."""
    if template not in TEMPLATES:
        return {"error": "Template de reel inconnu."}
    res = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    if not res.data:
        return {"error": "Contenu introuvable."}
    cur = res.data[0]
    texte = cur.get("contenu") or cur.get("titre") or ""
    if not texte.strip():
        return {"error": "Ce contenu n'a pas de texte a transformer en reel."}

    u = _charger_marque(telegram_id)
    scenario = None
    if template == "sequence":
        # Visuels CHOISIS par le client (dialogue Sequence) > pool automatique du compte
        if images:
            pool = [{"id": f"img_{i+1}", "url": im["url"],
                     "desc": (im.get("desc") or f"Visuel fourni n°{i+1}")[:200]}
                    for i, im in enumerate(images) if _est_image_source(im.get("url"))]
            scenario = _script_sequence(texte, u, pool, brief=brief, imposees=True)
        else:
            pool = _pool_visuels(telegram_id, cur)
            scenario = _script_sequence(texte, u, pool, brief=brief)
        script = {"hook": (scenario["segments"][0]["texte"] if scenario["segments"] else "")[:80]}
        props = {
            "brand": _props_marque(u, {"hook": "", "points": [], "cta": ""})["brand"],
            "segments": [{k: v for k, v in s.items() if k != "image_id"} for s in scenario["segments"]],
        }
    elif template == "affiche":
        script = _script_affiche(texte, u)
        props = {
            "brand": _props_marque(u, {"hook": "", "points": [], "cta": ""})["brand"],
            **script,
            # Pas d'image de fond pour l'instant : les visuels de posts contiennent du texte
            # et ecrasent la lisibilite (teste). TODO : champ "image d'affiche" dans la fiche
            # marque (mascotte/portrait du client) dedie a ce template.
            "image": None,
        }
    else:
        long = (template == "long")
        script = _script_depuis_post(texte, u, long=long)
        props = _props_marque(u, script)
        if long:
            props["contexte"] = script.get("contexte") or ""
            props["lecon"] = script.get("lecon") or ""

    try:
        mp4 = _rendre_mp4(props, composition=TEMPLATES[template]["composition"])
    except Exception as e:
        logger.error(f"reel rendu: {e}")
        return {"error": "Le rendu du reel a echoue. Reessaie dans un instant."}

    # Nouveau contenu AVANT l'upload pour un public_id deterministe (remplace, n'accumule pas)
    row = {
        "telegram_id": telegram_id,
        "titre": f"Reel — {cur.get('titre') or (script.get('hook') or script.get('headline') or '')[:60]}",
        "contenu": cur.get("contenu"),
        "type": "Reel",
        "reseau_cible": cur.get("reseau_cible"),
        "statut": "A valider",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    creneau = planning_service.prochain_creneau(telegram_id, cur.get("reseau_cible"), cur.get("type") or "Reel")
    if creneau:
        row["date_publication"] = creneau
    # Le scenario est conserve (retouche / re-rendu), comme carrousel_data pour les carrousels.
    if scenario:
        row["reel_data"] = scenario
    try:
        ins = supabase.table("contenu").insert(row).execute()
    except Exception as e:
        msg = str(e)
        # Colonne pas encore migree : on n'echoue pas, le reel sort sans scenario stocke.
        if "reel_data" in row and any(m in msg for m in ("PGRST204", "42703", "does not exist", "schema cache")):
            logger.warning("contenu.reel_data absente en base — reel cree sans scenario stocke")
            row.pop("reel_data", None)
            ins = supabase.table("contenu").insert(row).execute()
        else:
            raise
    new_id = ins.data[0]["id"] if ins.data else None
    if not new_id:
        try:
            os.unlink(mp4)
        except OSError:
            pass
        return {"error": "Creation du contenu reel impossible."}

    try:
        up = cloudinary.uploader.upload(
            mp4, resource_type="video",
            public_id=f"reels/{telegram_id}/{new_id}",
            overwrite=True, invalidate=True,
        )
        url = up["secure_url"]
        preview = url.rsplit(".", 1)[0] + ".jpg"  # 1re frame en poster (transformation Cloudinary)
        supabase.table("contenu").update({
            "video_url": url, "video_status": "ready", "video_preview_url": preview,
            "lien_visuel": preview,
        }).eq("id", new_id).execute()
    except Exception as e:
        logger.error(f"reel upload: {e}")
        supabase.table("contenu").delete().eq("id", new_id).execute()
        return {"error": "Upload de la video impossible."}
    finally:
        try:
            os.unlink(mp4)
        except OSError:
            pass

    return {"id": new_id, "video_url": url, "hook": script.get("hook") or script.get("headline"),
            "reseau": row.get("reseau_cible"), "date_publication": row.get("date_publication")}
