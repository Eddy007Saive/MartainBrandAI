# Jugement visuel de la meilleure frame miniature via Gemini (OpenRouter) —
# la détection de visage (YuNet) sait dire "il y a un grand visage net ici"
# mais pas "cette personne a les yeux fermés" ; Gemini regarde vraiment
# l'image et juge expression/cadrage/netteté comme le ferait un humain.
import base64
import json
import re
import urllib.request

import envkeys

MODEL = "google/gemini-2.5-flash"


def _api_key():
    return envkeys.get("OPENROUTER_API_KEY", "API_OPENROUTER")


def pick_best_thumbnail(frames_jpeg_bytes):
    """frames_jpeg_bytes: list[bytes] JPEG. Renvoie l'index du meilleur
    candidat, ou None si l'appel échoue (repli sur le score mécanique)."""
    content = [{"type": "text", "text": (
        f"Voici {len(frames_jpeg_bytes)} frames candidates (numérotées à "
        "partir de 0, dans l'ordre d'apparition) pour la miniature d'une "
        "vidéo réseaux sociaux. Choisis la MEILLEURE pour donner envie de "
        "cliquer : yeux ouverts, expression engageante et naturelle, image "
        "nette (pas de flou de mouvement ni de clignement), bien cadrée. "
        "Réponds UNIQUEMENT par le numéro de la meilleure photo, sans autre "
        "texte."
    )}]
    for i, jpg in enumerate(frames_jpeg_bytes):
        b64 = base64.b64encode(jpg).decode("ascii")
        content.append({"type": "text", "text": f"Photo {i} :"})
        content.append({"type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {_api_key()}",
                "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    text = data["choices"][0]["message"]["content"]
    m = re.search(r"\d+", text)
    if not m:
        return None
    idx = int(m.group(0))
    return idx if 0 <= idx < len(frames_jpeg_bytes) else None
