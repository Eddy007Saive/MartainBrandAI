# Service de rendu Remotion persistant (backend/remotion/server) — 3e service Railway.
# Reçoit POST /render {composition, props, crf} et renvoie le MP4 ; le bundle webpack des
# compositions est fait UNE fois au démarrage (vs. à chaque reel en sous-processus).
# Les deux backends (Python et NestJS) l'appellent via REMOTION_RENDER_URL.
#
# Railway : nouveau service depuis ce dépôt, Root Directory = backend/remotion, ce Dockerfile
# est détecté automatiquement. Pas de domaine public nécessaire : les backends l'atteignent
# par le réseau privé (http://<nom-du-service>.railway.internal:8090).
FROM node:20-bookworm-slim

# Bibliothèques système du Chrome headless de Remotion (liste officielle Remotion pour Debian).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
    libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 \
    libcups2 fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances d'abord (cache Docker), puis le navigateur de Remotion téléchargé DANS l'image
# au build : aucun réseau au runtime (même choix que backend/Dockerfile).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npx remotion browser ensure

# Compositions (src/, public/) + serveur HTTP (server/) ; compilation du serveur vers out-server/.
COPY . .
RUN npx tsc -p server/tsconfig.json

ENV NODE_ENV=production
# PORT : Railway l'injecte ; 8090 par défaut (main.ts). Un rendu sature les cœurs du
# conteneur : REMOTION_RENDUS_SIMULTANES (défaut 2) plafonne la concurrence ici.
EXPOSE 8090

CMD ["node", "out-server/main.js"]
