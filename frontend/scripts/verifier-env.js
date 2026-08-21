/* eslint-disable no-console */
/**
 * Garde-fou lancé avant chaque build (script « prebuild »).
 *
 * Sans REACT_APP_BACKEND_URL, rien ne casse bruyamment : `${undefined}/api`
 * reste une URL relative valide, les appels repartent vers le serveur du
 * front, qui répond 200 avec index.html. L'application semble fonctionner
 * jusqu'à ce qu'un utilisateur clique — et la console ne montre aucune
 * erreur, seulement du JSON qui n'en est pas.
 *
 * On préfère un build qui refuse de se terminer à un build silencieusement
 * inutilisable. La panne coûte cinq secondes ici, une demi-journée en ligne.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
// Ordre de priorité de Create React App.
const FICHIERS = ['.env.production.local', '.env.local', '.env.production', '.env'];

const lireDepuisFichiers = (cle) => {
  for (const nom of FICHIERS) {
    const chemin = path.join(RACINE, nom);
    if (!fs.existsSync(chemin)) continue;
    for (const ligne of fs.readFileSync(chemin, 'utf8').split(/\r?\n/)) {
      const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && m[1] === cle) return m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return undefined;
};

const url = process.env.REACT_APP_BACKEND_URL || lireDepuisFichiers('REACT_APP_BACKEND_URL');
// Vercel, Netlify et la plupart des CI posent CI=true.
const enLigne = !!(process.env.VERCEL || process.env.NETLIFY || process.env.CI === 'true');
const local = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(url || '');

if (!url) {
  console.error('\n\x1b[41m\x1b[97m  BUILD REFUSÉ  \x1b[0m REACT_APP_BACKEND_URL est absente.\n');
  console.error("  Sans elle, l'adresse de l'API devient « undefined/api » : une URL relative.");
  console.error('  Les appels repartent vers le front, qui répond index.html avec un code 200.');
  console.error("  L'application se charge, se connecte en apparence, et ne fait rien.\n");
  console.error('  → en local    : renseigne-la dans frontend/.env');
  console.error('  → sur Vercel  : Settings → Environment Variables\n');
  process.exit(1);
}

if (local && enLigne) {
  console.error('\n\x1b[41m\x1b[97m  BUILD REFUSÉ  \x1b[0m REACT_APP_BACKEND_URL pointe sur une machine locale :');
  console.error(`  ${url}\n`);
  console.error("  Mis en ligne, ce build appelle l'ordinateur de chaque visiteur.");
  console.error("  Il fonctionnerait chez toi, si ton serveur tourne, et chez personne d'autre.\n");
  process.exit(1);
}

if (local) {
  // Build local délibéré : on laisse passer, mais on le dit — c'est ce
  // build-là qu'on risque de déposer par erreur sur un hébergement.
  console.warn(`\n\x1b[43m\x1b[30m  ATTENTION  \x1b[0m build compilé contre ${url}`);
  console.warn("  À ne pas déposer sur un hébergement : il n'y fonctionnerait que pour toi.\n");
} else {
  console.log(`\x1b[32m✓\x1b[0m API : ${url}`);
}
