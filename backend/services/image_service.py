"""
Agent Image :
  1. Claude (Haiku) écrit un prompt d'image à partir du post + la charte de marque.
  2. nano-banana (Gemini 2.5 Flash Image) via OpenRouter génère l'image
     (+ photo du client en référence si demandé).
  3. Upload Cloudinary → URL.
"""
import re
import base64
import httpx
import cloudinary
import cloudinary.uploader
import cloudinary.api
import anthropic
from config import (
    CLAUDE_API_KEY, OPENROUTER_API_KEY, OPENROUTER_IMAGE_MODEL,
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
    supabase, logger,
)
from services.agent_service import _charger_marque

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY) if CLAUDE_API_KEY else None

# Modèles d'image proposés (le user choisit nano-banana 2.5 ou 3)
IMAGE_MODELS = {
    "nano2": "google/gemini-2.5-flash-image",        # nano-banana 2.5 (standard)
    "nano3": "google/gemini-3-pro-image-preview",    # nano-banana 3 (Pro, meilleur)
}

ROLE_PROMPT = (
    "Tu es directeur artistique. À partir d'un post et de la charte de marque, tu écris UN prompt "
    "d'image (en anglais, plus efficace pour le modèle) pour illustrer le post. "
    "Le visuel doit coller au message, rester professionnel, épuré et lisible, et respecter la palette "
    "de la marque. Évite tout texte dans l'image. Réponds UNIQUEMENT avec le prompt, rien d'autre.\n\n"
)


def generer_prompt(telegram_id: int, post_texte: str, reseau: str = "linkedin") -> dict:
    """Claude écrit le prompt d'image (modifiable ensuite par l'utilisateur)."""
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    contexte = (
        f"Secteur : {u.get('secteur') or '—'}. "
        f"Style : {u.get('style_vestimentaire') or '—'}. "
        f"Palette de marque (à utiliser) : principale {u.get('couleur_principale')}, "
        f"secondaire {u.get('couleur_secondaire')}, accent {u.get('couleur_accent')}."
    )
    # Si le client a des images d'inspiration (appliquées en référence à la génération),
    # on prévient Claude pour qu'il ne sur-décrive pas un style qui entrerait en conflit.
    if u.get("use_inspirations", True) and inspiration_urls(telegram_id, limit=1):
        contexte += (
            " Le client a fourni des IMAGES D'INSPIRATION qui seront appliquées comme référence "
            "de style au moment de la génération : décris surtout le SUJET et la SCÈNE, et reste "
            "cohérent avec ces références (le style visuel sera guidé par elles)."
        )
    resp = _client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=400,
        system=ROLE_PROMPT + contexte,
        messages=[{
            "role": "user",
            "content": f"Post à illustrer (réseau {reseau}) :\n\n{post_texte}\n\nDonne le prompt d'image.",
        }],
    )
    prompt = "".join(b.text for b in resp.content if b.type == "text").strip()
    return {"prompt": prompt}


def inspiration_urls(telegram_id: int, limit: int = 20) -> list:
    """Liste les images d'inspiration de l'utilisateur (dossier Cloudinary)."""
    try:
        res = cloudinary.api.resources(
            type="upload", prefix=f"inspirations/{telegram_id}/", max_results=limit,
        )
        return [r["secure_url"] for r in res.get("resources", []) if r.get("secure_url")]
    except Exception as e:
        logger.warning(f"list inspirations error: {e}")
        return []


_DRIVE_FILE_RE = re.compile(r"drive\.google\.com/file/d/([\w-]+)")
_DRIVE_ID_RE = re.compile(r"[?&]id=([\w-]+)")


def _drive_direct(url: str) -> str:
    """Convertit un lien Google Drive (page /view) en lien de téléchargement direct."""
    if "drive.google.com" in url:
        m = _DRIVE_FILE_RE.search(url) or _DRIVE_ID_RE.search(url)
        if m:
            return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    return url


async def _prep_refs(urls: list) -> tuple:
    """Télécharge + valide les images de référence (convertit Drive, ignore les non-images).
    Retourne (data_urls_valides, urls_ignorees)."""
    ok, bad = [], []
    if not urls:
        return ok, bad
    async with httpx.AsyncClient(timeout=25, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as c:
        for u in urls:
            try:
                r = await c.get(_drive_direct(u))
                ct = r.headers.get("content-type", "").split(";")[0].strip().lower()
                if r.status_code == 200 and ct.startswith("image/") and len(r.content) > 100:
                    ok.append(f"data:{ct};base64,{base64.b64encode(r.content).decode()}")
                else:
                    bad.append(u)
                    logger.warning(f"ref image ignorée ({ct or r.status_code}): {u[:90]}")
            except Exception as e:
                bad.append(u)
                logger.warning(f"ref image échec téléchargement: {u[:90]} — {e}")
    return ok, bad


async def generer_image(telegram_id: int, prompt: str, avec_photo: bool = False, model: str = None) -> dict:
    """Génère l'image via nano-banana (OpenRouter) → upload Cloudinary → URL.

    Les images de référence (photo + inspirations) sont validées : liens Drive convertis,
    images invalides ignorées (la génération continue sans elles plutôt que d'échouer).
    """
    if not OPENROUTER_API_KEY:
        return {"error": "no_openrouter_key"}
    u = _charger_marque(telegram_id)

    refs_in = []
    if avec_photo and u.get("photo_url"):
        refs_in.append(u["photo_url"])
    if u.get("use_inspirations", True):
        refs_in.extend(inspiration_urls(telegram_id)[:3])
    refs, _bad = await _prep_refs(refs_in)

    texte = prompt
    if refs:
        if avec_photo and u.get("photo_url"):
            texte += "\n\nIntègre la personne de la photo de référence de façon naturelle et cohérente (même visage)."
        texte += ("\n\nInspire-toi du STYLE VISUEL (composition, palette de couleurs, ambiance, "
                  "éclairage, traitement) des images de référence, sans en copier le contenu.")
        content = [{"type": "text", "text": texte}]
        content += [{"type": "image_url", "image_url": {"url": url}} for url in refs]
    else:
        content = prompt

    body = {
        "model": model or OPENROUTER_IMAGE_MODEL,
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
    }
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json=body,
        )
    if r.status_code != 200:
        logger.error(f"OpenRouter image error {r.status_code}: {r.text[:400]}")
        return {"error": f"image_failed_{r.status_code}"}

    data = r.json()
    try:
        url_data = data["choices"][0]["message"]["images"][0]["image_url"]["url"]
    except (KeyError, IndexError, TypeError):
        logger.error(f"OpenRouter no image in response: {str(data)[:400]}")
        return {"error": "no_image"}

    b64 = url_data.split(",", 1)[1] if "," in url_data else url_data
    img_bytes = base64.b64decode(b64)

    up = cloudinary.uploader.upload(img_bytes, resource_type="image", folder=f"contenus/{telegram_id}", overwrite=True)
    return {"lien_visuel": up["secure_url"]}
