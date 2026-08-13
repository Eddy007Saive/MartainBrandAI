# -*- coding: utf-8 -*-
"""Bibliothèque musicale PARTAGÉE : Studio Vidéo (Submagic) ET reels Remotion.

Chaque piste est hébergée sur Cloudinary (preview écoutable et source du mix
Remotion) et pré-enregistrée chez Submagic (user_media_id) pour le montage vidéo.
`category` regroupe les pistes dans les sélecteurs ; "none" = pas de musique.
Seed Submagic via scripts/seed_submagic_music_drive.py.
"""

MUSIC_CATEGORIES = [
    {"id": "calme", "label": "Calme"},
    {"id": "optimiste", "label": "Optimiste"},
    {"id": "funky", "label": "Funky / Groove"},
    {"id": "epique", "label": "Épique"},
    {"id": "emotion", "label": "Émotion"},
    {"id": "country", "label": "Country"},
]

_MUS = "https://res.cloudinary.com/dy9gp5pim/video/upload/submagic_music"
MUSIC_LIBRARY = [
    {"id": "none", "label": "Aucune musique", "category": None, "user_media_id": None, "url": None},
    {"id": "calme", "label": "Calme", "category": "calme", "user_media_id": "638c9a7f-2cb9-41ff-bb99-fae4e0c73c1d", "url": f"{_MUS}/calme.mp3"},
    {"id": "in-the-morning", "label": "In The Morning", "category": "calme", "user_media_id": "16624be5-3758-4293-9291-92c3106f4c7d", "url": f"{_MUS}/in-the-morning.mp3"},
    {"id": "visible-invisible", "label": "Make The Visible Invisible", "category": "calme", "user_media_id": "b9114ed4-d11e-4118-a3af-9a1049fa741e", "url": f"{_MUS}/visible-invisible.mp3"},
    {"id": "optimiste", "label": "Optimiste", "category": "optimiste", "user_media_id": "ac12a379-88a9-4c99-add1-f826a92c5cd8", "url": f"{_MUS}/optimiste.mp3"},
    {"id": "butterfly", "label": "Butterfly", "category": "optimiste", "user_media_id": "7c9a8720-84e2-407e-a062-2ca79a44997a", "url": f"{_MUS}/butterfly.mp3"},
    {"id": "funky", "label": "Funky", "category": "funky", "user_media_id": "be0ae396-bed5-4f8a-b721-d741521c6371", "url": f"{_MUS}/funky.mp3"},
    {"id": "claim-to-fame", "label": "Claim To Fame", "category": "funky", "user_media_id": "dce42cc3-510c-44f1-83d1-98949f7fa3d9", "url": f"{_MUS}/claim-to-fame.mp3"},
    {"id": "drop-of-a-hat", "label": "Drop Of A Hat", "category": "funky", "user_media_id": "3ca88017-c9b2-4320-977a-58968ba9d3b7", "url": f"{_MUS}/drop-of-a-hat.mp3"},
    {"id": "frame-dragging", "label": "Frame-Dragging", "category": "epique", "user_media_id": "8e8fd1f4-0ff6-47c8-9290-c35daf7f3004", "url": f"{_MUS}/frame-dragging.mp3"},
    {"id": "level", "label": "Level", "category": "epique", "user_media_id": "631d3eb3-21f2-401e-9f86-eac664866bf7", "url": f"{_MUS}/level.mp3"},
    {"id": "dyin-breed", "label": "A Dyin' Breed", "category": "emotion", "user_media_id": "ec851863-3887-43cd-a0f5-a4ea781caa30", "url": f"{_MUS}/dyin-breed.mp3"},
    {"id": "missed-my-chance", "label": "Missed My Chance", "category": "emotion", "user_media_id": "8a4ae600-4586-4926-85ae-a7dd16c7ba23", "url": f"{_MUS}/missed-my-chance.mp3"},
    {"id": "triste", "label": "Triste", "category": "emotion", "user_media_id": "0cfc6fdf-a29e-4f49-8d74-e821b29d2b7a", "url": f"{_MUS}/triste.mp3"},
    {"id": "country", "label": "Country", "category": "country", "user_media_id": "96d986ed-e831-4f5c-b0fc-7f360eeb2e85", "url": f"{_MUS}/country.mp3"},
]


def piste(music_id: str | None) -> dict | None:
    """La piste correspondant à l'id, ou None (inclut l'entrée « none » : url None)."""
    if not music_id:
        return None
    return next((m for m in MUSIC_LIBRARY if m["id"] == music_id), None)


def musique_url(music_id: str | None) -> str | None:
    """URL Cloudinary de la piste, ou None si inconnue / « none »."""
    m = piste(music_id)
    return m["url"] if m else None
