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

_BASE = "https://res.cloudinary.com/dy9gp5pim/image/upload/q_auto/brand/rico"

# id -> ce que la pose RACONTE. Ces phrases sont lues par l'IA : elles décrivent
# l'intention, pas l'anatomie, car c'est l'intention qui doit coller au propos.
POSES = {
    "accueille":      "ailes ouvertes en signe d'accueil — ouvre un sujet, souhaite la bienvenue",
    "celebre":        "ailes grandes ouvertes, joyeux — une victoire, un résultat obtenu, une bonne nouvelle",
    "brandit-badge":  "brandit un badge hexagonal — une preuve, une garantie, un label, un chiffre clé",
    # « fier » est retiré tant que sa planche n'est pas refaite : l'image encore
    # en ligne est l'ancien modèle, hors charte, et jurerait au milieu des autres.
    # « bras-croises » couvre la même intention en attendant.
    "debout":         "debout, calme, neutre — pose passe-partout quand rien de plus précis ne colle",
    "presente-cote":  "présente quelque chose sur le côté — introduit une idée, montre une direction",
    "bras-croises":   "ailes croisées, sourire tranquille — la sérénité, le problème déjà réglé",
    "attentif":       "de trois quarts, à l'écoute — une question posée au lecteur, une transition",
    "pointe":         "pointe du doigt vers le côté — insiste sur un point précis, désigne l'essentiel",
    "pouce-leve":     "pouce levé — une validation, un conseil approuvé, un geste simple à faire",
    "interroge":      "ailes levées, l'air interrogatif — un problème, un doute, une erreur courante",
    "explique":       "ailes écartées, en train d'expliquer — une démonstration, un mécanisme détaillé",
    "ecrans-data":    "entouré d'écrans holographiques — la donnée, les statistiques, l'analyse",
    "ecrans-action":  "en action au milieu d'écrans — le travail en cours, l'automatisation, l'outil qui tourne",
    "presente-data":  "présente des écrans de données — un résultat chiffré, une performance, un tableau de bord",
    "lit-tablette":   "lit une tablette — la veille, la lecture, l'apprentissage, un conseil de méthode",
}

DEFAUT = "debout"


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
    rotation = ["accueille", "interroge", "explique", "presente-data", "pouce-leve",
                "bras-croises", "pointe", "ecrans-action"]
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
