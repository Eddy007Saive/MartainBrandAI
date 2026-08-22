/**
 * La langue vit dans l'ADRESSE, plus seulement dans le navigateur.
 *
 * Avant, elle etait rangee dans localStorage : une page espagnole n'avait donc
 * aucune adresse. Impossible de la partager, de la mettre en favori — et
 * invisible pour Google comme pour les robots d'IA, qui n'ont pas de
 * localStorage et voyaient toujours le francais.
 *
 * Le francais reste SANS prefixe : le site est en ligne, ses adresses
 * circulent deja. On ajoute des langues, on ne casse pas l'existant.
 *
 *   /tarifs        francais
 *   /en/tarifs     anglais
 *   /es/tarifs     espagnol
 */
import { articleTraduit, estCheminBlog } from './blog';

export const LANGUES = ['fr', 'en', 'es'];
export const LANGUE_DEFAUT = 'fr';

// Les langues qui portent un prefixe (toutes sauf celle par defaut).
export const PREFIXEES = LANGUES.filter((l) => l !== LANGUE_DEFAUT);

/** Les pages INDEXEES : celles qui portent canonical + hreflang et qu'on
 *  prerend. Le tableau de bord n'en fait pas partie, il est prive. */
export const PAGES_PUBLIQUES = [
  '/', '/fonctionnalites', '/comment-ca-marche', '/tarifs', '/faq',
  '/audit-marque', '/cgu', '/confidentialite', '/mentions-legales',
];

/** Les pages TRADUITES PAR ADRESSE. Sur-ensemble des precedentes : connexion
 *  et inscription sont publiques et traduites, mais exclues de l'indexation
 *  (robots.txt). Sans elles ici, un visiteur espagnol qui clique « Empezar »
 *  depuis /es/tarifs retombait sur un formulaire en francais. */
export const PAGES_TRADUITES = [
  ...PAGES_PUBLIQUES,
  '/login', '/register', '/pending', '/forgot-password', '/reset-password',
];

/** Extrait la langue d'un chemin. `/es/tarifs` -> 'es' ; `/tarifs` -> 'fr'. */
export function langueDuChemin(chemin) {
  const seg = (chemin || '/').split('/')[1];
  return PREFIXEES.includes(seg) ? seg : LANGUE_DEFAUT;
}

/** Le chemin sans son prefixe de langue. `/es/tarifs` -> `/tarifs`. */
export function cheminSansLangue(chemin) {
  const parts = (chemin || '/').split('/');
  if (PREFIXEES.includes(parts[1])) {
    const reste = '/' + parts.slice(2).join('/');
    return reste === '/' ? '/' : reste.replace(/\/$/, '');
  }
  return chemin || '/';
}

/** Compose l'adresse d'une page dans une langue donnee. */
export function cheminPourLangue(chemin, langue) {
  const nu = cheminSansLangue(chemin);
  // Un article ne se traduit pas en collant un prefixe devant son adresse :
  // « /es/definir-sa-ligne-editoriale » n'existe pas, c'est « /es/blog/
  // definir-tu-linea-editorial ». Faute de traduction, on renvoie vers
  // l'index du blog dans la langue demandee plutot que vers une 404.
  if (estCheminBlog(nu) && nu !== '/blog') {
    const traduit = articleTraduit(chemin, langue);
    if (traduit) return traduit;
    return langue === LANGUE_DEFAUT ? '/blog' : `/${langue}/blog`;
  }
  if (langue === LANGUE_DEFAUT) return nu;
  return nu === '/' ? `/${langue}` : `/${langue}${nu}`;
}

/** Vrai si la page est indexee : c'est elle qui porte canonical et hreflang. */
export function estPagePublique(chemin) {
  return PAGES_PUBLIQUES.includes(cheminSansLangue(chemin));
}

/** Vrai si l'adresse porte un prefixe de langue explicite (`/es/...`).
 *  Sert aux pages qui ne figurent dans aucune liste — la page introuvable :
 *  `/es/nimporte-quoi` doit s'afficher en espagnol, pas en francais. */
export function aPrefixeDeLangue(chemin) {
  return PREFIXEES.includes((chemin || '/').split('/')[1]);
}

/** Vrai si la page suit la langue de l'adresse (indexee ou non). */
export function estPageTraduite(chemin) {
  return PAGES_TRADUITES.includes(cheminSansLangue(chemin))
    || estCheminBlog(cheminSansLangue(chemin))
    || aPrefixeDeLangue(chemin);
}
