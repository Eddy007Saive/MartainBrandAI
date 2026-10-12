#!/usr/bin/env bash
# Passe le serveur de montage sous un utilisateur sans droits, dans un bac à sable systemd.
# À lancer UNE fois, en root, depuis /srv/agent-video (après avoir copié les fichiers à jour) :
#   bash installer-securite.sh
# Relançable sans risque : chaque étape vérifie ce qui existe déjà.
set -euo pipefail
cd /srv/agent-video
D=/srv/agent-video

echo "1/7  Utilisateur « montage » (sans mot de passe, sans shell de connexion)"
id montage >/dev/null 2>&1 || useradd --system --home-dir $D/home --shell /usr/sbin/nologin montage

echo "2/7  Dossiers : le code reste à root (lecture seule pour montage), le travail à montage"
mkdir -p $D/home $D/montages $D/assets
chown root:root $D $D/serveur-agent.mjs $D/regles.md $D/garde-fou.mjs
chmod 755 $D && chmod 644 $D/serveur-agent.mjs $D/regles.md $D/garde-fou.mjs
chown -R montage:montage $D/home $D/montages $D/assets
chmod 600 $D/.env && chown root:root $D/.env

echo "3/7  Claude Code installé pour tout le système (le binaire de root est dans /root, inaccessible)"
npm install -g @anthropic-ai/claude-code >/dev/null 2>&1 || true
CLAUDE_GLOBAL="$(npm prefix -g)/bin/claude"
[ -x "$CLAUDE_GLOBAL" ] || { echo "   ERREUR : $CLAUDE_GLOBAL introuvable"; exit 1; }
echo "   $CLAUDE_GLOBAL ($($CLAUDE_GLOBAL --version))"

echo "4/7  Plugin HyperFrames copié hors de /root"
if [ -d /root/.claude/plugins/marketplaces/hyperframes ] && [ ! -d $D/hyperframes ]; then
  cp -r /root/.claude/plugins/marketplaces/hyperframes $D/hyperframes
fi
[ -d $D/hyperframes ] && chown -R root:root $D/hyperframes && chmod -R a+rX $D/hyperframes

echo "5/7  Connexion de Claude Code pour l'utilisateur montage"
if grep -q '^ANTHROPIC_API_KEY=.\+' $D/.env; then
  echo "   clé API trouvée dans .env : elle sera utilisée"
elif [ -f /root/.claude/.credentials.json ]; then
  mkdir -p $D/home/.claude
  cp /root/.claude/.credentials.json $D/home/.claude/.credentials.json
  chown -R montage:montage $D/home/.claude && chmod 600 $D/home/.claude/.credentials.json
  echo "   connexion de l'abonnement copiée depuis root (tests uniquement : clé API avant les clients)"
else
  echo "   ATTENTION : ni clé API ni connexion trouvée. Ajoute ANTHROPIC_API_KEY=... dans $D/.env"
fi

echo "6/7  Réglages du .env adaptés (binaire et plugin hors de /root)"
sed -i '/^CLAUDE_BIN=/d;/^PLUGIN_DIR=/d;/^HOME=/d' $D/.env
echo "CLAUDE_BIN=$CLAUDE_GLOBAL" >> $D/.env
[ -d $D/hyperframes ] && echo "PLUGIN_DIR=$D/hyperframes" >> $D/.env

echo "7/7  Service systemd sécurisé"
cp $D/agent-montage.service /etc/systemd/system/agent-montage.service
systemctl daemon-reload
systemctl restart agent-montage
sleep 3
systemctl is-active agent-montage
echo
echo "Vérifications :"
echo "  utilisateur du service : $(ps -o user= -p "$(systemctl show -p MainPID --value agent-montage)")"
sudo -u montage test -r /root/.bashrc 2>/dev/null && echo "  !! montage peut lire /root" || echo "  montage ne peut pas lire /root : OK"
sudo -u montage test -w $D/serveur-agent.mjs 2>/dev/null && echo "  !! montage peut modifier le serveur" || echo "  montage ne peut pas modifier le serveur : OK"
sudo -u montage HOME=$D/home $CLAUDE_GLOBAL --version >/dev/null 2>&1 && echo "  Claude Code utilisable par montage : OK" || echo "  !! Claude Code ne démarre pas pour montage"
echo "Terminé."
