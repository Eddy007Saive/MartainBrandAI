# -*- coding: utf-8 -*-
"""
Les poses de Rico, la mascotte de Postorico.

Une seule pose répétée sur cinq slides se remarque tout de suite et casse
l'effet « fait main ». On en tient donc un catalogue, et c'est l'IA qui choisit
celle qui colle à CHAQUE slide — la même logique que le reste du produit : le
contenu décide de la forme.

Réservé aux gabarits maison (« Rico Studio », « Rico Scène ») : les autres
clients ont leur propre identité, pas notre coq.
"""
import json
import re

from config import logger
from services.agent_service import _messages_create

# rico-v4 : chemin neuf a chaque planche. Cloudinary sert ces images avec un
# cache d'un an — reecrire au meme identifiant laisserait tous les navigateurs,
# clients compris, sur l'ancienne planche pendant des mois.
# Source détourée en 500px : on demande à Cloudinary un upscale 2x (c_fit 1000)
# + netteté (e_sharpen) + qualité max. Le navigateur RÉDUIT alors une image plus
# grande (net) au lieu d'agrandir du 500px (flou), surtout sur les grands Rico (hero/CTA/scène).
_BASE = "https://res.cloudinary.com/dy9gp5pim/image/upload/w_1000,h_1000,c_fit,q_auto:best,e_sharpen:60,f_auto/brand/rico-v4"

# id -> ce que la pose RACONTE. Ces phrases sont lues par l'IA : elles décrivent
# l'intention, pas l'anatomie, car c'est l'intention qui doit coller au propos.
#
# Onze poses. La planche v4 n'en couvre pas davantage — et notamment aucune
# pose « au travail devant des écrans » : les écrans de chargement restent donc
# sur l'ancienne planche, faute d'équivalent ici.
POSES = {
    "accueille":        "ailes grandes ouvertes, accueillant — une ouverture, une bienvenue, une bonne nouvelle",
    "pouce-leve":       "deux pouces levés — une validation, un résultat obtenu, une recommandation",
    "annonce":          "gros plan, les deux mains qui désignent, bouche grande ouverte — une annonce forte, le chiffre qui claque",
    "clin-oeil":        "un clin d'œil en désignant du doigt — la complicité, l'astuce, le raccourci qu'on partage",
    "idee":             "index levé — une idée, un point clé, la chose à retenir",
    "pointe-haut":      "pointe vers le haut, l'autre aile croisée — ce qui monte, une tendance, un objectif",
    "presente-cote":    "présente sur le côté, main ouverte, souriant — introduit une idée, montre une direction",
    "presente-produit": "présente quelque chose de la main, enthousiaste — met en avant un outil, une offre",
    "presente-calme":   "présente d'un geste posé — une explication tranquille, un constat",
    "de-dos":           "vu de dos, il se retourne — ce qu'on laisse derrière, l'avant/après, le changement de cap",
    "curieux":          "penché, il regarde entre ses pattes — la recherche, le détail qu'on ne voit pas, une note d'humour",
}

DEFAUT = "presente-cote"


def url(pose_id: str) -> str:
    """URL Cloudinary d'une pose (retombe sur la pose neutre si l'id est inconnu)."""
    return f"{_BASE}/{pose_id if pose_id in POSES else DEFAUT}.png"


_ROLE = (
    "You cast a mascot in a social-media carousel. For EACH slide, pick the pose whose "
    "INTENTION matches what the slide says — a problem calls for the questioning pose, a "
    "result for the celebrating one, a figure for the data one.\n"
    "Rules: never repeat the same pose on two consecutive slides; the cover should welcome "
    "or present; the final call-to-action should celebrate, approve or point. Use only the "
    "ids provided. Answer with STRICT JSON only: {\"poses\": [\"id\", \"id\", …]} — exactly "
    "one id per slide, in order."
)


def choisir(hook: str, slides: list, cta_titre: str) -> list:
    """Une pose par slide (couverture, étapes, CTA). Retombe sur une rotation
    fixe si l'appel échoue : mieux vaut varier bêtement que répéter."""
    textes = [f"1. Couverture : {hook}"]
    for i, sl in enumerate(slides):
        textes.append(f"{i + 2}. {sl.get('titre') or ''} — {(sl.get('texte') or '')[:160]}")
    textes.append(f"{len(slides) + 2}. Appel à l'action : {cta_titre}")
    n = len(textes)

    catalogue = "\n".join(f"- {k} : {v}" for k, v in POSES.items())
    try:
        resp = _messages_create(
            model="claude-haiku-4-5", max_tokens=300, system=_ROLE,
            messages=[{"role": "user", "content":
                       f"Poses disponibles :\n{catalogue}\n\nLes {n} slides :\n"
                       + "\n".join(textes) + f"\n\nDonne exactement {n} ids."}],
        )
        brut = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", brut, re.S)
        choix = [p for p in json.loads(m.group(0) if m else brut).get("poses", []) if p in POSES]
        if len(choix) >= n:
            return _sans_repetition(choix[:n])
        logger.warning(f"poses Rico : {len(choix)} choix pour {n} slides — repli")
    except Exception as e:
        logger.warning(f"choix des poses Rico : {e}")
    # Repli : une rotation qui suit la dramaturgie d'un carrousel
    rotation = ["presente-cote", "idee", "presente-calme", "pointe-haut",
                "clin-oeil", "presente-produit", "annonce", "de-dos"]
    return _sans_repetition([rotation[i % len(rotation)] for i in range(n - 1)] + ["celebre"])


def _sans_repetition(poses: list) -> list:
    """Deux slides voisines ne montrent jamais la même pose."""
    dispo = list(POSES)
    out = []
    for p in poses:
        if out and p == out[-1]:
            p = next((x for x in dispo if x != out[-1] and x not in out), DEFAUT)
        out.append(p)
    return out
