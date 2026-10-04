"""
Modèles de carrousel créés par les CLIENTS dans l'éditeur (« Enregistrer comme modèle »).

Le client envoie un design (trois pages : couverture, étape, finale) dont chaque texte porte
un rôle (accroche, titre, texte…). On en fabrique ICI, côté serveur, un gabarit HTML au même
contrat que les templates importés par l'admin (carrousel_custom : blocs data-role et
marqueurs {{hook}}, {{titre}}…). Il est rangé dans la même table avec son propriétaire : le
moteur de rendu, le choix du modèle et la planification le traitent comme un template importé.

Sécurité : le client n'envoie jamais de HTML. Chaque valeur (nombre, couleur, police, URL)
est validée puis réécrite par nous ; les images sont hébergées sur notre Cloudinary.
"""
import base64
import html as _html
import re
import uuid

import cloudinary.api
import cloudinary.uploader

from config import supabase, logger, FRONTEND_URL

MAX_MODELES = 10            # par compte (à relier aux forfaits)
LARGEUR, HAUTEUR = 1080, 1350
K = 360 / LARGEUR           # le rendu travaille en 360×450 (×3 à la capture)
ROLES_PAGES = ("couverture", "etape", "final")

# Rôle d'un texte -> marqueur du gabarit (par page), plus les rôles communs à toutes les pages.
MARQUEURS = {
    "couverture": {"accroche": "{{hook}}"},
    "etape": {"titre": "{{titre}}", "texte": "{{texte}}", "astuce": "{{pro_tip}}"},
    "final": {"cta": "{{cta_titre}}", "cta_texte": "{{cta_texte}}"},
}
COMMUNS = {"nom": "{{nom}}", "compteur": "{{index}}/{{total}}"}
VARIABLES = {r for m in MARQUEURS.values() for r in m}  # textes écrits par l'IA
# Couleurs de marque qu'un texte ou un fond peut suivre : variable CSS posée par le rendu.
VARS_MARQUE = {"principale": "--marque-p", "secondaire": "--marque-s", "accent": "--marque-a"}

_COULEUR = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$")
_POLICE = re.compile(r"^[A-Za-z0-9 \-]{1,60}$")
_DATA_IMG = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$")
_CHEMIN_SITE = re.compile(r"^/[A-Za-z0-9/_\-.]{1,200}$")
_ID = re.compile(r"^perso-[0-9a-f]{10}$")


class ModeleInvalide(Exception):
    """Design inutilisable : le message est montré tel quel au client."""


# ------------------------------------------------------------------ validation
def _nombre(v, mini, maxi, defaut=0.0) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return defaut
    if n != n:  # NaN
        return defaut
    return max(mini, min(maxi, n))


def _couleur(v, defaut="#ffffff") -> str:
    v = str(v or "").strip()
    return v if _COULEUR.match(v) else defaut


def _police(v) -> str:
    v = str(v or "").strip()
    return v if _POLICE.match(v) else "Inter"


def _url_image(src, owner: str, tid: str, nom: str) -> str | None:
    """Image hébergée chez nous : data URL -> Cloudinary ; Cloudinary ou fichier du site -> gardé."""
    src = str(src or "").strip()
    m = _DATA_IMG.match(src)
    if m:
        brut = base64.b64decode(m.group(2))
        if len(brut) > 6 * 1024 * 1024:
            raise ModeleInvalide("Une image du modèle dépasse 6 Mo.")
        up = cloudinary.uploader.upload(brut, resource_type="image", folder=f"carrousels/modeles/{owner}",
                                        public_id=f"{tid}_{nom}", overwrite=True)
        return up["secure_url"]
    if src.startswith("https://res.cloudinary.com/"):
        return src.replace('"', "%22")
    if _CHEMIN_SITE.match(src) and ".." not in src:
        return f"{FRONTEND_URL}{src}"
    return None


def _marque(v) -> str | None:
    return v if v in VARS_MARQUE else None


def _teinte(couleur: str, marque: str | None) -> str:
    """Couleur CSS : celle de la marque au moment du rendu, sinon la couleur dessinée."""
    return f"var({VARS_MARQUE[marque]},{couleur})" if marque else couleur


def _page(page: dict, role: str, owner: str, tid: str) -> dict:
    """Une page du design, nettoyée : seules des valeurs validées passent."""
    if not isinstance(page, dict):
        raise ModeleInvalide("Page de modèle illisible.")
    degrade = page.get("degrade") if isinstance(page.get("degrade"), dict) else None
    if degrade:
        stops = [[_nombre(o, 0, 1), _couleur(c, "#000000")]
                 for o, c in (degrade.get("stops") or [])[:6] if isinstance(c, str)]
        degrade = {"angle": _nombre(degrade.get("angle"), -360, 360, 180), "stops": stops} if len(stops) >= 2 else None
    out = {
        "role": role,
        "fond": _couleur(page.get("fond"), "#000000"),
        "degrade": degrade,
        "fondImage": _url_image(page.get("fondImage"), owner, tid, f"{role}_fond") if page.get("fondImage") else None,
        "fondMarque": _marque(page.get("fondMarque")),
        "elements": [],
    }
    elements = page.get("elements") or []
    if len(elements) > 60:
        raise ModeleInvalide("Trop d'éléments sur une slide (60 au maximum).")
    roles_ok = set(MARQUEURS[role]) | set(COMMUNS) | ({"numero"} if role == "etape" else set()) | {"fixe"}
    for i, e in enumerate(elements):
        if not isinstance(e, dict):
            continue
        base = {
            "x": _nombre(e.get("x"), -LARGEUR, 2 * LARGEUR), "y": _nombre(e.get("y"), -HAUTEUR, 2 * HAUTEUR),
            "width": _nombre(e.get("width"), 1, 3 * LARGEUR, 100), "rotation": _nombre(e.get("rotation"), -360, 360),
            "opacity": _nombre(e.get("opacity"), 0, 1, 1),
        }
        if e.get("type") == "texte":
            r = str(e.get("role") or "fixe")
            out["elements"].append({
                **base, "type": "texte", "role": r if r in roles_ok else "fixe",
                "text": str(e.get("text") or "")[:3000],
                "height": _nombre(e.get("height"), 1, 3 * HAUTEUR, 100),
                "fontSize": _nombre(e.get("fontSize"), 4, 600, 40), "fontFamily": _police(e.get("fontFamily")),
                "fill": _couleur(e.get("fill")), "gras": bool(e.get("gras")), "italique": bool(e.get("italique")),
                "align": e.get("align") if e.get("align") in ("left", "center", "right") else "left",
                "lineHeight": _nombre(e.get("lineHeight"), 0.5, 4, 1.2),
                "letterSpacing": _nombre(e.get("letterSpacing"), -50, 200),
                "uneLigne": bool(e.get("uneLigne")),
                "couleurMarque": _marque(e.get("couleurMarque")),
                "accentMots": int(_nombre(e.get("accentMots"), 0, 5)),
                "accentCouleur": _couleur(e.get("accentCouleur"), "#3AFFA3"),
                "accentMarque": _marque(e.get("accentMarque")),
            })
        elif e.get("type") == "image":
            src = _url_image(e.get("src"), owner, tid, f"{role}_img{i}")
            if not src:
                continue
            ombre = e.get("ombre") if isinstance(e.get("ombre"), dict) else None
            out["elements"].append({
                **base, "type": "image", "src": src,
                "role": "logo" if e.get("role") == "logo" else "fixe", "rond": bool(e.get("rond")),
                "height": _nombre(e.get("height"), 1, 3 * HAUTEUR, 100),
                "ombre": {
                    "couleur": _couleur(ombre.get("couleur"), "#000000"), "opacite": _nombre(ombre.get("opacite"), 0, 1, .5),
                    "x": _nombre(ombre.get("x"), -200, 200), "y": _nombre(ombre.get("y"), -200, 200),
                    "flou": _nombre(ombre.get("flou"), 0, 300),
                } if ombre else None,
            })
    return out


# ------------------------------------------------------------------ gabarit HTML
def _n(v) -> str:
    """Nombre CSS lisible : 160 plutôt que 160.0."""
    r = round(float(v), 3)
    return str(int(r)) if r == int(r) else str(r)


def _px(v) -> str:
    return f"{_n(v * K)}px"


def _rgba(hexa: str, opacite: float) -> str:
    h = hexa.lstrip("#")
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h[:3])
    if len(h) < 6 or not re.match(r"^[0-9a-fA-F]+$", h[:6]):
        return hexa
    return f"rgba({int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)},{round(opacite, 3)})"


def _fond_css(p: dict) -> str:
    d = p.get("degrade")
    if d:
        return f"linear-gradient({_n(d['angle'])}deg, " + ", ".join(f"{c} {round(o * 100)}%" for o, c in d["stops"]) + ")"
    return p["fond"]


def _contenu_texte(e: dict, role_page: str) -> str:
    """Texte affiché : marqueur du rôle, ou texte fixe échappé."""
    r = e["role"]
    if r in MARQUEURS[role_page]:
        return MARQUEURS[role_page][r]
    if r in COMMUNS:
        return COMMUNS[r]
    txt = _html.escape(e["text"]).replace("{", "&#123;").replace("}", "&#125;")
    if r == "numero":
        return re.sub(r"\d+", "{{numero}}", txt, count=1) if re.search(r"\d", txt) else "{{numero}}"
    return txt


POLICE_TITRE = {"accroche", "titre", "cta"}       # prennent la police des titres choisie
POLICE_CORPS = {"texte", "astuce", "cta_texte"}   # prennent la police du texte choisie


def _familles(pages: list) -> tuple:
    """Police des titres et police du texte telles que dessinées dans le modèle."""
    textes = [e for p in pages for e in p["elements"] if e["type"] == "texte"]
    titre = next((e["fontFamily"] for e in textes if e["role"] in POLICE_TITRE), None)
    corps = next((e["fontFamily"] for e in textes if e["role"] in POLICE_CORPS), None)
    return titre, corps


def _police_de(e: dict, familles: tuple) -> str | None:
    """« titre » ou « corps » : la police choisie dans Contenus/Carrousels remplacera la sienne.
    Un texte fixe suit le groupe dont il partage la police (étiquette, numéro d'étape…)."""
    if e["role"] in POLICE_TITRE:
        return "titre"
    if e["role"] in POLICE_CORPS:
        return "corps"
    if e["fontFamily"] == familles[0]:
        return "titre"
    if e["fontFamily"] == familles[1]:
        return "corps"
    return None


def _bloc(p: dict, familles: tuple = (None, None)) -> str:
    morceaux = [f'<div class="slide" data-role="{p["role"]}" style="position:relative;width:360px;height:450px;'
                f'overflow:hidden;background:{_teinte(_fond_css(p), None if p.get("degrade") else p.get("fondMarque"))}">']
    if p.get("fondImage"):
        morceaux.append(f'<img src="{p["fondImage"]}" alt="" style="position:absolute;left:0;top:0;width:100%;'
                        'height:100%;object-fit:cover">')
    for e in p["elements"]:
        commun = (f"position:absolute;left:{_px(e['x'])};top:{_px(e['y'])};width:{_px(e['width'])};"
                  f"opacity:{_n(e['opacity'])};transform:rotate({_n(e['rotation'])}deg);transform-origin:0 0;")
        if e["type"] == "image":
            o = e.get("ombre")
            filtre = (f"filter:drop-shadow({_px(o['x'])} {_px(o['y'])} {_px(o['flou'])} {_rgba(o['couleur'], o['opacite'])});"
                      if o else "")
            # le logo suit celui de la marque ; rond, il est recadré dans sa pastille
            src = "{{logo}}" if e.get("role") == "logo" else e["src"]
            forme = "border-radius:50%;object-fit:cover;" if e.get("rond") else ""
            morceaux.append(f'<img src="{src}" alt="" style="{commun}height:{_px(e["height"])};{forme}{filtre}">')
        else:
            # un texte fixe tenu sur une ligne (bouton, étiquette) ne passe jamais à la ligne
            ligne = e.get("uneLigne") and e["role"] not in VARIABLES
            style = (f"{commun}height:{_px(e['height'])};margin:0;overflow:hidden;"
                     f"white-space:{'nowrap' if ligne else 'pre-wrap'};"
                     f"overflow-wrap:break-word;font-family:'{e['fontFamily']}',sans-serif;"
                     f"font-size:{_px(e['fontSize'])};font-weight:{700 if e['gras'] else 400};"
                     f"font-style:{'italic' if e['italique'] else 'normal'};color:{_teinte(e['fill'], e.get('couleurMarque'))};"
                     f"text-align:{e['align']};line-height:{_n(e['lineHeight'])};letter-spacing:{_px(e['letterSpacing'])}")
            accent = (f' data-accent-mots="{e["accentMots"]}" data-accent="{_teinte(e["accentCouleur"], e.get("accentMarque"))}"'
                      if e.get("accentMots") else "")
            groupe = _police_de(e, familles)
            police = f' data-police="{groupe}"' if groupe else ""
            morceaux.append(f'<div data-fit{accent}{police} style="{style}">{_contenu_texte(e, p["role"])}</div>')
    morceaux.append("</div>")
    return "".join(morceaux)


def html_depuis_pages(pages: list) -> str:
    """Gabarit au contrat de carrousel_custom : polices en tête, puis les trois blocs."""
    from services.carrousel_service import _CUSTOM_FONTS, _font_face_css
    familles = list(dict.fromkeys(e["fontFamily"] for p in pages for e in p["elements"] if e["type"] == "texte"))
    google = [f for f in familles if f not in _CUSTOM_FONTS]
    tete = _font_face_css(familles)
    if google:
        q = "&".join(f"family={f.replace(' ', '+')}:ital,wght@0,400;0,700;1,400;1,700" for f in google)
        tete = f'<link href="https://fonts.googleapis.com/css2?{q}&display=swap" rel="stylesheet">' + tete
    tete += "<style>body{margin:0}</style>"
    groupes = _familles(pages)
    return tete + "".join(_bloc(p, groupes) for p in pages)


# ------------------------------------------------------------------ persistance
def lister(owner: str) -> list:
    r = supabase.table("carrousel_templates_custom").select("id,label,preview_url,created_at") \
        .eq("owner_id", owner).order("created_at", desc=True).execute()
    return r.data or []


async def creer(owner: str, nom: str, pages: list) -> dict:
    if len(lister(owner)) >= MAX_MODELES:
        raise ModeleInvalide(f"Tu as atteint la limite de {MAX_MODELES} modèles. Supprimes-en un pour en créer un autre.")
    return await _enregistrer(owner, nom, pages)


async def _enregistrer(owner: str, nom: str, pages: list, tid: str | None = None) -> dict:
    from services import carrousel_custom, carrousel_service
    nom = (nom or "").strip()[:60]
    if not nom:
        raise ModeleInvalide("Donne un nom à ton modèle.")
    if not isinstance(pages, list) or len(pages) != 3:
        raise ModeleInvalide("Un modèle se compose de trois slides : couverture, étape et finale.")
    roles = [{str(e.get("role")) for e in (p or {}).get("elements") or [] if isinstance(e, dict)} for p in pages]
    if "accroche" not in roles[0]:
        raise ModeleInvalide("Choisis le texte de la couverture qui recevra l'accroche.")
    if "titre" not in roles[1]:
        raise ModeleInvalide("Choisis le texte de la slide d'étape qui recevra le titre.")

    tid = tid or f"perso-{uuid.uuid4().hex[:10]}"
    propres = [_page(p, r, owner, tid) for p, r in zip(pages, ROLES_PAGES)]
    html = html_depuis_pages(propres)
    erreurs = carrousel_custom.valider(html)
    if erreurs:
        raise ModeleInvalide(" ".join(erreurs))
    apercu = None
    try:
        apercu = await carrousel_service.apercu_custom(tid, html)
    except Exception as e:
        logger.warning(f"vignette modèle {tid}: {e}")
    row = {"id": tid, "label": nom, "html": carrousel_custom.nettoyer(html), "created_by": owner,
           "owner_id": owner, "design": {"v": 1, "w": LARGEUR, "h": HAUTEUR, "pages": propres}}
    if apercu:
        row["preview_url"] = apercu
    supabase.table("carrousel_templates_custom").upsert(row, on_conflict="id").execute()
    return {"id": tid, "label": nom, "preview_url": apercu}


def charger(owner: str, tid: str) -> dict | None:
    """Un modèle du client, avec son design (pour le rouvrir dans l'éditeur)."""
    if not _ID.match(tid or ""):
        return None
    r = supabase.table("carrousel_templates_custom").select("id,label,preview_url,design")         .eq("id", tid).eq("owner_id", owner).limit(1).execute()
    return r.data[0] if r.data else None


async def modifier(owner: str, tid: str, nom: str, pages: list) -> dict | None:
    """Met à jour un modèle existant (design, rôles, nom) : gabarit et vignette refaits."""
    if not charger(owner, tid):
        return None
    return await _enregistrer(owner, nom, pages, tid=tid)


def supprimer(owner: str, tid: str) -> bool:
    if not _ID.match(tid or ""):
        return False
    r = supabase.table("carrousel_templates_custom").delete().eq("id", tid).eq("owner_id", owner).execute()
    if not r.data:
        return False
    try:
        cloudinary.api.delete_resources_by_prefix(f"carrousels/modeles/{owner}/{tid}_")
        cloudinary.uploader.destroy(f"carrousels/_templates/{tid}", resource_type="image")
    except Exception as e:
        logger.warning(f"nettoyage Cloudinary du modèle {tid}: {e}")
    return True
