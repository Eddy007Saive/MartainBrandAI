import { Link, NavLink, useLocation } from 'react-router-dom';

import { cheminPourLangue, langueDuChemin } from '../lib/langues';

/**
 * Un lien interne qui reste dans la langue courante.
 *
 * Sans lui, depuis /es/tarifs un clic sur « FAQ » menait à /faq — donc au
 * français. La langue vivant désormais dans l'adresse, tout lien écrit en dur
 * la fait retomber au français : c'est le pendant obligatoire du routage par
 * préfixe, pas une amélioration optionnelle.
 *
 * Les adresses externes, les ancres et le tableau de bord passent tels quels :
 * seul le site public est traduit par adresse.
 */
const prefixer = (to, pathname) => (
  typeof to === 'string' && to.startsWith('/')
    && !to.startsWith('/dashboard') && !to.startsWith('/admin')
    ? cheminPourLangue(to, langueDuChemin(pathname))
    : to
);

export default function LienLangue({ to, children, ...reste }) {
  const { pathname } = useLocation();
  return <Link to={prefixer(to, pathname)} {...reste}>{children}</Link>;
}

/** Meme chose pour le menu, qui a besoin de l'etat « actif » de NavLink. */
export function NavLienLangue({ to, children, ...reste }) {
  const { pathname } = useLocation();
  return <NavLink to={prefixer(to, pathname)} {...reste}>{children}</NavLink>;
}
