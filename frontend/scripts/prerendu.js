/* eslint-disable no-console */
/**
 * Prérendu des pages publiques.
 *
 * Le problème qu'il règle : GPTBot, ClaudeBot et PerplexityBot n'exécutent pas
 * JavaScript. Sur une application React rendue côté navigateur, ils lisent
 * « You need to enable JavaScript to run this app. » — une page vide. Un
 * robots.txt accueillant ne sert à rien tant qu'il n'y a rien à lire.
 *
 * Le principe : après le build, on sert `build/` en local, on visite chaque
 * page avec un vrai navigateur, et on enregistre le HTML une fois rendu.
 * C'est la technique de react-snap, sans dépendre d'un paquet abandonné
 * depuis 2021 qui casserait sur React 19.
 *
 * Rien n'est demandé au serveur d'exécution : ce sont des fichiers statiques.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const BUILD = path.resolve(__dirname, '..', 'build');
const PORT = 4599;

// Les mêmes pages que src/lib/langues.js. Duplication assumée : ce script
// tourne dans Node, hors du bundle, il ne peut pas importer un module ES.
const PAGES = ['/', '/fonctionnalites', '/comment-ca-marche', '/tarifs', '/faq',
  '/audit-marque', '/cgu', '/confidentialite', '/mentions-legales'];
const PREFIXES = ['', '/en', '/es'];
const SITE = 'https://postorico.com';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

/** Serveur statique minimal, avec le repli SPA vers index.html. */
function servir() {
  return http.createServer((req, res) => {
    const propre = decodeURIComponent(req.url.split('?')[0]);
    let fichier = path.join(BUILD, propre);
    if (!fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
      fichier = path.join(BUILD, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fichier)] || 'application/octet-stream' });
    fs.createReadStream(fichier).pipe(res);
  }).listen(PORT);
}

async function principal() {
  if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
    console.error('build/index.html introuvable — lance le build avant le prérendu.');
    process.exit(1);
  }

  const serveur = servir();
  const navigateur = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  let ecrits = 0;
  let vides = 0;

  for (const prefixe of PREFIXES) {
    for (const page of PAGES) {
      const chemin = (prefixe + (page === '/' ? '' : page)) || '/';
      const onglet = await navigateur.newPage();
      // Un poste de bureau : c'est le rendu que verront les moteurs.
      await onglet.setViewport({ width: 1440, height: 900 });
      try {
        // Pas « networkidle0 » : /audit-marque porte un widget anti-robot qui
        // garde une connexion ouverte, le réseau n'est donc JAMAIS au repos et
        // la page expirait. On attend le document, puis le contenu réel.
        await onglet.goto(`http://127.0.0.1:${PORT}${chemin}`, {
          waitUntil: 'domcontentloaded', timeout: 45000,
        });
        // Le contenu, pas seulement le squelette.
        await onglet.waitForFunction(
          () => document.querySelector('#root')?.innerText.trim().length > 120,
          { timeout: 15000 },
        ).catch(() => { /* page pauvre en texte : on prend ce qu'il y a */ });
        // Le temps que les images et les polices se posent : sans cette pause,
        // on capture parfois un rendu à moitié dessiné.
        await new Promise((r) => setTimeout(r, 600));

        // « Vous devez activer JavaScript » n'est plus vrai sur une page
        // prérendue — et c'est justement cette phrase qu'un robot qui
        // n'exécute pas JavaScript lit en tête de page. On la retire.
        const html = (await onglet.content())
          .replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
        const texte = await onglet.evaluate(
          () => document.querySelector('#root')?.innerText.trim().length || 0);

        // Un fichier par adresse : build/es/tarifs/index.html
        const dossier = chemin === '/' ? BUILD : path.join(BUILD, chemin);
        fs.mkdirSync(dossier, { recursive: true });
        fs.writeFileSync(path.join(dossier, 'index.html'), html, 'utf8');

        if (texte < 120) {
          vides += 1;
          console.warn(`  ⚠ ${chemin.padEnd(28)} ${texte} caractères — page quasi vide`);
        } else {
          console.log(`  ✓ ${chemin.padEnd(28)} ${texte} caractères`);
        }
        ecrits += 1;
      } catch (e) {
        console.error(`  ✗ ${chemin} — ${e.message}`);
      }
      await onglet.close();
    }
  }

  await navigateur.close();
  serveur.close();

  // Le plan du site est écrit ICI, depuis les mêmes listes que le prérendu :
  // deux sources finiraient toujours par diverger d'une page.
  const jour = new Date().toISOString().slice(0, 10);
  const abs = (page, prefixe) => `${SITE}${(prefixe + (page === '/' ? '' : page)) || '/'}`;
  const entrees = PREFIXES.flatMap((prefixe) => PAGES.map((page) => {
    const alternates = PREFIXES
      .map((p) => `    <xhtml:link rel="alternate" hreflang="${p.replace('/', '') || 'fr'}" href="${abs(page, p)}"/>`)
      .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(page, '')}"/>`)
      .join('\n');
    return `  <url>\n    <loc>${abs(page, prefixe)}</loc>\n${alternates}\n    <lastmod>${jour}</lastmod>\n  </url>`;
  })).join('\n');

  fs.writeFileSync(path.join(BUILD, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
    + '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + `${entrees}\n</urlset>\n`, 'utf8');
  console.log(`  → sitemap.xml : ${PAGES.length * PREFIXES.length} adresses, avec leurs alternates`);

  console.log(`\nPrérendu : ${ecrits} pages écrites sur ${PAGES.length * PREFIXES.length}.`);
  if (vides) console.warn(`${vides} page(s) sans contenu réel — à regarder.`);
  // On ne fait pas échouer le build : une page ratée vaut mieux qu'un
  // déploiement bloqué. L'avertissement suffit à la voir passer.
}

principal().catch((e) => {
  console.error('Prérendu interrompu :', e.message);
  process.exit(1);
});
