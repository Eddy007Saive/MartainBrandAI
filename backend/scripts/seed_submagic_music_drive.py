"""Seed de la bibliothèque de sons du Studio Vidéo depuis un dossier Google Drive.

Pour chaque piste : télécharge le MP3 (Drive public) → héberge sur Cloudinary
(URL stable, propre) → enregistre dans Submagic (/user-media → userMediaId).
Écrit le résultat dans scratchpad/music_seed.json et imprime le MUSIC_LIBRARY prêt
à coller dans backend/routes/video.py.

Usage (depuis backend/, venv activé) :
    python scripts/seed_submagic_music_drive.py
"""
import asyncio
import json
import os
import sys

import httpx
import cloudinary
import cloudinary.uploader

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (  # noqa: E402
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
)
from services import submagic_service  # noqa: E402

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY,
                  api_secret=CLOUDINARY_API_SECRET)

# Catégories (ordre d'affichage + libellé)
CATEGORIES = [
    ("calme", "Calme"),
    ("optimiste", "Optimiste"),
    ("funky", "Funky / Groove"),
    ("epique", "Épique"),
    ("emotion", "Émotion"),
    ("country", "Country"),
]

# (slug interne, libellé affiché, catégorie, drive_file_id)
TRACKS = [
    ("calme",             "Calme",                       "calme",     "1O4n9tX47d1-VvTRVqondsSOYx24IDf8g"),
    ("in-the-morning",    "In The Morning",              "calme",     "1y9QDtq9fwJ2Fx7bWkPOvd3BNxjYfyL9v"),
    ("visible-invisible", "Make The Visible Invisible",  "calme",     "1HxKqn8eN65TP61q_HFu1TEByteOfjlE1"),
    ("optimiste",         "Optimiste",                   "optimiste", "15AE46A3uW9cSebb93_oRKxqKLvvrT76N"),
    ("butterfly",         "Butterfly",                   "optimiste", "1YAaxmTtGqxSpiI5QOGthq3c6-2BqeTOb"),
    ("funky",             "Funky",                       "funky",     "1CGRbMiD2PMExMlT4JUsBJbZTX7aMKRUP"),
    ("claim-to-fame",     "Claim To Fame",               "funky",     "1XjK5-lrki4wsunxl87mCx9Fz5pyjHlKp"),
    ("drop-of-a-hat",     "Drop Of A Hat",               "funky",     "1o8Yl0q922wb3sIMPjvrHhCQjaQjpcn4u"),
    ("frame-dragging",    "Frame-Dragging",              "epique",    "1dpx83jwgYzwDNPBoulbEMMUoTdpcRyOp"),
    ("level",             "Level",                       "epique",    "1vlM-96ABk7E6LDUM9v_5seAbpoQ_iJG_"),
    ("dyin-breed",        "A Dyin' Breed",               "emotion",   "1i_mkVotk2tKxG285C28Oha7vBBn_Dpvt"),
    ("missed-my-chance",  "Missed My Chance",            "emotion",   "1yUlSI-2V__6WXJqnu37VEr-WfU6nXFIg"),
    ("triste",            "Triste",                      "emotion",   "1Wt3aH87yZSDaLRciFTlqBSz4lnO57ra8"),
    ("country",           "Country",                     "country",   "1Sn4WkvqTu_Xzv9eJR5yuBa2p4wWJI8SZ"),
]

SCRATCH = os.environ.get("SCRATCH", ".")


def download_drive(file_id: str) -> bytes:
    """Télécharge un fichier Drive public (gère l'écran de confirmation antivirus)."""
    url = "https://drive.google.com/uc?export=download"
    with httpx.Client(timeout=120, follow_redirects=True) as c:
        r = c.get(url, params={"id": file_id})
        # Gros fichier -> page de confirmation avec un token
        if r.content[:15].lstrip().lower().startswith(b"<!doctype") or b"confirm=" in r.content[:4000]:
            import re
            m = re.search(rb"confirm=([0-9A-Za-z_\-]+)", r.content)
            token = m.group(1).decode() if m else "t"
            r = c.get(url, params={"id": file_id, "confirm": token})
        r.raise_for_status()
        return r.content


async def main():
    if not submagic_service.enabled():
        print("SUBMAGIC_API_KEY absente — configure-la dans backend/.env")
        return
    results = []
    for slug, label, cat, fid in TRACKS:
        try:
            data = download_drive(fid)
            if len(data) < 20000:
                print(f"[!] {slug}: fichier trop petit ({len(data)} o) — Drive pas public ? skip")
                continue
            up = cloudinary.uploader.upload(
                data, resource_type="video", folder="submagic_music",
                public_id=slug, overwrite=True, invalidate=True,
            )
            cdn_url = up["secure_url"]
            media_id = await submagic_service.add_music_from_url(cdn_url)
            print(f"[ok] {slug:20s} {len(data)//1024:>5} Ko  media={media_id}")
            results.append({"id": slug, "label": label, "category": cat,
                            "user_media_id": media_id, "url": cdn_url})
        except Exception as e:
            print(f"[X] {slug}: {e}")
    with open(os.path.join(SCRATCH, "music_seed.json"), "w", encoding="utf-8") as f:
        json.dump({"categories": CATEGORIES, "tracks": results}, f, ensure_ascii=False, indent=2)
    print(f"\n{len(results)}/{len(TRACKS)} pistes OK → {os.path.join(SCRATCH, 'music_seed.json')}")


if __name__ == "__main__":
    asyncio.run(main())
