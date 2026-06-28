"""
Gabarits de post (feed cohérent) : HTML brandé FIXE -> PNG via Playwright -> Cloudinary.
Le client choisit un gabarit ; seuls le TEXTE et la PHOTO/fond changent. Variables de marque
(accent, logo, nom) injectées. Combinable avec un fond généré par IA (slot bg_image).
"""
import html as _html
import asyncio
import cloudinary
import cloudinary.uploader
from config import CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, logger
from services.agent_service import _charger_marque

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

# 600x600 logique * 1.8 = 1080x1080 (Instagram carré)
GAB_W = GAB_H = 600
DSF = 1.8

GABARITS = ["statement", "citation", "stat"]


def _esc(t):
    return _html.escape(str(t or ""))


def _title_html(lines):
    """lines : [{t, c}] ; c = 'a' (accent2) | 'v' (accent) | None (ink)."""
    out = []
    for ln in (lines or []):
        cls = ln.get("c")
        span = f'<span class="{cls}">' + _esc(ln.get("t")) + "</span>" if cls in ("a", "v") else _esc(ln.get("t"))
        out.append(span)
    return "<br>".join(out)


def _css(brand):
    return f"""
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#000;font-family:Inter,sans-serif}}
.frame{{position:relative;width:{GAB_W}px;height:{GAB_H}px;color:#fff;padding:48px;display:flex;flex-direction:column;overflow:hidden;
  background:radial-gradient(120% 90% at 80% 0%, {brand['accent']}33, transparent 55%),
             radial-gradient(90% 70% at 0% 100%, {brand['accent']}1a, transparent 60%), {brand['bg']};}}
.photo{{position:absolute;inset:0;z-index:0;background-size:cover;background-position:center}}
.ov{{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(5,5,12,.4),rgba(5,5,12,.15) 38%,rgba(5,5,12,.93))}}
.top{{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2}}
.eyebrow{{font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#d7d9e6;font-weight:600;text-shadow:0 2px 10px rgba(0,0,0,.5)}}
.label{{display:inline-block;background:{brand['accent']}40;border:1px solid {brand['accent']}73;color:#fff;font-size:11px;font-weight:700;padding:5px 11px;border-radius:999px;backdrop-filter:blur(4px)}}
.logo{{display:flex;align-items:center;gap:9px}}
.logo .g{{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-family:Sora;font-weight:800;font-size:17px;color:#fff;background:radial-gradient(circle at 35% 30%, #ffffff66, {brand['accent']} 60%);box-shadow:0 0 22px {brand['accent']}b3;overflow:hidden}}
.logo .g img{{width:100%;height:100%;object-fit:cover}}
.logo b{{font-family:Sora;font-weight:800;font-size:15px;text-shadow:0 2px 10px rgba(0,0,0,.5)}}
.spacer{{flex:1}}
.h{{font-family:Sora;font-weight:800;letter-spacing:-.02em;line-height:1.05;position:relative;z-index:2;text-shadow:0 4px 22px rgba(0,0,0,.45)}}
.h .a{{color:{brand['accent2']}}} .h .v{{color:{brand['accent']}}}
.sub{{color:#c3c8db;font-size:16px;line-height:1.55;position:relative;z-index:2;margin-top:16px;max-width:92%;text-shadow:0 2px 12px rgba(0,0,0,.55)}}
.orb{{position:absolute;width:230px;height:230px;border-radius:50%;right:-30px;top:80px;z-index:1;
  background:radial-gradient(circle at 38% 32%, #ffffffcc, {brand['accent']} 55%, #1c1340 82%);box-shadow:0 0 90px {brand['accent']}99;display:grid;place-items:center}}
.orb b{{font-family:Sora;font-weight:800;font-size:96px;color:#fff}}
.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;position:relative;z-index:2}}
.stat{{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px 12px;backdrop-filter:blur(6px)}}
.stat .n{{font-family:Sora;font-weight:800;font-size:26px;color:{brand['accent']}}}
.stat .k{{font-size:10.5px;color:#c3c8db;text-transform:uppercase;letter-spacing:.06em;margin-top:6px}}
.quote{{font-family:Sora;font-weight:700;font-size:30px;line-height:1.25;position:relative;z-index:2;text-shadow:0 3px 18px rgba(0,0,0,.5)}}
.who{{display:flex;align-items:center;gap:12px;position:relative;z-index:2;margin-top:22px}}
.who .av{{width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.25);background:#222}}
.who .nm{{font-weight:700;font-size:15px}} .who .rl{{color:#c3c8db;font-size:12.5px}}
"""


def _logo_mark(brand):
    if brand.get("logo"):
        return f'<span class="g"><img src="{_esc(brand["logo"])}" alt=""></span>'
    return f'<span class="g">{_esc((brand.get("nom") or "G")[:1].upper())}</span>'


def _brandbar(brand, eyebrow=None, label=None):
    left = ""
    if label:
        left = f'<span class="label">{_esc(label)}</span>'
    elif eyebrow:
        left = f'<span class="eyebrow">{_esc(eyebrow)}</span>'
    return f'<div class="top">{left}<span class="logo">{_logo_mark(brand)}<b>{_esc(brand.get("nom") or "")}</b></span></div>'


def _photo(slots):
    img = slots.get("bg_image")
    return (f'<div class="photo" style="background-image:url(\'{_esc(img)}\')"></div><div class="ov"></div>') if img else ""


def _g_statement(slots, brand):
    orb = '' if slots.get("bg_image") else f'<div class="orb"><b>{_esc((brand.get("nom") or "G")[:1].upper())}</b></div>'
    return f"""{_photo(slots)}{_brandbar(brand, eyebrow=slots.get('eyebrow'))}{orb}
<div class="spacer"></div>
<div class="h" style="font-size:52px">{_title_html(slots.get('title_lines'))}</div>
{f'<p class="sub">{_esc(slots.get("subtitle"))}</p>' if slots.get('subtitle') else ''}"""


def _g_citation(slots, brand):
    au = slots.get("author") or {}
    avatar = f'<img class="av" src="{_esc(au.get("photo"))}">' if au.get("photo") else '<span class="av"></span>'
    return f"""{_photo(slots)}{_brandbar(brand, label=slots.get('label') or 'Témoignage')}
<div class="spacer"></div>
<div class="quote">« {_title_html(slots.get('quote_lines'))} »</div>
<div class="who">{avatar}<div><div class="nm">{_esc(au.get('name'))}</div><div class="rl">{_esc(au.get('role'))}</div></div></div>"""


def _g_stat(slots, brand):
    cells = "".join(f'<div class="stat"><div class="n">{_esc(s.get("n"))}</div><div class="k">{_esc(s.get("k"))}</div></div>'
                    for s in (slots.get("stats") or [])[:4])
    return f"""{_photo(slots)}{_brandbar(brand, eyebrow=slots.get('eyebrow'))}
<div class="h" style="font-size:38px;margin-top:24px">{_title_html(slots.get('title_lines'))}</div>
<div class="spacer"></div>
<div class="stats">{cells}</div>"""


_BUILDERS = {"statement": _g_statement, "citation": _g_citation, "stat": _g_stat}


def build_html(gabarit, slots, brand):
    inner = _BUILDERS.get(gabarit, _g_statement)(slots, brand)
    return f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>{_css(brand)}</style></head><body><div class="frame">{inner}</div></body></html>"""


def _render_and_upload(telegram_id, gabarit, slots, brand):
    from playwright.sync_api import sync_playwright
    html_str = build_html(gabarit, slots, brand)
    with sync_playwright() as pw:
        args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        try:
            browser = pw.chromium.launch(args=args)
        except Exception:
            browser = pw.chromium.launch(channel="chromium", args=args)
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


async def render_gabarit(telegram_id: str, gabarit: str, slots: dict) -> dict:
    if gabarit not in _BUILDERS:
        return {"ok": False, "error": "Gabarit inconnu."}
    u = _charger_marque(telegram_id)
    brand = {
        "accent": (u.get("couleur_accent") or "#7c5cff"),
        "accent2": (u.get("couleur_secondaire") or "#ff2d2d"),
        "bg": "#07070e",
        "logo": u.get("logo_url"),
        "nom": u.get("nom") or u.get("user_name") or "",
    }
    try:
        url = await asyncio.to_thread(_render_and_upload, telegram_id, gabarit, slots or {}, brand)
        return {"ok": True, "url": url}
    except Exception as e:
        logger.error(f"render_gabarit error {telegram_id}/{gabarit}: {e}")
        return {"ok": False, "error": "Échec du rendu du visuel."}
