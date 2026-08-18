import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, X } from 'lucide-react';

import { isAuthenticated, isAdminAuthenticated } from '../lib/auth';
import { isNativeApp } from '../lib/appDownload';

/**
 * Proposition de rendez-vous après une minute passée sur le site public.
 *
 * Une minute, c'est le moment où quelqu'un a lu assez pour savoir si le sujet
 * le concerne. Avant, on interrompt une lecture qui commence ; bien après, il
 * est déjà reparti.
 *
 * Trois garde-fous, parce qu'une fenêtre qui s'impose se retourne vite contre
 * celui qui la pose : on ne l'affiche qu'une fois par mois et par visiteur, ni
 * à ceux qui remplissent déjà le formulaire, ni à ceux qui l'ont envoyé.
 */
const DELAI_MS = 60_000;
const CLE = 'postorico_rdv_vu';
const REPOS_JOURS = 30;

// Pages où la proposition n'a pas lieu d'être : on y est déjà en train de
// convertir, ou on n'est pas un visiteur.
const EXCLUES = ['/audit-marque', '/login', '/register', '/pending',
  '/forgot-password', '/reset-password', '/dashboard', '/admin'];

const dejaVu = () => {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) || 'null');
    return !!v && v.jusqua > Date.now();
  } catch {
    return false;
  }
};

const marquerVu = () => {
  try {
    localStorage.setItem(CLE, JSON.stringify({ jusqua: Date.now() + REPOS_JOURS * 86400000 }));
  } catch { /* stockage refusé : on réaffichera, tant pis */ }
};

/** À appeler quand le visiteur a envoyé son audit : plus rien à lui proposer. */
export function rdvDejaPris() {
  marquerVu();
}

export default function PopupRdv() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [sortie, setSortie] = useState(false);
  const boutonRef = useRef(null);
  const focusAvant = useRef(null);

  const horsSujet = EXCLUES.some((p) => pathname.startsWith(p))
    || isAuthenticated() || isAdminAuthenticated() || isNativeApp();

  useEffect(() => {
    if (horsSujet || dejaVu()) return undefined;
    const it = setTimeout(() => setOuvert(true), DELAI_MS);
    return () => clearTimeout(it);
    // Le minuteur ne redémarre pas à chaque page : il court depuis l'arrivée
    // sur le site, ce qui est bien le temps passé, pas le temps sur une page.
  }, [horsSujet]);

  // La sortie est plus rapide que l'entrée : on entre pour se faire remarquer,
  // on sort pour libérer l'écran.
  const fermer = () => {
    setSortie(true);
    marquerVu();
    setTimeout(() => { setOuvert(false); setSortie(false); }, 160);
  };

  useEffect(() => {
    if (!ouvert) return undefined;
    focusAvant.current = document.activeElement;
    boutonRef.current?.focus();
    const auClavier = (e) => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', auClavier);
    return () => {
      document.removeEventListener('keydown', auClavier);
      focusAvant.current?.focus?.();
    };
  }, [ouvert]);

  if (!ouvert) return null;

  const aller = () => { marquerVu(); setOuvert(false); navigate('/audit-marque'); };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rdv-titre" data-testid="popup-rdv"
      onClick={fermer}
      className={`fixed inset-0 z-[90] grid place-items-center p-4 bg-[#020617]/70 backdrop-blur-sm
                  transition-opacity duration-200 ease-out motion-reduce:transition-none
                  ${sortie ? 'opacity-0' : 'opacity-100 animate-fondu'}`}>
      <div onClick={(e) => e.stopPropagation()}
        className={`relative w-[min(430px,100%)] rounded-2xl border border-white/10 bg-[#0f172a] p-6 text-center
                    shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_30px_60px_-14px_rgba(0,0,0,0.75)]
                    transition-[opacity,transform] ease-out-strong motion-reduce:transition-none
                    ${sortie ? 'opacity-0 scale-[0.97] [transition-duration:160ms]'
                             : 'opacity-100 scale-100 [transition-duration:260ms] animate-monter'}`}>
        <button onClick={fermer} aria-label={t('rdv.fermer')} data-testid="popup-rdv-fermer"
          className="absolute top-3.5 right-3.5 w-8 h-8 grid place-items-center rounded-lg
                     text-slate-500 hover:text-white hover:bg-white/[0.06] active:scale-90
                     transition-[color,background-color,transform] duration-150 ease-out-strong">
          <X className="w-4 h-4" />
        </button>

        <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-[#5B6CFF]/25 to-[#8A6CFF]/25
                        grid place-items-center mb-4">
          <CalendarCheck className="w-6 h-6 text-[#8A6CFF]" />
        </div>

        <h2 id="rdv-titre" className="font-sora font-bold text-white text-[19px] leading-snug">
          {t('rdv.titre')}
        </h2>
        <p className="text-[13.5px] text-slate-400 font-inter mt-2 leading-relaxed">{t('rdv.texte')}</p>

        <button ref={boutonRef} onClick={aller} data-testid="popup-rdv-ok"
          className="mt-5 w-full rounded-xl py-3 font-inter font-semibold text-[14px] text-white
                     bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97]
                     shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_20px_-6px_rgba(91,108,255,0.5)]
                     transition-transform duration-150 ease-out-strong">
          {t('rdv.cta')}
        </button>
        <button onClick={fermer}
          className="mt-2.5 text-[12.5px] text-slate-500 hover:text-slate-300 font-inter
                     transition-colors duration-150">
          {t('rdv.plusTard')}
        </button>
        <p className="text-[11.5px] text-slate-600 font-inter mt-3">{t('rdv.rassurance')}</p>
      </div>
    </div>
  );
}
