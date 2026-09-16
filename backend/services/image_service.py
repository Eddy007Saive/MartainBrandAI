"""
Agent Image :
  1. Claude (Haiku) écrit un prompt d'image à partir du post + la charte de marque.
  2. nano-banana (Gemini 2.5 Flash Image) via OpenRouter génère l'image
     (+ photo du client en référence si demandé).
  3. Upload Cloudinary → URL.
"""
import os
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
# Délai d'attente du générateur d'images. nano-banana 3 (pro) dépasse parfois 2 min aux
# heures chargées d'OpenRouter : à 120 s la génération partait en erreur alors que l'image
# arrivait juste après. Le front attend 4 min sur ces appels.
IMAGE_TIMEOUT_S = float(os.environ.get("OPENROUTER_IMAGE_TIMEOUT_S", "210"))

def upload_avec_reprise(*args, essais: int = 3, **kwargs):
    """cloudinary.uploader.upload, réessayé sur coupure réseau. Cloudinary ferme parfois la
    connexion sans répondre (« Remote end closed connection ») : une image générée à 3 c
    partait à la poubelle pour une reprise de 2 s. Les erreurs 4xx (refus) ne sont pas
    réessayées."""
    import time as _t
    derniere = None
    for i in range(essais):
        try:
            return cloudinary.uploader.upload(*args, **kwargs)
        except Exception as e:  # cloudinary.exceptions.Error, requests ProtocolError…
            derniere = e
            msg = str(e).lower()
            if any(k in msg for k in ("400", "401", "403", "404", "invalid", "not allowed")):
                raise
            logger.warning(f"cloudinary upload essai {i + 1}/{essais} : {e}")
            _t.sleep(1.5 * (i + 1))
    raise derniere


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

# Même directeur artistique, mais pour un style NON photographique (3D, illustration, pop…) : pas
# d'objectif ni de pellicule, la couche finale est le style demandé.
ROLE_PROMPT_STYLE = (
    "Tu es directeur artistique. À partir d'un post et de la charte de marque, tu écris UN prompt "
    "d'image (en anglais, plus efficace pour le modèle) pour illustrer le post.\n\n"
    "Structure le prompt en couches, dans cet ordre :\n"
    "1. Cadrage et composition (ex. \"centered hero object\", \"isometric scene\", \"close-up\")\n"
    "2. Sujet (personnage, objet ou scène) décrit précisément\n"
    "3. Action / ce qui se passe dans le cadre\n"
    "4. Environnement (décor, contexte)\n"
    "5. Lumière et ambiance\n"
    "6. Palette : celle de la marque, nommée en mots\n"
    "7. Le STYLE, recopié tel quel depuis la consigne de style ci-dessous, en dernière couche.\n\n"
    "Le visuel doit coller au message, rester professionnel, épuré et lisible. Aucun texte dans "
    "l'image. Réponds UNIQUEMENT avec le prompt, rien d'autre.\n\n"
)

# Règle commune : le générateur ne sait PAS dessiner une interface qu'on lui décrit vaguement
# (« un dashboard », « une appli ») : il invente des cadrans illisibles. Vu le 2026-09-15 sur un
# post fiche Google : téléphone avec un tableau de bord fantaisiste.
_REGLE_ECRANS = (
    "ÉCRANS ET INTERFACES : ne décris JAMAIS un écran allumé montrant une interface générique, un "
    "« dashboard », une appli ou des graphiques inventés (le modèle produit un faux tableau de bord "
    "illisible). Pour un sujet numérique, préfère une métaphore physique ou un décor : devanture, "
    "épingle de carte, loupe, fiche cartonnée avec des étoiles, icône 3D, objet symbolique. Si un "
    "écran connu doit absolument apparaître, NOMME-le exactement et décris ses éléments visibles "
    "(ex. « the public Google Business Profile card as shown in Google Maps: business name, 4.8 "
    "stars, three photos, opening hours, Directions and Call buttons »), jamais « a dashboard ». "
    "COULEURS : nomme-les toujours en mots (deep navy, mint green…), JAMAIS de code hexadécimal dans "
    "le prompt : le générateur les dessine comme du texte. "
)

_HEX_RE = re.compile(r"#?\b[0-9a-fA-F]{6}\b")


def _sans_hex(texte: str) -> str:
    """Remplace tout code couleur du prompt par son nom : les codes finissent écrits dans l'image."""
    return _HEX_RE.sub(lambda m: _nom_couleur(m.group(0)), texte or "")


def styles_image() -> dict:
    """Styles proposés à la génération d'image : ceux des miniatures (une seule définition)."""
    from services.miniature_service import STYLES
    return STYLES


def _nom_couleur(hexa: str) -> str:
    """Nom approximatif (en anglais) d'une couleur hexadécimale : le générateur lit mieux
    « deep violet » que « #5B6CFF »."""
    try:
        h = (hexa or "").strip().lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except Exception:
        return hexa or ""
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    d = mx - mn
    if d < 0.08:
        return "black" if l < 0.12 else "charcoal" if l < 0.3 else "grey" if l < 0.7 else "off-white" if l < 0.93 else "white"
    if mx == r:
        hue = (60 * ((g - b) / d) + 360) % 360
    elif mx == g:
        hue = 60 * ((b - r) / d) + 120
    else:
        hue = 60 * ((r - g) / d) + 240
    noms = [(15, "red"), (38, "orange"), (52, "gold"), (66, "yellow"), (95, "lime green"), (170, "green"),
            (186, "teal"), (205, "cyan"), (222, "azure blue"), (246, "blue"), (268, "indigo"), (292, "violet"),
            (335, "magenta"), (361, "red")]
    nom = next(n for lim, n in noms if hue < lim)
    if nom == "green" and l > 0.5:
        nom = "mint green"
    if nom == "blue" and l < 0.2:
        nom = "navy"
    if l < 0.28:
        nom = "deep " + nom
    elif l > 0.72:
        nom = "pale " + nom
    return nom


def _charte(u: dict) -> str:
    """La charte de marque, injectée à CHAQUE génération libre (même si le client a réécrit la
    description) : palette nommée + codes. Décision PO du 2026-09-15."""
    parts = []
    for cle, lib in (("couleur_principale", "primary"), ("couleur_secondaire", "secondary"), ("couleur_accent", "accent")):
        v = (u.get(cle) or "").strip()
        if v:
            parts.append(f"{lib} {_nom_couleur(v)} ({v})")
    if not parts:
        return ""
    return ("BRAND PALETTE, mandatory: " + ", ".join(parts) + ". These are the dominant colours of the "
            "composition (backgrounds, key objects, lighting accents, wardrobe details); other colours stay "
            "secondary and harmonious with them. The codes are for colour matching only: never draw or write them.")


_STYLE_AUTO = "auto"
_GUIDE_CHOIX_STYLE = (
    "photo : sujet concret, humain, produit, lieu, témoignage, coulisses ; "
    "cinema : émotion forte, tension, avant/après, récit dramatique ; "
    "3d : concept abstrait, outil numérique, process, chiffres, pédagogie ; "
    "illustration : conseil, liste, méthode, comparaison, sujet éditorial ; "
    "neon : nouveauté, lancement, tendance, tech, nuit, événement ; "
    "pop : humour, provocation, coup de gueule, opinion tranchée."
)


def choisir_style(post_texte: str, langue_hint: str = "fr") -> str:
    """Mode Auto : Claude choisit le style le plus adapté au post (un mot). Repli : photo."""
    ids = [k for k in styles_image().keys()]
    try:
        resp = _messages_create(
            model="claude-haiku-4-5", max_tokens=10,
            system=("Tu es directeur artistique. Choisis le style d'image le plus adapté à un post de réseau "
                    "social. Réponds par UN SEUL mot parmi : " + ", ".join(ids) + ". Repères : " + _GUIDE_CHOIX_STYLE),
            messages=[{"role": "user", "content": f"Post :\n\n{(post_texte or '')[:2500]}\n\nStyle ?"}],
        )
        mot = "".join(b.text for b in resp.content if b.type == "text").strip().lower().strip(".«» \"'")
        return mot if mot in styles_image() else "photo"
    except Exception as e:
        logger.warning(f"choisir_style: {e}")
        return "photo"


def generer_prompt(telegram_id: str, post_texte: str, reseau: str = "linkedin", avec_photo: bool = False,
                   style: str = "photo") -> dict:
    """Claude écrit le prompt d'image (modifiable ensuite par l'utilisateur).
    style : photo (réaliste, défaut), cinema, 3d, illustration, neon, pop (styles_image()),
    ou « auto » : le style est choisi d'abord, puis la description est écrite pour lui.
    Retourne {prompt, style} avec le style effectivement utilisé."""
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    if style == _STYLE_AUTO or style not in styles_image():
        style = choisir_style(post_texte) if style == _STYLE_AUTO else "photo"
    st = styles_image().get(style) or styles_image()["photo"]
    contexte = _REGLE_ECRANS + (
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
    if st["photo"]:
        role = ROLE_PROMPT
        if style != "photo":
            contexte += f" Ambiance photographique demandée : {st['texte']}"
    else:
        role = ROLE_PROMPT_STYLE
        contexte += f" CONSIGNE DE STYLE (à recopier en dernière couche) : {st['texte']}"
    resp = _messages_create(
        model="claude-haiku-4-5",
        max_tokens=400,
        system=role + contexte,
        messages=[{
            "role": "user",
            "content": f"Post à illustrer (réseau {reseau}) :\n\n{post_texte}\n\nDonne le prompt d'image.",
        }],
    )
    prompt = "".join(b.text for b in resp.content if b.type == "text").strip()
    return {"prompt": prompt, "style": style}


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


async def generer_image(telegram_id: str, prompt: str, avec_photo: bool = False, model: str = None, contenu_id: str = None, refs: list = None, style_note: str = None, template_mode: bool = False, ratio: str = "4:5", integrate_refs: list = None, public_id: str = None, identite_stylisee: bool = False, style: str = "photo") -> dict:
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
    st = styles_image().get(style) or styles_image()["photo"]
    if not template_mode:
        prompt = _sans_hex(prompt)
        if st["photo"]:
            prompt = f"{prompt}\n\nRender with visible natural texture, no over-smoothing, no plastic/AI look. Photographic realism, no text."
            if style != "photo":
                prompt = f"{prompt}\nMood: {st['texte']}"
        else:
            # Style non photographique choisi par le client : le garde-fou réalisme ne s'applique pas,
            # le style prime (et la personne de la photo, s'il y en a une, est stylisée, pas photographiée).
            prompt = f"{prompt}\n\nSTYLE, mandatory: {st['texte']} No words, letters or numbers anywhere in the image."
            identite_stylisee = True
        # La charte part TOUJOURS, quel que soit le texte de la description (le client a pu la réécrire).
        charte = _charte(u)
        if charte:
            prompt = f"{prompt}\n\n{charte}"

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

    if photo_refs and identite_stylisee:
        # Style non photographique demandé (3D, illustration, pop art…) : on garde l'IDENTITÉ
        # de la personne mais on la rend dans le style décrit, sans le garde-fou réalisme.
        tenue = (u.get("style_vestimentaire") or "").strip()
        tenue_txt = f" La personne porte la tenue suivante : {tenue}." if tenue else ""
        texte = (
            "Mets en scène la personne EXACTE de la PREMIÈRE image de référence : même visage, mêmes "
            "traits, coiffure et morphologie, immédiatement reconnaissable, mais RENDUE DANS LE STYLE "
            "demandé ci-dessous (ce n'est pas une photo : suis le style à la lettre)." + tenue_txt
            + "\n\n" + prompt
        )
        content = [{"type": "text", "text": texte},
                   {"type": "image_url", "image_url": {"url": photo_refs[0]}}]
        content += [{"type": "image_url", "image_url": {"url": url}} for url in inspi_refs]
    elif photo_refs:
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
    async with httpx.AsyncClient(timeout=IMAGE_TIMEOUT_S) as client:
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
    if public_id:
        # Emplacement imposé par l'appelant (ex. la banque de visuels d'un reel) : un asset neuf.
        up = upload_avec_reprise(img_bytes, resource_type="image", public_id=public_id,
                                        overwrite=True, invalidate=True, transformation=fmt)
    elif contenu_id:
        up = upload_avec_reprise(img_bytes, resource_type="image",
                                        public_id=f"contenus/{telegram_id}/{contenu_id}",
                                        overwrite=True, invalidate=True, transformation=fmt)
    else:
        # Photo « à la volée » (pas encore attachée à un contenu) : slot brouillon UNIQUE par user
        # → une nouvelle génération écrase la précédente (pas d'accumulation d'orphelins).
        up = upload_avec_reprise(img_bytes, resource_type="image",
                                        public_id=f"contenus/{telegram_id}/draft-photo",
                                        overwrite=True, invalidate=True, transformation=fmt)
    return {"lien_visuel": up["secure_url"]}
