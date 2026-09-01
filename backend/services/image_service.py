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
    "d'image (en anglais, plus efficace pour le modèle) pour illustrer le post.\n\n"
    "Structure le prompt en couches, dans cet ordre, pour cibler précisément le modèle :\n"
    "1. Angle/cadrage caméra (ex. \"medium shot\", \"three-quarter angle\", \"overhead flat lay\")\n"
    "2. Sujet (personne, objet ou scène) décrit précisément\n"
    "3. Action / composition (ce qui se passe dans le cadre)\n"
    "4. Environnement (décor, contexte)\n"
    "5. Éclairage avec température de couleur (ex. \"soft natural window light 5500K\")\n"
    "6. Technique caméra (ex. \"85mm f/1.8\", \"shallow depth of field\")\n"
    "7. Un repère de pellicule photo pour ancrer le rendu (\"Kodak Portra 400\" pour un rendu lifestyle "
    "chaleureux, \"Kodak Ektar 100\" pour un produit saturé, \"Fujifilm Provia 100F\" pour un rendu "
    "neutre et documentaire)\n\n"
    "Termine TOUJOURS le prompt par : \"visible natural texture, no over-smoothing, photographic "
    "realism, no text\" — pour éviter un rendu plastique/IA. "
    "Le visuel doit coller au message, rester professionnel, épuré et lisible, et respecter la palette "
    "de la marque. Évite tout texte dans l'image. Réponds UNIQUEMENT avec le prompt, rien d'autre.\n\n"
)


def generer_prompt(telegram_id: str, post_texte: str, reseau: str = "linkedin", avec_photo: bool = False) -> dict:
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
    # Règle produit : sans photo du client, on ne met JAMAIS en scène un humain inventé de toutes
    # pièces (visage générique, non identifiable à la marque, potentiellement incohérent d'un post
    # à l'autre). Le visuel doit alors reposer sur un objet, un environnement, une composition
    # abstraite/graphique — jamais un personnage humain.
    if avec_photo:
        contexte += (
            " Le client A fourni une photo de lui-même comme référence : tu peux décrire une scène "
            "avec CETTE personne (le visage exact sera préservé au moment de la génération)."
        )
    else:
        contexte += (
            " Le client N'A PAS fourni de photo de référence : NE DÉCRIS AUCUN visage ni personnage "
            "humain, même générique ou de dos. Décris plutôt un objet, un environnement, une "
            "composition graphique/abstraite, une icône 3D ou une scène sans personnage — jamais un "
            "humain inventé."
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


async def generer_image(telegram_id: str, prompt: str, avec_photo: bool = False, model: str = None, contenu_id: str = None, refs: list = None, style_note: str = None, template_mode: bool = False, ratio: str = "4:5", integrate_refs: list = None) -> dict:
    """Génère l'image via nano-banana (OpenRouter) → upload Cloudinary → URL.

    `refs` : images de référence choisies à la génération (URLs). Si fourni (même vide), il a
    priorité ; sinon on retombe sur les inspirations du compte.
    `integrate_refs` : sous-ensemble de `refs` marqué « à toujours intégrer littéralement »
    (ex. la mascotte) — par opposition aux autres, traitées comme simple inspiration de STYLE
    (sauf si le texte du prompt demande explicitement de les intégrer).
    Les images de référence (photo + style) sont validées : liens Drive convertis,
    images invalides ignorées (la génération continue sans elles plutôt que d'échouer).
    `ratio` : format de sortie ("4:5" feed par défaut, "9:16" pour les stories).
    """
    if not OPENROUTER_API_KEY:
        return {"error": "no_openrouter_key"}
    u = _charger_marque(telegram_id)

    # Directive de style imposée par un template de marque
    if style_note:
        prompt = f"{prompt}\n\nDirective de style à respecter : {style_note}"

    # Story : composition verticale plein écran (le recadrage Cloudinary suivra en 9:16)
    if ratio == "9:16":
        prompt = f"{prompt}\n\nFormat VERTICAL 9:16 plein écran mobile (story Instagram) : composition pensée pour la hauteur, éléments importants centrés (pas collés aux bords hauts/bas)."

    # Garde-fou anti-plastique appliqué à TOUTE génération photo (pas seulement quand une photo de
    # référence est fournie) : l'utilisateur peut avoir édité le prompt de Claude et retiré la
    # consigne de réalisme d'origine (voir ROLE_PROMPT). Absent pour template_mode : là, on édite un
    # gabarit graphique existant, pas une photo — la fidélité au design prime sur le réalisme photo.
    if not template_mode:
        prompt = f"{prompt}\n\nRender with visible natural texture, no over-smoothing, no plastic/AI look. Photographic realism, no text."

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

    # Parmi les références choisies, celles marquées « à toujours intégrer » (ex. la mascotte)
    # sont téléchargées à part : elles reçoivent une consigne plus forte que le simple style.
    integrate_set = set(integrate_refs or [])
    integrate_urls = [x for x in style_urls if x in integrate_set]
    style_only_urls = [x for x in style_urls if x not in integrate_set]

    integrate_data = []
    if integrate_urls:
        integrate_data, _ = await _prep_refs(integrate_urls)
    inspi_refs = []
    if style_only_urls:
        inspi_refs, _ = await _prep_refs(style_only_urls)

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
        # Rôles explicites : 1re image = le GABARIT à reproduire ; images suivantes = RÉFÉRENCES de l'utilisateur.
        if len(inspi_refs) > 1:
            # Prompt validé par tests réels (gemini-3-pro-image) : recrée le design du gabarit et remplace
            # UNIQUEMENT la zone photo par la référence, sans la laisser envahir le fond.
            texte = (
                "Tu reçois PLUSIEURS images. IMAGE 1 = ton GABARIT DE MARQUE. IMAGE(S) suivante(s) = IMAGE(S) DE "
                "RÉFÉRENCE de l'utilisateur. Recrée EXACTEMENT le design de l'IMAGE 1 : même fond, même mise en "
                "page, même logo, mêmes typographies, mêmes couleurs, mêmes emplacements et tailles de texte. "
                "Le gabarit contient une ZONE PHOTO (l'endroit où se trouve une photo/personne) : remplace "
                "UNIQUEMENT le contenu de CETTE zone par l'image de référence, en gardant EXACTEMENT la même "
                "position, la même taille et la même forme de découpe que dans le gabarit. IMPÉRATIF : l'image "
                "de référence ne doit PAS devenir le fond de toute l'image ni déborder de la zone photo ; le "
                "fond, le texte et la disposition du gabarit restent intacts et priment. Ne reproduis NI la mise "
                "en page NI le texte de l'image de référence. Pour le TEXTE : si un « Texte à afficher » est "
                "fourni ci-dessous, c'est LUI (et lui seul) qui REMPLACE le texte du gabarit ; si des "
                "« Consignes de l'utilisateur » sont fournies, EXÉCUTE-les — ce sont des ORDRES, pas du texte à "
                "afficher (ex. « remplace la phrase par X » = afficher UNIQUEMENT X). L'ancien texte du gabarit "
                "DISPARAÎT : ne montre JAMAIS l'ancien et le nouveau en même temps. Garde les accents français "
                "corrects (é, è, ê…). Texte parfaitement lisible, sans faute.\n\n" + prompt
            )
        else:
            texte = (
                "ÉDITE cette image, c'est ton GABARIT DE MARQUE, et RESPECTE SON DESIGN À LA LETTRE : "
                "arrière-plan, photo/sujet, couleurs, composition, éléments graphiques, polices et positions "
                "restent STRICTEMENT IDENTIQUES. Ne génère PAS une nouvelle image. La SEULE modification est le "
                "TEXTE : si un « Texte à afficher » est fourni ci-dessous, c'est LUI (et lui seul) qui REMPLACE "
                "le texte existant (même emplacement, même style) ; si des « Consignes de l'utilisateur » sont "
                "fournies, EXÉCUTE-les — ce sont des ORDRES, pas du texte à afficher (ex. « remplace la phrase "
                "par X » = afficher UNIQUEMENT X). L'ancien texte DISPARAÎT : ne montre JAMAIS l'ancien et le "
                "nouveau en même temps. Parfaitement lisible, sans faute, accents français corrects.\n\n" + prompt
            )
        content = [{"type": "text", "text": texte}]
        content += [{"type": "image_url", "image_url": {"url": url}} for url in inspi_refs]
    elif integrate_data or inspi_refs:
        # Pas de photo : deux familles de références.
        # - integrate_data (marquées « à toujours intégrer », ex. la mascotte) -> leur contenu EXACT
        #   doit apparaître dans le résultat, sans condition.
        # - inspi_refs (le reste) : l'usage reste PILOTÉ PAR LA DESCRIPTION, comme avant — intégré
        #   seulement si le texte le demande explicitement, sinon simple inspiration de style.
        texte = prompt
        if integrate_data:
            texte += (
                "\n\nTu reçois aussi une ou plusieurs IMAGES DE RÉFÉRENCE À INTÉGRER LITTÉRALEMENT dans "
                "la scène décrite ci-dessus : reproduis fidèlement leur contenu exact (personnage, objet, "
                "logo…), à la bonne échelle, intégré naturellement dans la composition. Ce ne sont PAS de "
                "simples inspirations de style — leur contenu doit être clairement VISIBLE dans le résultat."
            )
        if inspi_refs:
            texte += (
                "\n\nTu reçois enfin une ou plusieurs images de référence de STYLE. Si la description "
                "ci-dessus demande explicitement de les utiliser ou de les intégrer (par ex. « ajoute "
                "l'image de référence », « mets la photo dans le cercle », « combine les deux images »), "
                "alors INTÈGRE fidèlement leur contenu dans la composition finale en suivant précisément "
                "la description. Sinon, contente-toi de t'INSPIRER de leur STYLE VISUEL (composition, "
                "palette de couleurs, ambiance, éclairage, traitement) sans copier leur contenu."
            )
        content = [{"type": "text", "text": texte}]
        content += [{"type": "image_url", "image_url": {"url": url}} for url in integrate_data]
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

    # Format normalisé (4:5 feed par défaut, 9:16 story) — recadrage intelligent (sujet préservé).
    # Le modèle rend parfois du 16:9 / 1:1 / 3:4 : on force un ratio unique à l'upload.
    fmt = [{"aspect_ratio": ratio, "crop": "fill", "gravity": "auto"}]
    # public_id déterministe par contenu -> une régénération ÉCRASE le même asset (pas d'accumulation)
    if contenu_id:
        up = cloudinary.uploader.upload(img_bytes, resource_type="image",
                                        public_id=f"contenus/{telegram_id}/{contenu_id}",
                                        overwrite=True, invalidate=True, transformation=fmt)
    else:
        # Photo « à la volée » (pas encore attachée à un contenu) : slot brouillon UNIQUE par user
        # → une nouvelle génération écrase la précédente (pas d'accumulation d'orphelins).
        up = cloudinary.uploader.upload(img_bytes, resource_type="image",
                                        public_id=f"contenus/{telegram_id}/draft-photo",
                                        overwrite=True, invalidate=True, transformation=fmt)
    return {"lien_visuel": up["secure_url"]}
