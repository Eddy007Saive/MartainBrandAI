import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';

// Langue de l'INTERFACE (indépendante de user.langue = langue du contenu généré).
// Cascade : choix explicite (localStorage 'lang') → langue du navigateur → français.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
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
