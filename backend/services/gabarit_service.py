"""
Gabarits de post (feed cohérent) : HTML brandé FIXE -> PNG via Playwright -> Cloudinary.
Le client choisit un gabarit ; seuls le TEXTE et la PHOTO/fond changent. Variables de marque
(accent, logo, nom) injectées. Combinable avec un fond généré par IA / une photo (slot bg_image).

12 gabarits, repris du feed de référence :
statement, acquisition, citation, dashboard, features, phone, services, mission,
integrations, testimonial, people, closing.
"""
import html as _html
import asyncio
import hashlib
import cloudinary
import cloudinary.uploader
from config import CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, logger
from services.agent_service import _charger_marque

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

# 600x600 logique * 1.8 = 1080x1080 (Instagram carré)
GAB_W = GAB_H = 600
DSF = 1.8

# Ordre d'affichage + libellés
GAB_LABELS = {
    "statement": "Accroche",
    "split": "Texte + photo",
    "acquisition": "Acquisition",
    "citation": "Citation",
    "dashboard": "Tableau de bord",
    "features": "Fonctionnalités",
    "phone": "Conversation",
    "services": "Services",
    "mission": "Mission",
    "integrations": "Intégrations",
    "testimonial": "Avis client",
    "people": "Humain",
    "closing": "Signature",
}
GABARITS = list(GAB_LABELS.keys())

# Gabarits qui possèdent une ZONE PHOTO (rendent slots["bg_image"]). Les autres ignorent la photo.
PHOTO_GABARITS = ["statement", "split", "citation", "mission", "testimonial", "people"]

# Vignettes d'aperçu STATIQUES (rendues une fois, neutres) -> chargement instantané du sélecteur.
# Pour les régénérer après ajout/modif d'un gabarit : relancer scripts/render_static_previews.
_STATIC_BASE = f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/image/upload/gabarits/_static"
STATIC_PREVIEWS = {g: f"{_STATIC_BASE}/{g}.png" for g in GABARITS}

_ICONS = {
    "star": '<path d="M12 3l1.9 5.8L20 10l-5.1 3.7L16 20l-4-3.6L8 20l1.1-6.3L4 10l6.1-1.2z"/>',
    "pulse": '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    "bars": '<path d="M4 19V5m6 14V9m6 10V3"/>',
    "home": '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
}
_FEAT_ICONS = ["star", "pulse", "bars"]


def _esc(t):
    return _html.escape(str(t or ""))


def _title_html(lines):
    """lines : [{t, c}] ; c = 'a' (accent2) | 'v' (accent) | None (ink)."""
    out = []
    for ln in (lines or []):
        if isinstance(ln, str):
            ln = {"t": ln}
        cls = ln.get("c")
        span = f'<span class="{cls}">' + _esc(ln.get("t")) + "</span>" if cls in ("a", "v") else _esc(ln.get("t"))
        out.append(span)
    return "<br>".join(out)


def _icon(key):
    return f'<svg viewBox="0 0 24 24" fill="none" stroke-width="2">{_ICONS.get(key, _ICONS["star"])}</svg>'


def _css(b):
    a, a2 = b["accent"], b["accent2"]
    return f"""
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#000;font-family:Inter,sans-serif}}
.frame{{position:relative;width:{GAB_W}px;height:{GAB_H}px;color:#fff;padding:48px;display:flex;flex-direction:column;overflow:hidden;
  background:radial-gradient(120% 90% at 80% 0%, {a}33, transparent 55%),radial-gradient(90% 70% at 0% 100%, {a}1a, transparent 60%), {b['bg']};}}
.top{{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2}}
.eyebrow{{font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#9aa0b5;font-weight:600;text-shadow:0 2px 10px rgba(0,0,0,.4)}}
.label{{display:inline-block;background:{a}26;border:1px solid {a}4d;color:#fff;font-size:11px;font-weight:700;padding:5px 11px;border-radius:999px;backdrop-filter:blur(4px)}}
.logo{{display:flex;align-items:center;gap:9px}}
.logo .g{{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-family:Sora;font-weight:800;font-size:17px;color:#fff;background:radial-gradient(circle at 35% 30%, #ffffff66, {a} 60%);box-shadow:0 0 22px {a}b3;overflow:hidden}}
.logo .g img{{width:100%;height:100%;object-fit:cover}}
.logo b{{font-family:Sora;font-weight:800;font-size:15px;letter-spacing:-.01em;text-shadow:0 2px 10px rgba(0,0,0,.4)}}
.spacer{{flex:1}}
.h{{font-family:Sora;font-weight:800;letter-spacing:-.02em;line-height:1.05;position:relative;z-index:2;text-shadow:0 4px 22px rgba(0,0,0,.4)}}
.h .a{{color:{a2}}} .h .v{{color:{a}}}
.sub{{color:#9aa0b5;font-size:16px;line-height:1.55;position:relative;z-index:2;max-width:92%;text-shadow:0 2px 12px rgba(0,0,0,.5)}}
.photo{{position:absolute;inset:0;z-index:0;background-size:cover;background-position:center}}
.photo::after{{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,7,14,.25),rgba(7,7,14,.92))}}
.orb{{position:absolute;width:230px;height:230px;border-radius:50%;right:-30px;top:90px;background:radial-gradient(circle at 38% 32%, #ffffffcc, {a} 55%, #1c1340 82%);box-shadow:0 0 90px {a}99;display:grid;place-items:center;z-index:1}}
.orb b{{font-family:Sora;font-weight:800;font-size:96px;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.4)}}
.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;position:relative;z-index:2}}
.stat{{background:#101020cc;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px 14px}}
.stat .k{{font-size:11px;color:#5a5f74;text-transform:uppercase;letter-spacing:.08em}}
.stat .n{{font-family:Sora;font-weight:800;font-size:26px;margin-top:8px}}
.stat .n.v{{color:{a}}}
.big{{display:grid;grid-template-columns:1fr 1fr;gap:14px;position:relative;z-index:2}}
.bigc{{background:#101020cc;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:22px}}
.bigc .k{{font-size:13px;color:#9aa0b5}}
.bigc .n{{font-family:Sora;font-weight:800;font-size:36px;margin-top:6px}}
.bigc .n.v{{color:{a}}}
.bars{{display:flex;align-items:flex-end;gap:7px;height:56px;margin-top:14px}}
.bars i{{flex:1;border-radius:4px 4px 0 0;background:linear-gradient(180deg,{a},{a}40)}}
.feat{{display:flex;flex-direction:column;gap:14px;position:relative;z-index:2}}
.fi{{display:flex;align-items:center;gap:14px}}
.fi .ic{{width:42px;height:42px;border-radius:11px;background:{a}24;border:1px solid {a}4d;display:grid;place-items:center;flex-shrink:0}}
.fi .ic svg{{width:20px;height:20px;stroke:{a}}}
.fi .t{{font-size:16.5px;font-weight:600}}
.fi .d{{font-size:13px;color:#9aa0b5}}
.quote{{font-family:Sora;font-weight:700;font-size:30px;line-height:1.25;position:relative;z-index:2;text-shadow:0 3px 18px rgba(0,0,0,.5)}}
.who{{display:flex;align-items:center;gap:12px;position:relative;z-index:2;margin-top:22px}}
.who .av{{width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.2);background:#222}}
.who .nm{{font-weight:700;font-size:15px}}
.who .rl{{color:#9aa0b5;font-size:12.5px}}
.row{{display:flex;gap:22px;align-items:center;position:relative;z-index:2}}
.phone{{width:186px;height:372px;border-radius:30px;border:7px solid #1c1c2c;background:#0c0c18;flex-shrink:0;padding:16px 12px 12px;box-shadow:0 20px 60px {a}4d;overflow:hidden}}
.phone .notch{{width:58px;height:6px;background:#1c1c2c;border-radius:3px;margin:0 auto 16px}}
.bubble{{max-width:82%;padding:9px 12px;border-radius:13px;font-size:11.5px;margin-bottom:9px;line-height:1.3}}
.bubble.in{{background:#1a1a2c;color:#cfd3e6;border-bottom-left-radius:4px}}
.bubble.out{{background:{a};color:#fff;margin-left:auto;border-bottom-right-radius:4px}}
.logos{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;position:relative;z-index:2}}
.logos .lg{{background:#101020cc;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px 10px;text-align:center;font-weight:700;font-size:13.5px;color:#cfd3e6}}
.svc{{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;position:relative;z-index:2}}
.svc .s{{display:flex;align-items:center;gap:10px;background:#101020cc;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:13px 14px;font-size:14px;font-weight:600}}
.svc .s .d{{width:9px;height:9px;border-radius:50%;background:{a};flex-shrink:0}}
.flow{{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#101020cc;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px 14px;position:relative;z-index:2;margin-top:14px}}
.flow .step{{font-size:12px;color:#9aa0b5;text-align:center;flex:1}}
.flow .gmini{{width:38px;height:38px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffffff66,{a} 60%);display:grid;place-items:center;font-family:Sora;font-weight:800;color:#fff;box-shadow:0 0 18px {a}99;flex-shrink:0}}
.flow .arr{{color:#5a5f74;font-size:18px}}
.stars{{color:#ffb020;font-size:22px;letter-spacing:4px;position:relative;z-index:2}}
.statrow{{display:flex;gap:10px;position:relative;z-index:2}}
.statrow .si{{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 8px;text-align:center}}
.statrow .si .n{{font-family:Sora;font-weight:800;font-size:22px;color:{a}}}
.statrow .si .k{{font-size:10px;color:#9aa0b5;margin-top:3px}}
.thumb{{width:46px;height:46px;border-radius:10px;background:linear-gradient(135deg,#2a2440,#14121f);border:1px solid rgba(255,255,255,.08);display:grid;place-items:center;flex-shrink:0}}
.thumb svg{{width:20px;height:20px;stroke:{a}}}
"""


def _logo_mark(b):
    if b.get("logo"):
        return f'<span class="g"><img src="{_esc(b["logo"])}" alt=""></span>'
    return f'<span class="g">{_esc((b.get("nom") or "G")[:1].upper())}</span>'


def _brandbar(b, eyebrow=None, label=None):
    left = f'<span class="label">{_esc(label)}</span>' if label else (f'<span class="eyebrow">{_esc(eyebrow)}</span>' if eyebrow else "<span></span>")
    return f'<div class="top">{left}<span class="logo">{_logo_mark(b)}<b>{_esc(b.get("nom") or "")}</b></span></div>'


def _photo(slots):
    img = slots.get("bg_image")
    return f'<div class="photo" style="background-image:url(\'{_esc(img)}\')"></div>' if img else ""


def _G(b):
    return _esc((b.get("nom") or "G")[:1].upper())


_GRAD = '<div class="photo" style="background-image:linear-gradient(160deg,#241a44,#0a0a16)"></div>'


def _sub(text, style=""):
    if not text:
        return ""
    st = f' style="{style}"' if style else ""
    return f'<p class="sub"{st}>{_esc(text)}</p>'


# --------------------------------------------------------------------------- builders
def _g_statement(s, b):
    eb = s.get("eyebrow") or "Vision"
    orb = "" if s.get("bg_image") else f'<div class="orb"><b>{_G(b)}</b></div>'
    return (f'{_photo(s)}{_brandbar(b, eyebrow=eb)}{orb}'
            f'<div class="spacer"></div>'
            f'<div class="h" style="font-size:52px">{_title_html(s.get("title_lines"))}</div>'
            + _sub(s.get("subtitle"), "margin-top:18px"))


def _g_split(s, b):
    # Texte à gauche, ZONE PHOTO à droite (la photo fournie la remplit, position fixe).
    img = s.get("bg_image")
    bgimg = f"url('{_esc(img)}')" if img else "linear-gradient(160deg,#241a44,#0a0a16)"
    photo = (f'<div style="position:absolute;top:0;right:0;bottom:0;width:54%;z-index:0;'
             f'background-image:{bgimg};background-size:cover;background-position:center"></div>'
             f'<div style="position:absolute;inset:0;z-index:1;'
             f'background:linear-gradient(90deg,{b["bg"]} 0%,{b["bg"]} 40%,{b["bg"]}00 74%)"></div>')
    return (f'{photo}{_brandbar(b, eyebrow=s.get("eyebrow") or "")}'
            f'<div class="spacer"></div>'
            f'<div class="h" style="font-size:44px;max-width:60%">{_title_html(s.get("title_lines"))}</div>'
            + _sub(s.get("subtitle"), "max-width:54%;margin-top:14px"))


def _g_acquisition(s, b):
    cells = "".join(f'<div class="stat"><div class="k">{_esc(x.get("k"))}</div><div class="n{" v" if x.get("v") else ""}">{_esc(x.get("n"))}</div></div>'
                    for x in (s.get("stats") or [])[:4])
    return (f'{_brandbar(b, eyebrow=s.get("eyebrow") or "Acquisition")}'
            f'<div class="h" style="margin-top:26px;font-size:40px">{_title_html(s.get("title_lines"))}</div>'
            f'<div class="spacer"></div><div class="stats">{cells}</div>')


def _g_citation(s, b):
    au = s.get("author") or {}
    av = f'<img class="av" src="{_esc(au.get("photo"))}">' if au.get("photo") else '<span class="av"></span>'
    return (f'{_photo(s)}{_brandbar(b, label=s.get("label") or "Témoignage")}'
            f'<div class="spacer"></div>'
            f'<div class="quote">« {_title_html(s.get("quote_lines"))} »</div>'
            f'<div class="who">{av}<div><div class="nm">{_esc(au.get("name"))}</div><div class="rl">{_esc(au.get("role"))}</div></div></div>')


def _g_dashboard(s, b):
    def card(c):
        bars = "".join(f'<i style="height:{int(h)}%"></i>' for h in (c.get("bars") or [40, 60, 50, 80, 65, 100]))
        return (f'<div class="bigc"><div class="k">{_esc(c.get("k"))}</div>'
                f'<div class="n{" v" if c.get("v") else ""}">{_esc(c.get("n"))}</div><div class="bars">{bars}</div></div>')
    cards = "".join(card(c) for c in (s.get("big") or [])[:2])
    return (f'{_brandbar(b, eyebrow=s.get("eyebrow") or "Vos données")}'
            f'<div class="h" style="margin-top:22px;font-size:36px">{_title_html(s.get("title_lines"))}</div>'
            f'<div class="spacer"></div><div class="big">{cards}</div>')


def _g_features(s, b):
    eb = s.get("eyebrow") or "Boosté par l'IA"
    rows = ""
    for i, f in enumerate((s.get("features") or [])[:3]):
        rows += (f'<div class="fi"><span class="ic">{_icon(_FEAT_ICONS[i % len(_FEAT_ICONS)])}</span>'
                 f'<div><div class="t">{_esc(f.get("t"))}</div><div class="d">{_esc(f.get("d"))}</div></div></div>')
    return (f'{_brandbar(b, eyebrow=eb)}'
            f'<div class="h" style="margin-top:22px;font-size:34px">{_title_html(s.get("title_lines"))}</div>'
            f'<div class="spacer"></div><div class="feat">{rows}</div>')


def _g_phone(s, b):
    eb = s.get("eyebrow") or "Réponse client"
    bub = "".join(f'<div class="bubble {("out" if x.get("side")=="out" else "in")}">{_esc(x.get("t"))}</div>'
                  for x in (s.get("bubbles") or []))
    return (f'{_brandbar(b, eyebrow=eb)}'
            f'<div class="row" style="margin-top:24px">'
            f'<div><div class="h" style="font-size:46px">{_title_html(s.get("title_lines"))}</div>'
            + _sub(s.get("subtitle"), "margin-top:14px;max-width:100%")
            + f'</div><div class="phone"><div class="notch"></div>{bub}</div></div>')


def _g_services(s, b):
    cells = "".join(f'<div class="s"><span class="d"></span>{_esc(x)}</div>' for x in (s.get("services") or [])[:4])
    fl = s.get("flow") or ["Réservation", "Action déclenchée"]
    return (f'{_brandbar(b, eyebrow=s.get("eyebrow") or "Délégation")}'
            f'<div class="h" style="margin-top:22px;font-size:38px">{_title_html(s.get("title_lines"))}</div>'
            f'<div class="spacer"></div><div class="svc">{cells}</div>'
            f'<div class="flow"><div class="step">{_esc(fl[0])}</div><span class="arr">→</span>'
            f'<div class="gmini">{_G(b)}</div><span class="arr">→</span>'
            f'<div class="step">{_esc(fl[-1])}</div></div>')


def _g_mission(s, b):
    cells = "".join(f'<div class="si"><div class="n">{_esc(x.get("n"))}</div><div class="k">{_esc(x.get("k"))}</div></div>'
                    for x in (s.get("statrow") or [])[:4])
    photo = _photo(s) or _GRAD
    sub = _sub(s.get("subtitle"), "margin:14px 0 18px") or '<div style="height:18px"></div>'
    return (f'{photo}{_brandbar(b, label=s.get("label") or "Notre mission")}'
            f'<div class="spacer"></div>'
            f'<div class="h" style="font-size:38px">{_title_html(s.get("title_lines"))}</div>'
            f'{sub}<div class="statrow">{cells}</div>')


def _g_integrations(s, b):
    eb = s.get("eyebrow") or "Intégrations natives"
    lg = "".join(f'<div class="lg">{_esc(x)}</div>' for x in (s.get("logos") or [])[:6])
    return (f'{_brandbar(b, eyebrow=eb)}'
            f'<div class="h" style="margin-top:22px;font-size:36px">{_title_html(s.get("title_lines"))}</div>'
            f'<div class="spacer"></div><div class="logos">{lg}</div>'
            + _sub(s.get("subtitle"), "margin-top:16px"))


def _g_testimonial(s, b):
    au = s.get("author") or {}
    n = int(s.get("stars") or 5)
    stars = "★" * max(1, min(5, n))
    return (f'{_photo(s)}{_brandbar(b, label=s.get("label") or "Nos clients")}'
            f'<div class="spacer"></div><div class="stars">{stars}</div>'
            f'<div class="quote" style="font-size:26px;margin-top:16px">« {_title_html(s.get("quote_lines"))} »</div>'
            f'<div class="who"><span class="thumb">{_icon("home")}</span>'
            f'<div><div class="nm">{_esc(au.get("name"))}</div><div class="rl">{_esc(au.get("role"))}</div></div></div>')


def _g_people(s, b):
    eb = s.get("eyebrow") or "L'équipe"
    photo = _photo(s) or _GRAD
    return (f'{photo}{_brandbar(b, eyebrow=eb)}'
            f'<div class="spacer"></div>'
            f'<div class="h" style="font-size:40px">{_title_html(s.get("title_lines"))}</div>'
            + _sub(s.get("subtitle"), "margin-top:14px"))


def _g_closing(s, b):
    return (f'<div class="orb" style="position:relative;right:auto;top:auto;margin:0 auto 30px"><b>{_G(b)}</b></div>'
            f'<div class="h" style="font-size:42px">{_title_html(s.get("title_lines"))}</div>'
            + _sub(s.get("subtitle"), "margin-top:16px;text-align:center;max-width:82%"))


_BUILDERS = {
    "statement": _g_statement, "split": _g_split, "acquisition": _g_acquisition, "citation": _g_citation,
    "dashboard": _g_dashboard, "features": _g_features, "phone": _g_phone,
    "services": _g_services, "mission": _g_mission, "integrations": _g_integrations,
    "testimonial": _g_testimonial, "people": _g_people, "closing": _g_closing,
}

# Contenu d'exemple pour les vignettes d'aperçu (placeholder par gabarit)
_SAMPLES = {
    "statement": {"eyebrow": "Vision", "title_lines": [{"t": "MOINS"}, {"t": "DE STRESS."}, {"t": "PLUS DE", "c": "a"}, {"t": "RÉSULTATS.", "c": "a"}], "subtitle": "On automatise ce qui te prend du temps."},
    "split": {"eyebrow": "Plus de clients", "title_lines": [{"t": "C'EST PAS"}, {"t": "PLUS GRAND,"}, {"t": "C'EST PLUS LOURD.", "c": "a"}], "subtitle": "La traction, pas la taille."},
    "acquisition": {"eyebrow": "Acquisition", "title_lines": [{"t": "TON MOTEUR"}, {"t": "D'ACQUISITION."}, {"t": "CONNECTÉ. PILOTÉ.", "c": "v"}], "stats": [{"k": "Leads", "n": "2 782", "v": True}, {"k": "CA", "n": "18,4k€"}, {"k": "Conv.", "n": "7,6%", "v": True}, {"k": "RDV", "n": "212"}]},
    "citation": {"label": "Témoignage", "quote_lines": [{"t": "Libère-toi de"}, {"t": "l'opérationnel."}, {"t": "Construis l'essentiel.", "c": "v"}], "author": {"name": "Martin K.", "role": "Fondateur"}},
    "dashboard": {"eyebrow": "Vos données", "title_lines": [{"t": "VOTRE ACTIVITÉ."}, {"t": "VOS DONNÉES."}, {"t": "VOTRE CONTRÔLE.", "c": "v"}], "big": [{"k": "CA du mois", "n": "128 580 €", "bars": [40, 60, 50, 80, 65, 100]}, {"k": "Occupation", "n": "72%", "v": True, "bars": [55, 70, 62, 85, 74, 90]}]},
    "features": {"eyebrow": "Boosté par l'IA", "title_lines": [{"t": "L'INTELLIGENCE"}, {"t": "AU SERVICE DE"}, {"t": "VOTRE PERFORMANCE.", "c": "a"}], "features": [{"t": "Tarification dynamique", "d": "Optimise tes prix en temps réel."}, {"t": "Détection d'anomalies", "d": "Alertes avant que ça dérape."}, {"t": "Suivi de performance", "d": "Tes vrais chiffres, en clair."}]},
    "phone": {"eyebrow": "Réponse client", "title_lines": [{"t": "24/7."}, {"t": "AUTOMATISÉE.", "c": "v"}], "subtitle": "Réponses instantanées, jour et nuit.", "bubbles": [{"side": "in", "t": "Bonjour, à quelle heure le check-in ?"}, {"side": "out", "t": "Bonjour 👋 Check-in dès 16h."}, {"side": "in", "t": "Parfait, merci !"}, {"side": "out", "t": "Avec plaisir ✨"}]},
    "services": {"eyebrow": "Délégation", "title_lines": [{"t": "LA BONNE PERSONNE."}, {"t": "AU BON MOMENT.", "c": "a"}], "services": ["Ménage", "Maintenance", "Check-in", "Linge"], "flow": ["Réservation", "Action déclenchée"]},
    "mission": {"label": "Notre mission", "title_lines": [{"t": "AIDER LES PROS"}, {"t": "À PASSER UN CAP.", "c": "v"}], "subtitle": "Moins d'outils. Plus de croissance.", "statrow": [{"n": "+300", "k": "clients"}, {"n": "+2k", "k": "biens"}, {"n": "98%", "k": "satisfaction"}, {"n": "24/7", "k": "support"}]},
    "integrations": {"eyebrow": "Intégrations natives", "title_lines": [{"t": "TOUT EST CONNECTÉ."}, {"t": "TOUT EST SYNCHRONISÉ.", "c": "v"}], "logos": ["Airbnb", "Booking.com", "Stripe", "WhatsApp", "Smoobu", "Google"], "subtitle": "Plus d'intégrations, moins de friction."},
    "testimonial": {"label": "Nos clients", "stars": 5, "quote_lines": [{"t": "Un temps fou gagné, et notre CA a augmenté de 20%.", "c": None}], "author": {"name": "Julien M.", "role": "Conciergerie Bleue · Annecy"}},
    "people": {"eyebrow": "L'équipe", "title_lines": [{"t": "DES HUMAINS."}, {"t": "VRAI SERVICE."}, {"t": "VRAIE DIFFÉRENCE.", "c": "a"}], "subtitle": "Une équipe qui gère comme si c'était à elle."},
    "closing": {"title_lines": [{"t": "CHAQUE JOUR,"}, {"t": "ON BOSSE POUR VOUS.", "c": "v"}], "subtitle": "Ton outil avance pendant que tu te concentres sur ton métier."},
}


def build_html(gabarit, slots, brand):
    inner = _BUILDERS.get(gabarit, _g_statement)(slots, brand)
    return (f'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
            f'<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
            f'<style>{_css(brand)}</style></head><body><div class="frame">{inner}</div></body></html>')


def _brand_of(telegram_id):
    u = _charger_marque(telegram_id)
    return {
        "accent": (u.get("couleur_accent") or "#7c5cff"),
        "accent2": (u.get("couleur_secondaire") or "#ff2d2d"),
        "bg": "#07070e",
        "logo": u.get("logo_url"),
        "nom": u.get("nom") or u.get("user_name") or "",
    }


def _brand_sig(b):
    return hashlib.md5(f"{b['accent']}|{b['accent2']}|{b.get('logo')}|{b.get('nom')}".encode()).hexdigest()[:10]


# --------------------------------------------------------------------------- rendu
def _launch(pw):
    args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    try:
        return pw.chromium.launch(args=args)
    except Exception:
        return pw.chromium.launch(channel="chromium", args=args)


def _render_one(telegram_id, gabarit, slots, brand):
    from playwright.sync_api import sync_playwright
    html_str = build_html(gabarit, slots, brand)
    with sync_playwright() as pw:
        browser = _launch(pw)
        page = browser.new_page(viewport={"width": GAB_W, "height": GAB_H}, device_scale_factor=DSF)
        page.set_content(html_str, wait_until="networkidle")
        try:
            page.evaluate("document.fonts.ready")
        except Exception:
            pass
        png = page.locator(".frame").screenshot(type="png")
        browser.close()
    up = cloudinary.uploader.upload(png, resource_type="image", folder=f"gabarits/{telegram_id}",
                                    public_id=(slots.get("public_id") or f"post_{gabarit}"), overwrite=True, invalidate=True)
    return up["secure_url"]


def _render_previews(telegram_id, brand, sig):
    """Rend les 12 gabarits (contenu d'exemple) en UNE page -> 12 screenshots -> Cloudinary."""
    from playwright.sync_api import sync_playwright
    frames = "".join(f'<div class="frame">{_BUILDERS[g](_SAMPLES.get(g, {}), brand)}</div>' for g in GABARITS)
    html_str = (f'<!DOCTYPE html><html><head><meta charset="utf-8">'
                f'<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
                f'<style>{_css(brand)} body{{display:flex;flex-wrap:wrap;gap:0}}</style></head><body>{frames}</body></html>')
    out = {}
    with sync_playwright() as pw:
        browser = _launch(pw)
        page = browser.new_page(viewport={"width": GAB_W, "height": GAB_H * 2}, device_scale_factor=1)
        page.set_content(html_str, wait_until="networkidle")
        try:
            page.evaluate("document.fonts.ready")
        except Exception:
            pass
        for i, g in enumerate(GABARITS):
            try:
                png = page.locator(".frame").nth(i).screenshot(type="png")
                up = cloudinary.uploader.upload(png, resource_type="image", folder=f"gabarits/{telegram_id}/_preview",
                                                public_id=f"{g}_{sig}", overwrite=True, invalidate=True)
                out[g] = up["secure_url"]
            except Exception as e:
                logger.warning(f"preview {g}: {e}")
        browser.close()
    return out


_PREVIEW_CACHE = {}


def _thumb(url: str, size: int = 240) -> str:
    """URL Cloudinary redimensionnée + optimisée (q_auto + WebP) pour des vignettes légères."""
    if url and "/upload/" in url:
        return url.replace("/upload/", f"/upload/c_fill,w_{size},h_{size},q_auto,f_auto/", 1)
    return url


def _thumbs(d: dict) -> dict:
    return {k: _thumb(v) for k, v in (d or {}).items()}


async def render_gabarit(telegram_id: str, gabarit: str, slots: dict) -> dict:
    if gabarit not in _BUILDERS:
        return {"ok": False, "error": "Gabarit inconnu."}
    brand = _brand_of(telegram_id)
    try:
        url = await asyncio.to_thread(_render_one, telegram_id, gabarit, slots or {}, brand)
        return {"ok": True, "url": url}
    except Exception as e:
        logger.error(f"render_gabarit error {telegram_id}/{gabarit}: {e}")
        return {"ok": False, "error": "Échec du rendu du visuel."}


async def previews(telegram_id: str) -> dict:
    """Vignettes d'aperçu STATIQUES (instantanées). Elles montrent la mise en page ;
    le visuel final utilise les vraies couleurs de la marque."""
    return {"previews": _thumbs(STATIC_PREVIEWS), "labels": GAB_LABELS, "photo": PHOTO_GABARITS}
