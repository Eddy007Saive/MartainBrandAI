import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  LANGUE_DEFAUT, PREFIXEES, cheminPourLangue, estPagePublique, estPageTraduite,
  langueDuChemin,
} from '../lib/langues';

const SITE = 'https://postorico.com';

/**
 * Fait de l'adresse la source de verite pour la langue, et pose les balises
 * que lisent les moteurs.
 *
 * Monte une fois, au niveau de l'application. Trois responsabilites :
 *
 *  1. `/es/tarifs` affiche l'espagnol. Sans cela, un visiteur dont le
 *     navigateur est en francais verrait du francais a une adresse espagnole
 *     — pire que pas de traduction du tout.
 *
 *  2. `<html lang>` suit. Les lecteurs d'ecran s'en servent pour choisir leur
 *     prononciation ; les moteurs, pour savoir dans quelle langue classer.
 *
 *  3. `hreflang` + `canonical`. Sans elles, Google traite les trois versions
 *     d'une page comme du contenu duplique au lieu de trois traductions, et
 *     n'en garde qu'une.
 */
const poser = (rel, attrs) => {
  const cle = `${rel}-${attrs.hreflang || 'canonical'}`;
  let el = document.head.querySelector(`link[data-langue="${cle}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('data-langue', cle);
    document.head.appendChild(el);
  }
  el.setAttribute('rel', rel);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
};

const nettoyer = () => {
  document.head.querySelectorAll('link[data-langue]').forEach((el) => el.remove());
};

export default function LangueParUrl() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  // L'accueil sans préfixe est en français. Avant, un visiteur au navigateur
  // espagnol y voyait de l'espagnol : l'adresse ne portant pas la langue, le
  // détecteur décidait seul. On garde cette commodité, mais en produisant
  // cette fois une adresse — sinon la Colombie atterrit en français.
  //
  // Dans un effet, donc après l'hydratation : un aiguillage pendant le premier
  // rendu ferait diverger la page du HTML prérendu. Et jamais contre un choix
  // explicite, ni pour un robot, qui n'exécute pas ce code.
  useEffect(() => {
    if (pathname !== '/') return;
    let choisi = null;
    try { choisi = localStorage.getItem('lang'); } catch { /* stockage refusé */ }
    if (choisi) return;
    const navigateur = (navigator.language || '').slice(0, 2);
    if (PREFIXEES.includes(navigateur)) navigate(`/${navigateur}`, { replace: true });
  }, [pathname, navigate]);

  useEffect(() => {
    // L'adresse ne fait foi QUE sur les pages traduites. Le tableau de bord
    // n'a pas de préfixe : forcer la langue de son chemin le ramènerait au
    // français, et quelqu'un qui vient de se connecter depuis /en/login se
    // retrouverait en français sans avoir rien demandé.
    const courante = (i18n.resolvedLanguage || LANGUE_DEFAUT).slice(0, 2);
    const langue = estPageTraduite(pathname) ? langueDuChemin(pathname) : courante;

    if (courante !== langue) {
      i18n.changeLanguage(langue);
    }
    document.documentElement.setAttribute('lang', langue);

    // Les balises de langue n'ont de sens que sur les pages publiques : le
    // tableau de bord n'est ni indexe ni traduit par adresse.
    nettoyer();
    if (!estPagePublique(pathname)) return;

    poser('canonical', { href: SITE + cheminPourLangue(pathname, langue) });
    [LANGUE_DEFAUT, ...PREFIXEES].forEach((l) => {
      poser('alternate', { hreflang: l, href: SITE + cheminPourLangue(pathname, l) });
    });
    // x-default : la version servie a qui ne correspond a aucune langue declaree.
    poser('alternate', {
      hreflang: 'x-default',
      href: SITE + cheminPourLangue(pathname, LANGUE_DEFAUT),
    });
  }, [pathname, i18n]);

  return null;
}
