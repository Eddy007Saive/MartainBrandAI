# -*- coding: utf-8 -*-
"""Bibliothèque musicale PARTAGÉE : Studio Vidéo (Submagic) ET reels Remotion.

Chaque piste est hébergée sur Cloudinary (preview écoutable et source du mix
Remotion) et pré-enregistrée chez Submagic (user_media_id) pour le montage vidéo.
`category` regroupe les pistes dans les sélecteurs ; "none" = pas de musique.
Seed Submagic via scripts/seed_submagic_music_drive.py.
"""

MUSIC_CATEGORIES = [
    {"id": "studio", "label": "Studio Motion"},
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
    # Pistes « Studio Motion » (pack MIT huashu-design, celles des démos de templates),
    # enregistrées chez Submagic le 14/08/2026 -> disponibles dans les DEUX studios.
    {"id": "studio-pub", "label": "Pub énergique", "category": "studio", "user_media_id": "f010a5ac-f4b4-4fd8-983a-a60c2b162b3c", "url": f"{_MUS}/bgm-ad.mp3"},
    {"id": "studio-tech", "label": "Tech", "category": "studio", "user_media_id": "2b2797b3-b838-4d62-8d58-579b9f1e15f6", "url": f"{_MUS}/bgm-tech.mp3"},
    {"id": "studio-edu", "label": "Éducatif", "category": "studio", "user_media_id": "b69d530c-0602-4693-ab85-7d8122b8b760", "url": f"{_MUS}/bgm-educational.mp3"},
    {"id": "studio-edu-2", "label": "Éducatif II", "category": "studio", "user_media_id": "ed2f60ff-aa30-4a38-9629-b5006aa66a5e", "url": f"{_MUS}/bgm-educational-alt.mp3"},
    {"id": "studio-tuto", "label": "Tutoriel", "category": "studio", "user_media_id": "02979dd6-2a18-4729-9d3f-42ba25a9c01d", "url": f"{_MUS}/bgm-tutorial.mp3"},
    {"id": "studio-tuto-2", "label": "Tutoriel II", "category": "studio", "user_media_id": "86e67102-210d-4085-9af9-19d235caeb1a", "url": f"{_MUS}/bgm-tutorial-alt.mp3"},
]


MAX_MUSIQUES = 12          # par compte — garde-fou de stockage
TAILLE_MAX_MO = 15


def musiques_du_compte(telegram_id: str) -> list:
    """Les MP3 importés par le client, présentés comme la bibliothèque partagée.
    `debut_s`/`duree_s` : passage retenu par le client (voir decouper())."""
    from config import supabase, logger
    try:
        r = (supabase.table("brand_musiques").select("id, url, label, debut_s, duree_s, created_at")
             .eq("telegram_id", telegram_id).order("created_at", desc=True).execute())
        return [{"id": m["id"], "label": m["label"], "category": "perso",
                 "user_media_id": None, "url": m["url"],
                 "debut_s": m.get("debut_s"), "duree_s": m.get("duree_s")} for m in (r.data or [])]
    except Exception as e:
        logger.error(f"musiques du compte {telegram_id}: {e}")
        return []


def decouper(telegram_id: str, musique_id: str, debut_s=None, duree_s=None) -> dict:
    """Enregistre le passage retenu d'une musique importée. Les deux à None = piste entière."""
    from config import supabase, logger

    def _borne(v, mini=0.0):
        if v in (None, ""):
            return None
        try:
            return max(mini, round(float(v), 2))
        except (TypeError, ValueError):
            return None

    d, du = _borne(debut_s), _borne(duree_s, 0.5)
    try:
        r = (supabase.table("brand_musiques").update({"debut_s": d, "duree_s": du})
             .eq("id", musique_id).eq("telegram_id", telegram_id).execute())
    except Exception as e:
        logger.error(f"decoupage musique {musique_id}: {e}")
        return {"error": "Découpage impossible."}
    if not r.data:
        return {"error": "Musique introuvable."}
    m = r.data[0]
    return {"id": m["id"], "label": m["label"], "url": m["url"], "category": "perso",
            "debut_s": m.get("debut_s"), "duree_s": m.get("duree_s")}


def bibliotheque(telegram_id: str = None) -> tuple:
    """(catégories, pistes) — la bibliothèque partagée + les MP3 du client en tête."""
    perso = musiques_du_compte(telegram_id) if telegram_id else []
    cats = ([{"id": "perso", "label": "Mes musiques"}] if perso else []) + MUSIC_CATEGORIES
    return cats, perso + MUSIC_LIBRARY


def pour_rendu(url: str | None, debut_s=None, duree_s=None) -> str | None:
    """Version allégée d'une piste pour le rendu Remotion.

    L'audio est ré-encodé à la volée par Cloudinary en 128 kbps : ~35 % de moins à
    télécharger avant chaque rendu, pour une musique de fond mixée à 30 % derrière
    les bruitages — la différence est inaudible. Le fichier d'origine n'est pas
    touché (c'est une transformation d'URL), et la pré-écoute reste en pleine qualité.
    `q_auto` ne sert à rien ici : testé, aucun gain sur de l'audio.
    """
    if not url or "res.cloudinary.com" not in url or "/upload/" not in url:
        return url
    base, _, fin = url.partition("/upload/")
    if fin.startswith(("ac_", "so_")):   # déjà transformée
        return url
    if fin.startswith("q_auto/"):        # q_auto n'apporte rien sur l'audio : on le remplace
        fin = fin[len("q_auto/"):]
    # Passage retenu par le client : so_ = début, du_ = durée. Ne transporter que
    # ces secondes-là, au lieu du morceau entier, est le vrai gain sur un long MP3.
    coupe = ""
    if debut_s not in (None, "", 0):
        coupe += f"so_{float(debut_s):g},"
    if duree_s not in (None, ""):
        coupe += f"du_{float(duree_s):g},"
    return f"{base}/upload/{coupe}ac_mp3,br_128k/{fin}"


def url_de(music_id: str | None, telegram_id: str = None, rendu: bool = False) -> str | None:
    """URL d'une piste, qu'elle vienne de la bibliothèque partagée ou du client.
    `rendu=True` : version allégée, limitée au passage retenu par le client."""
    u = musique_url(music_id)
    if u:
        return pour_rendu(u) if rendu else u
    if not (music_id and telegram_id):
        return None
    m = next((x for x in musiques_du_compte(telegram_id) if x["id"] == music_id), None)
    if not m:
        return None
    return pour_rendu(m["url"], m.get("debut_s"), m.get("duree_s")) if rendu else m["url"]


def piste(music_id: str | None) -> dict | None:
    """La piste correspondant à l'id, ou None (inclut l'entrée « none » : url None)."""
    if not music_id:
        return None
    return next((m for m in MUSIC_LIBRARY if m["id"] == music_id), None)


def musique_url(music_id: str | None) -> str | None:
    """URL Cloudinary de la piste, ou None si inconnue / « none »."""
    m = piste(music_id)
    return m["url"] if m else None
