# Image officielle Playwright Python : Chromium + toutes les libs système préinstallés.
# La version DOIT correspondre à playwright dans requirements.txt (1.60.0).
FROM mcr.microsoft.com/playwright/python:v1.60.0-jammy

# ffmpeg : compression des vidéos montées (Studio Vidéo) avant enregistrement Cloudinary.
# Node 20 : rendu des reels animés (Remotion, backend/remotion/).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances Python (cache séparé)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Dépendances Remotion (cache séparé, avant COPY . .)
COPY remotion/package.json remotion/package-lock.json ./remotion/
RUN cd remotion && npm ci --no-audit --no-fund

# Code de l'app
COPY . .

# Remotion réutilise le Chromium de l'image Playwright (pas de re-téléchargement)
RUN ln -sf $(ls -d /ms-playwright/chromium-*/chrome-linux/chrome | head -1) /usr/local/bin/chromium-remotion
ENV REMOTION_BROWSER=/usr/local/bin/chromium-remotion
ENV REMOTION_DIR=/app/remotion

# Railway fournit $PORT dynamiquement ; server.py le lit lui-même (pas d'expansion shell requise)
ENV PORT=8000
EXPOSE 8000

CMD ["python", "server.py"]
