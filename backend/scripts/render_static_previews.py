import sys; sys.path.insert(0,'.')
import json
from playwright.sync_api import sync_playwright
import cloudinary, cloudinary.uploader
from services import gabarit_service as G

brand = {"accent": "#7c5cff", "accent2": "#ff2d2d", "bg": "#07070e", "logo": None, "nom": ""}
frames = "".join(f'<div class="frame">{G._BUILDERS[g](G._SAMPLES.get(g, {}), brand)}</div>' for g in G.GABARITS)
html = (f'<!DOCTYPE html><html><head><meta charset="utf-8">'
        f'<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
        f'<style>{G._css(brand)} body{{display:flex;flex-wrap:wrap;gap:0}}</style></head><body>{frames}</body></html>')
out = {}
with sync_playwright() as pw:
    b = G._launch(pw)
    page = b.new_page(viewport={"width": G.GAB_W, "height": G.GAB_H * 2}, device_scale_factor=1)
    page.set_content(html, wait_until="networkidle")
    try: page.evaluate("document.fonts.ready")
    except Exception: pass
    for i, g in enumerate(G.GABARITS):
        png = page.locator(".frame").nth(i).screenshot(type="png")
        up = cloudinary.uploader.upload(png, resource_type="image", folder="gabarits/_static", public_id=g, overwrite=True, invalidate=True)
        out[g] = up["secure_url"]
        print("OK", g)
    b.close()
print("STATIC_JSON=" + json.dumps(out))
