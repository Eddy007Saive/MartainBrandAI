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
    cmd = [npx, "remotion", "render", "src/index.ts", composition, out_path, f"--props={props_path}"]
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


def generer_reel(telegram_id: str, contenu_id: str, template: str = "impact") -> dict:
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
    if template == "affiche":
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
    creneau = planning_service.prochain_creneau(telegram_id, cur.get("reseau_cible"))
    if creneau:
        row["date_publication"] = creneau
    ins = supabase.table("contenu").insert(row).execute()
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
