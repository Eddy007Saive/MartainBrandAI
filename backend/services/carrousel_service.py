"""
Carrousel : rend chaque slide (HTML brandé) en PNG via Playwright -> Cloudinary.
Le contenu des slides est généré par agent_service.rediger_carrousel.
"""
import html as _html
import cloudinary
import cloudinary.uploader
from config import (
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, logger,
)
from services.agent_service import _charger_marque

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

SLIDE_W, SLIDE_H = 540, 675  # 4:5 ; rendu ×2 -> 1080×1350


def _esc(t: str) -> str:
    return _html.escape(t or "").replace("\n", "<br>")


def build_html(slides: list, p: str, s: str, a: str, nom: str, secteur: str) -> str:
    initial = (nom or "?")[:1].upper()
    secteur = (secteur or "").strip()
    if len(secteur) > 42:
        secteur = secteur[:42].rstrip() + "…"
    n = len(slides)
    cards = []
    for i, sl in enumerate(slides):
        titre, texte = _esc(sl.get("titre", "")), _esc(sl.get("texte", ""))
        idx = f'<span class="idx"><b>{i+1:02d}</b> / {n:02d}</span>'
        foot = (f'<div class="foot"><span class="av">{_esc(initial)}</span>'
                f'<div><div class="nm">{_esc(nom)}</div><div class="hd">{_esc(secteur)}</div></div></div>')
        if i == 0:  # HOOK
            cards.append(f'''<div class="slide">
              <div class="topline"><span class="kicker">Carrousel</span>{idx}</div>
              <div class="body hookwrap"><h1>{titre}</h1>
                <div class="swipe">swipe <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
              </div>{foot}</div>''')
        elif i == n - 1:  # CTA
            body = f'<h2>{titre}</h2>' + (f'<p>{texte}</p>' if texte else '')
            cards.append(f'''<div class="slide ctaslide">
              <div class="topline"><span class="kicker">À toi de jouer</span>{idx}</div>
              <div class="body">{body}<div class="chip">En savoir plus <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div></div>{foot}</div>''')
        else:  # IDÉE
            body = f'<div class="num">{i:02d}</div><h2>{titre}</h2>' + (f'<p>{texte}</p>' if texte else '')
            cards.append(f'''<div class="slide">
              <div class="topline"><span class="kicker">Idée {i:02d}</span>{idx}</div>
              <div class="body">{body}</div>{foot}</div>''')
    slides_html = "\n".join(cards)
    return f'''<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{{--p:{p};--s:{s};--a:{a};--mut:rgba(255,255,255,.62)}}
  *{{box-sizing:border-box;margin:0}}
  body{{background:#05070f;font-family:Inter,sans-serif;padding:0}}
  .slide{{width:{SLIDE_W}px;height:{SLIDE_H}px;position:relative;overflow:hidden;color:#fff;
    background:linear-gradient(165deg,var(--p) 0%,#060a24 100%);display:flex;flex-direction:column;padding:46px 44px}}
  .slide::before{{content:"";position:absolute;top:0;left:0;right:0;height:7px;background:var(--a)}}
  .slide::after{{content:"";position:absolute;width:400px;height:400px;right:-140px;bottom:-140px;border-radius:50%;
    background:radial-gradient(circle,rgba(255,255,255,.06),transparent 70%);pointer-events:none}}
  .topline{{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2}}
  .kicker{{font-size:15px;letter-spacing:.16em;text-transform:uppercase;color:var(--a);font-weight:700}}
  .idx{{font-family:Sora;font-weight:700;font-size:17px;color:var(--mut)}}.idx b{{color:#fff}}
  .body{{flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;z-index:2}}
  .num{{font-family:Sora;font-weight:800;font-size:62px;line-height:1;color:rgba(255,255,255,.10);margin-bottom:14px}}
  h1{{font-family:Sora;font-weight:800;font-size:46px;line-height:1.12;letter-spacing:-.01em}}
  h2{{font-family:Sora;font-weight:700;font-size:30px;line-height:1.18;margin-bottom:16px}}
  p{{font-size:19px;line-height:1.5;color:var(--mut)}}
  .hookwrap{{justify-content:center}}
  .swipe{{position:absolute;bottom:0;right:0;display:flex;align-items:center;gap:8px;color:var(--a);font-weight:700;font-size:17px}}
  .foot{{display:flex;align-items:center;gap:12px;position:relative;z-index:2;border-top:1px solid rgba(255,255,255,.10);padding-top:18px}}
  .foot>div{{min-width:0;overflow:hidden}}
  .av{{width:36px;height:36px;border-radius:50%;background:var(--a);display:grid;place-items:center;font-weight:700;font-size:16px;font-family:Sora;flex-shrink:0}}
  .foot .nm{{font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
  .foot .hd{{font-size:13px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
  .ctaslide{{background:linear-gradient(165deg,var(--s) 0%,var(--p) 100%)}}
  .chip{{display:inline-flex;align-items:center;gap:9px;background:var(--a);color:#fff;font-weight:700;font-size:18px;padding:14px 22px;border-radius:14px;width:max-content;margin-top:20px;font-family:Sora}}
</style></head><body>{slides_html}</body></html>'''


def _render_and_upload(telegram_id: int, slides: list, p: str, s: str, a: str,
                       nom: str, secteur: str, base: str) -> list:
    """SYNC : rend chaque slide en PNG (Playwright sync) + upload Cloudinary. À exécuter dans un thread."""
    from playwright.sync_api import sync_playwright
    html_str = build_html(slides, p, s, a, nom, secteur)
    urls = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chromium", args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": SLIDE_W, "height": SLIDE_H}, device_scale_factor=2)
        page.set_content(html_str, wait_until="networkidle")
        try:
            page.evaluate("document.fonts.ready")
        except Exception:
            pass
        for i in range(len(slides)):
            png = page.locator(".slide").nth(i).screenshot(type="png")
            up = cloudinary.uploader.upload(
                png, resource_type="image", folder=f"carrousels/{telegram_id}",
                public_id=f"{base}_s{i+1}", overwrite=True,
            )
            urls.append(up["secure_url"])
        browser.close()
    return urls


async def generer_carrousel(telegram_id: int, slides: list, contenu_id: str = None) -> list:
    """slides -> images de slides uploadées sur Cloudinary -> liste d'URLs.

    Le rendu Playwright tourne dans un THREAD séparé (API sync) pour éviter les conflits
    avec la boucle asyncio d'uvicorn (lancement de sous-processus impossible sinon sous Windows).
    """
    import asyncio
    u = _charger_marque(telegram_id)
    p = u.get("couleur_principale") or "#0B1340"
    s = u.get("couleur_secondaire") or "#1A237E"
    a = u.get("couleur_accent") or "#D32F2F"
    nom = u.get("nom") or u.get("username") or ""
    secteur = u.get("secteur") or ""
    base = (contenu_id or "tmp").replace("-", "")[:16]
    return await asyncio.to_thread(_render_and_upload, telegram_id, slides, p, s, a, nom, secteur, base)
