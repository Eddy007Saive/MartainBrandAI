"""
Carrousel : 6 templates de slides (HTML brandé) -> PNG via Playwright + PDF (LinkedIn) -> Cloudinary.

Option 2 : le HTML des templates est FIXE ; Claude ne produit que le CONTENU structuré
(hook / idées avec pills+pro_tip / cta). Les couleurs viennent du profil client, le logo aussi.
Contenu attendu : {"hook": str, "slides": [{"titre","texte","pills":[],"pro_tip"}], "cta": {"titre","texte"}}
"""
import html as _html
from io import BytesIO
from PIL import Image
import cloudinary
import cloudinary.uploader
from config import (
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, logger,
)
from services.agent_service import _charger_marque

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

# Rendu à 360×450 ×3 = 1080×1350 (4:5) -> on réutilise tel quel les tailles des maquettes.
SLIDE_W, SLIDE_H, DSF = 360, 450, 3

TEMPLATES = ["creme", "sombre", "alterne", "editorial", "pop", "clean"]


def _esc(t: str) -> str:
    return _html.escape(t or "").replace("\n", "<br>")


def _av_span(logo: str, initial: str, fallback_bg: str, ink: str) -> str:
    if logo:
        return ('<span class="av" style="background:#fff;padding:3px;overflow:hidden">'
                f'<img src="{logo}" style="width:100%;height:100%;object-fit:contain" alt=""></span>')
    return f'<span class="av" style="background:{fallback_bg};color:{ink}">{_esc(initial)}</span>'


# ---- utils couleur ----
def _to_rgb(h):
    h = (h or "#000000").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return (0, 0, 0)


def _to_hex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(x)))) for x in rgb)


def _mix(c1, c2, t):
    r1, r2 = _to_rgb(c1), _to_rgb(c2)
    return _to_hex(tuple(r1[i] * (1 - t) + r2[i] * t for i in range(3)))


def _lighten(h, t):
    return _mix(h, "#ffffff", t)


def _darken(h, t):
    return _mix(h, "#000000", t)


def _luma(h):
    r, g, b = _to_rgb(h)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def _ink_on(bg):
    """Texte lisible (noir/blanc) sur un fond donné."""
    return "#0d1512" if _luma(bg) > 0.6 else "#ffffff"


# ---- contenu ----
def _parts(content):
    if isinstance(content, list):  # rétro-compat : ancienne liste de slides
        sl = content or []
        hook = (sl[0].get("titre") or sl[0].get("texte")) if sl else ""
        cta = sl[-1] if len(sl) > 1 else {}
        return hook, sl[1:-1], {"titre": cta.get("titre", "On en parle ?"), "texte": cta.get("texte", "")}
    c = content or {}
    cta = c.get("cta") or {}
    if isinstance(cta, str):
        cta = {"titre": cta, "texte": ""}
    return c.get("hook") or "", c.get("slides") or [], {"titre": cta.get("titre") or "On en parle ?", "texte": cta.get("texte") or ""}


def _dots(n, idx):
    return "".join('<i class="on"></i>' if k == idx else '<i></i>' for k in range(n))


def _pills(pills, cls="pill"):
    return "".join(f'<span class="{cls}">{_esc(p)}</span>' for p in (pills or [])[:4])


def build_html(content, p, s, a, nom, secteur, template="creme", logo=None):
    secteur = (secteur or "").strip()
    if len(secteur) > 42:
        secteur = secteur[:42].rstrip() + "…"
    fn = {
        "creme": _tpl_creme, "sombre": _tpl_sombre, "alterne": _tpl_alterne,
        "editorial": _tpl_editorial, "pop": _tpl_pop, "clean": _tpl_clean,
        # alias des anciens noms
        "bold": _tpl_sombre, "instagram": _tpl_clean,
    }.get(template, _tpl_creme)
    return fn(content, p, s, a, nom, secteur, logo)


# =============================================================================
# Famille "référence" : titre Anton condensé + bandeau étape + pills + PRO TIP
# =============================================================================
def _ref_css(bg, bg2, ink, mut, line, accent, accent_ink, anton=True):
    head = ('<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
            if anton else
            '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">')
    disp = "Anton" if anton else "Inter"
    weight = "400" if anton else "800"
    return head, f'''<style>
  *{{box-sizing:border-box;margin:0}}
  body{{margin:0;font-family:Inter,sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;background:{bg};color:{ink};overflow:hidden;position:relative;display:flex;flex-direction:column;padding:34px 30px 56px}}
  .cta-slide{{background:{bg2}}}
  .tag{{align-self:flex-start;background:{accent};color:{accent_ink};font-weight:700;font-size:11px;letter-spacing:2px;padding:6px 12px;border-radius:6px;text-transform:uppercase}}
  .grow{{flex:1}}
  h1{{font-family:{disp};font-weight:{weight};font-size:50px;line-height:.96;letter-spacing:.3px;text-transform:uppercase;margin-top:16px}}
  h2{{font-family:{disp};font-weight:{weight};font-size:39px;line-height:.97;letter-spacing:.3px;text-transform:uppercase;margin:12px 0}}
  .sub{{font-size:15px;color:{mut};line-height:1.5;margin-top:13px;max-width:90%}}
  .pills{{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}}
  .pill{{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:{accent};color:{accent_ink};padding:6px 11px;border-radius:6px}}
  .protip{{margin-top:15px;border-top:1px solid {line};padding-top:12px}}
  .protip .lbl{{font-size:10px;font-weight:700;letter-spacing:2px;color:{accent_ink};background:{accent};display:inline-block;padding:3px 8px;border-radius:4px;text-transform:uppercase}}
  .protip p{{font-size:13px;color:{mut};line-height:1.5;margin-top:7px}}
  .bar{{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;padding:0 30px 22px}}
  .dots{{display:flex;gap:6px}}
  .dots i{{width:7px;height:7px;border-radius:50%;background:{line}}}
  .dots i.on{{background:{accent};width:22px;border-radius:5px}}
  .swipe{{font-size:11px;font-weight:700;letter-spacing:1.5px;color:{accent_ink};text-transform:uppercase}}
  .cnt{{font-size:11px;color:{mut};font-weight:600}}
  .foot{{display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:600;color:{ink}}}
  .av{{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-family:{disp};font-size:14px}}
  .foot small{{color:{mut};font-weight:500;display:block;font-size:11px}}
  .cta-btn{{align-self:flex-start;background:{accent};color:{accent_ink};font-weight:700;font-size:14px;padding:13px 24px;border-radius:8px;margin-top:18px;text-transform:uppercase;letter-spacing:.5px}}
</style>'''


def _ref_slides(content, nom, secteur, logo, ink, accent, accent_ink, swipe_on_dark=False):
    hook, slides, cta = _parts(content)
    n = 2 + len(slides)
    initial = (nom or "?")[:1].upper()
    foot = (f'<div class="foot">{_av_span(logo, initial, accent, accent_ink)}'
            f'<div>{_esc(nom)}<small>{_esc(secteur)}</small></div></div>')
    out = []
    # hero
    out.append(
        f'<div class="slide"><span class="tag">Carrousel</span>'
        f'<div class="grow" style="display:flex;flex-direction:column;justify-content:center">'
        f'<h1>{_esc(hook)}</h1></div>'
        f'<div class="bar">{foot}<span class="swipe">Swipe →</span></div></div>'
    )
    # idées
    for i, sl in enumerate(slides):
        pills = f'<div class="pills">{_pills(sl.get("pills"))}</div>' if sl.get("pills") else ""
        protip = (f'<div class="protip"><span class="lbl">Pro tip</span><p>{_esc(sl.get("pro_tip"))}</p></div>'
                  if sl.get("pro_tip") else "")
        txt = f'<p class="sub">{_esc(sl.get("texte"))}</p>' if sl.get("texte") and not protip and not pills else ""
        out.append(
            f'<div class="slide"><span class="tag">Étape {i+1:02d}</span><div class="grow"></div>'
            f'<h2>{_esc(sl.get("titre"))}</h2>{txt}{pills}{protip}'
            f'<div class="bar"><div class="dots">{_dots(n, i+1)}</div><span class="cnt">{i+2}/{n}</span></div></div>'
        )
    # cta
    out.append(
        f'<div class="slide cta-slide"><span class="tag">À toi de jouer</span>'
        f'<div class="grow" style="display:flex;flex-direction:column;justify-content:center">'
        f'<h2>{_esc(cta["titre"])}</h2>'
        + (f'<p class="sub">{_esc(cta["texte"])}</p>' if cta["texte"] else "")
        + f'<span class="cta-btn">Lien en bio →</span></div>'
        f'<div class="bar">{foot}<div class="dots">{_dots(n, n-1)}</div></div></div>'
    )
    return "\n".join(out)


def _tpl_creme(content, p, s, a, nom, secteur, logo):
    accent = a or "#3AFFA3"
    accent_ink = p or "#003D2E"
    bg = _mix(p or accent, "#ffffff", 0.93)
    bg2 = _mix(p or accent, "#ffffff", 0.88)
    line = _mix(p or accent, "#ffffff", 0.78)
    ink, mut = "#14201b", "#5d655e"
    head, css = _ref_css(bg, bg2, ink, mut, line, accent, accent_ink)
    body = _ref_slides(content, nom, secteur, logo, ink, accent, accent_ink)
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{body}</body></html>'


def _tpl_sombre(content, p, s, a, nom, secteur, logo):
    accent = a or "#3AFFA3"
    accent_ink = p or "#003D2E"
    bg = _darken(p or "#06301f", 0.45)
    bg2 = _darken(p or "#06301f", 0.38)
    line = "rgba(255,255,255,.14)"
    ink, mut = "#eef1ec", "rgba(255,255,255,.66)"
    head, css = _ref_css(bg, bg2, ink, mut, line, accent, accent_ink)
    # accent text (swipe/cnt) doit rester lisible sur sombre -> on force accent comme couleur
    css = css.replace(f"color:{accent_ink};text-transform:uppercase}}\n  .cnt", f"color:{accent};text-transform:uppercase}}\n  .cnt")
    body = _ref_slides(content, nom, secteur, logo, ink, accent, accent_ink)
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{body}</body></html>'


def _tpl_alterne(content, p, s, a, nom, secteur, logo):
    accent = a or "#3AFFA3"
    accent_ink = p or "#003D2E"
    cream = _mix(p or accent, "#ffffff", 0.93)
    creamln = _mix(p or accent, "#ffffff", 0.78)
    dark = _darken(p or "#06301f", 0.45)
    head = '<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
    css = f'''<style>
  *{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:34px 30px 56px}}
  .lt{{background:{cream};color:#14201b}} .dk{{background:{dark};color:#eef1ec}}
  .tag{{align-self:flex-start;background:{accent};color:{accent_ink};font-weight:700;font-size:11px;letter-spacing:2px;padding:6px 12px;border-radius:6px;text-transform:uppercase}}
  .grow{{flex:1}}
  h1{{font-family:Anton;font-size:50px;line-height:.96;letter-spacing:.3px;text-transform:uppercase;margin-top:16px}}
  h2{{font-family:Anton;font-size:39px;line-height:.97;letter-spacing:.3px;text-transform:uppercase;margin:12px 0}}
  .sub{{font-size:15px;line-height:1.5;margin-top:13px;max-width:90%}} .lt .sub{{color:#5d655e}} .dk .sub{{color:rgba(255,255,255,.66)}}
  .pills{{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}}
  .pill{{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:6px 11px;border-radius:6px}}
  .lt .pill{{background:{accent};color:{accent_ink}}} .dk .pill{{background:rgba(58,255,163,.14);color:{accent};border:1px solid rgba(58,255,163,.3)}}
  .protip{{margin-top:15px;padding-top:12px}} .lt .protip{{border-top:1px solid {creamln}}} .dk .protip{{border-top:1px solid rgba(255,255,255,.14)}}
  .protip .lbl{{font-size:10px;font-weight:700;letter-spacing:2px;color:{accent_ink};background:{accent};display:inline-block;padding:3px 8px;border-radius:4px;text-transform:uppercase}}
  .protip p{{font-size:13px;line-height:1.5;margin-top:7px}} .lt .protip p{{color:#5d655e}} .dk .protip p{{color:rgba(255,255,255,.66)}}
  .bar{{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;padding:0 30px 22px}}
  .dots{{display:flex;gap:6px}} .dots i{{width:7px;height:7px;border-radius:50%}}
  .lt .dots i{{background:{creamln}}} .dk .dots i{{background:rgba(255,255,255,.2)}}
  .dots i.on{{width:22px;border-radius:5px;background:{accent}}}
  .swipe{{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}} .lt .swipe{{color:{accent_ink}}} .dk .swipe{{color:{accent}}}
  .cnt{{font-size:11px;font-weight:600}} .lt .cnt{{color:#5d655e}} .dk .cnt{{color:rgba(255,255,255,.6)}}
  .foot{{display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:600}}
  .av{{width:28px;height:28px;border-radius:50%;background:{accent};color:{accent_ink};display:grid;place-items:center;font-family:Anton;font-size:14px}}
  .foot small{{font-weight:500;display:block;font-size:11px}} .lt .foot small{{color:#5d655e}} .dk .foot small{{color:rgba(255,255,255,.66)}}
  .cta-btn{{align-self:flex-start;background:{accent};color:{accent_ink};font-weight:700;font-size:14px;padding:13px 24px;border-radius:8px;margin-top:18px;text-transform:uppercase;letter-spacing:.5px}}
</style>'''
    hook, slides, cta = _parts(content)
    n = 2 + len(slides)
    initial = (nom or "?")[:1].upper()
    av = _av_span(logo, initial, accent, accent_ink)
    out = [f'<div class="slide lt"><span class="tag">Carrousel</span>'
           f'<div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h1>{_esc(hook)}</h1></div>'
           f'<div class="bar"><div class="foot">{av}<div>{_esc(nom)}<small>{_esc(secteur)}</small></div></div><span class="swipe">Swipe →</span></div></div>']
    for i, sl in enumerate(slides):
        kind = "dk" if i % 2 == 0 else "lt"
        pills = f'<div class="pills">{_pills(sl.get("pills"))}</div>' if sl.get("pills") else ""
        protip = (f'<div class="protip"><span class="lbl">Pro tip</span><p>{_esc(sl.get("pro_tip"))}</p></div>'
                  if sl.get("pro_tip") else "")
        txt = f'<p class="sub">{_esc(sl.get("texte"))}</p>' if sl.get("texte") and not protip and not pills else ""
        out.append(f'<div class="slide {kind}"><span class="tag">Étape {i+1:02d}</span><div class="grow"></div>'
                   f'<h2>{_esc(sl.get("titre"))}</h2>{txt}{pills}{protip}'
                   f'<div class="bar"><div class="dots">{_dots(n, i+1)}</div><span class="cnt">{i+2}/{n}</span></div></div>')
    out.append(f'<div class="slide lt"><span class="tag">À toi de jouer</span>'
               f'<div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h2>{_esc(cta["titre"])}</h2>'
               + (f'<p class="sub">{_esc(cta["texte"])}</p>' if cta["texte"] else "")
               + f'<span class="cta-btn">Lien en bio →</span></div>'
               f'<div class="bar"><div class="foot">{av}<div>{_esc(nom)}<small>{_esc(secteur)}</small></div></div><div class="dots">{_dots(n, n-1)}</div></div></div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{"".join(out)}</body></html>'


# =============================================================================
# Editorial (serif Fraunces, crème + vert)
# =============================================================================
def _tpl_editorial(content, p, s, a, nom, secteur, logo):
    green = p or "#003D2E"
    mint = a or "#3AFFA3"
    cream = _mix(green, "#ffffff", 0.94)
    ink = "#14201b"
    hook, slides, cta = _parts(content)
    n = 2 + len(slides)
    initial = (nom or "?")[:1].upper()
    head = '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    css = f'''<style>
  *{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:36px 32px 50px}}
  .lt{{background:{cream};color:{ink}}} .dk{{background:{green};color:{cream}}}
  .kick{{font-size:10px;letter-spacing:3px;text-transform:uppercase;font-weight:600;opacity:.6}}
  .rule{{height:1px;background:currentColor;opacity:.18;margin:13px 0}}
  .grow{{flex:1}}
  h1{{font-family:Fraunces;font-weight:600;font-size:36px;line-height:1.08;letter-spacing:-.3px}}
  h2{{font-family:Fraunces;font-weight:600;font-size:27px;line-height:1.13;margin-bottom:10px}}
  p{{font-size:14px;line-height:1.55;opacity:.8}}
  .num{{font-family:Fraunces;font-weight:500;font-size:42px;color:{mint};line-height:1;margin-bottom:6px}} .lt .num{{color:{green}}}
  .pills{{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}}
  .pill{{font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;border:1px solid currentColor;opacity:.7;padding:4px 9px;border-radius:20px}}
  .pg{{font-family:Fraunces;font-size:13px;opacity:.5}} .pg b{{color:{green}}} .dk .pg b{{color:{mint}}}
  .foot{{display:flex;align-items:center;gap:9px;font-size:12px}}
  .av{{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-family:Fraunces;font-weight:600;font-size:13px}}
  .cta-chip{{display:inline-block;margin-top:16px;border:1.5px solid {green};color:{green};padding:9px 18px;border-radius:30px;font-size:13px;font-weight:600}}
</style>'''
    av = _av_span(logo, initial, mint, green)
    out = [f'<div class="slide lt"><div class="kick">Carrousel</div><div class="rule"></div>'
           f'<div class="grow" style="display:flex;align-items:center"><h1>{_esc(hook)}</h1></div>'
           f'<div class="rule"></div><div class="foot">{av}<div><b>{_esc(nom)}</b> · {_esc(secteur)}</div></div></div>']
    for i, sl in enumerate(slides):
        kind = "dk" if i % 2 == 0 else "lt"
        pills = f'<div class="pills">{_pills(sl.get("pills"))}</div>' if sl.get("pills") else ""
        out.append(f'<div class="slide {kind}"><div style="display:flex;justify-content:space-between">'
                   f'<span class="kick">Idée {i+1:02d}</span><span class="pg"><b>{i+2:02d}</b> / {n:02d}</span></div>'
                   f'<div class="grow"></div><div class="num">{i+1:02d}</div><h2>{_esc(sl.get("titre"))}</h2>'
                   + (f'<p>{_esc(sl.get("texte"))}</p>' if sl.get("texte") else "") + pills + '</div>')
    out.append(f'<div class="slide lt"><div class="kick">À toi de jouer</div><div class="rule"></div>'
               f'<div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h2>{_esc(cta["titre"])}</h2>'
               + (f'<p>{_esc(cta["texte"])}</p>' if cta["texte"] else "")
               + f'<span class="cta-chip">Lien en bio →</span></div>'
               f'<div class="rule"></div><div class="foot">{av}<div><b>{_esc(nom)}</b> · {_esc(secteur)}</div></div></div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{"".join(out)}</body></html>'


# =============================================================================
# Pop (fonds pleins colorés, Sora bold)
# =============================================================================
def _tpl_pop(content, p, s, a, nom, secteur, logo):
    green = p or "#003D2E"
    blue = s or "#0077FF"
    mint = a or "#3AFFA3"
    hook, slides, cta = _parts(content)
    n = 2 + len(slides)
    initial = (nom or "?")[:1].upper()
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
    css = f'''<style>
  *{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:32px 30px 30px}}
  .top{{display:flex;align-items:center;justify-content:space-between}}
  .badge{{font-family:Sora;font-weight:800;font-size:12px;letter-spacing:.5px;padding:5px 11px;border-radius:30px}}
  .grow{{flex:1}}
  h1{{font-family:Sora;font-weight:800;font-size:37px;line-height:1.04;letter-spacing:-1px}}
  h2{{font-family:Sora;font-weight:800;font-size:26px;line-height:1.08;letter-spacing:-.5px;margin-bottom:10px}}
  p{{font-size:14px;line-height:1.5;font-weight:500;opacity:.92}}
  .num{{font-family:Sora;font-weight:800;font-size:84px;line-height:.8;letter-spacing:-3px;opacity:.16}}
  .pills{{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}}
  .pill{{font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:5px 10px;border-radius:30px;background:rgba(255,255,255,.16)}}
  .dots{{display:flex;gap:6px;margin-top:16px}} .dots i{{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.3}} .dots i.on{{opacity:1;width:20px;border-radius:6px}}
  .foot{{display:flex;align-items:center;gap:9px;font-family:Sora;font-weight:700;font-size:14px;margin-top:12px}}
  .av{{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-weight:800;font-size:14px}}
  .swipe{{font-family:Sora;font-weight:800;font-size:13px;letter-spacing:1px}}
  .cta-btn{{display:inline-flex;align-items:center;gap:8px;background:#fff;color:{blue};font-family:Sora;font-weight:800;font-size:15px;padding:13px 24px;border-radius:14px;margin-top:16px;width:max-content}}
</style>'''

    def bgkind(i):
        return [("background:%s;color:%s" % (mint, _ink_on(mint)), "mint"),
                ("background:%s;color:#fff" % green, "green")][i % 2]

    def badge_style(name):
        if name == "mint":
            return f"background:{green};color:{mint}"
        return f"background:{mint};color:{green}"
    av_bg = mint
    out = []
    st, _ = (f"background:{mint};color:{_ink_on(mint)}", "mint")
    out.append(f'<div class="slide" style="{st}"><div class="top"><span class="badge" style="{badge_style("mint")}">CARROUSEL</span><span class="swipe">SWIPE →</span></div>'
               f'<div class="grow" style="display:flex;align-items:center"><h1>{_esc(hook)}</h1></div>'
               f'<div class="foot"><span class="av" style="{badge_style("mint")}">{_esc(initial)}</span> {_esc(nom)}</div>'
               f'<div class="dots">{_dots(n,0)}</div></div>')
    for i, sl in enumerate(slides):
        style, name = bgkind(i)
        pills = f'<div class="pills">{_pills(sl.get("pills"))}</div>' if sl.get("pills") else ""
        out.append(f'<div class="slide" style="{style}"><div class="top"><span class="badge" style="{badge_style(name)}">ÉTAPE {i+1:02d}</span><span class="swipe">→</span></div>'
                   f'<div class="grow"></div><div class="num">{i+1:02d}</div><h2>{_esc(sl.get("titre"))}</h2>'
                   + (f'<p>{_esc(sl.get("texte"))}</p>' if sl.get("texte") else "") + pills
                   + f'<div class="dots">{_dots(n,i+1)}</div></div>')
    out.append(f'<div class="slide" style="background:{blue};color:#fff"><div class="top"><span class="badge" style="background:#fff;color:{blue}">À TOI</span></div>'
               f'<div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h2>{_esc(cta["titre"])}</h2>'
               + (f'<p>{_esc(cta["texte"])}</p>' if cta["texte"] else "")
               + f'<span class="cta-btn">Lien en bio →</span></div>'
               f'<div class="foot"><span class="av" style="background:#fff;color:{blue}">{_esc(initial)}</span> {_esc(nom)}</div>'
               f'<div class="dots">{_dots(n,n-1)}</div></div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{"".join(out)}</body></html>'


# =============================================================================
# Clean (light/dark + barre de progression + flèche, Plus Jakarta Sans)
# =============================================================================
def _tpl_clean(content, p, s, a, nom, secteur, logo):
    green = p or "#003D2E"
    mint = a or "#3AFFA3"
    lbg = _mix(green, "#ffffff", 0.93)
    dbg = _darken(green, 0.5)
    grad = f"linear-gradient(165deg,{green} 0%,{_mix(green, mint, .4)} 60%,{mint} 130%)"
    ink = "#181a1f"
    hook, slides, cta = _parts(content)
    n = 2 + len(slides)
    initial = (nom or "?")[:1].upper()
    chev = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
    head = '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
    css = f'''<style>
  *{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:'Plus Jakarta Sans',sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:34px 30px 50px}}
  .lt{{background:{lbg};color:{ink}}} .dk{{background:{dbg};color:#fff}} .gr{{background:{grad};color:#fff}}
  .center{{justify-content:center}} .end{{justify-content:flex-end}} .grow{{flex:1}}
  .kick{{font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:{mint};margin-bottom:12px}}
  h1{{font-size:33px;font-weight:800;line-height:1.12;letter-spacing:-.5px}}
  h2{{font-size:25px;font-weight:700;line-height:1.16;letter-spacing:-.3px;margin-bottom:10px}}
  p{{font-size:14px;line-height:1.55}} .lt p{{color:rgba(0,0,0,.55)}} .dk p,.gr p{{color:rgba(255,255,255,.74)}}
  .num{{font-size:38px;font-weight:300;color:{mint};line-height:1;margin-bottom:6px}}
  .pills{{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}}
  .pill{{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:5px 10px;border-radius:20px}}
  .lt .pill{{background:{mint};color:{green}}} .dk .pill,.gr .pill{{background:rgba(255,255,255,.12);color:#fff}}
  .lockup{{display:flex;align-items:center;gap:9px}}
  .av{{width:32px;height:32px;border-radius:50%;background:{mint};color:{green};display:grid;place-items:center;font-weight:800;font-size:14px;overflow:hidden}}
  .lk-nm{{font-size:14px;font-weight:700}} .lk-hd{{font-size:11px;opacity:.6}}
  .ctabtn{{display:inline-flex;align-items:center;gap:7px;background:{lbg};color:{green};font-weight:700;font-size:14px;padding:11px 22px;border-radius:26px;width:max-content;margin-top:16px}}
  .pbar{{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:0 30px 20px}}
  .track{{flex:1;height:4px;border-radius:9px;overflow:hidden}} .lt .track{{background:rgba(0,0,0,.08)}} .dk .track,.gr .track{{background:rgba(255,255,255,.16)}}
  .fill{{height:100%;border-radius:9px}} .lt .fill{{background:{mint}}} .dk .fill,.gr .fill{{background:#fff}}
  .cnt{{font-size:12px;font-weight:600}} .lt .cnt{{color:rgba(0,0,0,.35)}} .dk .cnt,.gr .cnt{{color:rgba(255,255,255,.5)}}
  .swipe{{position:absolute;top:0;right:0;bottom:0;width:44px;display:flex;align-items:center;justify-content:flex-end;padding-right:12px;color:rgba(0,0,0,.22)}} .dk .swipe{{color:rgba(255,255,255,.4)}}
</style>'''
    av = _av_span(logo, initial, mint, green)

    def pbar(idx):
        pct = (idx + 1) / n * 100
        return f'<div class="pbar"><div class="track"><div class="fill" style="width:{pct:.0f}%"></div></div><span class="cnt">{idx+1}/{n}</span></div>'
    out = [f'<div class="slide lt center"><div class="kick">Carrousel</div><h1>{_esc(hook)}</h1><div class="grow"></div>'
           f'<div class="lockup">{av}<div><div class="lk-nm">{_esc(nom)}</div><div class="lk-hd">{_esc(secteur)}</div></div></div>'
           f'<div class="swipe">{chev}</div>{pbar(0)}</div>']
    for i, sl in enumerate(slides):
        kind = "dk" if i % 2 == 0 else "lt"
        numcol = "" if kind == "dk" else f' style="color:{green}"'
        pills = f'<div class="pills">{_pills(sl.get("pills"))}</div>' if sl.get("pills") else ""
        out.append(f'<div class="slide {kind} end"><div class="num"{numcol}>{i+1:02d}</div><h2>{_esc(sl.get("titre"))}</h2>'
                   + (f'<p>{_esc(sl.get("texte"))}</p>' if sl.get("texte") else "") + pills
                   + f'<div class="swipe">{chev}</div>{pbar(i+1)}</div>')
    out.append(f'<div class="slide gr center"><div class="lockup">{av}<div><div class="lk-nm">{_esc(nom)}</div>'
               f'<div class="lk-hd" style="color:rgba(255,255,255,.7)">{_esc(secteur)}</div></div></div><div class="grow"></div>'
               f'<h2>{_esc(cta["titre"])}</h2>'
               + (f'<p>{_esc(cta["texte"])}</p>' if cta["texte"] else "")
               + f'<span class="ctabtn">Lien en bio →</span>{pbar(n-1)}</div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{"".join(out)}</body></html>'


# =============================================================================
# Rendu Playwright + PDF + upload Cloudinary
# =============================================================================
def _render_and_upload(telegram_id, content, p, s, a, nom, secteur, base, template="creme", logo=None):
    from playwright.sync_api import sync_playwright
    html_str = build_html(content, p, s, a, nom, secteur, template, logo)
    urls, pngs = [], []
    with sync_playwright() as pw:
        args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        try:
            browser = pw.chromium.launch(args=args)
        except Exception:
            browser = pw.chromium.launch(channel="chromium", args=args)
        page = browser.new_page(viewport={"width": SLIDE_W, "height": SLIDE_H}, device_scale_factor=DSF)
        page.set_content(html_str, wait_until="networkidle")
        try:
            page.evaluate("document.fonts.ready")
        except Exception:
            pass
        count = page.locator(".slide").count()
        for i in range(count):
            png = page.locator(".slide").nth(i).screenshot(type="png")
            pngs.append(png)
            up = cloudinary.uploader.upload(
                png, resource_type="image", folder=f"carrousels/{telegram_id}",
                public_id=f"{base}_s{i+1}", overwrite=True,
            )
            urls.append(up["secure_url"])
        browser.close()

    pdf_url = None
    try:
        imgs = [Image.open(BytesIO(b)).convert("RGB") for b in pngs]
        if imgs:
            buf = BytesIO()
            imgs[0].save(buf, format="PDF", save_all=True, append_images=imgs[1:], resolution=150.0)
            up = cloudinary.uploader.upload(
                buf.getvalue(), resource_type="image", folder=f"carrousels/{telegram_id}",
                public_id=f"{base}_doc", format="pdf", overwrite=True,
            )
            pdf_url = up["secure_url"]
    except Exception as e:
        logger.error(f"carrousel pdf error: {e}")
    return {"images": urls, "pdf": pdf_url}


async def generer_carrousel(telegram_id: int, content, contenu_id: str = None, template: str = "creme") -> dict:
    """content structuré -> images + PDF -> {"images":[...], "pdf":url}. Rendu dans un thread."""
    import asyncio
    u = _charger_marque(telegram_id)
    p = u.get("couleur_principale") or "#003D2E"
    s = u.get("couleur_secondaire") or "#0077FF"
    a = u.get("couleur_accent") or "#3AFFA3"
    nom = u.get("nom") or u.get("username") or ""
    secteur = u.get("secteur") or ""
    logo = u.get("logo_url") or None
    base = (contenu_id or "tmp").replace("-", "")[:16]
    return await asyncio.to_thread(_render_and_upload, telegram_id, content, p, s, a, nom, secteur, base, template, logo)
