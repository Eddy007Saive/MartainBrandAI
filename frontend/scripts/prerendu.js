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

// critters (Google Chrome Labs) : extrait le CSS critique d'une page a partir
// de son DOM prerendu. Les @font-face sont inlinees A PART (inlinerFontFaces
// ci-dessous) : l'option inlineFonts de critters ne reconnait pas les familles
// referencees via une variable CSS et laissait Sora de cote. Sans @font-face
// dans le CSS inline, le premier affichage se fait en police de repli (plus
// petite), puis le titre est repeint plus grand une fois main.css arrive ;
// Chrome enregistrait alors un second candidat LCP, 1 a 10 s plus tard selon
// le reseau. Les fichiers woff2 du premier ecran sont de plus precharges. Facultatif : s'il manque ou echoue, la page est ecrite
// avec sa feuille de style classique.
// Les polices du premier ecran sont declarees dans main.css, charge en differe
// depuis le passage au CSS critique : sans preload, le navigateur ne les
// decouvre qu'apres la feuille complete (chaine CSS -> woff2 de ~2,9 s dans
// Lighthouse), ou, pour celles dont le @font-face est inline (FACES_INLINE),
// seulement au premier layout, apres le CSS critique (~1,1 a 1,5 s). On les
// annonce dans <head>. Graisses relevees au premier ecran (octobre 2026,
// accueil + blog + tarifs, 412x823 et 1350x940) :
//   - Sora 700/800 : titres, logo, chiffres ;
//   - Inter 400 : paragraphes ;
//   - Inter 600 : selecteur de langue, kicker, boutons CTA, <b> du sous-titre ;
//   - Inter 500 : liens de nav + tagline « Studio de contenu IA », visibles sur
//     grand ecran seulement (masques <= 900 px par homeCine.css) : preload
//     conditionne par media query, le mobile ne telecharge pas 24 Ko inutiles.
// Sora 400 n'apparait qu'a ~2 700 px (h3 des comparatifs) : pas prechargee.
// Total mobile : 4 fichiers (~78 Ko) ; grand ecran : 5 fichiers (~102 Ko).
const POLICES_PRIORITAIRES = [
  'sora-latin-700-normal', 'sora-latin-800-normal', 'inter-latin-400-normal', 'inter-latin-600-normal',
  { nom: 'inter-latin-500-normal', media: '(min-width: 901px)' },
];
let preloadsPolices = null;
function precharcherPolices(html) {
  if (preloadsPolices === null) {
    const dossierMedia = path.join(BUILD, 'static', 'media');
    const fichiers = fs.existsSync(dossierMedia) ? fs.readdirSync(dossierMedia) : [];
    preloadsPolices = POLICES_PRIORITAIRES
      .map((p) => (typeof p === 'string' ? { nom: p } : p))
      .map(({ nom, media }) => ({ media, f: fichiers.find((f) => f.startsWith(`${nom}.`) && f.endsWith('.woff2')) }))
      .filter(({ f }) => f)
      .map(({ f, media }) => `<link rel="preload" as="font" type="font/woff2" crossorigin${media ? ` media="${media}"` : ''} href="/static/media/${f}">`)
      .join('');
  }
  if (!preloadsPolices || html.includes('as="font"')) return html;
  return html.replace('</head>', `${preloadsPolices}</head>`);
}

// @font-face des polices du premier ecran, extraites de main.css : sous-ensemble
// latin uniquement (les variantes latin-ext/cyrillic/grec/vietnamien restent
// dans la feuille complete, chargee en differe). Une face inline declenche le
// telechargement des le premier layout pour tout texte qui l'utilise, meme
// loin sous la ligne de flottaison : Sora 400 (h3 des comparatifs, ~2 700 px)
// n'y figure donc plus, elle n'est decouverte qu'avec main.css et sort de la
// chaine critique ; d'ici la, ces h3 s'affichent en « Sora Fallback » calibree.
const FACES_INLINE = { Sora: ['700', '800'], Inter: ['400', '500', '600'] };
let fontFacesInline = null;
function inlinerFontFaces(html) {
  if (fontFacesInline === null) {
    fontFacesInline = '';
    try {
      const dossierCss = path.join(BUILD, 'static', 'css');
      const feuille = fs.readdirSync(dossierCss).find((f) => /^main\..*\.css$/.test(f));
      const css = feuille ? fs.readFileSync(path.join(dossierCss, feuille), 'utf8') : '';
      const faces = css.match(/@font-face\{[^}]*\}/g) || [];
      const gardees = faces.filter((face) => {
        const famille = (face.match(/font-family:\s*"?([^;"]+)/) || [])[1];
        const poids = (face.match(/font-weight:\s*([^;]+)/) || [])[1];
        const url = (face.match(/url\(([^)]+)\)/) || [])[1] || '';
        if (famille && / Fallback$/.test(famille)) return true; // replis calibres (App.css)
        return FACES_INLINE[famille] && FACES_INLINE[famille].includes((poids || '').trim())
          && /-latin-\d/.test(url);
      });
      if (gardees.length) fontFacesInline = `<style data-font-faces>${gardees.join('')}</style>`;
    } catch (e) {
      console.warn(`  ! @font-face non inlinees : ${e.message}`);
    }
  }
  if (!fontFacesInline || html.includes('data-font-faces')) return html;
  // Avant le CSS critique, pour que les polices soient connues au premier rendu.
  return html.replace('<head>', `<head>${fontFacesInline}`);
}

let critters = null;
async function inlinerCssCritique(html, chemin) {
  try {
    if (!critters) {
      const Critters = require('critters');
      critters = new Critters({
        path: BUILD, publicPath: '/', preload: 'media', inlineFonts: false,
        pruneSource: false, reduceInlineStyles: false, logLevel: 'silent',
      });
    }
    return await critters.process(html);
  } catch (e) {
    console.warn(`  ! CSS critique ignore pour ${chemin} : ${e.message}`);
    return html;
  }
}

const BUILD = path.resolve(__dirname, '..', 'build');

// Instantanes des pages prerendues, VERSIONNES (frontend/prerendu/). Ecrits a
// chaque prerendu reussi sur une machine ou un navigateur se lance ; rejoues
// par appliquerInstantanes() la ou aucun navigateur ne demarre (conteneur de
// build Hostinger, octobre 2026 : ni puppeteer ni @sparticuz/chromium n'y
// fonctionnent, et le site etait servi sans aucune page prerendue). Les
// references aux fichiers hashes (main.js, main.css, polices) sont reecrites
// d'apres asset-manifest.json, car les hashes du build distant different.
const SNAP = path.resolve(__dirname, '..', 'prerendu');

function cheminInstantane(chemin) {
  const rel = chemin === '/' ? '' : chemin.replace(/^\//, '');
  return path.join(SNAP, rel, 'index.html');
}

function enregistrerInstantane(chemin, html) {
  try {
    const fichier = cheminInstantane(chemin);
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, html, 'utf8');
  } catch (e) {
    console.warn(`  ! instantane non enregistre pour ${chemin} : ${e.message}`);
  }
}

function lireManifeste(dossier) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dossier, 'asset-manifest.json'), 'utf8')).files || {};
  } catch {
    return null;
  }
}

function listerHtml(dossier, base = dossier) {
  const out = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const abs = path.join(dossier, entree.name);
    if (entree.isDirectory()) out.push(...listerHtml(abs, base));
    else if (entree.name === 'index.html') out.push(path.relative(base, abs));
  }
  return out;
}

/** Rejoue les instantanes dans build/ en reecrivant les URL hashees. Renvoie le nombre de pages. */
function appliquerInstantanes() {
  const ancien = lireManifeste(SNAP);
  const nouveau = lireManifeste(BUILD);
  if (!ancien || !nouveau || !fs.existsSync(SNAP)) {
    console.warn('  ! aucun instantane disponible (frontend/prerendu/ absent ou sans asset-manifest.json)');
    return 0;
  }
  const remplacements = [];
  for (const [cle, ancienneUrl] of Object.entries(ancien)) {
    const nouvelleUrl = nouveau[cle];
    if (nouvelleUrl && nouvelleUrl !== ancienneUrl) remplacements.push([ancienneUrl, nouvelleUrl]);
  }
  const manquants = Object.keys(ancien).filter((cle) => !nouveau[cle] && !/\.map$/.test(cle));
  if (manquants.length) console.warn(`  ! ${manquants.length} fichier(s) de l'instantane absents du build : ${manquants.slice(0, 5).join(', ')}`);
  let n = 0;
  for (const rel of listerHtml(SNAP)) {
    let html = fs.readFileSync(path.join(SNAP, rel), 'utf8');
    for (const [a, b] of remplacements) html = html.split(a).join(b);
    const cible = path.join(BUILD, rel);
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, html, 'utf8');
    n += 1;
  }
  console.log(`  ${n} page(s) restaurees depuis frontend/prerendu/ (${remplacements.length} URL hashee(s) reecrite(s)).`);
  return n;
}
const PORT = 4599;

// Les mêmes pages que src/lib/langues.js. Duplication assumée : ce script
// tourne dans Node, hors du bundle, il ne peut pas importer un module ES.
const PAGES = ['/', '/fonctionnalites', '/comment-ca-marche', '/tarifs', '/faq', '/blog',
  '/audit-marque', '/cgu', '/confidentialite', '/mentions-legales'];
const PREFIXES = ['', '/en', '/es'];
const SITE = 'https://postorico.com';

// Les articles, eux, ne se declinent pas par prefixe : chaque langue a SON
// adresse, ecrite dans l'en-tete du fichier Markdown. On lit donc la table
// compilee plutot que de fabriquer des adresses qui n'existeraient pas.
const BLOG = require('../src/generated/blog.json');
const ARTICLES = BLOG.articles.map((a) => ({
  chemin: a.chemin,
  langue: a.langue,
  maj: a.maj,
  // Les langues dans lesquelles CET article existe vraiment.
  alternates: BLOG.traductions[a.id] || {},
}));

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

// Lance un navigateur pour le prérendu. Sur Vercel/CI, le Chrome que puppeteer
// télécharge manque des libs système (libnspr4.so…) : on tente d'abord
// @sparticuz/chromium (Chromium « serverless » livré avec ses libs), sinon on
// retombe sur le puppeteer local (poste de dev).
async function lancerChromiumPortable() {
  // @sparticuz/chromium : un Chromium autonome (librairies incluses), concu
  // pour les environnements minimaux (Lambda, conteneurs de build).
  const chromium = require('@sparticuz/chromium');
  const pc = require('puppeteer-core');
  return pc.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'],
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

async function lancerNavigateur() {
  // PRERENDU_SANS_NAVIGATEUR=1 : simule un hote sans navigateur (test du rejeu
  // des instantanes, cf. appliquerInstantanes).
  if (process.env.PRERENDU_SANS_NAVIGATEUR === '1') throw new Error('navigateur desactive (PRERENDU_SANS_NAVIGATEUR=1)');
  // Octobre 2026 : sur Hostinger (deploiement git), ni VERCEL ni CI ne sont
  // definis et le Chromium de puppeteer ne se lance pas (librairies systeme
  // absentes) : le site etait servi SANS pages prerendues (index.html de
  // 985 octets) alors que le sitemap et llms.txt, eux, etaient bien ecrits.
  // On essaie donc TOUJOURS le Chromium portable si le navigateur de
  // puppeteer echoue, quel que soit l'environnement.
  const surVercel = !!(process.env.VERCEL || process.env.CI);
  const essais = surVercel
    ? [['@sparticuz/chromium', lancerChromiumPortable], ['puppeteer', lancerPuppeteer]]
    : [['puppeteer', lancerPuppeteer], ['@sparticuz/chromium', lancerChromiumPortable]];
  let derniere = null;
  for (const [nom, lancer] of essais) {
    try {
      const navigateur = await lancer();
      console.log(`  navigateur : ${nom}`);
      return navigateur;
    } catch (e) {
      derniere = e;
      console.warn(`  ⚠ ${nom} : ${String(e.message).split(String.fromCharCode(10))[0]}`);
    }
  }
  throw derniere || new Error('aucun navigateur disponible');
}

function lancerPuppeteer() {
  return puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
}

async function principal() {
  if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
    console.error('build/index.html introuvable — lance le build avant le prérendu.');
    process.exit(1);
  }

  const serveur = servir();
  // Le navigateur est FACULTATIF : s'il ne se lance pas (libs manquantes sur
  // Vercel), on saute le prérendu des pages mais on écrit quand même le sitemap
  // plus bas — un navigateur cassé ne doit jamais faire échouer le déploiement.
  let navigateur = null;
  try {
    navigateur = await lancerNavigateur();
  } catch (e) {
    console.warn(`\n  ⚠ Navigateur impossible à lancer : ${e.message}`);
    console.warn('    → pages NON prérendues ce déploiement (le sitemap.xml est écrit quand même).\n');
  }

  let ecrits = 0;
  let vides = 0;

  if (navigateur) {
    // Repart d'un dossier propre : une page supprimee ne doit pas survivre.
    fs.rmSync(SNAP, { recursive: true, force: true });
    fs.mkdirSync(SNAP, { recursive: true });
  }

  const aVisiter = PREFIXES.flatMap((prefixe) => PAGES.map(
    (page) => (prefixe + (page === '/' ? '' : page)) || '/',
  )).concat(ARTICLES.map((a) => a.chemin));

  if (navigateur) for (const chemin of aVisiter) {
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
      // Les articles chargent leur corps par un fichier JSON : on attend qu'il
      // soit en place (data-article-pret, cf. pages/marketing/Article.jsx),
      // sinon la page figee n'aurait que le titre.
      if (/\/blog\/./.test(chemin)) {
        await onglet.waitForSelector('article[data-article-pret]', { timeout: 15000 })
          .catch(() => console.warn(`  ! ${chemin} : corps de l'article non charge avant expiration`));
      }
      // Le temps que les images et les polices se posent : sans cette pause,
      // on capture parfois un rendu à moitié dessiné.
      await new Promise((r) => setTimeout(r, 600));

      // « Vous devez activer JavaScript » n'est plus vrai sur une page
      // prérendue — et c'est justement cette phrase qu'un robot qui
      // n'exécute pas JavaScript lit en tête de page. On la retire.
      //
      // Le lien Google Fonts charge en media="print" puis bascule en "all" à
      // son onload (chargement non bloquant, cf. index.html) — mais au moment
      // où Puppeteer capture le DOM, ce onload a déjà eu lieu : le HTML figé
      // contiendrait media="all" pour de bon, et tout visiteur qui reçoit
      // cette page prérendue perdrait l'astuce. On restaure l'état de départ.
      const html = (await onglet.content())
        .replace(/<noscript>[\s\S]*?<\/noscript>/gi, '')
        .replace(
          /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]*)"[^>]*>/i,
          '<link rel="stylesheet" href="$1" media="print" onload="this.media=\'all\'">',
        );
      const texte = await onglet.evaluate(
        () => document.querySelector('#root')?.innerText.trim().length || 0);

      // Un fichier par adresse : build/es/tarifs/index.html
      const dossier = chemin === '/' ? BUILD : path.join(BUILD, chemin);
      fs.mkdirSync(dossier, { recursive: true });
      // CSS critique : les regles necessaires au premier ecran sont inlinees,
      // la feuille complete (main.css, ~25 Ko transferes) passe en chargement
      // non bloquant. Audit Lighthouse "requetes de blocage du rendu".
      const htmlFinal = precharcherPolices(inlinerFontFaces(await inlinerCssCritique(html, chemin)));
      fs.writeFileSync(path.join(dossier, 'index.html'), htmlFinal, 'utf8');
      enregistrerInstantane(chemin, htmlFinal);

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

  if (navigateur) {
    await navigateur.close();
    // Le manifeste du build dont proviennent les instantanes : indispensable
    // pour reecrire les hashes sur une autre machine.
    fs.copyFileSync(path.join(BUILD, 'asset-manifest.json'), path.join(SNAP, 'asset-manifest.json'));
    console.log(`  instantanes enregistres dans frontend/prerendu/ (${ecrits} pages) — a versionner.`);
  } else {
    console.warn('  → pas de navigateur : rejeu des instantanes versionnes.');
    ecrits = appliquerInstantanes();
  }
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

  // Les articles, avec leurs alternates reels : declarer une traduction qui
  // n'existe pas envoie Google sur une page introuvable, et il le retient.
  const entreesBlog = ARTICLES.map((a) => {
    const alternates = Object.entries(a.alternates)
      .map(([l, c]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${c}"/>`)
      .concat(a.alternates.fr
        ? `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${a.alternates.fr}"/>`
        : [])
      .join('\n');
    return `  <url>\n    <loc>${SITE}${a.chemin}</loc>\n${alternates}\n    <lastmod>${a.maj}</lastmod>\n  </url>`;
  }).join('\n');

  fs.writeFileSync(path.join(BUILD, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
    + '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + `${entrees}\n${entreesBlog}\n</urlset>\n`, 'utf8');
  // llms.txt liste les pages a l'intention des modeles de langage. Les
  // articles y sont AJOUTES au build, et non recopies a la main dans
  // public/llms.txt : une liste tenue a la main est fausse des le deuxieme
  // article publie.
  const llms = path.join(BUILD, 'llms.txt');
  if (fs.existsSync(llms)) {
    const fr = ARTICLES.filter((a) => a.langue === 'fr');
    if (fr.length) {
      const lignes = BLOG.articles.filter((a) => a.langue === 'fr')
        .map((a) => `- [${a.titre}](${SITE}${a.chemin}) : ${a.description}`)
        .join('\n');
      fs.appendFileSync(llms, `\n## Blog\n\n${lignes}\n`, 'utf8');
      console.log(`  → llms.txt : ${fr.length} article(s) ajouté(s)`);
    }
  }

  console.log(`  → sitemap.xml : ${PAGES.length * PREFIXES.length + ARTICLES.length} adresses, dont ${ARTICLES.length} article(s)`);

  console.log(`\nPrérendu : ${ecrits} pages écrites sur ${aVisiter.length}.`);
  if (vides) console.warn(`${vides} page(s) sans contenu réel — à regarder.`);
  // On ne fait pas échouer le build : une page ratée vaut mieux qu'un
  // déploiement bloqué. L'avertissement suffit à la voir passer.
}

principal().catch((e) => {
  console.error('Prérendu interrompu :', e.message);
  process.exit(1);
});
