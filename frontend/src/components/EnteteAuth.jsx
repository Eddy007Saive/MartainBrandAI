import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LangSwitcher from './LangSwitcher';

/**
 * En-tête des pages de connexion et d'inscription.
 *
 * Volontairement plus maigre que la navigation du site : ces deux pages
 * n'existent que pour une seule action. Y remettre les quatre liens du menu et
 * le bouton « Commencer », c'est proposer cinq sorties à quelqu'un qu'on vient
 * de faire venir — on garde donc le strict nécessaire.
 *
 * Le logo ramène au site, parce que se retrouver sans aucun retour possible est
 * la vraie faute ; la langue, parce qu'un visiteur hispanophone doit pouvoir
 * lire le formulaire ; et le lien croisé, parce que la moitié des gens se
 * trompent de page.
 */
export default function EnteteAuth({ vers }) {
  const { t } = useTranslation();
  const versInscription = vers === 'register';

  return (
    <header className="absolute top-0 left-0 right-0 z-20">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[68px] flex items-center justify-between gap-4">
        <Link to="/" data-testid="auth-retour-site"
          className="flex items-center gap-2.5 min-w-0 rounded-lg active:scale-[0.98]
                     transition-transform duration-150 ease-out-strong">
          <img src="/logo.png" alt="" className="w-8 h-8 flex-shrink-0" />
          <span className="font-sora font-bold text-white text-[15px] truncate">Postorico</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <LangSwitcher />
          {/* Masqué sur très petit écran : le formulaire porte déjà ce lien en bas. */}
          <Link to={versInscription ? '/register' : '/login'} data-testid="auth-lien-croise"
            className="hidden sm:block text-[13px] font-inter text-slate-400 hover:text-white
                       transition-colors duration-150 ease-out-strong">
            {t(versInscription ? 'lp.nav.start' : 'lp.nav.login')}
          </Link>
        </div>
      </div>
    </header>
  );
}
