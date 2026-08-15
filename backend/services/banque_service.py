"""
Banque de visuels de la marque (table brand_assets).

Le client dépose ses photos (produits, locaux, équipe, réalisations) dans
Paramètres ; chaque image est envoyée sur Cloudinary puis DÉCRITE une seule
fois par une IA de vision (description + tags stockés en base). C'est cette
banque qui donne des « yeux » à l'agent scénariste des reels : il reçoit
[{id, description}] et choisit des images par identifiant — jamais d'URL.
"""
import json
import re
from datetime import datetime, timezone

import cloudinary
import cloudinary.uploader

from config import CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, supabase, logger
from services.agent_service import _messages_create

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

MAX_ASSETS = 30  # par compte — garde-fou de stockage

_ROLE_VISION = (
    "Tu décris une image de banque visuelle d'une marque, pour qu'une IA de montage vidéo "
    "puisse la choisir plus tard. Réponds UNIQUEMENT en JSON strict :\n"
    '{"description": "une phrase concrète de 8 à 20 mots (sujet, cadrage, ambiance)", '
    '"tags": ["3 à 6 mots-clés simples"]}'
)


def _decrire(url: str, telegram_id: str = None) -> dict:
    """Description + tags par IA vision ; repli neutre si l'appel échoue.
    `telegram_id` : journalise le coût de l'appel vision dans usage_log."""
    try:
        resp = _messages_create(
            model="claude-haiku-4-5",
            max_tokens=200,
            system=_ROLE_VISION,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "url", "url": url}},
                    {"type": "text", "text": "Décris cette image. Donne le JSON."},
                ],
            }],
        )
        if telegram_id:
            from services.reel_service import _journal_llm
            _journal_llm(telegram_id, "banque_vision", resp)
        raw = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
        return {
            "description": str(data.get("description") or "")[:200],
            "tags": [str(t)[:30] for t in (data.get("tags") or [])[:6]],
        }
    except Exception as e:
        logger.warning(f"banque vision: {e}")
        return {"description": "", "tags": []}


def lister(telegram_id: str) -> list:
    r = (supabase.table("brand_assets")
         .select("id, url, description, tags, type, duree_s, apercu_url, created_at")
         .eq("telegram_id", telegram_id).order("created_at", desc=True).execute())
    return r.data or []


def _vignette(url: str) -> str:
    """Image fixe extraite d'un clip (2e seconde) : sert d'aperçu ET de base à la
    description par vision — le modèle ne sait pas regarder une vidéo."""
    base, _, fin = url.partition("/upload/")
    return f"{base}/upload/so_2,w_800,q_auto/{fin.rsplit('.', 1)[0]}.jpg"


def ajouter(telegram_id: str, fichier, est_video: bool = False) -> dict:
    """Ajoute un visuel à la banque : Cloudinary -> description vision -> insert.
    `est_video=True` : un extrait vidéo, décrit depuis une image extraite du clip."""
    try:
        if len(lister(telegram_id)) >= MAX_ASSETS:
            return {"error": f"Banque pleine ({MAX_ASSETS} visuels maximum). Supprime des visuels d'abord."}
    except Exception as e:
        logger.warning(f"banque comptage: {e}")   # vérification best-effort (réseau instable)
    up = None
    for attempt in (1, 2):
        try:
            up = cloudinary.uploader.upload(
                fichier,
                folder=f"banque/{telegram_id}",
                resource_type="video" if est_video else "image",
                # Les clips sont ramenés en 720p : c'est la largeur servie au rendu,
                # inutile de stocker du 4K qu'on ne lira jamais en entier.
                transformation=([{"width": 1280, "crop": "limit"}, {"quality": "auto"}]
                                if est_video else
                                [{"width": 1600, "crop": "limit"}, {"quality": "auto"}]),
            )
            break
        except Exception as e:
            logger.warning(f"banque cloudinary (essai {attempt}): {e}")
            if attempt == 2:
                raise
    url = up["secure_url"]
    # Le modèle de vision ne lit pas une vidéo : on lui montre une image du clip.
    desc = _decrire(_vignette(url) if est_video else url, telegram_id)
    row = {
        "telegram_id": telegram_id,
        "url": url,
        "description": desc["description"],
        "tags": desc["tags"],
        "type": "video" if est_video else "image",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if est_video:
        row["duree_s"] = round(float(up.get("duration") or 0), 2) or None
        row["apercu_url"] = _vignette(url)
    for attempt in (1, 2):
        try:
            ins = supabase.table("brand_assets").insert(row).execute()
            break
        except Exception as e:
            logger.warning(f"banque insert (essai {attempt}): {e}")
            if attempt == 2:
                raise
    if not ins.data:
        return {"error": "Enregistrement impossible."}
    return ins.data[0]


def modifier_description(telegram_id: str, asset_id: str, description: str) -> dict:
    r = (supabase.table("brand_assets").update({"description": (description or "")[:200]})
         .eq("id", asset_id).eq("telegram_id", telegram_id).execute())
    return r.data[0] if r.data else {"error": "Image introuvable."}


def supprimer(telegram_id: str, asset_id: str) -> dict:
    """Supprime la ligne ET l'asset Cloudinary (pas d'accumulation)."""
    r = (supabase.table("brand_assets").select("url, type").eq("id", asset_id)
         .eq("telegram_id", telegram_id).execute())
    if not r.data:
        return {"error": "Visuel introuvable."}
    url = r.data[0]["url"]
    try:
        m = re.search(r"/upload/(?:v\d+/)?(.+)\.[a-z0-9]+$", url, re.I)
        if m:
            # un clip est rangé en resource_type "video" chez Cloudinary
            kind = "video" if (r.data[0].get("type") == "video") else "image"
            cloudinary.uploader.destroy(m.group(1), resource_type=kind, invalidate=True)
    except Exception as e:
        logger.warning(f"banque destroy cloudinary: {e}")
    supabase.table("brand_assets").delete().eq("id", asset_id).eq("telegram_id", telegram_id).execute()
    return {"ok": True}
