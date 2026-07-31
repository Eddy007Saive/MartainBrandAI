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

_ROLE = (
    "Tu es copywriter pour reels courts. A partir d'un post, tu produis le script d'un reel de 8 s :\n"
    "- hook : une phrase choc de 5 a 10 mots (la promesse ou la tension du post)\n"
    "- points : 3 arguments TRES courts (3 a 6 mots chacun)\n"
    "- cta : un appel a l'action de 2 a 5 mots\n"
    "Ecris dans la langue du post. Reponds UNIQUEMENT en JSON strict : "
    '{"hook": "...", "points": ["...", "...", "..."], "cta": "..."}'
)


def _script_depuis_post(texte: str, marque: dict) -> dict:
    """Claude condense le post ; repli heuristique si l'appel echoue."""
    try:
        resp = _messages_create(
            model="claude-haiku-4-5",
            max_tokens=300,
            system=_ROLE,
            messages=[{"role": "user", "content": f"Post :\n\n{texte[:4000]}\n\nDonne le JSON."}],
        )
        raw = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
        if data.get("hook") and isinstance(data.get("points"), list):
            return {
                "hook": str(data["hook"])[:120],
                "points": [str(p)[:80] for p in data["points"][:3]] or ["Simple.", "Rapide.", "A ta marque."],
                "cta": str(data.get("cta") or "Suis-nous")[:40],
            }
    except Exception as e:
        logger.warning(f"reel script LLM: {e}")
    # Repli : premiere phrase = hook, suivantes = points
    phrases = [s.strip() for s in re.split(r"(?<=[.!?])\s+", texte or "") if s.strip()]
    return {
        "hook": (phrases[0] if phrases else "Un contenu qui travaille pour toi.")[:120],
        "points": [p[:80] for p in phrases[1:4]] or ["Simple.", "Rapide.", "A ta marque."],
        "cta": (marque.get("nom") or "Suis-nous")[:40],
    }


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


def generer_reel(telegram_id: str, contenu_id: str) -> dict:
    """Pipeline complet : post -> script -> rendu -> Cloudinary -> contenu jumeau 'Reel'."""
    res = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    if not res.data:
        return {"error": "Contenu introuvable."}
    cur = res.data[0]
    texte = cur.get("contenu") or cur.get("titre") or ""
    if not texte.strip():
        return {"error": "Ce contenu n'a pas de texte a transformer en reel."}

    u = _charger_marque(telegram_id)
    script = _script_depuis_post(texte, u)
    props = _props_marque(u, script)

    try:
        mp4 = _rendre_mp4(props)
    except Exception as e:
        logger.error(f"reel rendu: {e}")
        return {"error": "Le rendu du reel a echoue. Reessaie dans un instant."}

    # Nouveau contenu AVANT l'upload pour un public_id deterministe (remplace, n'accumule pas)
    row = {
        "telegram_id": telegram_id,
        "titre": f"Reel — {cur.get('titre') or script['hook'][:60]}",
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

    return {"id": new_id, "video_url": url, "hook": script["hook"],
            "reseau": row.get("reseau_cible"), "date_publication": row.get("date_publication")}
