# Sélection des emojis réaction par IA (Claude Haiku 4.5) — même schéma
# "indices épars" que correct.py : on ne demande QUE les quelques mots
# choisis (pas de réécriture de toute la liste), donc pas de risque de
# décalage. Le choix est restreint à emoji_lib.EMOJI_LIBRARY (fermé) pour
# garantir que chaque emoji choisi est bien téléchargeable.
import json

import emoji_lib
import hooks

MAX_EMOJIS = 6


def suggest_emojis(words, language="fr"):
    """[(index_mot, emoji), ...] — jusqu'à MAX_EMOJIS occurrences, dédupliquées."""
    if not words:
        return []
    numbered = "\n".join(f"{i}: {w['text']}" for i, w in enumerate(words))
    allowed = " ".join(emoji_lib.EMOJI_LIBRARY.keys())
    response = hooks.client().messages.create(
        model="claude-haiku-4-5",
        max_tokens=800,
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
                                    "emoji": {"type": "string"},
                                },
                                "required": ["i", "emoji"],
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
                "ligne (langue : " + language + "). Choisis entre 3 et " +
                str(MAX_EMOJIS) + " moments forts (mots-clés, chiffres, "
                "émotions, retournements) où faire apparaître un emoji "
                "réaction à l'écran, comme dans un montage TikTok. Pour "
                "chaque choix : le numéro du mot concerné et l'emoji, choisi "
                "UNIQUEMENT dans cette liste : " + allowed + "\n\n" + numbered
            ),
        }],
    )
    text = next(b.text for b in response.content if b.type == "text")
    picks = json.loads(text)["picks"]
    n, seen, out = len(words), set(), []
    for p in picks:
        i, e = p.get("i"), p.get("emoji")
        if isinstance(i, int) and 0 <= i < n and e in emoji_lib.EMOJI_LIBRARY and i not in seen:
            seen.add(i)
            out.append((i, e))
    return out[:MAX_EMOJIS]
