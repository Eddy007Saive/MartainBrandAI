# Monteur vidéo IA sur le VPS

Serveur HTTP qui confie les montages à Claude Code (sans interface), appelé par Postorico
(`postorico/src/modules/agent-video`). Postorico prépare tout (transcription par le service POC,
morceaux à garder, illustrations, voix off en motion design) ; le serveur coupe les silences,
lance l'agent, vérifie le MP4 et le sert. Détail des routes en tête de `serveur-agent.mjs`.

## Fichiers
- `serveur-agent.mjs` : le serveur (Node 22+, aucune dépendance).
- `regles.md` : les règles du monteur (ajoutées au prompt système de l'agent).
- `garde-fou.mjs` : hook PreToolUse — chaque commande de l'agent passe par lui (outillage vidéo
  seulement, dans le dossier du montage).
- `agent-montage.service` : service systemd sous l'utilisateur `montage`, en bac à sable.
- `installer-securite.sh` : installation / mise à niveau du service sécurisé (relançable).
- `pretraiter.py` : outil de test (coupe des silences en local à partir d'une transcription).

## Installation (root, une fois)
1. Copier les fichiers dans `/srv/agent-video/` (scp).
2. Créer `/srv/agent-video/.env` (chmod 600) : `JETON=` (openssl rand -hex 32, même valeur que
   `AGENT_VIDEO_JETON` côté Postorico), `ANTHROPIC_API_KEY=` (obligatoire avant les clients),
   éventuellement `MODELE`, `BUDGET_USD`, `MAX_MINUTES`, `SIMULTANES`, `RETENTION_JOURS`.
3. Polices : `apt-get install -y fonts-inter fonts-montserrat` + Archivo, Playfair, Bebas dans
   `/usr/local/share/fonts/google`, puis `fc-cache -f`.
4. `cd /srv/agent-video && bash installer-securite.sh` — les 4 vérifications finales doivent être OK.

## Mise à jour
`scp serveur-agent.mjs regles.md garde-fou.mjs root@<vps>:/srv/agent-video/` puis
`chmod 644 /srv/agent-video/*.mjs /srv/agent-video/regles.md && systemctl restart agent-montage`.

## Côté Postorico (Railway)
`AGENT_VIDEO_URL`, `AGENT_VIDEO_JETON`, `PEXELS_API_KEY`, `MONTAGE_POC_URL`,
`MONTAGE_POC_INTERNAL_KEY`. Avant les clients : HTTPS devant le serveur (Caddy) ou `HOST=127.0.0.1`.
