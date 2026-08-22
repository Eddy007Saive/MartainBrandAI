# -*- coding: utf-8 -*-
"""
Illustre les articles du blog : une image par article, generee puis deposee
sur Cloudinary, et l'adresse ecrite dans l'en-tete du fichier Markdown.

Pourquoi generer plutot que piocher dans une banque d'images : une photo de
banque se retrouve sur mille autres blogs, et un lecteur qui l'a deja vue
ailleurs vous classe aussitot dans la meme categorie qu'eux. Une image faite
pour l'article, dans la palette de la marque, ne se confond avec rien.

Usage (depuis backend/, venv actif) :
    python scripts/illustrer_blog.py                  # tous les articles sans image
    python scripts/illustrer_blog.py frequence-publication ligne-editoriale
    python scripts/illustrer_blog.py --refaire <id>   # remplace une image existante

L'identifiant est le nom du fichier sans .md. Seule la version FRANCAISE est
illustree : les traductions partagent la meme image, c'est le meme article.
"""
import base64
import io
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import cloudinary
import cloudinary.uploader
import httpx

from config import (
    OPENROUTER_API_KEY, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
)

RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ARTICLES = os.path.join(RACINE, "frontend", "content", "blog", "fr")

# nano-banana 3 : le meme modele que le studio de l'application. Un seul
# fournisseur d'images pour tout le produit, donc un seul comportement a
# connaitre quand un rendu deraille.
MODELE = "google/gemini-3-pro-image-preview"

# La palette de la marque, ecrite ici en toutes lettres : le modele ne lit pas
# tailwind.config.js.
PALETTE = ("deep navy background #020617 to #0f172a, indigo #5B6CFF and violet #8A6CFF "
           "as the dominant accents, a single mint green #3AFFA3 highlight used sparingly")

GABARIT = """Editorial hero illustration for a blog article. 16:9 landscape.

WHAT TO DRAW — draw exactly this scene, nothing else:
{scene}

Style: modern flat vector illustration with subtle depth, clean geometric
shapes, generous negative space, soft ambient glow. Dark theme.
Palette: {palette}
Composition: ONE single idea, centred, uncluttered, still readable at
thumbnail size. Hexagons may appear as faint background accents only.

Absolutely NO text, NO letters, NO numbers, NO words, NO logos. NO
photorealistic people, NO stock-photo look, NO handshake imagery.
And avoid the default AI-tech cliches: NO isometric cubes floating in space,
NO circuit-board traces, NO glowing brains, NO abstract network of dots and
lines, NO server racks, NO crypto or blockchain visual language.
"""

# Faute de scene decrite dans l'en-tete, on retombe sur le titre — le modele
# produira alors une image « tech » generique, jolie et sans rapport avec le
# propos. C'est exactement ce qu'on cherche a eviter : ecrivez `illustration:`.
DEFAUT = "An abstract editorial illustration representing this idea: {sujet}"


def entete(brut):
    """Coupe le fichier en (texte de l'en-tete, corps)."""
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$", brut)
    return (m.group(1), m.group(2)) if m else (None, brut)


def champ(tete, cle):
    m = re.search(r"^%s\s*:\s*(.*)$" % cle, tete, re.M)
    return m.group(1).strip().strip("\"'") if m else ""


def generer(scene):
    """Un appel a OpenRouter, une image en retour (octets PNG)."""
    r = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": "Bearer %s" % OPENROUTER_API_KEY,
                 "Content-Type": "application/json"},
        json={
            "model": MODELE,
            "messages": [{"role": "user", "content": GABARIT.format(scene=scene, palette=PALETTE)}],
            "modalities": ["image", "text"],
        },
        timeout=180,
    )
    if r.status_code != 200:
        raise RuntimeError("OpenRouter %s : %s" % (r.status_code, r.text[:300]))
    data = r.json()
    try:
        url = data["choices"][0]["message"]["images"][0]["image_url"]["url"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("aucune image dans la reponse : %s" % str(data)[:300])
    return base64.b64decode(url.split(",", 1)[1] if "," in url else url)


def main():
    if not OPENROUTER_API_KEY:
        print("API_OPENROUTER absente de backend/.env")
        return 1
    cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY,
                      api_secret=CLOUDINARY_API_SECRET)

    args = sys.argv[1:]
    refaire = "--refaire" in args
    demandes = [a for a in args if not a.startswith("--")]

    fichiers = sorted(f for f in os.listdir(ARTICLES) if f.endswith(".md"))
    if demandes:
        fichiers = [f for f in fichiers if f[:-3] in demandes]
        if not fichiers:
            print("aucun article ne correspond a : %s" % ", ".join(demandes))
            return 1

    for f in fichiers:
        ident = f[:-3]
        chemin = os.path.join(ARTICLES, f)
        brut = io.open(chemin, encoding="utf-8").read()
        tete, _ = entete(brut)
        if tete is None:
            print("  ignore %-28s en-tete absent" % ident)
            continue
        if champ(tete, "image") and not refaire:
            print("  garde  %-28s image deja posee" % ident)
            continue

        scene = champ(tete, "illustration")
        if not scene:
            scene = DEFAUT.format(sujet="%s. %s" % (champ(tete, "titre"),
                                                    champ(tete, "description")))
            print("  (pas de champ `illustration` : rendu generique attendu)")
        print("  genere %-28s ..." % ident, end="", flush=True)
        try:
            octets = generer(scene)
            # Chemin NEUF a chaque refaire : Cloudinary sert ces images avec
            # un cache d'un an, reecrire au meme identifiant laisserait tous
            # les navigateurs sur l'ancienne version pendant des mois. Le
            # numero suit celui deja pose, sinon le deuxieme « refaire »
            # retomberait sur -v2 et ne changerait rien pour personne.
            public_id = ident
            if refaire:
                v = re.search(r"-v(\d+)\.png", champ(tete, "image") or "")
                public_id = "%s-v%d" % (ident, int(v.group(1)) + 1 if v else 2)
            rep = cloudinary.uploader.upload(
                octets, folder="blog", public_id=public_id,
                overwrite=True, resource_type="image", format="png",
            )
        except Exception as e:
            print(" ECHEC : %s" % e)
            continue

        url = rep["secure_url"]
        # L'adresse est ecrite dans l'en-tete FRANCAIS ; les traductions la
        # reprennent, c'est le meme article.
        if champ(tete, "image"):
            neuf = re.sub(r"^image\s*:.*$", "image: %s" % url, brut, count=1, flags=re.M)
        else:
            neuf = brut.replace("\npose:", "\nimage: %s\npose:" % url, 1)
            if "\nimage:" not in neuf:   # pas de champ `pose` : on pose avant la fin
                neuf = re.sub(r"^---\r?\n", "---\nimage: %s\n" % url, brut, count=1, flags=re.M)
        io.open(chemin, "w", encoding="utf-8").write(neuf)
        print(" ok  %dx%d  %d Ko" % (rep["width"], rep["height"], rep["bytes"] // 1024))

    print("\nPense a relancer : cd frontend && node scripts/blog.mjs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
