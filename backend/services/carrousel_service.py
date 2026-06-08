"""
Carrousel : 6 templates de slides (HTML brandé) -> PNG via Playwright + PDF (LinkedIn) -> Cloudinary.

Option 2 : HTML des templates FIXE ; Claude ne produit que le CONTENU structuré
{"hook", "slides":[{"titre","texte","pills":[],"pro_tip"}], "cta":{"titre","texte"}}.
Couleurs du client + logo injectés. CONTRASTE AUTOMATIQUE : la couleur du texte est
calculée selon la luminosité du fond (toujours lisible), les fonds "sombres" sont
forcés en quasi-noir teinté.
"""
import html as _html
from io import BytesIO
from PIL import Image
import cloudinary
import cloudinary.uploader
from config import CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, logger
from services.agent_service import _charger_marque

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

SLIDE_W, SLIDE_H, DSF = 360, 450, 3  # 1080×1350
TEMPLATES = ["creme", "sombre", "alterne", "editorial", "pop", "clean", "neon"]


def _esc(t):
    return _html.escape(t or "").replace("\n", "<br>")


def _av_span(logo, initial, fallback_bg, ink):
    if logo:
        return ('<span class="av" style="background:#fff;padding:3px;overflow:hidden">'
                f'<img src="{logo}" style="width:100%;height:100%;object-fit:contain" alt=""></span>')
    return f'<span class="av" style="background:{fallback_bg};color:{ink}">{_esc(initial)}</span>'


# ---- couleur ----
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


def _lum(h):
    r, g, b = _to_rgb(h)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def _ink_on(bg):
    return "#12150f" if _lum(bg) > 0.6 else "#ffffff"


def _acc_light(a):   # accent lisible sur fond clair
    return a if _lum(a) < 0.62 else _darken(a, 0.5)


def _acc_dark(a):    # accent lisible sur fond sombre
    return a if _lum(a) > 0.34 else _lighten(a, 0.42)


def _near(p):        # fond quasi-noir teinté (toujours sombre)
    return _mix(p, "#0a0c0b", 0.85)


# ---- contenu ----
def _parts(content):
    if isinstance(content, list):
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


def _pills(pills):
    return "".join(f'<span class="pill">{_esc(p)}</span>' for p in (pills or [])[:4])


def build_html(content, p, s, a, nom, secteur, template="creme", logo=None):
    secteur = (secteur or "").strip()
    if len(secteur) > 42:
        secteur = secteur[:42].rstrip() + "…"
    fn = {"creme": _tpl_creme, "sombre": _tpl_sombre, "alterne": _tpl_alterne,
          "editorial": _tpl_editorial, "pop": _tpl_pop, "clean": _tpl_clean, "neon": _tpl_neon,
          "bold": _tpl_sombre, "instagram": _tpl_clean}.get(template, _tpl_creme)
    return fn(content, p, s, a, nom, secteur, logo)


def _two_tone(t, acc):
    w = (t or "").split(" ")
    if len(w) < 2:
        return f'<span style="color:{acc}">{_esc(t)}</span>'
    c = (len(w) + 1) // 2
    return f'{_esc(" ".join(w[:c]))} <span style="color:{acc}">{_esc(" ".join(w[c:]))}</span>'


# =============================================================================
# Famille référence (Anton condensé + bandeau étape + pills + PRO TIP)
# =============================================================================
def _ref(content, p, a, nom, secteur, logo, bg, bg2, ink, mut, line, accent_text):
    A = a
    Aink = _ink_on(A)
    n = 2 + len(_parts(content)[1])
    hook, slides, cta = _parts(content)
    initial = (nom or "?")[:1].upper()
    foot = (f'<div class="foot" style="color:{ink}">{_av_span(logo, initial, A, Aink)}'
            f'<div><div class="nm">{_esc(nom)}</div><div class="hd" style="color:{mut}">{_esc(secteur)}</div></div></div>')
    css = f'''<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>
  *{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;background:{bg};color:{ink};overflow:hidden;position:relative;display:flex;flex-direction:column;padding:34px 30px 56px}}
  .cta-slide{{background:{bg2}}}
  .tag{{align-self:flex-start;background:{A};color:{Aink};font-weight:700;font-size:11px;letter-spacing:2px;padding:6px 12px;border-radius:6px;text-transform:uppercase}}
  .grow{{flex:1}}
  h1{{font-family:Anton;font-size:50px;line-height:.96;letter-spacing:.3px;text-transform:uppercase;margin-top:16px}}
  h2{{font-family:Anton;font-size:39px;line-height:.97;letter-spacing:.3px;text-transform:uppercase;margin:12px 0}}
  .sub{{font-size:15px;color:{mut};line-height:1.5;margin-top:13px;max-width:90%}}
  .pills{{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}}
  .pill{{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:{A};color:{Aink};padding:6px 11px;border-radius:6px}}
  .protip{{margin-top:15px;border-top:1px solid {line};padding-top:12px}}
  .protip .lbl{{font-size:10px;font-weight:700;letter-spacing:2px;color:{Aink};background:{A};display:inline-block;padding:3px 8px;border-radius:4px;text-transform:uppercase}}
  .protip p{{font-size:13px;color:{mut};line-height:1.5;margin-top:7px}}
  .bar{{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;padding:0 30px 22px}}
  .dots{{display:flex;gap:6px}} .dots i{{width:7px;height:7px;border-radius:50%;background:{line}}} .dots i.on{{background:{accent_text};width:22px;border-radius:5px}}
  .swipe{{font-size:11px;font-weight:700;letter-spacing:1.5px;color:{accent_text};text-transform:uppercase}}
  .cnt{{font-size:11px;color:{mut};font-weight:600}}
  .foot{{display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:600}}
  .av{{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-family:Anton;font-size:14px}}
  .foot .nm{{font-weight:600}} .foot .hd{{font-size:11px;font-weight:500}}
  .cta-btn{{align-self:flex-start;background:{A};color:{Aink};font-weight:700;font-size:14px;padding:13px 24px;border-radius:8px;margin-top:18px;text-transform:uppercase;letter-spacing:.5px}}
</style>'''
    out = [f'<div class="slide"><span class="tag">Carrousel</span><div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h1>{_esc(hook)}</h1></div><div class="bar">{foot}<span class="swipe">Swipe →</span></div></div>']
    for i, sl in enumerate(slides):
        pills = f'<div class="pills">{_pills(sl.get("pills"))}</div>' if sl.get("pills") else ""
        protip = f'<div class="protip"><span class="lbl">Pro tip</span><p>{_esc(sl.get("pro_tip"))}</p></div>' if sl.get("pro_tip") else ""
        txt = f'<p class="sub">{_esc(sl.get("texte"))}</p>' if sl.get("texte") and not protip and not pills else ""
        out.append(f'<div class="slide"><span class="tag">Étape {i+1:02d}</span><div class="grow"></div><h2>{_esc(sl.get("titre"))}</h2>{txt}{pills}{protip}<div class="bar"><div class="dots">{_dots(n, i+1)}</div><span class="cnt">{i+2}/{n}</span></div></div>')
    out.append(f'<div class="slide cta-slide"><span class="tag">À toi de jouer</span><div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h2>{_esc(cta["titre"])}</h2>'
               + (f'<p class="sub">{_esc(cta["texte"])}</p>' if cta["texte"] else "")
               + f'<span class="cta-btn">Lien en bio →</span></div><div class="bar">{foot}<div class="dots">{_dots(n, n-1)}</div></div></div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{css}</head><body>{"".join(out)}</body></html>'


def _tpl_creme(content, p, s, a, nom, secteur, logo):
    p = p or "#003D2E"
    return _ref(content, p, a or "#3AFFA3", nom, secteur, logo,
                bg=_lighten(p, .93), bg2=_lighten(p, .88), ink="#14201b", mut="#5d655e",
                line=_mix(p, "#ffffff", .78), accent_text=_acc_light(a or "#3AFFA3"))


def _tpl_sombre(content, p, s, a, nom, secteur, logo):
    p = p or "#003D2E"
    return _ref(content, p, a or "#3AFFA3", nom, secteur, logo,
                bg=_near(p), bg2=_mix(p, "#0a0c0b", .78), ink="#ffffff", mut="rgba(255,255,255,.66)",
                line="rgba(255,255,255,.15)", accent_text=_acc_dark(a or "#3AFFA3"))


def _tpl_alterne(content, p, s, a, nom, secteur, logo):
    p = p or "#003D2E"; A = a or "#3AFFA3"; Aink = _ink_on(A)
    CREAM = _lighten(p, .93); CLINE = _mix(p, "#ffffff", .78); NEAR = _near(p)
    accL = _acc_light(A); accD = _acc_dark(A)
    hook, slides, cta = _parts(content); n = 2 + len(slides)
    initial = (nom or "?")[:1].upper(); av = _av_span(logo, initial, A, Aink)
    css = f'''<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>
  *{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:34px 30px 56px}}
  .lt{{background:{CREAM};color:#14201b}} .dk{{background:{NEAR};color:#fff}}
  .tag{{align-self:flex-start;background:{A};color:{Aink};font-weight:700;font-size:11px;letter-spacing:2px;padding:6px 12px;border-radius:6px;text-transform:uppercase}}
  .grow{{flex:1}}
  h1{{font-family:Anton;font-size:50px;line-height:.96;text-transform:uppercase;margin-top:16px}}
  h2{{font-family:Anton;font-size:39px;line-height:.97;text-transform:uppercase;margin:12px 0}}
  .pills{{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}}
  .pill{{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:{A};color:{Aink};padding:6px 11px;border-radius:6px}}
  .protip{{margin-top:15px;padding-top:12px}} .lt .protip{{border-top:1px solid {CLINE}}} .dk .protip{{border-top:1px solid rgba(255,255,255,.15)}}
  .protip .lbl{{font-size:10px;font-weight:700;letter-spacing:2px;color:{Aink};background:{A};display:inline-block;padding:3px 8px;border-radius:4px;text-transform:uppercase}}
  .protip p{{font-size:13px;line-height:1.5;margin-top:7px}} .lt .protip p{{color:#5d655e}} .dk .protip p{{color:rgba(255,255,255,.66)}}
  .bar{{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;padding:0 30px 22px}}
  .dots{{display:flex;gap:6px}} .dots i{{width:7px;height:7px;border-radius:50%}} .lt .dots i{{background:{CLINE}}} .dk .dots i{{background:rgba(255,255,255,.2)}}
  .lt .dots i.on{{width:22px;border-radius:5px;background:{accL}}} .dk .dots i.on{{width:22px;border-radius:5px;background:{accD}}}
  .swipe{{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:{accL}}}
  .cnt{{font-size:11px;font-weight:600}} .lt .cnt{{color:#5d655e}} .dk .cnt{{color:rgba(255,255,255,.6)}}
  .foot{{display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:600}}
  .av{{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-family:Anton;font-size:14px}}
  .foot small{{font-weight:500;display:block;font-size:11px}} .lt .foot small{{color:#5d655e}} .dk .foot small{{color:rgba(255,255,255,.66)}}
  .cta-btn{{align-self:flex-start;background:{A};color:{Aink};font-weight:700;font-size:14px;padding:13px 24px;border-radius:8px;margin-top:18px;text-transform:uppercase;letter-spacing:.5px}}
</style>'''
    out = [f'<div class="slide lt"><span class="tag">Carrousel</span><div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h1>{_esc(hook)}</h1></div><div class="bar"><div class="foot">{av}<div>{_esc(nom)}<small>{_esc(secteur)}</small></div></div><span class="swipe">Swipe →</span></div></div>']
    for i, sl in enumerate(slides):
        kind = "dk" if i % 2 == 0 else "lt"
        pills = f'<div class="pills">{_pills(sl.get("pills"))}</div>' if sl.get("pills") else ""
        protip = f'<div class="protip"><span class="lbl">Pro tip</span><p>{_esc(sl.get("pro_tip"))}</p></div>' if sl.get("pro_tip") else ""
        out.append(f'<div class="slide {kind}"><span class="tag">Étape {i+1:02d}</span><div class="grow"></div><h2>{_esc(sl.get("titre"))}</h2>{pills}{protip}<div class="bar"><div class="dots">{_dots(n, i+1)}</div><span class="cnt">{i+2}/{n}</span></div></div>')
    out.append(f'<div class="slide lt"><span class="tag">À toi de jouer</span><div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h2>{_esc(cta["titre"])}</h2><span class="cta-btn">Lien en bio →</span></div><div class="bar"><div class="foot">{av}<div>{_esc(nom)}<small>{_esc(secteur)}</small></div></div><div class="dots">{_dots(n, n-1)}</div></div></div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{css}</head><body>{"".join(out)}</body></html>'


def _tpl_editorial(content, p, s, a, nom, secteur, logo):
    p = p or "#003D2E"; A = a or "#3AFFA3"
    CREAM = _lighten(p, .94); CLINE = _mix(p, "#ffffff", .8); NEAR = _near(p)
    accL = _acc_light(A); accD = _acc_dark(A)
    hook, slides, cta = _parts(content); n = 2 + len(slides)
    head = '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:36px 32px 50px}}
  .lt{{background:{CREAM};color:#14201b}} .dk{{background:{NEAR};color:#fff}}
  .rule{{height:1px;background:currentColor;opacity:.18;margin:13px 0}}
  .kick{{font-size:10px;letter-spacing:3px;text-transform:uppercase;font-weight:600;opacity:.6}}
  .grow{{flex:1}}
  h1{{font-family:Fraunces;font-weight:600;font-size:36px;line-height:1.08}}
  h2{{font-family:Fraunces;font-weight:600;font-size:27px;line-height:1.13;margin-bottom:10px}}
  p{{font-size:14px;line-height:1.55;opacity:.8}}
  .num{{font-family:Fraunces;font-weight:500;font-size:42px;line-height:1;margin-bottom:6px}}
  .foot{{display:flex;align-items:center;gap:9px;font-size:12px}}
  .av{{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-family:Fraunces;font-weight:600;font-size:13px}}
  .cta-chip{{display:inline-block;margin-top:16px;padding:9px 18px;border-radius:30px;font-size:13px;font-weight:600;border:1.5px solid {accL};color:{accL}}}
</style>'''
    av = _av_span(logo, (nom or "?")[:1].upper(), A, _ink_on(A))
    out = [f'<div class="slide lt"><div class="kick">Carrousel</div><div class="rule"></div><div class="grow" style="display:flex;align-items:center"><h1>{_esc(hook)}</h1></div><div class="rule"></div><div class="foot">{av}<div><b>{_esc(nom)}</b> · {_esc(secteur)}</div></div></div>']
    for i, sl in enumerate(slides):
        dk = i % 2 == 0; kind = "dk" if dk else "lt"; acc = accD if dk else accL
        out.append(f'<div class="slide {kind}"><div style="display:flex;justify-content:space-between"><span class="kick">Idée {i+1:02d}</span><span class="kick">{i+2:02d} / {n:02d}</span></div><div class="grow"></div><div class="num" style="color:{acc}">{i+1:02d}</div><h2>{_esc(sl.get("titre"))}</h2>'
                   + (f'<p>{_esc(sl.get("texte"))}</p>' if sl.get("texte") else "") + '</div>')
    out.append(f'<div class="slide lt"><div class="kick">À toi de jouer</div><div class="rule"></div><div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h2>{_esc(cta["titre"])}</h2>'
               + (f'<p>{_esc(cta["texte"])}</p>' if cta["texte"] else "") + '<span class="cta-chip">Lien en bio →</span></div><div class="rule"></div><div class="foot">' + av + f'<div><b>{_esc(nom)}</b> · {_esc(secteur)}</div></div></div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{"".join(out)}</body></html>'


def _tpl_pop(content, p, s, a, nom, secteur, logo):
    p = p or "#003D2E"; s = s or "#0077FF"; A = a or "#3AFFA3"
    Aink = _ink_on(A); Sink = _ink_on(s); NEAR = _near(p)
    hook, slides, cta = _parts(content)
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:32px 30px 30px}}
  .top{{display:flex;align-items:center;justify-content:space-between}}
  .badge{{font-family:Sora;font-weight:800;font-size:12px;padding:5px 11px;border-radius:30px}}
  .grow{{flex:1}}
  h1{{font-family:Sora;font-weight:800;font-size:37px;line-height:1.04;letter-spacing:-1px}}
  h2{{font-family:Sora;font-weight:800;font-size:26px;line-height:1.08;letter-spacing:-.5px;margin-bottom:10px}}
  p{{font-size:14px;line-height:1.5;font-weight:500;opacity:.92}}
  .num{{font-family:Sora;font-weight:800;font-size:84px;line-height:.8;letter-spacing:-3px;opacity:.16}}
  .pills{{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}}
  .pill{{font-size:10px;font-weight:700;text-transform:uppercase;padding:5px 10px;border-radius:30px}}
  .foot{{display:flex;align-items:center;gap:9px;font-family:Sora;font-weight:700;font-size:14px;margin-top:12px}}
  .swipe{{font-family:Sora;font-weight:800;font-size:13px}}
  .cta-btn{{display:inline-flex;align-items:center;gap:8px;font-family:Sora;font-weight:800;font-size:15px;padding:13px 24px;border-radius:14px;margin-top:16px;width:max-content}}
</style>'''
    out = [f'<div class="slide" style="background:{A};color:{Aink}"><div class="top"><span class="badge" style="background:{Aink};color:{A}">Carrousel</span><span class="swipe">SWIPE →</span></div><div class="grow" style="display:flex;align-items:center"><h1>{_esc(hook)}</h1></div><div class="foot">{_esc((nom or "?")[:1].upper())} · {_esc(nom)}</div></div>']
    for i, sl in enumerate(slides):
        acc = i % 2 == 0; bg = A if acc else NEAR; ink = Aink if acc else "#fff"
        bstyle = f"background:{NEAR};color:#fff" if acc else f"background:{A};color:{Aink}"
        pbg = "rgba(0,0,0,.12)" if acc else "rgba(255,255,255,.16)"
        pills = f'<div class="pills">{"".join(f"<span class=pill style=background:{pbg};color:{ink}>{_esc(x)}</span>" for x in (sl.get("pills") or [])[:4])}</div>' if sl.get("pills") else ""
        out.append(f'<div class="slide" style="background:{bg};color:{ink}"><span class="badge" style="{bstyle};align-self:flex-start">Étape {i+1:02d}</span><div class="num" style="margin-top:auto;color:{ink}">{i+1:02d}</div><h2>{_esc(sl.get("titre"))}</h2>{pills}</div>')
    out.append(f'<div class="slide" style="background:{s};color:{Sink}"><span class="badge" style="background:{Sink};color:{s};align-self:flex-start">À toi</span><div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h2>{_esc(cta["titre"])}</h2>'
               + (f'<p>{_esc(cta["texte"])}</p>' if cta["texte"] else "")
               + f'<span class="cta-btn" style="background:{Sink};color:{s}">Lien en bio →</span></div></div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{"".join(out)}</body></html>'


def _tpl_clean(content, p, s, a, nom, secteur, logo):
    p = p or "#003D2E"; A = a or "#3AFFA3"; Aink = _ink_on(A)
    LBG = _lighten(p, .93); NEAR = _near(p); accL = _acc_light(A); accD = _acc_dark(A)
    grad = f"linear-gradient(165deg,{NEAR},{_mix(NEAR, A, .5)})"
    hook, slides, cta = _parts(content); n = 2 + len(slides)
    chev = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
    head = '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:'Plus Jakarta Sans',sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:34px 30px 50px}}
  .lt{{background:{LBG};color:#181a1f}} .dk{{background:{NEAR};color:#fff}} .gr{{background:{grad};color:#fff}}
  .center{{justify-content:center}} .end{{justify-content:flex-end}} .grow{{flex:1}}
  .kick{{font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:12px}}
  h1{{font-size:33px;font-weight:800;line-height:1.12;letter-spacing:-.5px}}
  h2{{font-size:25px;font-weight:700;line-height:1.16;margin-bottom:10px}}
  p{{font-size:14px;line-height:1.55}} .lt p{{color:rgba(0,0,0,.55)}} .dk p,.gr p{{color:rgba(255,255,255,.74)}}
  .num{{font-size:38px;font-weight:300;line-height:1;margin-bottom:6px}}
  .pills{{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}}
  .pill{{font-size:10px;font-weight:700;text-transform:uppercase;padding:5px 10px;border-radius:20px}}
  .lt .pill{{background:{A};color:{Aink}}} .dk .pill,.gr .pill{{background:rgba(255,255,255,.12);color:#fff}}
  .lockup{{display:flex;align-items:center;gap:9px}}
  .av{{width:32px;height:32px;border-radius:50%;background:{A};color:{Aink};display:grid;place-items:center;font-weight:800;font-size:14px;overflow:hidden}}
  .lk-nm{{font-size:14px;font-weight:700}} .lk-hd{{font-size:11px;opacity:.6}}
  .ctabtn{{display:inline-flex;align-items:center;gap:7px;background:{LBG};color:{_ink_on(LBG)};font-weight:700;font-size:14px;padding:11px 22px;border-radius:26px;width:max-content;margin-top:16px}}
  .pbar{{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:0 30px 20px}}
  .track{{flex:1;height:4px;border-radius:9px;overflow:hidden}} .lt .track{{background:rgba(0,0,0,.08)}} .dk .track,.gr .track{{background:rgba(255,255,255,.16)}}
  .fill{{height:100%;border-radius:9px}} .lt .fill{{background:{accL}}} .dk .fill,.gr .fill{{background:#fff}}
  .cnt{{font-size:12px;font-weight:600}} .lt .cnt{{color:rgba(0,0,0,.35)}} .dk .cnt,.gr .cnt{{color:rgba(255,255,255,.5)}}
  .swipe{{position:absolute;top:0;right:0;bottom:0;width:44px;display:flex;align-items:center;justify-content:flex-end;padding-right:12px;color:rgba(0,0,0,.22)}} .dk .swipe{{color:rgba(255,255,255,.4)}}
</style>'''
    av = _av_span(logo, (nom or "?")[:1].upper(), A, Aink)

    def pbar(idx):
        return f'<div class="pbar"><div class="track"><div class="fill" style="width:{(idx+1)/n*100:.0f}%"></div></div><span class="cnt">{idx+1}/{n}</span></div>'
    out = [f'<div class="slide lt center"><div class="kick" style="color:{accL}">Carrousel</div><h1>{_esc(hook)}</h1><div class="grow"></div><div class="lockup">{av}<div><div class="lk-nm">{_esc(nom)}</div><div class="lk-hd">{_esc(secteur)}</div></div></div><div class="swipe">{chev}</div>{pbar(0)}</div>']
    for i, sl in enumerate(slides):
        dk = i % 2 == 0; kind = "dk" if dk else "lt"; acc = accD if dk else accL
        pills = f'<div class="pills">{_pills(sl.get("pills"))}</div>' if sl.get("pills") else ""
        out.append(f'<div class="slide {kind} end"><div class="num" style="color:{acc}">{i+1:02d}</div><h2>{_esc(sl.get("titre"))}</h2>'
                   + (f'<p>{_esc(sl.get("texte"))}</p>' if sl.get("texte") else "") + pills + f'<div class="swipe">{chev}</div>{pbar(i+1)}</div>')
    out.append(f'<div class="slide gr center"><div class="lockup">{av}<div><div class="lk-nm">{_esc(nom)}</div><div class="lk-hd" style="color:rgba(255,255,255,.7)">{_esc(secteur)}</div></div></div><div class="grow"></div><h2>{_esc(cta["titre"])}</h2>'
               + (f'<p>{_esc(cta["texte"])}</p>' if cta["texte"] else "") + f'<span class="ctabtn">Lien en bio →</span>{pbar(n-1)}</div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{"".join(out)}</body></html>'


def _tpl_neon(content, p, s, a, nom, secteur, logo):
    p = p or "#0b1c44"; A = a or "#2f7bff"
    acc = _acc_dark(A)
    D1 = _mix(p, "#0a1430", .30); D2 = _mix(p, "#04060e", .72)
    gc = "rgba(255,255,255,.05)"
    bg = (f"linear-gradient({gc} 1px,transparent 1px),linear-gradient(90deg,{gc} 1px,transparent 1px),"
          f"linear-gradient(155deg,{D1},{D2})")
    hook, slides, cta = _parts(content); n = 2 + len(slides)
    initial = (nom or "?")[:1].upper()
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:40px 38px;color:#eaf1ff;
    background-image:{bg};background-size:30px 30px,30px 30px,100% 100%}}
  .slide::after{{content:"";position:absolute;width:420px;height:420px;right:-130px;top:40px;border-radius:50%;background:radial-gradient(circle,{_mix(acc,'#000000',.1)}33,transparent 70%);pointer-events:none}}
  .top{{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2}}
  .brand{{display:flex;align-items:center;gap:9px;font-family:Sora;font-weight:800;font-size:15px;letter-spacing:.4px}}
  .av{{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-family:Sora;font-weight:800;font-size:14px;overflow:hidden}}
  .cnt{{font-family:Sora;font-weight:800;font-size:14px;color:{acc}}}
  .grow{{flex:1}}
  .num{{font-family:Sora;font-weight:800;font-size:96px;line-height:.8;letter-spacing:-4px;color:transparent;-webkit-text-stroke:2.5px {acc}}}
  .row2{{display:flex;align-items:flex-start;gap:16px;position:relative;z-index:2}}
  h1{{font-family:Sora;font-weight:800;font-size:38px;line-height:1.02;letter-spacing:-.5px;text-transform:uppercase;position:relative;z-index:2}}
  h2{{font-family:Sora;font-weight:800;font-size:27px;line-height:1.04;letter-spacing:-.3px;text-transform:uppercase;margin-top:6px}}
  .line{{width:46px;height:3px;background:{acc};border-radius:3px;margin:14px 0 12px;position:relative;z-index:2}}
  p{{font-size:15px;line-height:1.5;color:#9fb0cf;position:relative;z-index:2;max-width:92%}}
  .btn{{align-self:flex-start;background:{acc};color:{_ink_on(acc)};font-family:Sora;font-weight:800;font-size:14px;padding:12px 22px;border-radius:10px;margin-top:16px;position:relative;z-index:2}}
</style>'''
    av = _av_span(logo, initial, acc, _ink_on(acc))
    top = lambda i: f'<div class="top"><div class="brand">{av}<span>{_esc(nom)}</span></div><span class="cnt">{i+1}/{n}</span></div>'
    out = [f'<div class="slide">{top(0)}<div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h1>{_two_tone(hook, acc)}</h1><div class="line"></div></div></div>']
    for i, sl in enumerate(slides):
        out.append(f'<div class="slide">{top(i+1)}<div class="grow"></div><div class="row2"><div class="num">{i+1:02d}</div><h2>{_two_tone(sl.get("titre"), acc)}</h2></div><div class="line"></div>'
                   + (f'<p>{_esc(sl.get("texte"))}</p>' if sl.get("texte") else "") + '</div>')
    out.append(f'<div class="slide">{top(n-1)}<div class="grow" style="display:flex;flex-direction:column;justify-content:center"><h1>{_two_tone(cta["titre"], acc)}</h1><div class="line"></div>'
               + (f'<p>{_esc(cta["texte"])}</p>' if cta["texte"] else "") + '<span class="btn">Lien en bio →</span></div></div>')
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{"".join(out)}</body></html>'


# =============================================================================
# Rendu Playwright + PDF + upload
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
            up = cloudinary.uploader.upload(png, resource_type="image", folder=f"carrousels/{telegram_id}",
                                            public_id=f"{base}_s{i+1}", overwrite=True)
            urls.append(up["secure_url"])
        browser.close()

    pdf_url = None
    try:
        imgs = [Image.open(BytesIO(b)).convert("RGB") for b in pngs]
        if imgs:
            buf = BytesIO()
            imgs[0].save(buf, format="PDF", save_all=True, append_images=imgs[1:], resolution=150.0)
            up = cloudinary.uploader.upload(buf.getvalue(), resource_type="image", folder=f"carrousels/{telegram_id}",
                                            public_id=f"{base}_doc", format="pdf", overwrite=True)
            pdf_url = up["secure_url"]
    except Exception as e:
        logger.error(f"carrousel pdf error: {e}")
    return {"images": urls, "pdf": pdf_url}


async def generer_carrousel(telegram_id: int, content, contenu_id: str = None, template: str = "creme") -> dict:
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
