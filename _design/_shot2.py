from playwright.sync_api import sync_playwright
import pathlib
files = [
    ('performance/performance.html', 'performance/performance.png', 1240, 900),
    ('commentaires/commentaires.html', 'commentaires/commentaires.png', 1100, 1000),
]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for src, out, w, h in files:
        url = pathlib.Path(src).resolve().as_uri()
        pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2)
        pg.goto(url); pg.wait_for_timeout(1000)
        pg.screenshot(path=out, full_page=True); pg.close()
        print(out, 'ok')
    b.close()
