"""
Studio Reels (Remotion) :
  1. Claude (Haiku) condense un post existant en {hook, points, cta}.
  2. Remotion rend un reel MP4 vertical 1080x1920 a la charte du client
     (template remotion/src/ReelBrand.tsx, rendu par subprocess CLI).
  3. Upload Cloudinary (video) -> nouveau contenu "Reel" en "A valider",
     publie ensuite par le flux normal (validation -> Zernio).

Prerequis serveur : Node + `npm ci` dans le dossier remotion/ (voir REMOTION_DIR).
Env optionnels :
  REMOTION_DIR      chemin du projet Remotion (defaut: <repo>/remotion)
  REMOTION_BROWSER  chemin d'un Chrome/Chromium deja present (evite un telechargement)
"""
import json
import os
import re
import subprocess
import tempfile
import time
from datetime import datetime, timezone

import cloudinary
import cloudinary.uploader
from config import (
    supabase, logger,
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
)
from services.agent_service import _charger_marque, _messages_create
from services import planning_service, music_library

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTION_DIR = os.environ.get("REMOTION_DIR") or os.path.join(_BACKEND_DIR, "remotion")
REMOTION_BROWSER = os.environ.get("REMOTION_BROWSER")

# Cout d'une minute de rendu, en dollars. Un rendu Remotion sature les coeurs du
# conteneur : le seul cout reel est le TEMPS de calcul facture par l'hebergeur.
# Valeur par defaut prudente pour ~2 vCPU + 2 Go sur Railway ; a ajuster depuis la
# facture reelle via REMOTION_COUT_MINUTE_USD.
COUT_RENDU_MINUTE_USD = float(os.environ.get("REMOTION_COUT_MINUTE_USD", "0.0014"))

_MODELE_SCRIPT = "claude-haiku-4-5"


def _journal_llm(telegram_id: str, action: str, resp, modele: str = _MODELE_SCRIPT) -> None:
    """Journalise un appel LLM du studio reels dans usage_log.

    Un reel coute DEUX choses : l'ecriture du scenario par Claude (tokens, ici) et
    le rendu Remotion (temps de calcul, voir _rendre_mp4). Sans cette moitie, le
    cout affiche a l'admin serait faux."""
    if not telegram_id or resp is None:
        return
    try:
        from services.agent_service import _usage
        from services import usage_service
        usage_service.log(telegram_id, action, modele, _usage(resp), 0)
    except Exception as e:
        logger.warning(f"journal LLM {action}: {e}")

# ----------------------------------------------------------------- Bibliotheque de templates
# Ajouter un template = 1 composition .tsx dans remotion/src + 1 entree ici.
# id -> composition Remotion + metadonnees galerie. Les entrees "sequence*" partagent
# la composition ReelSequence : "style" pilote l'habillage (typo, letterbox, cadre).
# q_auto : allege les apercus ET donne une cle CDN distincte de l'URL brute
# (le CDN avait mis en cache des 404 demandes avant la fin des uploads).
_APERCUS = "https://res.cloudinary.com/dy9gp5pim/video/upload/q_auto/reels/_templates"
TEMPLATES = {
    "sequence": {"composition": "ReelSequence", "label": "Séquence", "duree": 18, "style": "signature",
                 "tags": ["Tous usages"],
                 "apercu": f"{_APERCUS}/sequence-signature.mp4",
                 "desc": "Le montage pro : plans multiples composés par l'IA — tes visuels, textes animés, unique à chaque post."},
    "sequence-cinema": {"composition": "ReelSequence", "label": "Séquence — Cinéma", "duree": 18, "style": "cinema",
                        "tags": ["Haut de gamme", "Hôtel · Immo"],
                        "apercu": f"{_APERCUS}/sequence-cinema.mp4",
                        "desc": "Le même montage en écriture cinéma : letterbox, légendes élégantes, rythme posé."},
    "sequence-editorial": {"composition": "ReelSequence", "label": "Séquence — Éditorial", "duree": 18, "style": "editorial",
                           "tags": ["Marques", "Produit"],
                           "apercu": f"{_APERCUS}/sequence-editorial.mp4",
                           "desc": "Façon magazine : cadre fin, numéros de page, accents nets."},
    "sequence-impact": {"composition": "ReelSequence", "label": "Séquence — Impact", "duree": 16, "style": "impact",
                        "tags": ["Punchy", "Promo"],
                        "apercu": f"{_APERCUS}/sequence-impact.mp4",
                        "desc": "Noir et brutal : mots énormes, coupes sèches, flashs — pour les annonces qui claquent."},
    "sequence-odyssee": {"composition": "ReelSequence", "label": "Séquence — Odyssée", "duree": 18, "style": "odyssee",
                         "tags": ["Spectaculaire", "Voyage"],
                         "apercu": f"{_APERCUS}/sequence-odyssee.mp4",
                         "desc": "Profondeur spatiale : images traversées en zoom, typo espacée — grandiose et immersif."},
    "sequence-vlog": {"composition": "ReelSequence", "label": "Séquence — Vlog", "duree": 18, "style": "vlog",
                      "tags": ["Casual", "Coulisses"],
                      "apercu": f"{_APERCUS}/sequence-vlog.mp4",
                      "desc": "Esprit vlog : mots en stickers, cadre caméra REC, image qui respire — proche et authentique."},
    "sequence-carnet": {"composition": "ReelSequence", "label": "Séquence — Carnet", "duree": 18, "style": "carnet",
                        "tags": ["Voyage", "Lifestyle"],
                        "apercu": f"{_APERCUS}/sequence-carnet.mp4",
                        "desc": "Carnet de voyage : polaroids scotchés, écriture manuscrite, papier crème."},
    "sequence-avantapres": {"composition": "ReelSequence", "label": "Séquence — Avant/Après", "duree": 16, "style": "avantapres",
                            "tags": ["Transformation", "Preuve"],
                            "apercu": f"{_APERCUS}/sequence-avantapres.mp4",
                            "desc": "La preuve par l'image : visuels badgés AVANT puis APRÈS — parfait pour les transformations."},
    "sequence-temoignage": {"composition": "ReelSequence", "label": "Séquence — Témoignage", "duree": 16, "style": "temoignage",
                            "tags": ["Avis client", "Confiance"],
                            "apercu": f"{_APERCUS}/sequence-temoignage.mp4",
                            "desc": "Un avis client mis en scène : 5 étoiles, citation en lettres serif, signature."},
    "sequence-conseils": {"composition": "ReelSequence", "label": "Séquence — Conseils", "duree": 18, "style": "conseils",
                          "tags": ["Éducatif", "Tips"],
                          "apercu": f"{_APERCUS}/sequence-conseils.mp4",
                          "desc": "Accroche puis conseils numérotés — le format qui se partage et se sauvegarde."},
    "affiche": {"composition": "ReelAffiche", "label": "Affiche", "duree": 11, "tags": ["Pub"], "apercu": None,
                "desc": "La pub premium : titre accentué, 3 arguments à icônes, ton image, CTA brillant."},
    "impact":  {"composition": "ReelBrand", "label": "Impact", "duree": 8, "tags": ["Promo", "Stories"], "apercu": None,
                "desc": "Punchy : accroche mot à mot → 3 preuves → CTA. Idéal stories."},
    "stats":   {"composition": "ReelStat", "label": "Gros chiffres", "duree": 10, "tags": ["Résultats"], "apercu": None,
                "desc": "Un chiffre géant par écran, qui compte en direct. Pour les posts à résultats."},
    "long":    {"composition": "ReelLong", "label": "Narratif", "duree": 22, "tags": ["Storytelling"], "apercu": None,
                "desc": "Accroche → contexte → preuves plein écran → leçon en citation → CTA."},
}


# Styles valides du moteur ReelSequence (= valeurs "style" des entrees sequence*)
_STYLES_SEQUENCE = tuple(v["style"] for k, v in TEMPLATES.items() if k.startswith("sequence"))


def liste_templates() -> list:
    return [{"id": k, "label": v["label"], "duree": v["duree"], "desc": v["desc"],
             "tags": v.get("tags") or [], "apercu": v.get("apercu"), "sequence": k.startswith("sequence")}
            for k, v in TEMPLATES.items()]


_ROLE_RECO = (
    "Tu recommandes UN template de reel pour un post donne. Voici les templates :\n"
    "- sequence : montage multi-plans avec les visuels du post (bon defaut)\n"
    "- sequence-cinema : haut de gamme, contemplatif (hotellerie, immobilier, bien-etre, luxe)\n"
    "- sequence-editorial : magazine, lancement produit, marques\n"
    "- sequence-impact : annonce choc, promo agressive, urgence, gros lancement\n"
    "- sequence-odyssee : voyage, destination, immobilier de prestige, spectaculaire\n"
    "- sequence-vlog : coulisses, quotidien, createurs, proximite avec l'audience\n"
    "- sequence-carnet : recit de voyage, lifestyle, souvenirs, artisanat\n"
    "- sequence-avantapres : transformation visible, renovation, relooking, resultats photo\n"
    "- sequence-temoignage : avis client, retour d'experience, preuve sociale\n"
    "- sequence-conseils : post educatif, astuces, liste d'erreurs ou de tips\n"
    "- affiche : publicite posee avec arguments structures\n"
    "- impact : promo punchy courte format stories\n"
    "- stats : posts a chiffres et resultats\n"
    "- long : storytelling, lecon, recit personnel\n"
    'Reponds UNIQUEMENT en JSON strict : {"template": "id", "raison": "8-14 mots dans la langue du post"}'
)


def recommander_template(telegram_id: str, contenu_id: str) -> dict:
    """L'IA choisit le template le plus adapte au post (badge « Recommande » de la galerie)."""
    res = (supabase.table("contenu").select("contenu, titre").eq("id", contenu_id)
           .eq("telegram_id", telegram_id).execute())
    if not res.data:
        return {"template": "sequence", "raison": ""}
    texte = (res.data[0].get("contenu") or res.data[0].get("titre") or "")[:2500]
    try:
        resp = _messages_create(
            model="claude-haiku-4-5", max_tokens=120, system=_ROLE_RECO,
            messages=[{"role": "user", "content": f"Post :\n\n{texte}\n\nDonne le JSON."}],
        )
        _journal_llm(telegram_id, "reel_reco", resp)
        raw = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
        tpl = data.get("template") if data.get("template") in TEMPLATES else "sequence"
        return {"template": tpl, "raison": str(data.get("raison") or "")[:120]}
    except Exception as e:
        logger.warning(f"reel reco: {e}")
        low = texte.lower()
        if any(k in low for k in ("%", "promo", "offre", "réduction", "reduction")):
            return {"template": "impact", "raison": ""}
        if any(k in low for k in ("chiffre", "résultat", "resultat", "x2", "x3")):
            return {"template": "stats", "raison": ""}
        return {"template": "sequence", "raison": ""}

_ROLE = (
    "Tu es copywriter pour reels courts. A partir d'un post, tu produis le script d'un reel de 8 s :\n"
    "- hook : une phrase choc de 5 a 10 mots (la promesse ou la tension du post)\n"
    "- points : 3 arguments TRES courts (3 a 6 mots chacun)\n"
    "- cta : un appel a l'action de 2 a 5 mots\n"
    "Ecris dans la langue du post. Reponds UNIQUEMENT en JSON strict : "
    '{"hook": "...", "points": ["...", "...", "..."], "cta": "..."}'
)

_ROLE_LONG = (
    "Tu es copywriter pour reels narratifs de 20-25 s. A partir d'un post, tu produis :\n"
    "- hook : une phrase choc de 5 a 10 mots\n"
    "- contexte : 1-2 phrases qui posent le decor (25 mots max)\n"
    "- points : 3 arguments courts (5 a 10 mots chacun)\n"
    "- lecon : la lecon du post en une phrase citation (15 mots max)\n"
    "- cta : un appel a l'action de 2 a 5 mots\n"
    "Ecris dans la langue du post, orthographe irreprochable. Reponds UNIQUEMENT en JSON strict : "
    '{"hook": "...", "contexte": "...", "points": ["...", "...", "..."], "lecon": "...", "cta": "..."}'
)


_ROLE_AFFICHE = (
    "Tu es directeur artistique publicitaire. A partir d'un post, tu produis le contenu d'une affiche video verticale.\n"
    "Regles : les segments a accentuer sont entre [crochets] (1 par ligne maximum, le mot le plus fort).\n"
    "- headline : 2 ou 3 lignes courtes separees par \\n (3-5 mots par ligne), le mot cle de la derniere ligne entre [crochets]\n"
    "- sub : 2 lignes courtes separees par \\n, un mot [marque] par ligne\n"
    "- features : 3 objets {icon: 'bolt'|'star'|'shield', texte: '4-6 mots avec un mot [marque]', sous: '3-6 mots'}\n"
    "- stat : une ligne percutante avec un segment [marque] (chiffre ou promesse)\n"
    "- cta : 2 a 4 mots\n"
    "Ecris dans la langue du post, orthographe irreprochable. Reponds UNIQUEMENT en JSON strict : "
    '{"headline": "...", "sub": "...", "features": [{"icon": "bolt", "texte": "...", "sous": "..."}, ...], "stat": "...", "cta": "..."}'
)


def _script_affiche(texte: str, marque: dict) -> dict:
    """Script du template Affiche ; repli heuristique si l'appel echoue."""
    try:
        resp = _messages_create(
            model="claude-haiku-4-5",
            max_tokens=500,
            system=_ROLE_AFFICHE,
            messages=[{"role": "user", "content": f"Post :\n\n{texte[:4000]}\n\nDonne le JSON."}],
        )
        _journal_llm(marque.get("telegram_id"), "reel_script_affiche", resp)
        raw = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
        feats = []
        for f in (data.get("features") or [])[:3]:
            feats.append({
                "icon": f.get("icon") if f.get("icon") in ("bolt", "star", "shield") else "bolt",
                "texte": str(f.get("texte") or "")[:60],
                "sous": str(f.get("sous") or "")[:60],
            })
        if data.get("headline") and len(feats) == 3:
            return {
                "headline": str(data["headline"])[:140],
                "sub": str(data.get("sub") or "")[:160],
                "features": feats,
                "stat": str(data.get("stat") or "")[:120],
                "cta": str(data.get("cta") or "Découvrir")[:32],
            }
    except Exception as e:
        logger.warning(f"reel affiche script LLM: {e}")
    phrases = [s.strip() for s in re.split(r"(?<=[.!?])\s+", texte or "") if s.strip()]
    return {
        "headline": (phrases[0] if phrases else "Un contenu qui travaille pour toi.")[:90],
        "sub": (phrases[1] if len(phrases) > 1 else "")[:120],
        "features": [
            {"icon": "bolt", "texte": (phrases[2] if len(phrases) > 2 else "Simple et rapide")[:60], "sous": ""},
            {"icon": "star", "texte": (phrases[3] if len(phrases) > 3 else "A ta marque")[:60], "sous": ""},
            {"icon": "shield", "texte": (phrases[4] if len(phrases) > 4 else "Tu gardes le controle")[:60], "sous": ""},
        ],
        "stat": "",
        "cta": (marque.get("nom") or "Découvrir")[:32],
    }


_ROLE_SEQUENCE = (
    "You direct short social videos (15-22 s). From a post and a list of available visuals, "
    "you write the SCENARIO of a reel: a sequence of 4 to 7 shots.\n"
    "\n"
    "OUTPUT LANGUAGE — ABSOLUTE RULE. These instructions are in English; every word you WRITE "
    "for the audience (texte, accents, bar, label) must be in the client's language, given below. "
    "Never mix languages, never translate to English, never leave an English word in the reel. "
    "Flawless spelling and accents in that language (é, è, ê, à, ç in French; ñ, á, ó in Spanish).\n"
    "\n"
    "Recipes (pick the one that fits the post):\n"
    "- promo: punchy hook -> benefit -> proof -> offer/CTA\n"
    "- tutorial: hook -> 2 to 4 steps -> CTA\n"
    "- proof: hook -> numbers/results -> CTA\n"
    "Shot types: 'typo' (full-screen text), 'image' (one visual from the list + short text), "
    "'cta' (last shot, mandatory).\n"
    "\n"
    "THE CLIENT'S OWN INSTRUCTIONS OUTRANK EVERYTHING.\n"
    "When the client says what to write or where to place it, obey to the letter:\n"
    "- he dictates a sentence (\"end with: book your demo\") -> reuse HIS EXACT WORDS, "
    "do not rephrase or embellish them, on the exact shot he asks for\n"
    "- \"at the end\" / \"to finish\" -> that is the text of the last shot (the cta)\n"
    "- \"start with\" / \"first\" -> that is the text of shot 1\n"
    "- he imposes a tone, an angle, an order, a banned word -> hold it across ALL shots\n"
    "- his instruction contradicts the recipe or the post? HE WINS.\n"
    "An ignored instruction makes the reel unusable: re-read it before returning your JSON.\n"
    "\n"
    "STRICT rules (they apply UNLESS the client asks otherwise):\n"
    "- 4 to 7 shots, 2 to 4.5 s each, the last one is ALWAYS type cta\n"
    "- texte: 2 to 7 words per shot, punchy\n"
    "- accents: 1 or 2 words of that text to highlight (copied exactly as written)\n"
    "- image_id: ONLY an id from the provided list; if no visual fits, make it a typo shot\n"
    "- vary the effects: zoomIn, zoomOut, panLeft, panRight\n"
    "- bar (cta shot): 2 to 5 words (brand, website or action)\n"
    "- label (optional): shot badge when the art direction asks for it (BEFORE/AFTER, witness signature)\n"
    "Answer with STRICT JSON only: "
    '{"recette": "...", "segments": [{"type": "typo|image|cta", "dur": 2.8, "texte": "...", '
    '"accents": ["..."], "image_id": "...or null", "effet": "zoomIn|zoomOut|panLeft|panRight", '
    '"reveal": "carte|lamelles|portes|stores|iris", "bar": "...if cta", "label": "...optional"}]}'
)

# Direction artistique par style : injectee dans le prompt scenariste pour que
# l'ECRITURE colle a l'habillage (le moteur Remotion fait le reste).
_GUIDES_STYLE = {
    "impact": ("IMPACT STYLE: sentences of 2 to 4 words MAXIMUM, strong verbs, zero filler. "
               "Fast pace: dur between 2 and 2.8 s."),
    "odyssee": ("ODYSSEY STYLE: grand, evocative tone (journey, vastness). "
                "Favour image shots with the iris reveal; short, airy texts."),
    "vlog": ("VLOG STYLE: spoken, direct tone, first person, like a face-to-camera story. "
             "Natural and complicit, never corporate."),
    "carnet": ("TRAVEL JOURNAL STYLE: intimate logbook tone in the first person, "
               "short sensory sentences."),
    "avantapres": ("MANDATORY BEFORE/AFTER STRUCTURE: shot 1 = typo hook; then a strict alternation "
                   "of images labelled BEFORE then AFTER (fill the label field, in the client's "
                   "language) following the logical order of the visuals; last shot is the cta. "
                   "Not enough images? Replace them with typo shots describing the before, then the after."),
    "temoignage": ("TESTIMONIAL STYLE: write the reel as ONE authentic client quote in the first person "
                   "(concrete result, sincere emotion). On the LAST shot before the cta, set "
                   "label = 'First name, role' (e.g. 'Sophie, client since 2024')."),
    "conseils": ("TIPS STRUCTURE: shot 1 = typo hook (a promise or a common mistake); then 3 to 5 shots "
                 "= ONE concrete, actionable tip per shot (typo or image); last shot is the cta."),
}

# Langue de redaction du client -> consigne explicite (on ne laisse pas le modele deduire).
_LANGUES = {"fr": "French", "en": "English", "es": "Spanish"}


def upload_image_source(telegram_id: str, data: bytes) -> dict:
    """Visuel source d'un reel Sequence : Cloudinary + description vision (une fois)."""
    from services.banque_service import _decrire
    up = cloudinary.uploader.upload(
        data, folder=f"reels-sources/{telegram_id}",
        transformation=[{"width": 1600, "crop": "limit"}, {"quality": "auto"}],
    )
    url = up["secure_url"]
    d = _decrire(url, telegram_id)
    return {"url": url, "desc": d["description"]}


def importer_musique(telegram_id: str, data: bytes, nom_fichier: str = None) -> dict:
    """Ajoute un MP3 du client à sa bibliothèque (Cloudinary + ligne brand_musiques).
    Cloudinary range l'audio sous resource_type='video' — c'est sa convention."""
    from services import music_library
    if len(data) > music_library.TAILLE_MAX_MO * 1024 * 1024:
        return {"error": f"Fichier trop lourd (max {music_library.TAILLE_MAX_MO} Mo)."}
    if len(music_library.musiques_du_compte(telegram_id)) >= music_library.MAX_MUSIQUES:
        return {"error": f"Bibliothèque pleine ({music_library.MAX_MUSIQUES} musiques). Supprimes-en une d'abord."}
    label = re.sub(r"\.[a-z0-9]{2,4}$", "", (nom_fichier or "").strip(), flags=re.I)[:60] or "Ma musique"
    try:
        up = cloudinary.uploader.upload(data, resource_type="video", folder=f"musiques/{telegram_id}")
        ins = supabase.table("brand_musiques").insert({
            "telegram_id": telegram_id, "url": up["secure_url"], "label": label,
        }).execute()
    except Exception as e:
        logger.error(f"import musique {telegram_id}: {e}")
        return {"error": "Import impossible."}
    if not ins.data:
        return {"error": "Enregistrement impossible."}
    m = ins.data[0]
    return {"id": m["id"], "label": m["label"], "url": m["url"], "category": "perso"}


def supprimer_musique(telegram_id: str, musique_id: str) -> dict:
    """Retire la piste ET son fichier Cloudinary (pas d'accumulation)."""
    r = (supabase.table("brand_musiques").select("url").eq("id", musique_id)
         .eq("telegram_id", telegram_id).execute())
    if not r.data:
        return {"error": "Musique introuvable."}
    try:
        m = re.search(r"/upload/(?:v\d+/)?(.+)\.[a-z0-9]+$", r.data[0]["url"], re.I)
        if m:
            cloudinary.uploader.destroy(m.group(1), resource_type="video", invalidate=True)
    except Exception as e:
        logger.warning(f"destroy musique cloudinary: {e}")
    supabase.table("brand_musiques").delete().eq("id", musique_id).eq("telegram_id", telegram_id).execute()
    return {"ok": True}


def _est_image_source(url: str) -> bool:
    """Une vraie image : pas un mp4, pas un poster derive d'une video (/video/upload/)."""
    return bool(url) and not url.endswith(".mp4") and "/video/upload/" not in url


def _img_rendu(url: str) -> str:
    """Version 1200px/q_auto d'une image Cloudinary : chargement rapide au rendu."""
    if url and "res.cloudinary.com" in url and "/upload/" in url and "/upload/w_" not in url:
        return url.replace("/upload/", "/upload/w_1200,q_auto/", 1)
    return url


def _pool_visuels(telegram_id: str, cur: dict) -> list:
    """Visuels mobilisables pour le scenario : visuel du post + gabarits de la marque.
    Chaque entree : {id, url, desc} — l'agent ne voit que id + desc, jamais d'URL."""
    pool = []
    lv = cur.get("lien_visuel")
    if lv and "cloudinary" in lv and _est_image_source(lv):
        pool.append({"id": "visuel_post", "url": lv, "desc": "Visuel principal du post"})
    for s_url in (cur.get("slides_images") or [])[:3]:
        pool.append({"id": f"slide_{len(pool)}", "url": s_url, "desc": "Slide du carrousel du post"})
    try:
        r = supabase.table("brand_templates").select("id, nom, note, images").eq("telegram_id", telegram_id).limit(5).execute()
        for row in (r.data or []):
            for i, u in enumerate((row.get("images") or [])[:2]):
                pool.append({
                    "id": f"bt_{str(row['id'])[:8]}_{i}",
                    "url": u,
                    "desc": f"Visuel de marque « {row.get('nom') or 'gabarit'} »" + (f" — {row['note']}" if row.get("note") else ""),
                })
    except Exception as e:
        logger.warning(f"reel pool visuels: {e}")
    return pool[:8]


_REVEALS = ("carte", "lamelles", "portes", "stores", "iris")


def _pimenter_reveals(segments: list, graine: str):
    """Le piment : chaque reel tire sa propre rotation de revelations, ancree sur
    le contenu (stable au re-rendu, differente d'un reel a l'autre). Corrige aussi
    les repetitions du LLM : jamais deux reveals identiques d'affilee."""
    import hashlib
    seed = int(hashlib.md5((graine or "reel").encode()).hexdigest()[:8], 16)
    ordre = list(_REVEALS)
    # melange deterministe de la bibliotheque selon la graine
    for i in range(len(ordre) - 1, 0, -1):
        seed = (seed * 1103515245 + 12345) % (2 ** 31)
        j = seed % (i + 1)
        ordre[i], ordre[j] = ordre[j], ordre[i]
    k = 0
    precedent = None
    for seg in segments:
        if seg.get("type") != "image":
            continue
        r = seg.get("reveal")
        if r not in _REVEALS or r == precedent:
            r = ordre[k % len(ordre)]
            if r == precedent:
                k += 1
                r = ordre[k % len(ordre)]
        precedent = r
        seg["reveal"] = r
        k += 1
    return segments


def _script_sequence(texte: str, marque: dict, pool: list, brief: str = None, imposees: bool = False,
                     style: str = None) -> dict:
    """Scenario de sequence ; validation stricte + repli heuristique.
    imposees=True : les visuels ont ete CHOISIS par le client -> tous utilises.
    style : injecte la direction artistique du template dans l'ecriture."""
    ids = {p["id"] for p in pool}
    urls = {p["id"]: _img_rendu(p["url"]) for p in pool}
    liste = "\n".join(f"- {p['id']} : {p['desc']}" for p in pool) or "(aucun visuel disponible)"
    # Langue de redaction : celle du compte, transmise explicitement (jamais deduite).
    langue = _LANGUES.get((marque.get("langue") or "fr").lower(), "French")
    role = (_ROLE_SEQUENCE
            + f"\n\nCLIENT'S LANGUAGE — write every audience-facing word in {langue.upper()}."
            + (f"\n\n{_GUIDES_STYLE[style]}" if style in _GUIDES_STYLE else ""))
    consigne = ""
    if imposees and pool:
        consigne = ("\nIMPORTANT: the client picked these visuals himself. You MUST use them ALL, "
                    "one per image shot, in the order that best serves the narration.")
    # Le brief est repris en TETE du message (et non en annexe) : c'est l'element
    # que le client a ecrit lui-meme, il prime sur le post et sur la recette.
    entete = ""
    if brief:
        entete = ("### CLIENT'S OWN INSTRUCTIONS — FOLLOW THEM TO THE LETTER\n"
                  f"{brief[:1500].strip()}\n"
                  "### end of instructions\n\n")
        consigne += ("\nREMINDER: apply the client's instructions above word for word. "
                     "If he dictates a sentence, copy it as-is on the shot he asked for.")
    segments = None
    try:
        resp = _messages_create(
            model="claude-haiku-4-5",
            max_tokens=900,
            system=role,
            messages=[{"role": "user", "content": f"{entete}Post:\n\n{texte[:4000]}\n\nAvailable visuals:\n{liste}{consigne}\n\nReturn the JSON."}],
        )
        _journal_llm(marque.get("telegram_id"), "reel_scenario", resp)
        raw = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
        segs = []
        for s in (data.get("segments") or [])[:7]:
            t = s.get("type") if s.get("type") in ("typo", "image", "cta") else "typo"
            img_id = s.get("image_id")
            seg = {
                "type": t,
                "dur": max(2.0, min(4.5, float(s.get("dur") or 3))),
                "texte": str(s.get("texte") or "")[:80].strip(),
                "accents": [str(a)[:30] for a in (s.get("accents") or [])[:2]],
            }
            if t == "image":
                if img_id in ids:
                    seg["image"] = urls[img_id]
                    seg["image_id"] = img_id
                    seg["effet"] = s.get("effet") if s.get("effet") in ("zoomIn", "zoomOut", "panLeft", "panRight") else "zoomIn"
                    if s.get("reveal") in _REVEALS:
                        seg["reveal"] = s["reveal"]
                    seg["tilt"] = [-3, 2, -2, 3][len(segs) % 4]
                else:
                    seg["type"] = "typo"   # id inconnu -> jamais d'URL inventee
            if t == "cta":
                seg["bar"] = str(s.get("bar") or marque.get("nom") or "")[:40]
            if s.get("label"):
                seg["label"] = str(s["label"])[:40]
            if seg["texte"]:
                segs.append(seg)
        # invariants : 4-7 plans, le dernier est un cta
        if segs and segs[-1]["type"] != "cta":
            segs.append({"type": "cta", "dur": 3.2, "texte": segs[-1]["texte"][:40] or "Suis-nous",
                         "accents": [], "bar": str(marque.get("nom") or "")[:40]})
        if len(segs) >= 4:
            segments = segs
    except Exception as e:
        logger.warning(f"reel sequence script LLM: {e}")
    if segments is None:
        # Repli : hook -> visuels -> CTA. Si les visuels sont imposes, TOUS y passent.
        phrases = [s.strip() for s in re.split(r"(?<=[.!?])\s+", texte or "") if s.strip()]
        segments = [{"type": "typo", "dur": 2.6, "texte": (phrases[0] if phrases else "Un contenu qui travaille pour toi.")[:70], "accents": []}]
        visuels = pool if imposees else pool[:1]
        effets = ["zoomIn", "panRight", "zoomOut", "panLeft"]
        for i, v in enumerate(visuels[:5]):
            txt = (phrases[1 + i] if len(phrases) > 1 + i else "Regarde.")[:60]
            segments.append({"type": "image", "dur": 3.0, "texte": txt, "accents": [],
                             "image": _img_rendu(v["url"]), "image_id": v["id"], "effet": effets[i % 4], "tilt": [-3, 2, -2, 3][i % 4]})
        if not visuels:
            for p in phrases[2:4]:
                segments.append({"type": "typo", "dur": 2.8, "texte": p[:70], "accents": []})
        segments.append({"type": "cta", "dur": 3.2, "texte": "On en parle ?", "accents": [],
                         "bar": str(marque.get("nom") or "Suis-nous")[:40]})
    return {"recette": "auto", "brief": brief,
            "segments": _pimenter_reveals(segments, (brief or "") + (texte or "")[:120])}


def _script_depuis_post(texte: str, marque: dict, long: bool = False) -> dict:
    """Claude condense le post ; repli heuristique si l'appel echoue."""
    try:
        resp = _messages_create(
            model="claude-haiku-4-5",
            max_tokens=450 if long else 300,
            system=_ROLE_LONG if long else _ROLE,
            messages=[{"role": "user", "content": f"Post :\n\n{texte[:4000]}\n\nDonne le JSON."}],
        )
        _journal_llm(marque.get("telegram_id"), "reel_script", resp)
        raw = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0) if m else raw)
        if data.get("hook") and isinstance(data.get("points"), list):
            script = {
                "hook": str(data["hook"])[:120],
                "points": [str(p)[:80] for p in data["points"][:3]] or ["Simple.", "Rapide.", "A ta marque."],
                "cta": str(data.get("cta") or "Suis-nous")[:40],
            }
            if long:
                script["contexte"] = str(data.get("contexte") or "")[:220]
                script["lecon"] = str(data.get("lecon") or "")[:140]
            return script
    except Exception as e:
        logger.warning(f"reel script LLM: {e}")
    # Repli : premiere phrase = hook, suivantes = points
    phrases = [s.strip() for s in re.split(r"(?<=[.!?])\s+", texte or "") if s.strip()]
    script = {
        "hook": (phrases[0] if phrases else "Un contenu qui travaille pour toi.")[:120],
        "points": [p[:80] for p in phrases[1:4]] or ["Simple.", "Rapide.", "A ta marque."],
        "cta": (marque.get("nom") or "Suis-nous")[:40],
    }
    if long:
        script["contexte"] = (phrases[1] if len(phrases) > 1 else "")[:220]
        script["lecon"] = (phrases[-1] if len(phrases) > 4 else "")[:140]
    return script


def _props_marque(u: dict, script: dict) -> dict:
    return {
        "brand": {
            "nom": u.get("nom") or u.get("user_name") or "Ma marque",
            "principale": u.get("couleur_principale") or "#5B6CFF",
            "accent": u.get("couleur_accent") or "#3AFFA3",
            "fond": "#0a0a12",
            "logo": u.get("logo_url") or None,
        },
        "hook": script["hook"],
        "points": script["points"],
        "cta": script["cta"],
    }


def _rendre_mp4(props: dict, composition: str = "ReelBrand",
                telegram_id: str = None, etiquette: str = None) -> str:
    """Lance le rendu Remotion en subprocess. Retourne le chemin du MP4.

    Le temps de calcul est journalise dans usage_log (colonne duree_s) avec son
    cout estime : c'est la seule depense reelle d'un rendu, et la moyenne permet
    de savoir ce que coute un reel. Les echecs sont journalises aussi — ils
    consomment du CPU sans rien produire."""
    if not os.path.isdir(os.path.join(REMOTION_DIR, "node_modules")):
        raise RuntimeError(f"Remotion non installe ({REMOTION_DIR}) : lancer `npm ci` dans ce dossier.")
    fd, props_path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)
    out_path = os.path.join(tempfile.gettempdir(), f"reel_{next(tempfile._get_candidate_names())}.mp4")
    npx = "npx.cmd" if os.name == "nt" else "npx"
    cmd = [npx, "remotion", "render", "src/index.ts", composition, out_path, f"--props={props_path}", "--timeout=120000"]
    if REMOTION_BROWSER:
        cmd.append(f"--browser-executable={REMOTION_BROWSER}")
    depart = time.monotonic()
    ok = False
    try:
        r = subprocess.run(cmd, cwd=REMOTION_DIR, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=900)
        if r.returncode != 0 or not os.path.exists(out_path):
            tail = (r.stderr or r.stdout or "")[-800:]
            raise RuntimeError(f"rendu remotion (code {r.returncode}) : {tail}")
        ok = True
        return out_path
    finally:
        duree = time.monotonic() - depart
        if telegram_id:
            try:
                from services import usage_service
                usage_service.log(
                    telegram_id,
                    "reel_rendu" if ok else "reel_rendu_echec",
                    etiquette or composition, {}, 0,
                    cost_override=round(duree / 60 * COUT_RENDU_MINUTE_USD, 6),
                    duree_s=duree,
                )
            except Exception as e:
                logger.warning(f"journal du rendu {composition}: {e}")
        try:
            os.unlink(props_path)
        except OSError:
            pass


def creer_reel_libre(telegram_id: str, brief: str, images: list = None, reseau: str = "Instagram",
                     style: str = None, musique: str = None) -> dict:
    """Cree un reel Sequence SANS contenu source : le brief du client est le sujet.
    Le resultat entre dans Contenus comme un Reel « A valider », planifie normalement."""
    if not (brief or "").strip():
        return {"error": "Decris ton reel : le brief est le sujet."}
    u = _charger_marque(telegram_id)
    imgs = [{"url": im.get("url"), "desc": im.get("desc")}
            for im in (images or []) if _est_image_source(im.get("url"))]
    st = style if style in _STYLES_SEQUENCE else "signature"
    if imgs:
        pool = [{"id": f"img_{i+1}", "url": im["url"],
                 "desc": (im.get("desc") or f"Visuel fourni n°{i+1}")[:200]}
                for i, im in enumerate(imgs)]
        scenario = _script_sequence(brief, u, pool, brief=brief, imposees=True, style=st)
    else:
        scenario = _script_sequence(brief, u, [], brief=brief, style=st)
    scenario["style"] = st
    scenario["musique"] = musique if music_library.url_de(musique, telegram_id) else None
    props = {
        "brand": _props_marque(u, {"hook": "", "points": [], "cta": ""})["brand"],
        "segments": [{k: v for k, v in sg.items() if k != "image_id"} for sg in scenario["segments"]],
        "style": st,
        "musique": music_library.url_de(scenario["musique"], telegram_id, rendu=True),
    }
    try:
        mp4 = _rendre_mp4(props, composition="ReelSequence",
                          telegram_id=telegram_id, etiquette=f"sequence/{st}")
    except Exception as e:
        logger.error(f"reel libre rendu: {e}")
        return {"error": "Le rendu du reel a echoue. Reessaie dans un instant."}

    hook = (scenario["segments"][0]["texte"] if scenario["segments"] else brief)[:60]
    row = {
        "telegram_id": telegram_id,
        "titre": f"Reel — {hook}",
        "contenu": brief.strip(),
        "type": "Reel",
        "reseau_cible": reseau or "Instagram",
        "statut": "A valider",
        "reel_data": scenario,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    creneau = planning_service.prochain_creneau(telegram_id, row["reseau_cible"], "Reel")
    if creneau:
        row["date_publication"] = creneau
    try:
        ins = supabase.table("contenu").insert(row).execute()
    except Exception as e:
        if any(m in str(e) for m in ("PGRST204", "42703", "does not exist", "schema cache")):
            row.pop("reel_data", None)
            ins = supabase.table("contenu").insert(row).execute()
        else:
            raise
    new_id = ins.data[0]["id"] if ins.data else None
    if not new_id:
        try:
            os.unlink(mp4)
        except OSError:
            pass
        return {"error": "Creation du contenu reel impossible."}
    try:
        up = cloudinary.uploader.upload(
            mp4, resource_type="video",
            public_id=f"reels/{telegram_id}/{new_id}",
            overwrite=True, invalidate=True,
        )
        url = up["secure_url"]
        preview = url.rsplit(".", 1)[0] + ".jpg"
        supabase.table("contenu").update({
            "video_url": url, "video_status": "ready", "video_preview_url": preview,
            "lien_visuel": preview,
        }).eq("id", new_id).execute()
    except Exception as e:
        logger.error(f"reel libre upload: {e}")
        supabase.table("contenu").delete().eq("id", new_id).execute()
        return {"error": "Upload de la video impossible."}
    finally:
        try:
            os.unlink(mp4)
        except OSError:
            pass
    return {"id": new_id, "video_url": url, "hook": hook,
            "reseau": row["reseau_cible"], "date_publication": row.get("date_publication")}


def regenerer_reel(telegram_id: str, reel_id: str, images: list = None, brief: str = None, style: str = None,
                   musique: str = None) -> dict:
    """Re-scenarise et re-rend un reel Sequence EXISTANT (statut A valider) : la video
    est remplacee sur place (meme contenu, meme public_id Cloudinary), pas de doublon."""
    res = supabase.table("contenu").select("*").eq("id", reel_id).eq("telegram_id", telegram_id).execute()
    if not res.data:
        return {"error": "Reel introuvable."}
    cur = res.data[0]
    if cur.get("type") != "Reel" or not cur.get("reel_data"):
        return {"error": "Ce contenu n'est pas un reel modifiable."}
    if cur.get("statut") not in ("A valider", "Refuse", "Refusé"):
        return {"error": "Ce reel a deja ete valide : il ne peut plus etre modifie."}
    texte = cur.get("contenu") or cur.get("titre") or ""
    u = _charger_marque(telegram_id)
    old_sc = cur.get("reel_data") or {}
    if style is None:
        style = old_sc.get("style")
    if musique is None:
        musique = old_sc.get("musique")   # None = garder ; "none" = retirer explicitement
    if brief is None:
        brief = old_sc.get("brief")
    if images is None:
        images = [{"url": sg.get("image"), "desc": None}
                  for sg in old_sc.get("segments", []) if _est_image_source(sg.get("image"))]
    st = style if style in _STYLES_SEQUENCE else "signature"
    if images:
        pool = [{"id": f"img_{i+1}", "url": im["url"],
                 "desc": (im.get("desc") or f"Visuel fourni n°{i+1}")[:200]}
                for i, im in enumerate(images) if im.get("url")]
        scenario = _script_sequence(texte, u, pool, brief=brief, imposees=True, style=st)
    else:
        pool = _pool_visuels(telegram_id, cur)
        scenario = _script_sequence(texte, u, pool, brief=brief, style=st)
    scenario["style"] = st
    scenario["musique"] = musique if music_library.url_de(musique, telegram_id) else None
    props = {
        "brand": _props_marque(u, {"hook": "", "points": [], "cta": ""})["brand"],
        "segments": [{k: v for k, v in sg.items() if k != "image_id"} for sg in scenario["segments"]],
        "style": st,
        "musique": music_library.url_de(scenario["musique"], telegram_id, rendu=True),
    }
    try:
        mp4 = _rendre_mp4(props, composition="ReelSequence",
                          telegram_id=telegram_id, etiquette=f"sequence/{st}")
    except Exception as e:
        logger.error(f"reel regen rendu: {e}")
        return {"error": "Le rendu du reel a echoue. Reessaie dans un instant."}
    try:
        up = cloudinary.uploader.upload(
            mp4, resource_type="video",
            public_id=f"reels/{telegram_id}/{reel_id}",
            overwrite=True, invalidate=True,
        )
        url = up["secure_url"]
        preview = url.rsplit(".", 1)[0] + ".jpg"
        maj = {"video_url": url, "video_preview_url": preview, "lien_visuel": preview,
               "reel_data": scenario, "video_status": "ready"}
        supabase.table("contenu").update(maj).eq("id", reel_id).execute()
    except Exception as e:
        logger.error(f"reel regen upload: {e}")
        return {"error": "Upload de la video impossible."}
    finally:
        try:
            os.unlink(mp4)
        except OSError:
            pass
    return {"id": reel_id, "video_url": url, "video_preview_url": preview}


def generer_reel(telegram_id: str, contenu_id: str, template: str = "impact",
                 images: list = None, brief: str = None, style: str = None,
                 musique: str = None) -> dict:
    """Pipeline complet : post -> script -> rendu -> Cloudinary -> contenu jumeau 'Reel'.
    template : cle de TEMPLATES ('affiche', 'impact', 'stats', 'long')."""
    if template not in TEMPLATES:
        return {"error": "Template de reel inconnu."}
    res = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    if not res.data:
        return {"error": "Contenu introuvable."}
    cur = res.data[0]
    texte = cur.get("contenu") or cur.get("titre") or ""
    if not texte.strip():
        return {"error": "Ce contenu n'a pas de texte a transformer en reel."}

    u = _charger_marque(telegram_id)
    scenario = None
    if template.startswith("sequence"):
        if style is None:
            style = TEMPLATES.get(template, {}).get("style")
        st = style if style in _STYLES_SEQUENCE else "signature"
        # Visuels CHOISIS par le client (dialogue Sequence) > pool automatique du compte
        if images:
            pool = [{"id": f"img_{i+1}", "url": im["url"],
                     "desc": (im.get("desc") or f"Visuel fourni n°{i+1}")[:200]}
                    for i, im in enumerate(images) if _est_image_source(im.get("url"))]
            scenario = _script_sequence(texte, u, pool, brief=brief, imposees=True, style=st)
        else:
            pool = _pool_visuels(telegram_id, cur)
            scenario = _script_sequence(texte, u, pool, brief=brief, style=st)
        scenario["style"] = st
        scenario["musique"] = musique if music_library.url_de(musique, telegram_id) else None
        script = {"hook": (scenario["segments"][0]["texte"] if scenario["segments"] else "")[:80]}
        props = {
            "brand": _props_marque(u, {"hook": "", "points": [], "cta": ""})["brand"],
            "segments": [{k: v for k, v in s.items() if k != "image_id"} for s in scenario["segments"]],
            "style": st,
            "musique": music_library.url_de(scenario["musique"], telegram_id, rendu=True),
        }
    elif template == "affiche":
        script = _script_affiche(texte, u)
        props = {
            "brand": _props_marque(u, {"hook": "", "points": [], "cta": ""})["brand"],
            **script,
            # Pas d'image de fond pour l'instant : les visuels de posts contiennent du texte
            # et ecrasent la lisibilite (teste). TODO : champ "image d'affiche" dans la fiche
            # marque (mascotte/portrait du client) dedie a ce template.
            "image": None,
        }
    else:
        long = (template == "long")
        script = _script_depuis_post(texte, u, long=long)
        props = _props_marque(u, script)
        if long:
            props["contexte"] = script.get("contexte") or ""
            props["lecon"] = script.get("lecon") or ""

    try:
        mp4 = _rendre_mp4(props, composition=TEMPLATES[template]["composition"],
                          telegram_id=telegram_id, etiquette=template)
    except Exception as e:
        logger.error(f"reel rendu: {e}")
        return {"error": "Le rendu du reel a echoue. Reessaie dans un instant."}

    # Nouveau contenu AVANT l'upload pour un public_id deterministe (remplace, n'accumule pas)
    row = {
        "telegram_id": telegram_id,
        "titre": f"Reel — {cur.get('titre') or (script.get('hook') or script.get('headline') or '')[:60]}",
        "contenu": cur.get("contenu"),
        "type": "Reel",
        "reseau_cible": cur.get("reseau_cible"),
        "statut": "A valider",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    creneau = planning_service.prochain_creneau(telegram_id, cur.get("reseau_cible"), cur.get("type") or "Reel")
    if creneau:
        row["date_publication"] = creneau
    # Le scenario est conserve (retouche / re-rendu), comme carrousel_data pour les carrousels.
    if scenario:
        row["reel_data"] = scenario
    try:
        ins = supabase.table("contenu").insert(row).execute()
    except Exception as e:
        msg = str(e)
        # Colonne pas encore migree : on n'echoue pas, le reel sort sans scenario stocke.
        if "reel_data" in row and any(m in msg for m in ("PGRST204", "42703", "does not exist", "schema cache")):
            logger.warning("contenu.reel_data absente en base — reel cree sans scenario stocke")
            row.pop("reel_data", None)
            ins = supabase.table("contenu").insert(row).execute()
        else:
            raise
    new_id = ins.data[0]["id"] if ins.data else None
    if not new_id:
        try:
            os.unlink(mp4)
        except OSError:
            pass
        return {"error": "Creation du contenu reel impossible."}

    try:
        up = cloudinary.uploader.upload(
            mp4, resource_type="video",
            public_id=f"reels/{telegram_id}/{new_id}",
            overwrite=True, invalidate=True,
        )
        url = up["secure_url"]
        preview = url.rsplit(".", 1)[0] + ".jpg"  # 1re frame en poster (transformation Cloudinary)
        supabase.table("contenu").update({
            "video_url": url, "video_status": "ready", "video_preview_url": preview,
            "lien_visuel": preview,
        }).eq("id", new_id).execute()
    except Exception as e:
        logger.error(f"reel upload: {e}")
        supabase.table("contenu").delete().eq("id", new_id).execute()
        return {"error": "Upload de la video impossible."}
    finally:
        try:
            os.unlink(mp4)
        except OSError:
            pass

    return {"id": new_id, "video_url": url, "hook": script.get("hook") or script.get("headline"),
            "reseau": row.get("reseau_cible"), "date_publication": row.get("date_publication")}
