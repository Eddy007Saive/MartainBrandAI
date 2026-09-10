# -*- coding: utf-8 -*-
"""
Miniatures (couvertures) des reels : une image IA + le texte posé par nous.

Pourquoi deux couches : les générateurs d'images écrivent mal (fautes, accents,
lettres tordues). Le fond est donc généré par nano-banana (la personne du client,
depuis sa photo de profil, mise en scène selon le gabarit), puis le texte est
composé en HTML et capturé par Playwright, avec les polices et couleurs de la
marque : lisible, sans faute, cohérent avec les carrousels. Et moins cher : une
image du quota, le texte ne coûte rien (« Changer le texte » recompose sans
régénérer le fond).

Huit gabarits, calqués sur ce qui marche sur YouTube / Instagram : affiche, action,
allongé, grande action, objet flottant, écran partagé, mot géant, objet en main.

La miniature devient la couverture du reel : `contenu.lien_visuel` et
`video_preview_url` (vignette dans Postorico), `reel_data.miniature` (mémoire des
choix), et late_service l'envoie comme `thumbnail` à Instagram (YouTube n'accepte
pas de miniature sur un Short, TikTok se règle par instant de la vidéo).
"""
import html as _html
import json
import re
from datetime import datetime, timezone

import cloudinary
import cloudinary.uploader

from config import supabase, logger, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
from services.agent_service import _charger_marque, _messages_create, _texte

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

# Chaque gabarit : la scène du fond (avec la personne du client, ou sans photo),
# la disposition du texte (layout), et les textes qu'il attend.
GABARITS = [
    {"id": "affiche", "layout": "titre-bas", "textes": ["kicker", "titre", "sous"],
     "scene": "Cinematic movie-poster shot: the person from the reference photo in the foreground, chest up, looking straight at the camera with a confident face, dramatic warm backlight, dark moody environment related to the subject, shallow depth of field. Keep the bottom third of the frame darker and empty for text.",
     "scene_sans_photo": "Cinematic movie-poster shot of a striking object or place related to the subject, dramatic warm backlight, dark moody environment, shallow depth of field. Bottom third darker and empty for text."},
    {"id": "action", "layout": "coin", "textes": ["titre"],
     "scene": "Dynamic action scene: the person from the reference photo caught mid-movement (turning, pointing, reacting), slight motion blur on the background, high-contrast dramatic lighting, gritty realistic look, wide vertical framing.",
     "scene_sans_photo": "Dynamic action scene related to the subject, objects in motion, slight motion blur, high-contrast dramatic lighting, realistic, wide vertical framing."},
    {"id": "allonge", "layout": "centre", "textes": ["titre", "sous"],
     "scene": "Top-down view: the person from the reference photo lying on their back on a patterned vintage rug, arms relaxed, looking up at the camera with a calm smile, a few objects related to the subject scattered around, soft even daylight, playful magazine editorial style. Keep the centre of the frame calm for a title.",
     "scene_sans_photo": "Top-down flat-lay on a patterned vintage rug: objects related to the subject arranged around an empty centre, soft daylight, playful magazine editorial style."},
    {"id": "grande-action", "layout": "geant", "textes": ["titre"],
     "scene": "The person from the reference photo jumping high mid-air, full body, joyful, sneakers visible, in front of a flat single-colour studio background (one bold saturated colour), hard clean light, sporty energy, no props.",
     "scene_sans_photo": "An object related to the subject tossed mid-air, frozen motion, in front of a flat single-colour studio background (one bold saturated colour), hard clean light."},
    {"id": "objet-flottant", "layout": "haut-neon", "textes": ["titre", "sous", "objet"],
     "scene": "The person from the reference photo looking amazed at {objet} floating and glowing above their open hand, dark futuristic room with subtle neon rim light, cinematic, the top quarter of the frame dark and empty for a title.",
     "scene_sans_photo": "{objet} floating and glowing above a dark futuristic table, subtle neon rim light, cinematic, the top quarter of the frame dark and empty for a title."},
    {"id": "ecran-partage", "layout": "bande", "textes": ["titre", "sous"],
     "scene": "Two-part composition: lower half, the person from the reference photo seated at a desk, looking at the camera with a slight smile, wearing a cap, soft key light; upper half, blurred abstract app interface screens and charts floating on a dark background. Calm, clean, the middle band free for a title.",
     "scene_sans_photo": "Two-part composition: lower half, a clean desk with a laptop related to the subject, soft key light; upper half, blurred abstract app interface screens on a dark background. The middle band free for a title."},
    {"id": "mot-geant", "layout": "mot-geant", "textes": ["kicker", "titre"],
     "scene": "Close portrait of the person from the reference photo from the chest up, holding a tablet or tool related to the subject, dark workshop background, bold high-contrast lighting, the upper half of the frame dark and empty for one huge word.",
     "scene_sans_photo": "Close shot of a tool or object related to the subject on a dark workshop background, bold high-contrast lighting, the upper half of the frame dark and empty for one huge word."},
    {"id": "objet-main", "layout": "aucun", "textes": ["objet"],
     "scene": "The person from the reference photo proudly holding {objet} in both hands, big smile, standing in front of a wall completely covered with the same kind of objects, bright even studio light, joyful, slightly surreal.",
     "scene_sans_photo": "{objet} presented on a pedestal in front of a wall completely covered with the same kind of objects, bright even studio light, joyful, slightly surreal."},
]
_PAR_ID = {g["id"]: g for g in GABARITS}
RATIOS = {"9:16": (360, 640, 3), "16:9": (640, 360, 2)}   # viewport x échelle -> 1080x1920 / 1280x720
# Le style de l'image : le gabarit dit QUOI montrer (scène, cadrage), le style dit COMMENT.
# La personne de la photo reste reconnaissable dans tous les styles (le générateur stylise
# sans changer le visage). `photo` garde le garde-fou réalisme d'image_service, les autres non.
STYLES = {
    "photo":   {"photo": True,  "texte": "Photorealistic, high detail, natural skin texture, thumbnail-grade contrast."},
    "cinema":  {"photo": True,  "texte": "Cinematic film still: anamorphic look, teal and orange grading, volumetric light, subtle film grain, high contrast."},
    "3d":      {"photo": False, "texte": "Stylised 3D render like a modern animated feature film (Pixar-like): soft rounded shapes, expressive face, glossy materials, warm studio lighting. Keep the person recognisable as a 3D character."},
    "illustration": {"photo": False, "texte": "Bold flat vector illustration with clean shapes, thick outlines, limited vivid palette, subtle paper grain, editorial poster look. Keep the person recognisable in a simplified drawn style."},
    "neon":    {"photo": True,  "texte": "Dark cyberpunk mood: deep blacks, magenta and cyan neon rim lights, wet reflections, haze, dramatic high contrast, futuristic."},
    "pop":     {"photo": False, "texte": "Pop-art comic style: halftone dots, bold black outlines, saturated primary colours, high energy, print texture. Keep the person recognisable."},
}
LANGUES = {"fr": "French", "en": "English", "es": "Spanish"}

# Polices de titre (Google Fonts, libres de droits) : une par caractère de miniature. Les
# polices de films (Harry Potter, Star Wars…) sont protégées ; on prend leur équivalent libre.
POLICES = {
    "impact":    {"famille": "Anton",             "gf": "Anton",                         "poids": 400, "maj": True},
    "cinema":    {"famille": "Bebas Neue",        "gf": "Bebas+Neue",                    "poids": 400, "maj": True},
    "comics":    {"famille": "Bangers",           "gf": "Bangers",                       "poids": 400, "maj": True},
    "elegant":   {"famille": "Playfair Display",  "gf": "Playfair+Display:ital,wght@0,900;1,900", "poids": 900, "maj": False},
    "tech":      {"famille": "Orbitron",          "gf": "Orbitron:wght@900",             "poids": 900, "maj": True},
    "fantasy":   {"famille": "Cinzel Decorative", "gf": "Cinzel+Decorative:wght@900",    "poids": 900, "maj": False},
    "manuscrit": {"famille": "Permanent Marker",  "gf": "Permanent+Marker",              "poids": 400, "maj": False},
    "retro":     {"famille": "Righteous",         "gf": "Righteous",                     "poids": 400, "maj": True},
}
POLICE_DEFAUT = {"affiche": "cinema", "action": "impact", "allonge": "elegant", "grande-action": "comics",
                 "objet-flottant": "tech", "ecran-partage": "elegant", "mot-geant": "impact", "objet-main": "impact"}


def gabarits() -> list:
    return [{"id": g["id"], "layout": g["layout"], "textes": g["textes"], "police": POLICE_DEFAUT.get(g["id"], "impact")} for g in GABARITS]


def polices() -> list:
    return [{"id": k, "famille": v["famille"]} for k, v in POLICES.items()]


def styles() -> list:
    return list(STYLES.keys())


# ------------------------------------------------------------------ textes proposés
def proposer_textes(telegram_id: str, contenu: dict) -> dict:
    """Kicker / titre / sous-titre / objet, dans la langue du compte, à partir du reel."""
    u = _charger_marque(telegram_id)
    langue = LANGUES.get((u.get("langue") or "fr").lower(), "French")
    sc = contenu.get("reel_data") or {}
    plans = " / ".join((s.get("texte") or "") for s in (sc.get("segments") or []) if s.get("texte"))
    sujet = (contenu.get("contenu") or contenu.get("titre") or "")[:1500]
    resp = _messages_create(
        model="claude-haiku-4-5", max_tokens=300,
        system=(f"You write YouTube/Instagram thumbnail text for a small business owner. Language of the texts: {langue.upper()}. "
                "Punchy, concrete, no hype words, no emoji, no quotes, no trailing period. Return STRICT JSON: "
                '{"kicker": "1 to 3 words, small label above the title", "titre": "2 to 4 words, THE promise, uppercase-friendly", '
                '"sous": "2 to 5 words, the twist or the benefit", "objet": "in ENGLISH: a short noun phrase for one iconic object that symbolises the subject, e.g. a giant golden key"}'),
        messages=[{"role": "user", "content": f"Subject of the video:\n{sujet}\n\nOn-screen texts of the video: {plans[:600]}\n\nBrand: {u.get('nom') or ''} ({u.get('secteur') or ''})."}],
    )
    raw = _texte(resp)
    try:
        d = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    except Exception:
        d = {}
    return {"kicker": str(d.get("kicker") or "")[:30], "titre": str(d.get("titre") or contenu.get("titre") or "")[:50],
            "sous": str(d.get("sous") or "")[:50], "objet": str(d.get("objet") or "a glowing object")[:60]}


# ------------------------------------------------------------------ composition du texte
def _css(layout: str, brand: dict, ratio: str, police: str = "impact") -> str:
    acc = brand.get("accent") or "#3AFFA3"
    horiz = ratio == "16:9"
    po = POLICES.get(police) or POLICES["impact"]
    base = f"""
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=Inter:wght@500;600;700&family=Caveat:wght@700&family={po['gf']}&display=swap');
    html,body{{margin:0;padding:0;background:#000;}}
    .m{{position:relative;width:100vw;height:100vh;overflow:hidden;font-family:'Sora',sans-serif;color:#fff;}}
    .m img.fond{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}}
    .voile{{position:absolute;inset:0;}}
    .txt{{position:absolute;left:0;right:0;text-align:center;padding:0 6rem;word-wrap:break-word;}}
    .kicker{{font-family:'Inter',sans-serif;font-weight:700;letter-spacing:.28em;text-transform:uppercase;font-size:2.4rem;opacity:.9;}}
    .titre{{font-family:'{po['famille']}',sans-serif;font-weight:{po['poids']};text-transform:{'uppercase' if po['maj'] else 'none'};line-height:.98;letter-spacing:-.01em;text-shadow:0 .6rem 2.4rem rgba(0,0,0,.55);}}
    .sous{{font-family:'Inter',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:{acc};text-shadow:0 .4rem 1.6rem rgba(0,0,0,.5);}}
    """
    L = {
        "titre-bas": f"""
    .voile{{background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.82) 100%);}}
    .txt{{bottom:{'9%' if horiz else '8%'};text-align:left;}}
    .kicker{{margin-bottom:1.2rem;}} .titre{{font-size:{'8.5rem' if horiz else '11.5rem'};}} .sous{{font-size:{'4.4rem' if horiz else '5.6rem'};margin-top:1.2rem;}}""",
        "coin": f"""
    .voile{{background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 40%);}}
    .txt{{top:6%;text-align:left;}} .titre{{font-size:{'6.5rem' if horiz else '8rem'};}}""",
        "centre": f"""
    .voile{{background:radial-gradient(ellipse at center,rgba(0,0,0,.45) 0%,rgba(0,0,0,.05) 70%);}}
    .txt{{top:50%;transform:translateY(-50%);}} .titre{{font-size:{'9rem' if horiz else '12.5rem'};}}
    .sous{{font-family:'Caveat',cursive;text-transform:none;font-weight:700;font-size:{'7rem' if horiz else '9.5rem'};letter-spacing:0;margin-top:.4rem;}}""",
        "geant": f"""
    .voile{{background:rgba(0,0,0,.12);}}
    .txt{{top:50%;transform:translateY(-50%) rotate(-7deg);padding:0 3rem;}}
    .titre{{font-style:italic;font-weight:800;font-size:{'11rem' if horiz else '15rem'};line-height:.9;text-shadow:.5rem .5rem 0 rgba(0,0,0,.55),0 1rem 3rem rgba(0,0,0,.45);}}""",
        "haut-neon": f"""
    .voile{{background:linear-gradient(180deg,rgba(0,0,0,.75) 0%,rgba(0,0,0,0) 40%);}}
    .txt{{top:6%;}} .titre{{font-size:{'8.5rem' if horiz else '11rem'};color:{acc};text-shadow:0 0 2rem {acc}99,0 0 6rem {acc}66,0 .4rem 1.2rem rgba(0,0,0,.7);}}
    .sous{{color:#fff;font-size:{'4rem' if horiz else '5rem'};margin-top:1rem;}}""",
        "bande": f"""
    .voile{{background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.6) 50%,rgba(0,0,0,0) 70%);}}
    .txt{{top:{'44%' if horiz else '46%'};transform:translateY(-50%);}}
    .titre{{font-size:{'9rem' if horiz else '11rem'};line-height:1;}}
    .sous{{color:#fff;font-size:{'3.4rem' if horiz else '4.2rem'};letter-spacing:.18em;margin-top:1rem;}}""",
        "mot-geant": f"""
    .voile{{background:linear-gradient(180deg,rgba(0,0,0,.7) 0%,rgba(0,0,0,0) 55%);}}
    .txt{{top:{'8%' if horiz else '11%'};}} .kicker{{margin-bottom:1.6rem;}}
    .titre{{font-size:{'13rem' if horiz else '19rem'};line-height:.9;letter-spacing:-.04em;}}""",
        "aucun": ".voile{background:transparent;} .txt{display:none;}",
    }
    return base + L.get(layout, L["titre-bas"])


def _html_miniature(fond_url: str, layout: str, textes: dict, brand: dict, ratio: str, police: str = "impact") -> str:
    e = _html.escape
    blocs = ""
    if textes.get("kicker") and layout in ("titre-bas", "mot-geant"):
        blocs += f'<div class="kicker">{e(textes["kicker"])}</div>'
    if textes.get("titre") and layout != "aucun":
        blocs += f'<div class="titre">{e(textes["titre"])}</div>'
    if textes.get("sous") and layout in ("titre-bas", "centre", "haut-neon", "bande"):
        blocs += f'<div class="sous">{e(textes["sous"])}</div>'
    return (f"<!doctype html><html><head><meta charset='utf-8'><style>{_css(layout, brand, ratio, police)}</style></head>"
            f"<body><div class='m'><img class='fond' src='{e(fond_url)}'><div class='voile'></div>"
            f"<div class='txt'>{blocs}</div></div></body></html>")


def composer(fond_url: str, layout: str, textes: dict, brand: dict, ratio: str = "9:16", police: str = "impact") -> bytes:
    """Fond + texte -> PNG (1080x1920 ou 1280x720). Le titre rétrécit s'il déborde."""
    from playwright.sync_api import sync_playwright
    w, h, dsf = RATIOS.get(ratio, RATIOS["9:16"])
    html_str = _html_miniature(fond_url, layout, textes, brand, ratio, police).replace("<html>", f"<html style='font-size:{w / 100}px'>")
    args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(args=args)
        except Exception:
            browser = pw.chromium.launch(channel="chromium", args=args)
        page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=dsf)
        page.set_content(html_str, wait_until="load")
        try:
            page.evaluate("() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 8000))])")
            page.wait_for_function("document.querySelector('img.fond').complete", timeout=15000)
        except Exception:
            pass
        page.wait_for_timeout(250)
        # le texte ne doit jamais déborder : on rétrécit jusqu'à tenir dans 92 % de la largeur
        page.evaluate("""() => {
          const box = document.querySelector('.txt'); if (!box) return;
          const maxW = window.innerWidth * 0.92, maxH = window.innerHeight * 0.55;
          for (let i = 0; i < 40; i++) {
            const r = box.getBoundingClientRect();
            const large = Array.from(box.children).some(c => c.scrollWidth > maxW) || r.height > maxH;
            if (!large) break;
            box.querySelectorAll('.titre,.sous,.kicker').forEach(el => { const s = parseFloat(getComputedStyle(el).fontSize); el.style.fontSize = (s * 0.94) + 'px'; });
          }
        }""")
        page.wait_for_timeout(60)
        png = page.screenshot(type="png", full_page=False)
        browser.close()
    return png


# ------------------------------------------------------------------ pipeline
def _contenu(telegram_id: str, contenu_id: str) -> dict:
    r = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).limit(1).execute()
    if not r.data:
        raise ValueError("Reel introuvable.")
    c = r.data[0]
    if c.get("type") != "Reel":
        raise ValueError("Ce contenu n'est pas un reel.")
    return c


def _brand(u: dict) -> dict:
    return {"principale": u.get("couleur_principale") or "#5B6CFF", "accent": u.get("couleur_accent") or "#3AFFA3"}


async def generer_fond(telegram_id: str, contenu: dict, gabarit_id: str, textes: dict, ratio: str, modele: str = "nano2", style: str = "photo") -> str:
    """L'image de fond (nano-banana), avec la photo du client si elle existe. Retourne l'URL."""
    from services import image_service
    g = _PAR_ID.get(gabarit_id) or GABARITS[0]
    u = _charger_marque(telegram_id)
    avec_photo = bool(u.get("photo_url"))
    scene = (g["scene"] if avec_photo else g["scene_sans_photo"]).replace("{objet}", textes.get("objet") or "a glowing object")
    sujet = (contenu.get("contenu") or contenu.get("titre") or "")[:400].replace("\n", " ")
    orient = "Vertical 9:16 composition, full-bleed, no borders." if ratio != "16:9" else "Horizontal 16:9 composition, full-bleed, no borders."
    st = STYLES.get(style) or STYLES["photo"]
    prompt = (f"{scene}\n\nSubject of the video, for context only (do NOT write any of it as text): {sujet}\n"
              f"{orient} STYLE: {st['texte']} ABSOLUTELY NO TEXT, NO LETTERS, NO LOGOS, NO WATERMARK anywhere in the image.")
    # Styles non photographiques : on coupe le garde-fou « réalisme photo » d'image_service
    # (template_mode, sans référence, ne fait rien d'autre).
    res = await image_service.generer_image(telegram_id, prompt, avec_photo, image_service.IMAGE_MODELS.get(modele, image_service.IMAGE_MODELS["nano2"]),
                                            None, refs=[], ratio=("16:9" if ratio == "16:9" else "9:16"), template_mode=not st["photo"],
                                            public_id=f"miniatures/{telegram_id}/{contenu['id']}-fond-{int(datetime.now(timezone.utc).timestamp())}")
    if res.get("error"):
        raise RuntimeError(res["error"])
    return res["lien_visuel"]


def finaliser(telegram_id: str, contenu: dict, fond_url: str, gabarit_id: str, textes: dict, ratio: str, style: str = "photo", police: str = None) -> dict:
    """Compose le texte, dépose la miniature, en fait la couverture du reel."""
    g = _PAR_ID.get(gabarit_id) or GABARITS[0]
    u = _charger_marque(telegram_id)
    police = police if police in POLICES else POLICE_DEFAUT.get(g["id"], "impact")
    png = composer(fond_url, g["layout"], textes, _brand(u), ratio, police)
    up = cloudinary.uploader.upload(png, resource_type="image", public_id=f"miniatures/{telegram_id}/{contenu['id']}",
                                    overwrite=True, invalidate=True)
    # Servie optimisée par Cloudinary (1,6 Mo de PNG -> ~240 Ko en WebP/AVIF) : c'est cette
    # adresse qui devient la couverture, la vignette dans Contenus et le thumbnail Instagram.
    url = up["secure_url"].replace("/upload/", "/upload/q_auto,f_auto/", 1)
    # l'ancien fond, s'il change, est supprimé (pas d'accumulation)
    ancien = ((contenu.get("reel_data") or {}).get("miniature") or {}).get("fond")
    if ancien and ancien != fond_url:
        m = re.search(r"/upload/(?:v\d+/)?(.+)\.[a-z0-9]+$", ancien, re.I)
        if m:
            try:
                cloudinary.uploader.destroy(m.group(1), resource_type="image", invalidate=True)
            except Exception as e:
                logger.warning(f"miniature: ancien fond non supprimé: {e}")
    mini = {"url": url, "fond": fond_url, "gabarit": g["id"], "textes": textes, "ratio": ratio, "style": style if style in STYLES else "photo", "police": police,
            "date": datetime.now(timezone.utc).isoformat()}
    rd = dict(contenu.get("reel_data") or {}); rd["miniature"] = mini
    supabase.table("contenu").update({"reel_data": rd, "lien_visuel": url, "video_preview_url": url}).eq("id", contenu["id"]).execute()
    return mini
