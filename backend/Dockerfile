# Image officielle Playwright Python : Chromium + toutes les libs système préinstallés.
# La version DOIT correspondre à playwright dans requirements.txt (1.60.0).
FROM mcr.microsoft.com/playwright/python:v1.60.0-jammy

# ffmpeg : compression des vidéos montées (Studio Vidéo) avant enregistrement Cloudinary.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances Python (cache séparé)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code de l'app
COPY . .

# Railway fournit $PORT dynamiquement ; server.py le lit lui-même (pas d'expansion shell requise)
ENV PORT=8000
EXPOSE 8000

CMD ["python", "server.py"]
