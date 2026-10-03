"""Accroches : formules, présélection et garde-fous (idées reprises du skill « instagram-agent-skill »,
licence MIT, adaptées au français et aux PME).

Principe : le CODE fait tout ce qui est objectif et gratuit (choisir les formules possibles, retirer
la ligne technique, détecter un chiffre absent des infos du client, nettoyer les caractères
invisibles) ; l'IA n'écrit l'accroche que DANS l'appel de rédaction existant (aucun appel en plus).

Étape 0 (octobre 2026, 30 accroches publiées, 3 comptes) : ce qui suit le mieux les interactions,
c'est l'essentiel dès le début (+0,43) et un fait concret (+0,22) ; « enjeu » et « public » : rien.
La consigne insiste donc sur ces deux points.
"""
import hashlib
import re

# id : stable (enregistré sur le contenu pour mesurer plus tard ce qui marche pour chaque client).
# chiffre=True : la formule n'a de sens qu'avec un vrai chiffre, présent dans les infos du client.
FORMULES = [
    {"id": 1, "nom": "Ce que ça a coûté", "modele": "{montant précis} : ce qu'{une erreur} a coûté.", "chiffre": True},
    {"id": 2, "nom": "Arrête / fais plutôt", "modele": "Arrête de {habitude courante}. Fais {alternative}.", "chiffre": False},
    {"id": 3, "nom": "Personne ne le dit", "modele": "Personne ne dit aux {public} que {vérité inconfortable}.", "chiffre": False},
    {"id": 4, "nom": "Le remplacement", "modele": "{Ceci} a remplacé {chose coûteuse} pour {prix}.", "chiffre": True},
    {"id": 5, "nom": "Avant / maintenant", "modele": "Avant, {tâche} prenait {durée longue}. Maintenant, {durée courte}.", "chiffre": True},
    {"id": 6, "nom": "Le relevé", "modele": "J'ai {fait quelque chose} pendant {durée}. Voici les vrais chiffres.", "chiffre": True},
    {"id": 7, "nom": "Mal fait, pas ta faute", "modele": "Tu {fais X} de travers, et ce n'est pas ta faute.", "chiffre": False},
    {"id": 8, "nom": "Les coulisses", "modele": "{N années} à {faire ce métier}. Voici ce qu'on ne dit jamais.", "chiffre": False},
    {"id": 9, "nom": "La vraie question", "modele": "« {question telle que les clients la posent} » {réponse courte et tranchée}.", "chiffre": False},
    {"id": 10, "nom": "L'objection", "modele": "« {objection réelle} » D'accord. Voici ce qui marche quand même.", "chiffre": False},
    {"id": 11, "nom": "La scène", "modele": "{Moment précis, en pleine action} : {le problème arrive}.", "chiffre": False},
    {"id": 12, "nom": "Le contre-pied", "modele": "{Idée reçue du secteur, retournée.}", "chiffre": False},
    {"id": 13, "nom": "L'échéance", "modele": "{Ceci} change le {date}. Fais {action} avant.", "chiffre": False},
    {"id": 14, "nom": "Liste avec une préférée", "modele": "{N} {choses} qui {résultat}. La {k}e, presque personne ne la fait.", "chiffre": True},
]
_PAR_ID = {f["id"]: f for f in FORMULES}
NB_PROPOSEES = 7

_CHIFFRE = re.compile(r"\d")
_NOMBRE = re.compile(r"\d+(?:[ .,  ]\d+)*")
_LIGNE_FORMULE = re.compile(r"^\s*FORMULE\s*[:：]\s*(\d{1,2})\s*$", re.IGNORECASE | re.MULTILINE)
_INVISIBLES = re.compile("[​‌‍⁠﻿­᠎؜⁡⁢⁣⁤]")

# Tournures typiques d'un texte d'IA, en français (à éviter dans la consigne ; on ne les réécrit
# PAS automatiquement : supprimer une expression peut casser la phrase).
A_EVITER = [
    "Dans un monde en constante évolution", "À l'ère du numérique", "Il est important de noter",
    "N'hésitez pas à", "Plongeons dans", "Que vous soyez", "Ce n'est pas seulement X, c'est Y",
    "Non seulement… mais aussi", "Et si je vous disais", "Le résultat ?", "Spoiler :",
    "Voici ce que j'ai appris", "Imaginez un monde où", "La vérité, c'est que",
]


def selection(sujet: str, infos: str = "", dimensions: dict | None = None) -> list[dict]:
    """6 à 8 formules possibles pour CE sujet. Les formules « chiffre » ne sont proposées que si un
    chiffre existe dans le sujet, le brief ou les infos de marque (jamais de chiffre inventé).
    L'ordre tourne selon le sujet, pour varier d'un post à l'autre."""
    sources = f"{sujet} {infos} {' '.join(str(v) for v in (dimensions or {}).values())}"
    a_chiffre = bool(_CHIFFRE.search(sources))
    possibles = [f for f in FORMULES if a_chiffre or not f["chiffre"]]
    depart = int(hashlib.md5((sujet or "").encode("utf-8")).hexdigest(), 16) % len(possibles)
    tournees = possibles[depart:] + possibles[:depart]
    return tournees[:NB_PROPOSEES]


def bloc_consigne(sujet: str, infos: str = "", dimensions: dict | None = None) -> str:
    """Bloc ajouté à la consigne de rédaction (en anglais comme le reste du prompt ; le texte
    produit reste dans la langue du client)."""
    formules = selection(sujet, infos, dimensions)
    lignes = "\n".join(f"{f['id']}. {f['nom']} : {f['modele']}" for f in formules)
    return (
        "\n\n## HOOK (the first line decides whether people read on)\n"
        "Before writing, silently draft three different first lines, each from a DIFFERENT formula "
        "below, and keep the strongest one. Do not show the drafts.\n"
        f"{lignes}\n"
        "Rules for the first line: put the key fact or the stake in the FIRST words (no warm-up, "
        "no greeting); prefer one concrete, real detail (a figure, a moment, a name) taken ONLY from "
        "the topic, the brief or the brand information above. NEVER invent a number, a client or a "
        "result; if no real figure is given, use a formula without one. Keep it short (about 12 "
        "words at most) and specific to this brand, not a line any competitor could post. Never "
        "claim something about the client that is not in the information above (how often they "
        "are asked something, how many clients they have, results).\n"
        "Avoid these AI-sounding phrasings (and their equivalents in the output language): "
        + "; ".join(f"« {x} »" for x in A_EVITER) + ".\n"
        "After the post, add one last separate line exactly like: FORMULE: <number of the formula used>."
    )


def bloc_consigne_carrousel(sujet: str, infos: str = "", dimensions: dict | None = None) -> str:
    """Même logique pour un carrousel : l'accroche est le titre de la couverture (champ « hook »),
    et la formule retenue est rendue dans le JSON (champ « formule »)."""
    formules = selection(sujet, infos, dimensions)
    lignes = "\n".join(f"{f['id']}. {f['nom']} : {f['modele']}" for f in formules)
    return (
        "\n\n## HOOK = THE COVER (it decides whether people swipe)\n"
        "The \"hook\" field is the cover slide. Before writing it, silently draft three different "
        "covers, each from a DIFFERENT formula below, and keep the strongest one. Do not show the drafts.\n"
        f"{lignes}\n"
        "Rules for the cover: put the key fact or the stake in the FIRST words; prefer one concrete, "
        "real detail (a figure, a moment, a name) taken ONLY from the topic, the brief or the brand "
        "information above. NEVER invent a number, a client or a result; if no real figure is given, "
        "use a formula without one. Keep it short (about 10 words at most) and specific to this brand. "
        "The first line of the \"legende\" follows the same rules (no greeting, key point first).\n"
        "Avoid these AI-sounding phrasings (and their equivalents in the output language): "
        + "; ".join(f"« {x} »" for x in A_EVITER) + ".\n"
        "Add to the JSON a field \"formule\" with the number of the formula used for the cover."
    )


def formule_valide(valeur) -> int | None:
    """Numéro de formule lu dans un JSON (entier ou texte) ; None s'il n'existe pas."""
    try:
        n = int(str(valeur).strip())
    except (TypeError, ValueError):
        return None
    return n if n in _PAR_ID else None


def extraire_formule(texte: str) -> tuple[str, int | None]:
    """Retire la ligne technique « FORMULE: n » et renvoie (texte, n). Tolérant : sans ligne,
    renvoie le texte tel quel et None."""
    if not isinstance(texte, str):
        return texte, None
    trouves = _LIGNE_FORMULE.findall(texte)
    propre = _LIGNE_FORMULE.sub("", texte).rstrip()
    n = int(trouves[-1]) if trouves else None
    return propre, (n if n in _PAR_ID else None)


def sans_invisibles(texte: str) -> str:
    """Caractères invisibles (espace de largeur nulle, trait d'union conditionnel…) : retirés.
    Purement mécanique, sans risque pour le sens."""
    return _INVISIBLES.sub("", texte) if isinstance(texte, str) else texte


def chiffres_non_sources(accroche: str, sources: str) -> list[str]:
    """Nombres de l'accroche absents des infos fournies (sujet, brief, marque) : un signal de
    chiffre peut-être inventé, à montrer au client (on ne bloque pas)."""
    norm = lambda s: re.sub(r"[ .,  ]", "", s)
    dispo = {norm(x) for x in _NOMBRE.findall(sources or "")}
    # les petits nombres (1 à 9 : « le mois 1 », « 3 erreurs ») structurent la phrase, ce ne sont
    # pas des faits chiffrés : on ne les signale pas
    return [x for x in _NOMBRE.findall(accroche or "")
            if norm(x) not in dispo and not (norm(x).isdigit() and int(norm(x)) < 10)]


def premiere_ligne(texte: str) -> str:
    for ligne in (texte or "").splitlines():
        if ligne.strip():
            return ligne.strip()
    return ""
