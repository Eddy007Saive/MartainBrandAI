import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { cheminPourLangue, estPageTraduite, langueDuChemin } from '../lib/langues';

const LANGS = [
  { id: 'fr', label: 'FR' },
  { id: 'en', label: 'EN' },
  { id: 'es', label: 'ES' },
];

/**
 * Sélecteur de langue de l'INTERFACE.
 *
 * Sur les pages publiques, il NAVIGUE : `/tarifs` → `/es/tarifs`. La page
 * espagnole a ainsi une adresse — partageable, mettable en favori, et lisible
 * par les moteurs. Auparavant le choix ne vivait que dans le localStorage :
 * un lien envoyé à un prospect s'ouvrait dans la langue de SON navigateur,
 * pas dans celle qu'on venait de lui montrer.
 *
 * Sur le tableau de bord, il n'y a rien à traduire par adresse : on garde le
 * changement en place. `onChanged(lang)` permet d'y synchroniser la langue du
 * contenu généré, qui est un réglage distinct.
 */
export default function LangSwitcher({ className = '', onChanged }) {
  const { i18n } = useTranslation();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();

  const publique = estPageTraduite(pathname);
  // Sur une page publique, l'adresse fait foi ; ailleurs, l'état d'i18next.
  const current = publique ? langueDuChemin(pathname)
    : (i18n.resolvedLanguage || 'fr').slice(0, 2);

  const choisir = (lang) => {
    if (publique) {
      navigate(cheminPourLangue(pathname, lang) + search + hash);
      // On mémorise quand même : c'est ce qui décidera vers quelle langue
      // envoyer ce visiteur s'il revient un jour sur une adresse sans préfixe.
      try { localStorage.setItem('lang', lang); } catch { /* refusé : tant pis */ }
    } else {
      i18n.changeLanguage(lang);
    }
    onChanged?.(lang);
  };

  return (
    <div className={`inline-flex gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] ${className}`} data-testid="lang-switcher">
      {LANGS.map((l) => (
        <button key={l.id} type="button" onClick={() => choisir(l.id)}
          data-testid={`lang-${l.id}`}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold font-inter transition-colors ${
            current === l.id ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
