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
RUN cd remotion && npm ci --no-audit --no-fund \
    # Navigateur propre a Remotion (decouple de celui de Playwright -> pas de chemin fragile
    # a deviner). Telecharge et met en cache DANS l'image au build, aucun reseau au runtime.
    && npx remotion browser ensure

# Code de l'app
COPY . .

ENV REMOTION_DIR=/app/remotion

# Railway fournit $PORT dynamiquement ; server.py le lit lui-même (pas d'expansion shell requise)
ENV PORT=8000
EXPOSE 8000

CMD ["python", "server.py"]
