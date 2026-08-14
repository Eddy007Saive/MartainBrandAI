# Emojis animés (réactions sur mots-clés) — PNG couleur Twemoji (licence CC-BY 4.0)
# via jsdelivr, téléchargés et mis en cache localement au 1er usage. Rendu en
# texte ASS natif = silhouettes monochromes seulement (testé : le fontselect
# directwrite/libass de ce build ffmpeg ne restitue pas les glyphes couleur
# COLR/CBDT) -> on incruste des images en overlay ffmpeg à la place.
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "emoji_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/"

# Liste fermée proposée à l'IA (chaque code vérifié disponible sur le CDN) —
# rester sur un jeu fermé évite les échecs de téléchargement sur des emojis
# exotiques ou des séquences multi-codepoints (ZWJ, tons de peau...).
EMOJI_LIBRARY = {
    "🔥": "1f525", "💰": "1f4b0", "🚀": "1f680", "🤯": "1f92f", "⏰": "23f0",
    "📈": "1f4c8", "💡": "1f4a1", "💪": "1f4aa", "🎯": "1f3af", "👍": "1f44d",
    "🔔": "1f514", "😢": "1f622", "😂": "1f602", "👀": "1f440", "🙌": "1f64c",
    "🏆": "1f3c6", "🛑": "1f6d1", "🔑": "1f511", "📌": "1f4cc", "😱": "1f631",
    "🤔": "1f914", "💸": "1f4b8", "🧠": "1f9e0", "😍": "1f60d", "👇": "1f447",
    "🚨": "1f6a8", "✅": "2705", "⚠️": "26a0", "❤️": "2764", "⭐": "2b50",
    "✨": "2728", "💯": "1f4af", "❓": "2753",
}


def local_path(emoji_char):
    cp = EMOJI_LIBRARY.get(emoji_char)
    if not cp:
        return None
    dest = os.path.join(CACHE_DIR, cp + ".png")
    if not os.path.exists(dest):
        tmp = dest + ".part"
        urllib.request.urlretrieve(_BASE + cp + ".png", tmp)
        os.replace(tmp, dest)
    return dest
