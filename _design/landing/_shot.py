from playwright.sync_api import sync_playwright
import pathlib
url = pathlib.Path('landing.html').resolve().as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for name, w, h in [('landing-desktop', 1280, 900), ('landing-mobile', 390, 844)]:
        pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2)
        pg.goto(url)
        pg.wait_for_timeout(1200)
        pg.screenshot(path=name + '.png', full_page=True)
        pg.close()
        print(name, 'ok')
    b.close()
