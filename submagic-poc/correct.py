# Correction orthographique de la transcription (Claude Haiku 4.5)
# Contrainte clé : la correction doit rester alignée mot à mot avec les
# timestamps Whisper (utilisés pour le karaoké) — décaler ne serait-ce qu'un
# seul mot corrompt la synchro de tout ce qui suit. Deux designs testés et
# écartés avant celui-ci :
#  1. renvoyer TOUT le texte reformaté -> le modèle peut fusionner/scinder
#     des mots ; même compte total en sortie mais alignement décalé,
#     silencieusement (le check de longueur ne détecte rien).
#  2. objets {i, texte} pour CHAQUE mot -> réponse ~3x plus verbeuse, tronquée
#     par max_tokens dès qu'un vrai transcript dépasse ~150 mots -> échec
#     JSON silencieux, correction ignorée sans avertissement visible.
# Solution retenue : le modèle ne renvoie QUE les corrections nécessaires
# (quelques mots sur des centaines), chacune ancrée à son index explicite —
# réponse courte (pas de troncature) et alignement impossible à décaler
# (un index ne peut pas "glisser").
import difflib
import json

import hooks

MAX_TOKENS = 4000
MIN_BATCH = 30   # en dessous, on abandonne le lot et on garde l'original
                 # plutôt que de boucler à l'infini sur un échec persistant


def _correct_once(words_text, language):
    n = len(words_text)
    numbered = "\n".join(f"{i}: {t}" for i, t in enumerate(words_text))
    response = hooks.client().messages.create(
        model="claude-haiku-4-5",
        max_tokens=MAX_TOKENS,
        output_config={
            "format": {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "corrections": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "i": {"type": "integer"},
                                    "t": {"type": "string"},
                                },
                                "required": ["i", "t"],
                                "additionalProperties": False,
                            },
                        }
                    },
                    "required": ["corrections"],
                    "additionalProperties": False,
                },
            }
        },
        messages=[{
            "role": "user",
            "content": (
                "Voici une transcription automatique (Whisper), un mot numéroté "
                "par ligne (langue : " + language + "). Repère UNIQUEMENT les "
                "mots mal orthographiés par la reconnaissance vocale (accents, "
                "casse, lettres manquantes/en trop) et liste les corrections à "
                "faire : pour chaque mot à corriger, son numéro et son texte "
                "corrigé. Ne mets RIEN dans la liste pour les mots déjà "
                "corrects. Chaque numéro reste un mot unique : ne fusionne "
                "jamais deux numéros, ne divise jamais un numéro en plusieurs "
                "mots.\n\n" + numbered
            ),
        }],
    )
    text = next(b.text for b in response.content if b.type == "text")
    corrections = json.loads(text)["corrections"]
    out = list(words_text)
    for c in corrections:
        i = c.get("i")
        if isinstance(i, int) and 0 <= i < n and isinstance(c.get("t"), str):
            out[i] = c["t"]
    return out


def _correct_recursive(words_text, language):
    """Repli en cas d'échec réel (réseau, JSON invalide) : découpe le lot en
    deux et réessaie chaque moitié, jusqu'à un plancher où l'on abandonne."""
    try:
        return _correct_once(words_text, language)
    except Exception as e:
        if len(words_text) <= MIN_BATCH:
            msg = str(e).encode("ascii", "backslashreplace").decode("ascii")
            print(f"[correction] echec definitif sur {len(words_text)} mot(s) "
                  f"({msg}) -> conserves tels quels")
            return list(words_text)
        mid = len(words_text) // 2
        return (_correct_recursive(words_text[:mid], language)
                + _correct_recursive(words_text[mid:], language))


def _plausible(original, corrected):
    """Garde-fou final : une correction doit rester CE mot (accents,
    orthographe), pas un mot différent — filtre les dérives improbables
    même si l'index déclaré est correct."""
    a, b = original.strip(".,!?;:").lower(), corrected.strip(".,!?;:").lower()
    if a == b:
        return True
    if not a or not b or min(len(a), len(b)) <= 3:
        # mots courts : la similarité de caractères n'est pas fiable
        # (peu de lettres -> ratio élevé même entre mots différents) ;
        # on exige alors un préfixe ou suffixe commun explicite
        return a.startswith(b[:2]) or b.startswith(a[:2]) or a[-2:] == b[-2:]
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.55


def correct_words(words, language="fr"):
    """Corrige l'orthographe en place (liste de dicts avec 'text'/'start'/'end')."""
    if not words:
        return words
    originals = [w["text"] for w in words]
    corrected = _correct_recursive(originals, language)
    changed, reverted = 0, 0
    for w, orig, c in zip(words, originals, corrected):
        if c == orig:
            continue
        if _plausible(orig, c):
            w["text"] = c
            changed += 1
        else:
            reverted += 1
    print(f"[correction] {changed} mot(s) corrige(s), {reverted} suspect(s) ignore(s)")
    return words
