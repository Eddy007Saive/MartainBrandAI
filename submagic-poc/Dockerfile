# Studio Montage — service autonome (séparé du backend MartainBrandAI),
# déploiement Railway. ffmpeg + faster-whisper (CPU) + OpenCV (YuNet) +
# Claude (hooks/correction/emojis) + Gemini via OpenRouter (miniature).
FROM python:3.10-slim

# ffmpeg : moteur du montage. libgl1/libglib2.0-0 : dépendances runtime
# d'opencv-python-headless pour le décodage vidéo (cv2.VideoCapture) et le
# détecteur de visage YuNet (cv2.dnn), même en environnement sans affichage.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Liste explicite (pas de COPY . .) : le dossier contient de nombreux
# scripts/vidéos de test accumulés pendant le développement du POC, à ne
# jamais embarquer dans l'image de production.
COPY app.py pipeline.py submagic_poc5.py envkeys.py ./
COPY hooks.py correct.py emojis.py emoji_lib.py ./
COPY music.py thumbnail.py nanobanana.py gemini_pick.py ./
COPY storage.py index.html yunet.onnx ./

# Cache Whisper téléchargé au 1er démarrage (~460 Mo pour "small") ; sans
# volume Railway monté sur /root/.cache, il est reperdu à chaque redéploiement
# (voir _design/prompt min.md non lié — limite connue, acceptée pour l'instant)
ENV HF_HUB_ENABLE_HF_TRANSFER=0

EXPOSE 8765
CMD ["python", "app.py"]
