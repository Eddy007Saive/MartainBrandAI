# Recherche et cache de clips b-roll via Pexels — même principe que
# music.py (téléchargement + cache local au 1er usage). Licence Pexels :
# usage commercial libre, pas d'attribution requise.
import json
import os
import urllib.parse
import urllib.request

import envkeys

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "broll_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# Cloudflare bloque le User-Agent par défaut de Python sur l'API Pexels
# (erreur 1010, "browser signature banned") — un UA de navigateur suffit.
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def search(query, out_w=720, out_h=1280):
    """Meilleur clip vertical pour cette requête -> {id, url, duration} ou None."""
    url = ("https://api.pexels.com/videos/search?query=" + urllib.parse.quote(query)
          + "&orientation=portrait&per_page=5")
    req = urllib.request.Request(url, headers={
        "Authorization": envkeys.get("PEXELS_API_KEY"), "User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    videos = data.get("videos") or []
    if not videos:
        return None
    v = videos[0]  # le plus pertinent selon le tri Pexels
    files = [f for f in v["video_files"] if f.get("width") and f.get("height")]
    if not files:
        return None
    # le fichier le plus proche de notre résolution cible, sans upscaler
    # si possible (priorité aux fichiers >= cible, puis le plus petit écart)
    files.sort(key=lambda f: (f["width"] < out_w, abs(f["width"] - out_w)))
    best = files[0]
    return {"id": v["id"], "url": best["link"], "duration": v["duration"]}


def local_path(video_id, url):
    """Télécharge et met en cache le clip localement (une fois par id)."""
    dest = os.path.join(CACHE_DIR, f"{video_id}.mp4")
    if not os.path.exists(dest):
        tmp = dest + ".part"
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=60) as resp, open(tmp, "wb") as f:
            f.write(resp.read())
        os.replace(tmp, dest)
    return dest
