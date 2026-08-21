import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import { estPageTraduite, langueDuChemin } from './lib/langues';

const chemin = typeof window !== 'undefined' ? window.location.pathname : '/';

// Langue de l'INTERFACE (indépendante de user.langue = langue du contenu généré).
//
// Sur les pages publiques, c'est l'ADRESSE qui décide : /es/tarifs est en
// espagnol, point. Et il faut le savoir AVANT le premier rendu — les pages
// sont prérendues, et un premier rendu en français sur un HTML espagnol
// provoque un décalage d'hydratation (React 418) : React jette la page et la
// redessine.
//
// Le détecteur reste en place pour tout le reste — tableau de bord, et choix
// vers lequel envoyer un visiteur arrivé sur une adresse sans préfixe.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // L'adresse ne decide QUE sur les pages traduites. Sur le tableau de bord,
    // qui n'a pas de prefixe, forcer la langue du chemin ramenerait au francais
    // quelqu'un qui vient de se connecter depuis /en/login. On laisse alors le
    // detecteur faire son travail : le choix memorise, puis le navigateur.
    ...(estPageTraduite(chemin) ? { lng: langueDuChemin(chemin) } : {}),
    resources: { fr: { translation: fr }, en: { translation: en }, es: { translation: es } },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en', 'es'],
    nonExplicitSupportedLngs: true, // "en-US" → "en"
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false }, // React échappe déjà
  });

export default i18n;
