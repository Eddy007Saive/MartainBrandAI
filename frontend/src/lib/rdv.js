// Prise de rendez-vous — une seule adresse pour tout le site.
//
// Elle vit dans REACT_APP_BOOKING_URL : changer d'agenda ne doit pas demander
// de toucher au code. Sans réglage, on retombe sur le courriel — jamais de
// bouton mort. Attention, les variables REACT_APP_ sont figées dans le paquet
// à la compilation : en production, il faut reconstruire, pas redémarrer.
export const BOOKING_URL = process.env.REACT_APP_BOOKING_URL
  || 'mailto:martindumoulin88@gmail.com?subject=Call%20setup%20Presence%20OS';

/** Attributs d'un lien de rendez-vous.
 *  Un agenda s'ouvre dans un onglet neuf — on ne fait pas quitter le site à
 *  quelqu'un qui vient de décider de réserver. Un mailto, lui, reste sur place :
 *  un onglet vide s'ouvrirait puis resterait là. */
export const propsRdv = () => (
  /^https?:/i.test(BOOKING_URL)
    ? { href: BOOKING_URL, target: '_blank', rel: 'noopener noreferrer' }
    : { href: BOOKING_URL }
);
