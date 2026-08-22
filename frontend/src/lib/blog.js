import donnees from '../generated/blog.json';

/**
 * Accès aux articles compilés par `scripts/blog.mjs`.
 *
 * Tout est en mémoire : le blog est du contenu statique, il n'y a ni requête
 * ni état de chargement. C'est ce qui permet au prérendu de produire des pages
 * complètes, donc lisibles par les robots qui n'exécutent pas JavaScript.
 *
 * Note pour plus tard : les articles voyagent aujourd'hui dans le paquet
 * principal. Passé une trentaine d'articles, il faudra séparer les métadonnées
 * (index) du corps des textes et charger ce dernier à la demande.
 */
const { articles, traductions } = donnees;

export const LANGUE_DEFAUT_BLOG = 'fr';

/** Les articles d'une langue, du plus récent au plus ancien. */
export function articlesDe(langue) {
  return articles.filter((a) => a.langue === langue);
}

/** L'article servi à cette adresse, ou `null` — auquel cas c'est une 404. */
export function articleParChemin(chemin) {
  const nu = (chemin || '').replace(/\/$/, '') || '/';
  return articles.find((a) => a.chemin === nu) || null;
}

/** Vrai pour `/blog`, `/es/blog` et toutes les pages d'articles. */
export function estCheminBlog(cheminSansPrefixe) {
  return cheminSansPrefixe === '/blog' || cheminSansPrefixe.startsWith('/blog/');
}

/**
 * L'adresse du même article dans une autre langue.
 *
 * Renvoie `null` si la traduction n'existe pas : on ne fabrique jamais une
 * adresse en collant un préfixe devant un slug français. Elle n'existerait
 * pas, et c'est le visiteur qui découvrirait la page introuvable.
 */
export function articleTraduit(chemin, langue) {
  const article = articleParChemin(chemin);
  if (!article) return null;
  return traductions[article.id]?.[langue] || null;
}

// L'ordre d'affichage des langues. Il vit ici et non dans `langues.js` : ce
// module est importe PAR lui, l'inverse creerait un cycle.
const ORDRE = ['fr', 'en', 'es'];

/** Les langues dans lesquelles cet article existe vraiment, dans l'ordre. */
export function languesDe(id) {
  const dispo = traductions[id] || {};
  return ORDRE.filter((l) => dispo[l]);
}

/** Le chemin d'un article dans une langue donnée, par identifiant. */
export function cheminDe(id, langue) {
  return traductions[id]?.[langue] || null;
}

/** Les deux articles les plus récents, hors celui qu'on est en train de lire. */
export function aLireAussi(article, combien = 2) {
  return articlesDe(article.langue).filter((a) => a.id !== article.id).slice(0, combien);
}

/** Toutes les adresses du blog : le prérendu et le plan du site s'en servent. */
export function tousLesChemins() {
  return articles.map((a) => a.chemin);
}

/** La date, écrite dans la langue de la page. */
export function dateLisible(iso, langue) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(langue, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// L'illustration. Deux cas : l'article porte une image propre (produite par
// scripts/illustrer.mjs et deposee sur Cloudinary), ou il retombe sur une pose
// de la mascotte. Pas de photo de banque d'images — elle ne raconterait rien
// et se retrouve sur mille autres blogs.
//
// Le format 1200x630 est celui qu'attendent les apercus sociaux : plus petit,
// LinkedIn et X affichent une vignette carree minuscule au lieu d'une banniere.
const CLOUD = 'https://res.cloudinary.com/dy9gp5pim/image/upload';
const transformer = (url, t) => url.replace('/image/upload/', `/image/upload/${t}/`);

export const posePetite = (pose) => `${CLOUD}/w_320,q_auto,f_auto/brand/rico-v4/${pose}.png`;
export const poseOuverture = (pose) => `${CLOUD}/w_1200,h_630,c_pad,b_rgb:0f172a,q_auto,f_auto/brand/rico-v4/${pose}.png`;

/** La vignette de la carte : l'image de l'article, sinon la mascotte. */
export const vignette = (a) => (a.image
  ? transformer(a.image, 'w_640,h_360,c_fill,q_auto,f_auto')
  : posePetite(a.pose));

/** L'image d'ouverture (bandeau de l'article et aperçu social). */
export const ouverture = (a) => (a.image
  ? transformer(a.image, 'w_1200,h_630,c_fill,q_auto,f_auto')
  : poseOuverture(a.pose));
