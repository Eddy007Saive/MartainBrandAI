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
export const LANGUES = ['fr', 'en', 'es'];
export const LANGUE_DEFAUT = 'fr';

// Les langues qui portent un prefixe (toutes sauf celle par defaut).
export const PREFIXEES = LANGUES.filter((l) => l !== LANGUE_DEFAUT);

/** Les pages publiques traduites. Le tableau de bord n'en fait pas partie :
 *  il est prive, aucun robot ne le lit, et son adresse n'a pas a changer. */
export const PAGES_PUBLIQUES = [
  '/', '/fonctionnalites', '/comment-ca-marche', '/tarifs', '/faq',
  '/audit-marque', '/cgu', '/confidentialite', '/mentions-legales',
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
  if (langue === LANGUE_DEFAUT) return nu;
  return nu === '/' ? `/${langue}` : `/${langue}${nu}`;
}

/** Vrai si le chemin correspond a une page publique traduite. Sert a ne pas
 *  poser de balises de langue sur le tableau de bord. */
export function estPagePublique(chemin) {
  return PAGES_PUBLIQUES.includes(cheminSansLangue(chemin));
}
