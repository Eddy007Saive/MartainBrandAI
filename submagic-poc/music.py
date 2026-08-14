# Bibliothèque musicale — copie autonome de backend/services/music_library.py
# (le POC n'importe pas le backend : venv/config séparés). Pistes MIT
# (huashu-design, licence commerciale libre depuis 2026-05-14) sur Cloudinary,
# téléchargées et mises en cache localement au premier usage.
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "music_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

_MUS = "https://res.cloudinary.com/dy9gp5pim/video/upload/submagic_music"
MUSIC_CATEGORIES = [
    {"id": "studio", "label": "Studio Motion"},
    {"id": "calme", "label": "Calme"},
    {"id": "optimiste", "label": "Optimiste"},
    {"id": "funky", "label": "Funky / Groove"},
    {"id": "epique", "label": "Épique"},
    {"id": "emotion", "label": "Émotion"},
    {"id": "country", "label": "Country"},
]
MUSIC_LIBRARY = [
    {"id": "none", "label": "Aucune musique", "category": None, "url": None},
    {"id": "calme", "label": "Calme", "category": "calme", "url": f"{_MUS}/calme.mp3"},
    {"id": "in-the-morning", "label": "In The Morning", "category": "calme", "url": f"{_MUS}/in-the-morning.mp3"},
    {"id": "visible-invisible", "label": "Make The Visible Invisible", "category": "calme", "url": f"{_MUS}/visible-invisible.mp3"},
    {"id": "optimiste", "label": "Optimiste", "category": "optimiste", "url": f"{_MUS}/optimiste.mp3"},
    {"id": "butterfly", "label": "Butterfly", "category": "optimiste", "url": f"{_MUS}/butterfly.mp3"},
    {"id": "funky", "label": "Funky", "category": "funky", "url": f"{_MUS}/funky.mp3"},
    {"id": "claim-to-fame", "label": "Claim To Fame", "category": "funky", "url": f"{_MUS}/claim-to-fame.mp3"},
    {"id": "drop-of-a-hat", "label": "Drop Of A Hat", "category": "funky", "url": f"{_MUS}/drop-of-a-hat.mp3"},
    {"id": "frame-dragging", "label": "Frame-Dragging", "category": "epique", "url": f"{_MUS}/frame-dragging.mp3"},
    {"id": "level", "label": "Level", "category": "epique", "url": f"{_MUS}/level.mp3"},
    {"id": "dyin-breed", "label": "A Dyin' Breed", "category": "emotion", "url": f"{_MUS}/dyin-breed.mp3"},
    {"id": "missed-my-chance", "label": "Missed My Chance", "category": "emotion", "url": f"{_MUS}/missed-my-chance.mp3"},
    {"id": "triste", "label": "Triste", "category": "emotion", "url": f"{_MUS}/triste.mp3"},
    {"id": "country", "label": "Country", "category": "country", "url": f"{_MUS}/country.mp3"},
    {"id": "studio-pub", "label": "Pub énergique", "category": "studio", "url": f"{_MUS}/bgm-ad.mp3"},
    {"id": "studio-tech", "label": "Tech", "category": "studio", "url": f"{_MUS}/bgm-tech.mp3"},
    {"id": "studio-edu", "label": "Éducatif", "category": "studio", "url": f"{_MUS}/bgm-educational.mp3"},
    {"id": "studio-edu-2", "label": "Éducatif II", "category": "studio", "url": f"{_MUS}/bgm-educational-alt.mp3"},
    {"id": "studio-tuto", "label": "Tutoriel", "category": "studio", "url": f"{_MUS}/bgm-tutorial.mp3"},
    {"id": "studio-tuto-2", "label": "Tutoriel II", "category": "studio", "url": f"{_MUS}/bgm-tutorial-alt.mp3"},
]
_BY_ID = {m["id"]: m for m in MUSIC_LIBRARY}


def local_path(music_id):
    """Chemin local de la piste (téléchargée et mise en cache au 1er usage), ou None."""
    m = _BY_ID.get(music_id)
    if not m or not m["url"]:
        return None
    dest = os.path.join(CACHE_DIR, music_id + ".mp3")
    if not os.path.exists(dest):
        tmp = dest + ".part"
        urllib.request.urlretrieve(m["url"], tmp)
        os.replace(tmp, dest)
    return dest
