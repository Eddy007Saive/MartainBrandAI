# Génération de hooks par IA (Claude Haiku 4.5 — le moins cher) à partir de la transcription
import json

import anthropic

import envkeys

_client = None


def client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(
            api_key=envkeys.get("ANTHROPIC_API_KEY", "api_claude"))
    return _client


def suggest_hooks(transcript, language="fr"):
    """3 propositions de hook (phrase choc d'ouverture) pour un reel."""
    response = client().messages.create(
        model="claude-haiku-4-5",
        max_tokens=300,
        output_config={
            "format": {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "hooks": {
                            "type": "array",
                            "items": {"type": "string"},
                        }
                    },
                    "required": ["hooks"],
                    "additionalProperties": False,
                },
            }
        },
        messages=[{
            "role": "user",
            "content": (
                "Voici la transcription d'une vidéo destinée aux réseaux sociaux "
                "(reel/short). Génère exactement 3 hooks : des phrases choc "
                "affichées en gros texte pendant les 3 premières secondes pour "
                "arrêter le scroll. Règles : maximum 9 mots chacun, percutant, "
                "concret (chiffres et enjeux réels de la transcription), pas de "
                "clickbait mensonger, dans la langue de la transcription "
                f"({language}).\n\nTranscription :\n{transcript[:6000]}"
            ),
        }],
    )
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)["hooks"][:3]


HOOK_ZONE = {
    "top": "the upper third of the frame",
    "center": "the middle of the frame",
    "bottom": "the lower third of the frame",
}


def suggest_thumbnail_style(transcript, language="fr", hook_position="top",
                            text_zone_style=None):
    """Prompt de retouche pour la miniature (Nano Banana), construit selon
    la structure universelle "toujours dans le même ordre" (cf. _design/
    prompt min.md) : [Type de plan] + [Sujet + émotion] + [Environnement] +
    [Éclairage/style/qualité, fixe] + [Composition, fixe]. Claude ne remplit
    QUE 3 champs courts via un JSON strict (type de plan, émotion,
    environnement) — le reste (qualité, mots-clés magiques, composition,
    garde-fous identité/texte) est assemblé en dur ici, jamais laissé à la
    rédaction libre de Claude. Volontairement PAS de choix de "genre" parmi
    les templates du guide (choc, avant/après split-screen, action/
    cyberpunk...) : ces mises en scène ne conviennent pas à une vraie photo
    d'identité à préserver, et un prompt à choix multiples serait plus
    confus qu'utile — un seul squelette clair et net, toujours le même."""
    zone = HOOK_ZONE.get(hook_position, HOOK_ZONE["top"])
    response = client().messages.create(
        model="claude-haiku-4-5",
        max_tokens=220,
        output_config={
            "format": {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "shot": {
                            "type": "string",
                            "enum": ["extreme close-up", "close-up", "medium shot"],
                            "description": "framing that best fits the content's energy",
                        },
                        "emotion": {
                            "type": "string",
                            "description": ("2-6 words, in English: the "
                                "subject's expression/energy that fits the "
                                "content (e.g. 'visibly relieved and "
                                "confident', 'sharp, focused energy')"),
                        },
                        "environment": {
                            "type": "string",
                            "description": ("1 short English sentence: a "
                                "background/setting that illustrates the "
                                "video's real topic (e.g. 'a modern real "
                                "estate office with growth dashboards on "
                                "screens and a city skyline view')"),
                        },
                    },
                    "required": ["shot", "emotion", "environment"],
                    "additionalProperties": False,
                },
            }
        },
        messages=[{
            "role": "user",
            "content": (
                "Voici la transcription d'une vidéo de reel/short "
                f"(langue : {language}). Identifie le sujet réel du "
                "contenu (de quoi ça parle, quel enjeu/résultat/problème) "
                "et remplis les 3 champs demandés, en anglais, pour "
                "composer une miniature accrocheuse cohérente avec ce "
                "sujet.\n\n"
                f"Transcription :\n{transcript[:4000]}"
            ),
        }],
    )
    text = next(b.text for b in response.content if b.type == "text")
    fields = json.loads(text)
    shot = fields["shot"].strip()
    emotion = fields["emotion"].strip().rstrip(".")
    environment = fields["environment"].strip().rstrip(".")

    # emplacements fixes (recette universelle + mots-clés magiques du guide)
    # + garde-fous identité/texte toujours imposés, jamais laissés à Claude
    return (
        f"A highly detailed, professional {shot} thumbnail photo of this "
        f"exact person, {emotion}. The scene is set in {environment}. "
        "Photorealistic, masterpiece quality, cinematic lighting, extreme "
        "contrast, vibrant saturated colors, shallow depth of field with a "
        "softly blurred background so the person stays the sharp focal "
        "point. Composition optimized for a vertical short-form video "
        "thumbnail: large key elements, bold composition, direct eye "
        "contact with the camera, clean realistic rendering (a photo-"
        "montage, not a stylized poster), 9:16 aspect ratio. Keep the "
        "person's face, features and identity from the reference photo "
        "EXACTLY unchanged — do not alter them. Do not add any text, "
        f"letters, logos or graphics. Keep {zone} as "
        f"{text_zone_style or 'a clean, uncluttered area'}, reserved for a "
        "headline added separately afterward."
    )
