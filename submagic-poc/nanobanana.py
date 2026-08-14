# Retouche visuelle de la miniature via Gemini "image" (Nano Banana),
# OpenRouter — même clé API_OPENROUTER que gemini_pick.py. On ne lui fait
# JAMAIS écrire de texte (les modèles de génération d'image rendent le texte
# de façon peu fiable, surtout accentué) : uniquement la stylisation
# visuelle ; le hook est incrusté ENSUITE via le pipeline ASS/ffmpeg déjà
# éprouvé (render_thumbnail), qui lui a une typographie parfaite.
import base64
import json
import urllib.request

import envkeys

MODEL = "google/gemini-2.5-flash-image"


def _api_key():
    return envkeys.get("OPENROUTER_API_KEY", "API_OPENROUTER")


# Prompt complet par défaut si Claude n'a pas pu en fournir un adapté au
# contenu (échec réseau, transcript vide...) — mêmes garde-fous d'identité/
# texte que ceux assemblés par hooks.suggest_thumbnail_style().
DEFAULT_PROMPT = (
    "Restyle this photo as an eye-catching, professional social media video "
    "thumbnail: masterpiece quality, cinematic lighting, extreme contrast, "
    "vibrant saturated colors, shallow depth of field with a softly blurred "
    "background. Keep the person, their face, expression and identity "
    "EXACTLY recognizable and unchanged — do not alter their features. Do "
    "NOT add any text, letters, logos or graphics. This must remain a "
    "realistic photo edit — absolutely NO rim light, glow, halo, aura, "
    "outline, or any effect that separates the subject's silhouette from "
    "the background."
)


def restyle(jpeg_bytes, prompt=None):
    """jpeg_bytes -> jpeg/png bytes stylisés, ou None si refus/échec.
    prompt : prompt complet déjà assemblé (par
    hooks.suggest_thumbnail_style()) ; repli sur DEFAULT_PROMPT si absent."""
    prompt = prompt or DEFAULT_PROMPT
    b64 = base64.b64encode(jpeg_bytes).decode("ascii")
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
        ]}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    images = data["choices"][0]["message"].get("images")
    if not images:
        return None
    url = images[0]["image_url"]["url"]
    return base64.b64decode(url.split(",", 1)[1])
