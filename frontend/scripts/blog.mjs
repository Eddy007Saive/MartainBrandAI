/* eslint-disable no-console */
/**
 * Compile les articles du blog en un seul fichier que l'application importe.
 *
 * Pourquoi des fichiers Markdown et non une table Supabase : un article doit
 * exister dans le HTML AVANT que le visiteur — ou le robot — arrive. Le site
 * est prérendu au build ; du contenu servi par une requête au chargement
 * serait invisible pour GPTBot, ClaudeBot et Googlebot, qui n'attendent pas.
 * Un article est donc du code : il se relit, se corrige, se déploie.
 *
 * Convention : `content/blog/<langue>/<identifiant>.md`. L'identifiant relie
 * les traductions entre elles (c'est lui qui produit les `hreflang`) ; chaque
 * langue garde en revanche SON adresse, écrite dans son en-tête `slug` — un
 * lecteur espagnol ne doit pas atterrir sur une adresse française.
 *
 * Le résultat est écrit dans `src/generated/blog.json` et versionné : sans
 * cela, `yarn start` sur une machine neuve échouerait sur un import manquant.
 * Le script tourne de toute façon avant chaque `start` et chaque `build`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(ICI, '..', 'content', 'blog');
const SORTIE = path.resolve(ICI, '..', 'src', 'generated', 'blog.json');
const LANGUES = ['fr', 'en', 'es'];
const LANGUE_DEFAUT = 'fr';
const OBLIGATOIRES = ['slug', 'titre', 'description', 'date'];

/** Adresse en toutes lettres, minuscules, sans accent : `Ligne éditoriale` -> `ligne-editoriale`. */
const ancre = (texte) => texte
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Marked encode les apostrophes et les esperluettes dans le HTML — c'est
 * correct. Mais le texte du sommaire est ensuite affiche par React comme du
 * TEXTE : « Ce qu&#39;il faut retenir » s'y lisait tel quel. On decode donc
 * les quelques entites que produit marked.
 */
const decoder = (t) => t
  .replace(/&#39;|&#x27;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

/**
 * L'en-tête d'un article : un sous-ensemble de YAML, volontairement pauvre.
 * Une vraie bibliothèque YAML pour six clés par fichier serait une dépendance
 * de plus à surveiller pour un gain nul.
 */
function entete(brut) {
  const m = brut.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return [null, brut];
  const champs = {};
  m[1].split(/\r?\n/).forEach((ligne) => {
    const c = ligne.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
    if (!c) return;
    const [, cle] = c;
    let valeur = c[2].trim().replace(/^["'](.*)["']$/, '$1');
    if (valeur.startsWith('[')) {
      champs[cle] = valeur.slice(1, -1).split(',').map((v) => v.trim()).filter(Boolean);
    } else {
      champs[cle] = valeur;
    }
  });
  return [champs, m[2]];
}

const erreurs = [];
const articles = [];

for (const langue of LANGUES) {
  const dossier = path.join(SOURCE, langue);
  if (!fs.existsSync(dossier)) continue;

  for (const fichier of fs.readdirSync(dossier).filter((f) => f.endsWith('.md'))) {
    const chemin = path.join(dossier, fichier);
    const id = fichier.replace(/\.md$/, '');
    const [champs, corps] = entete(fs.readFileSync(chemin, 'utf8'));

    if (!champs) { erreurs.push(`${langue}/${fichier} : en-tête --- absent`); continue; }
    const manquants = OBLIGATOIRES.filter((c) => !champs[c]);
    if (manquants.length) {
      erreurs.push(`${langue}/${fichier} : champ(s) manquant(s) — ${manquants.join(', ')}`);
      continue;
    }

    // Les titres reçoivent une ancre : c'est ce qui permet de renvoyer vers un
    // PASSAGE précis, et c'est aussi ce que citent les moteurs conversationnels.
    const sommaire = [];
    const html = marked.parse(corps)
      .replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, niveau, contenu) => {
        const texte = decoder(contenu.replace(/<[^>]+>/g, '')).trim();
        const cle = ancre(texte);
        if (niveau === '2') sommaire.push({ id: cle, texte });
        return `<h${niveau} id="${cle}">${contenu}</h${niveau}>`;
      })
      // Les liens sortants s'ouvrent ailleurs et ne transmettent pas notre
      // autorité de page ; les liens internes restent tels quels, l'article
      // les intercepte au clic pour naviguer sans recharger.
      .replace(/<a href="(https?:\/\/[^"]+)"/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer"');

    // Un tableau large doit defiler dans son propre cadre : sinon c'est la
    // page entiere qui part en travers sur telephone.
    const htmlFinal = html
      .replace(/<table>/g, '<div class="tbl"><table>')
      .replace(new RegExp('</table>', 'g'), '</table></div>');

    const mots = corps.split(/\s+/).filter(Boolean).length;
    const prefixe = langue === LANGUE_DEFAUT ? '' : `/${langue}`;

    articles.push({
      id,
      langue,
      slug: champs.slug,
      chemin: `${prefixe}/blog/${champs.slug}`,
      titre: champs.titre,
      description: champs.description,
      date: champs.date,
      maj: champs.maj || champs.date,
      auteur: champs.auteur || 'Postorico',
      tags: champs.tags || [],
      // La pose de Rico qui illustre la carte : la mascotte tient lieu
      // d'illustration, plutôt qu'une photo de banque d'images qui ne
      // raconterait rien et ressemblerait à tous les autres blogs.
      pose: champs.pose || 'presente-cote',
      minutes: Math.max(1, Math.round(mots / 200)),
      mots,
      sommaire,
      html: htmlFinal,
    });
  }
}

// Deux articles à la même adresse : le second écraserait le premier au
// prérendu, en silence. Mieux vaut arrêter ici.
const vues = new Map();
articles.forEach((a) => {
  const cle = `${a.langue}:${a.slug}`;
  if (vues.has(cle)) erreurs.push(`adresse en double : ${a.chemin} (${a.id} et ${vues.get(cle)})`);
  vues.set(cle, a.id);
});

if (erreurs.length) {
  console.error('\nBlog — articles refusés :');
  erreurs.forEach((e) => console.error(`  ✗ ${e}`));
  process.exit(1);
}

// Du plus récent au plus ancien : c'est l'ordre de la page d'index.
articles.sort((a, b) => (a.date < b.date ? 1 : -1));

// La table des traductions : elle sert au sélecteur de langue et aux balises
// `hreflang`. Un article traduit en deux langues seulement n'en déclare que
// deux — annoncer une traduction qui n'existe pas envoie le visiteur sur une
// page introuvable, et Google le constate avant nous.
const traductions = {};
articles.forEach((a) => {
  traductions[a.id] = traductions[a.id] || {};
  traductions[a.id][a.langue] = a.chemin;
});

fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, `${JSON.stringify({
  _: 'Genere par scripts/blog.mjs a partir de content/blog — ne pas editer a la main.',
  articles,
  traductions,
}, null, 1)}\n`, 'utf8');

const parLangue = LANGUES.map((l) => `${l}:${articles.filter((a) => a.langue === l).length}`);
console.log(`Blog : ${articles.length} article(s) compilé(s) — ${parLangue.join('  ')}`);
