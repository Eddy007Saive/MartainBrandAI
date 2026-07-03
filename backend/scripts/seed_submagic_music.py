"""Enregistre les pistes de la bibliothèque de sons dans Submagic (une seule fois).

Chaque piste (URL publique MP3, LIBRE DE DROITS) est ajoutée via l'API Submagic
(/user-media) ; on récupère son `userMediaId`. Colle ensuite les entrées imprimées
dans MUSIC_LIBRARY (backend/routes/video.py).

Usage (depuis backend/, venv activé) :
    python scripts/seed_submagic_music.py

⚠️ N'utilise QUE des pistes réellement libres de droits (licence claire) pour la prod.
Les URLs ci-dessous sont des exemples de test à remplacer.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import submagic_service  # noqa: E402

# (id interne, libellé affiché, URL MP3 publique libre de droits)
TRACKS = [
    ("demo1", "Énergique (démo)", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"),
    # ("calme", "Calme / posé", "https://.../track-calme.mp3"),
    # ("punchy", "Punchy / hook", "https://.../track-punchy.mp3"),
]


async def main():
    if not submagic_service.enabled():
        print("SUBMAGIC_API_KEY absente — configure-la dans backend/.env")
        return
    print("MUSIC_LIBRARY = [")
    print('    {"id": "none", "label": "Aucune musique", "user_media_id": None},')
    for tid, label, url in TRACKS:
        mid = await submagic_service.add_music_from_url(url)
        status = mid or "ÉCHEC"
        print(f'    {{"id": "{tid}", "label": "{label}", "user_media_id": "{status}"}},  # {url}')
    print("]")


if __name__ == "__main__":
    asyncio.run(main())
