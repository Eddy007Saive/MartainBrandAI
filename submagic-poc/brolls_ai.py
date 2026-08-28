# Sélection des moments b-roll par IA (Claude Haiku 4.5) — même schéma
# "indices épars" que correct.py/emojis.py : on ne demande QUE les quelques
# mots choisis (pas de réécriture de toute la liste), donc pas de risque de
# décalage. Chaque choix porte une requête de recherche EN ANGLAIS (les
# banques de vidéos indexent mieux en anglais, même pour du contenu FR).
import json

import hooks

# repli si l'appelant ne précise pas de préférence (max_brolls=None) ;
# bornes dures quel que soit ce que l'utilisateur envoie, pour ne pas
# exploser le nombre d'inputs ffmpeg chaînés dans le filtergraph
DEFAULT_MAX_BROLLS = 4
HARD_CAP = 8


def suggest_brolls(words, language="fr", max_brolls=None):
    """[(index_mot, requete_recherche), ...] — jusqu'à max_brolls occurrences."""
    if not words:
        return []
    max_brolls = max(1, min(HARD_CAP, max_brolls or DEFAULT_MAX_BROLLS))
    numbered = "\n".join(f"{i}: {w['text']}" for i, w in enumerate(words))
    response = hooks.client().messages.create(
        model="claude-haiku-4-5",
        max_tokens=500,
        output_config={
            "format": {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "picks": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "i": {"type": "integer"},
                                    "query": {"type": "string"},
                                },
                                "required": ["i", "query"],
                                "additionalProperties": False,
                            },
                        }
                    },
                    "required": ["picks"],
                    "additionalProperties": False,
                },
            }
        },
        messages=[{
            "role": "user",
            "content": (
                "Voici la transcription d'un reel/short, un mot numéroté par "
                "ligne (langue : " + language + "). Choisis entre " +
                str(min(2, max_brolls)) + " et " + str(max_brolls) +
                " moments où un plan d'illustration (b-roll) "
                "renforcerait le propos — un concept CONCRET et filmable "
                "évoqué à ce moment (objet, lieu, action, résultat chiffré), "
                "jamais une émotion abstraite. Pour chaque choix : le numéro "
                "du mot concerné et une requête de recherche COURTE EN "
                "ANGLAIS (2-4 mots, concrète) pour une banque de vidéos "
                "stock (Pexels).\n\n" + numbered
            ),
        }],
    )
    text = next(b.text for b in response.content if b.type == "text")
    picks = json.loads(text)["picks"]
    n, seen, out = len(words), set(), []
    for p in picks:
        i, q = p.get("i"), p.get("query")
        if (isinstance(i, int) and 0 <= i < n and isinstance(q, str)
                and q.strip() and i not in seen):
            seen.add(i)
            out.append((i, q.strip()))
    return out[:max_brolls]
