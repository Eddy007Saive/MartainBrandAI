/* eslint-disable no-console */
/**
 * Copie la composition « Montage » (éditeur vidéo manuel) depuis le projet Remotion
 * du backend vers `src/generated/montage/`.
 *
 * Pourquoi une copie et non un import : le même code doit tourner dans le
 * navigateur (aperçu @remotion/player) et au rendu serveur (backend/remotion).
 * Vercel ne construit que `frontend/`, Railway que `backend/` : aucun des deux ne
 * voit l'autre dossier. La source de vérité reste `backend/remotion/src/montage/`,
 * la copie est versionnée (comme blog.json) et rafraîchie avant chaque `start`
 * et chaque `build` quand la source est présente.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(ICI, '..', '..', 'backend', 'remotion', 'src', 'montage');
const SORTIE = path.resolve(ICI, '..', 'src', 'generated', 'montage');

if (!fs.existsSync(SOURCE)) {
  console.log('[montage] source absente (build isolé) : la copie versionnée est conservée');
  process.exit(0);
}
fs.mkdirSync(SORTIE, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(SOURCE)) {
  if (!/\.(jsx?|css)$/.test(f)) continue;
  const contenu = fs.readFileSync(path.join(SOURCE, f), 'utf8');
  const entete = `/* COPIE GÉNÉRÉE par scripts/montage.mjs depuis backend/remotion/src/montage/${f} — ne pas éditer ici. */\n`;
  fs.writeFileSync(path.join(SORTIE, f), entete + contenu);
  n += 1;
}
console.log(`[montage] ${n} fichier(s) copié(s) vers src/generated/montage`);
