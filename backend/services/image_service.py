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
from services.agent_service import _charger_marque, _messages_create

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


def generer_prompt(telegram_id: str, post_texte: str, reseau: str = "linkedin") -> dict:
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
    resp = _messages_create(
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


def inspiration_urls(telegram_id: str, limit: int = 20) -> list:
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


async def generer_image(telegram_id: str, prompt: str, avec_photo: bool = False, model: str = None, contenu_id: str = None, refs: list = None, style_note: str = None, template_mode: bool = False) -> dict:
    """Génère l'image via nano-banana (OpenRouter) → upload Cloudinary → URL.

    `refs` : images de référence de STYLE choisies à la génération (URLs). Si fourni
    (même vide), il a priorité ; sinon on retombe sur les inspirations du compte.
    Les images de référence (photo + style) sont validées : liens Drive convertis,
    images invalides ignorées (la génération continue sans elles plutôt que d'échouer).
    """
    if not OPENROUTER_API_KEY:
        return {"error": "no_openrouter_key"}
    u = _charger_marque(telegram_id)

    # Directive de style imposée par un template de marque
    if style_note:
        prompt = f"{prompt}\n\nDirective de style à respecter : {style_note}"

    # Photo de l'utilisateur demandée -> PHOTO RÉALISTE (pas d'illustration)
    photo_refs = []
    if avec_photo and u.get("photo_url"):
        photo_refs, _ = await _prep_refs([u["photo_url"]])

    # Références de STYLE : explicites (choisies à la génération) sinon inspirations du compte
    if refs is not None:
        style_urls = [r for r in refs if r][:4]
    elif u.get("use_inspirations", True):
        style_urls = inspiration_urls(telegram_id)[:3]
    else:
        style_urls = []
    inspi_refs = []
    if style_urls:
        inspi_refs, _ = await _prep_refs(style_urls)

    if photo_refs:
        tenue = (u.get("style_vestimentaire") or "").strip()
        tenue_txt = f" La personne porte la tenue suivante : {tenue}." if tenue else ""
        texte = (
            "PHOTOGRAPHIE RÉALISTE et professionnelle — PAS une illustration, PAS un dessin, "
            "PAS de style cartoon / vectoriel / 3D. Mets en scène la personne EXACTE de la PREMIÈRE image "
            "de référence : même visage, mêmes traits, identité fidèlement préservée, intégrée "
            "naturellement dans la scène, rendu et éclairage photographiques réalistes." + tenue_txt + " "
            "Ignore toute mention de style « illustration » ou « dessin » dans la description ci-dessous : "
            "rends une vraie photo.\n\n" + prompt
        )
        if inspi_refs:
            texte += ("\n\nInspire-toi du STYLE VISUEL (composition, palette de couleurs, ambiance, "
                      "éclairage) des images de style suivantes — sans copier leur contenu et SANS modifier "
                      "le visage de la personne de la première image.")
        content = [{"type": "text", "text": texte},
                   {"type": "image_url", "image_url": {"url": photo_refs[0]}}]
        content += [{"type": "image_url", "image_url": {"url": url}} for url in inspi_refs]
    elif inspi_refs and template_mode:
        # Template de marque = MODÈLE FIXE : on reproduit le visuel à l'identique, on ne change QUE le texte.
        texte = (
            "Tu reçois un GABARIT de marque (première image de référence). REPRODUIS-LE À L'IDENTIQUE : "
            "même mise en page, mêmes couleurs, mêmes éléments graphiques, mêmes polices, mêmes positions, "
            "même fond. NE MODIFIE RIEN du design. Tu ne changes QUE LE TEXTE affiché, en le remplaçant par "
            "le contenu ci-dessous. Garde le texte au même endroit, même style/typo, parfaitement lisible et "
            "sans faute.\n\nTexte à mettre :\n" + prompt
        )
        content = [{"type": "text", "text": texte}]
        content += [{"type": "image_url", "image_url": {"url": url}} for url in inspi_refs]
    elif inspi_refs:
        # Pas de photo -> style libre, guidé par les inspirations (illustrations OK)
        texte = prompt + ("\n\nInspire-toi du STYLE VISUEL (composition, palette de couleurs, "
                          "ambiance, éclairage, traitement) des images de référence, sans en copier le contenu.")
        content = [{"type": "text", "text": texte}]
        content += [{"type": "image_url", "image_url": {"url": url}} for url in inspi_refs]
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

    # public_id déterministe par contenu -> une régénération ÉCRASE le même asset (pas d'accumulation)
    if contenu_id:
        up = cloudinary.uploader.upload(img_bytes, resource_type="image",
                                        public_id=f"contenus/{telegram_id}/{contenu_id}",
                                        overwrite=True, invalidate=True)
    else:
        # Photo « à la volée » (pas encore attachée à un contenu) : slot brouillon UNIQUE par user
        # → une nouvelle génération écrase la précédente (pas d'accumulation d'orphelins).
        up = cloudinary.uploader.upload(img_bytes, resource_type="image",
                                        public_id=f"contenus/{telegram_id}/draft-photo",
                                        overwrite=True, invalidate=True)
    return {"lien_visuel": up["secure_url"]}
