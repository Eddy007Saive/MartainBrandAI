import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, Clock, Sparkles, ShieldCheck } from 'lucide-react';

import { isAuthenticated, isAdminAuthenticated } from '../lib/auth';
import { isNativeApp } from '../lib/appDownload';
import { propsRdv } from '../lib/rdv';

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
const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_420,q_auto,f_auto/brand/rico-v2/accueille.png';

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

const Jalon = ({ icone: Icone, children }) => (
  <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-300 font-inter
                   rounded-lg border border-white/[0.09] bg-white/[0.02] px-2.5 py-1.5
                   shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
    <Icone className="w-3.5 h-3.5 text-[#3AFFA3] flex-shrink-0" />{children}
  </span>
);

export default function PopupRdv() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
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

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rdv-titre" data-testid="popup-rdv"
      onClick={fermer}
      className={`fixed inset-0 z-[90] grid place-items-center p-4 bg-[#020617]/70 backdrop-blur-sm
                  transition-opacity duration-200 ease-out motion-reduce:transition-none
                  ${sortie ? 'opacity-0' : 'opacity-100 animate-fondu'}`}>
      <div onClick={(e) => e.stopPropagation()}
        className={`relative flex flex-col sm:flex-row overflow-hidden w-[min(660px,100%)]
                    rounded-[20px] border border-white/[0.09] bg-[#0f172a]
                    shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_20px_rgba(0,0,0,0.5),0_34px_68px_-14px_rgba(0,0,0,0.8)]
                    transition-[opacity,transform] ease-out-strong motion-reduce:transition-none
                    ${sortie ? 'opacity-0 scale-[0.97] [transition-duration:160ms]'
                             : 'opacity-100 scale-100 [transition-duration:260ms] animate-monter'}`}>

        <button onClick={fermer} aria-label={t('rdv.fermer')} data-testid="popup-rdv-fermer"
          className="absolute top-3 right-3 z-10 w-[30px] h-[30px] grid place-items-center rounded-[9px]
                     bg-white/[0.04] text-slate-500 hover:text-white hover:bg-white/[0.1] active:scale-90
                     transition-[color,background-color,transform] duration-150 ease-out-strong">
          <X className="w-3.5 h-3.5" />
        </button>

        {/* La colonne visuelle. Un halo, pas une image posée : la mascotte doit
            avoir l'air d'être dans un lieu, même abstrait. */}
        <div className="relative flex-shrink-0 h-[176px] sm:h-auto sm:w-[244px] overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at 50% 108%, rgba(91,108,255,.42), transparent 66%), linear-gradient(165deg,#141a33,#0b1024)' }}>
          <span className="absolute left-1/2 -top-12 w-[210px] h-[300px] -translate-x-1/2 blur-[12px]"
            style={{ background: 'conic-gradient(from 180deg at 50% 0%, transparent 42%, rgba(138,108,255,.34) 50%, transparent 58%)' }} />
          <span className="absolute inset-0 opacity-50"
            style={{ background: 'radial-gradient(circle at 24% 30%, rgba(255,255,255,.05), transparent 42%)' }} />
          {/* Sans halo ni ombre de contact, un personnage détouré flotte. */}
          <span className="absolute left-1/2 -translate-x-1/2 bottom-[26px] sm:bottom-[44px]
                           w-[140px] h-[140px] sm:w-[168px] sm:h-[168px] rounded-full blur-[16px]"
            style={{ background: 'radial-gradient(circle, rgba(58,255,163,.20), transparent 64%)' }} />
          <span className="absolute left-1/2 -translate-x-1/2 bottom-[20px] sm:bottom-[34px]
                           w-[104px] sm:w-[132px] h-[13px] rounded-[50%] blur-[5px]"
            style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,.62), transparent 70%)' }} />
          {/* Rico déborde le bas du cadre : une silhouette qui touche le bord a
              l'air dessinée dedans, pas collée dessus. */}
          <img src={RICO} alt="" aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 -bottom-1 sm:bottom-3.5 h-[196px] sm:h-[262px]
                       drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)]" />
        </div>

        <div className="flex-1 min-w-0 p-6 sm:p-[30px] sm:pb-[26px]">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em]
                           text-[#3AFFA3] mb-2.5 font-inter">
            <span className="w-[5px] h-[5px] rounded-full bg-[#3AFFA3]" />{t('rdv.surTitre')}
          </span>
          <h2 id="rdv-titre" className="font-sora font-extrabold text-white text-[19px] sm:text-[22px]
                                        leading-[1.18] tracking-[-0.5px]">
            {t('rdv.titre')}
          </h2>
          <p className="text-[13.5px] text-slate-400 font-inter leading-[1.62] mt-2.5">{t('rdv.texte')}</p>

          {/* Masqués sur téléphone : trois étiquettes de plus feraient descendre
              le bouton sous la ligne de flottaison. */}
          <div className="hidden sm:flex flex-wrap gap-[7px] mt-4">
            <Jalon icone={Clock}>{t('rdv.jalon.duree')}</Jalon>
            <Jalon icone={Sparkles}>{t('rdv.jalon.axes')}</Jalon>
            <Jalon icone={ShieldCheck}>{t('rdv.jalon.compteRendu')}</Jalon>
          </div>

          <div className="flex items-center gap-3.5 mt-5">
            {/* Un lien, pas un bouton : c'est une navigation. Il herite au
                passage de l'ouverture en onglet neuf, et le clic droit ou le
                Ctrl+clic fonctionnent comme le visiteur s'y attend. */}
            <a ref={boutonRef} {...propsRdv()} onClick={() => { marquerVu(); setOuvert(false); }}
              data-testid="popup-rdv-ok"
              className="flex-1 sm:flex-none text-center rounded-[11px] px-5 py-2.5 font-inter font-semibold text-[13.5px]
                         text-white bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97]
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_5px_rgba(0,0,0,0.3),0_10px_24px_-7px_rgba(91,108,255,0.55)]
                         hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_3px_7px_rgba(0,0,0,0.32),0_14px_30px_-7px_rgba(91,108,255,0.65)]
                         transition-[transform,box-shadow,filter] duration-150 ease-out-strong hover:brightness-110">
              {t('rdv.cta')}
            </a>
            <button onClick={fermer}
              className="hidden sm:block text-[12.5px] text-slate-500 hover:text-slate-200 font-inter
                         transition-colors duration-150 ease-out-strong">
              {t('rdv.plusTard')}
            </button>
          </div>
          <p className="text-[11.5px] text-slate-600 font-inter mt-3.5">{t('rdv.rassurance')}</p>
        </div>
      </div>
    </div>
  );
}
