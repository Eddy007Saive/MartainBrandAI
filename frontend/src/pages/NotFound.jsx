import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LifeBuoy } from 'lucide-react';

import LienLangue from '../components/LienLangue';
import LangSwitcher from '../components/LangSwitcher';
import Hexagone from '../components/Hexagone';

/**
 * La page introuvable.
 *
 * Trois personnes y arrivent : celle qui a fait une faute de frappe, celle qui
 * suit un lien périmé, et le robot d'indexation. Les deux premières ont besoin
 * d'une sortie — d'où deux boutons plutôt qu'un message d'excuse. Le troisième
 * a besoin qu'on lui dise de ne pas garder l'adresse : une application d'une
 * seule page répond 200 même sur une adresse inconnue, donc sans la balise
 * `noindex` posée ci-dessous, Google indexerait chaque faute de frappe.
 *
 * Le décor est celui de l'affiche de connexion — hexagones, halo, mascotte
 * posée au sol. Une page d'erreur qui ressemble à un autre site donne
 * l'impression d'avoir quitté le nôtre, ce qui est exactement l'inverse du but.
 */
// « curieux » : Rico cherche entre ses pattes. C'est la seule pose de la
// planche v4 qui raconte « je ne trouve pas », et une mascotte qui joue la
// scène vaut mieux qu'un point d'exclamation.
const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_620,q_auto,f_auto/'
           + 'brand/rico-v4/curieux.png';

const HEXAGONES = [
  { cls: 'w-[300px] h-[334px] left-[5%] top-[9%] text-[#8A6CFF]/40', delai: '0s' },
  { cls: 'w-[148px] h-[166px] right-[9%] top-[17%] text-[#3AFFA3]/40', delai: '-2s' },
  { cls: 'w-[212px] h-[236px] left-[16%] bottom-[5%] text-[#3AFFA3]/25', delai: '-4s' },
  { cls: 'w-[118px] h-[132px] right-[22%] bottom-[11%] text-[#8A6CFF]/30', delai: '-1.5s' },
];

const FOND = 'radial-gradient(ellipse at 50% 118%, rgba(58,255,163,.13), transparent 55%),'
           + 'radial-gradient(ellipse at 50% 126%, rgba(91,108,255,.3), transparent 66%),'
           + 'radial-gradient(ellipse at 12% -10%, rgba(138,108,255,.14), transparent 52%)';

export default function NotFound() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  // La balise n'est posée que le temps de la visite : elle suivrait sinon le
  // visiteur sur la page où il rebondit, et lui ferait perdre son indexation.
  useEffect(() => {
    const balise = document.createElement('meta');
    balise.setAttribute('name', 'robots');
    balise.setAttribute('content', 'noindex, follow');
    document.head.appendChild(balise);

    const titreAvant = document.title;
    document.title = `${t('err404.onglet')} · Postorico`;
    return () => { balise.remove(); document.title = titreAvant; };
  }, [t]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020617]
                     grid place-items-center px-5 py-14 sm:py-16">
      <div aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: FOND }} />
      {HEXAGONES.map((h, i) => <Hexagone key={i} {...h} />)}

      <Link to="/" data-testid="err404-logo"
        className="absolute top-5 left-5 lg:top-7 lg:left-8 z-[4] flex items-center gap-2.5
                   active:scale-[0.98] transition-transform duration-150 ease-out-strong">
        <img src="/logo.png" alt="Postorico"
          className="w-[38px] h-[38px] object-contain drop-shadow-[0_6px_16px_rgba(91,108,255,.4)]" />
        <b className="hidden sm:block font-sora text-[19px] font-bold text-white">Postorico</b>
      </Link>
      <div className="absolute top-5 right-5 lg:top-7 lg:right-8 z-[4]"><LangSwitcher /></div>

      <div className="relative z-[3] w-full max-w-[1000px] grid items-center gap-10
                      lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-4">

        <div className="text-center lg:text-left">
          {/* Le nombre est décoratif : il est déjà dit en toutes lettres
              au-dessous, et un lecteur d'écran n'a rien à faire de « 404 ». */}
          <p aria-hidden="true"
            className="font-sora font-extrabold leading-[0.82] tracking-[-0.045em]
                       text-[104px] sm:text-[132px] bg-clip-text text-transparent
                       bg-[linear-gradient(96deg,#8A6CFF_0%,#7fd7d0_40%,#3AFFA3_84%)]
                       animate-monter [animation-duration:520ms]">
            404
          </p>

          <h1 className="mt-4 font-sora text-[27px] sm:text-[34px] font-bold leading-[1.12]
                         tracking-[-0.02em] text-white animate-monter [animation-delay:70ms]">
            {t('err404.titre1')}
            <span className="block text-slate-400">{t('err404.titre2')}</span>
          </h1>

          <p className="mt-[18px] mx-auto lg:mx-0 max-w-[46ch] text-[15px] leading-[1.62]
                        text-slate-500 font-inter animate-monter [animation-delay:130ms]">
            {t('err404.texte')}
          </p>

          {/* L'adresse demandée, en toutes lettres : dans neuf cas sur dix la
              faute de frappe saute aux yeux, et la personne se corrige seule. */}
          <p className="mt-3.5 text-[12.5px] font-mono text-slate-600 break-all
                        animate-monter [animation-delay:170ms]">
            {t('err404.adresse')} <span className="text-slate-500">{pathname}</span>
          </p>

          <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center
                          justify-center lg:justify-start gap-3
                          animate-monter [animation-delay:210ms]">
            <LienLangue to="/" data-testid="err404-accueil"
              className="inline-flex items-center justify-center gap-2 rounded-[12px] px-[22px] h-11
                         font-inter font-semibold text-[14px] text-white
                         bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97]
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_5px_rgba(0,0,0,0.3),0_12px_26px_-8px_rgba(91,108,255,0.6)]
                         hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_3px_7px_rgba(0,0,0,0.32),0_16px_32px_-8px_rgba(91,108,255,0.7)]
                         transition-[transform,box-shadow,filter] duration-150 ease-out-strong
                         hover:brightness-110">
              <ArrowLeft className="w-4 h-4" />{t('err404.accueil')}
            </LienLangue>

            <LienLangue to="/tarifs" data-testid="err404-tarifs"
              className="inline-flex items-center justify-center rounded-[12px] px-[22px] h-11
                         font-inter font-semibold text-[14px] text-slate-300
                         border border-white/[0.11] bg-white/[0.03] active:scale-[0.97]
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]
                         hover:text-white hover:border-[#8A6CFF]/40 hover:bg-white/[0.06]
                         transition-[transform,color,background-color,border-color]
                         duration-150 ease-out-strong">
              {t('err404.tarifs')}
            </LienLangue>
          </div>

          <p className="mt-5 text-[13px] font-inter animate-monter [animation-delay:250ms]">
            <LienLangue to="/faq" data-testid="err404-faq"
              className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-200
                         transition-colors duration-150 ease-out-strong">
              <LifeBuoy className="w-3.5 h-3.5" />{t('err404.aide')}
            </LienLangue>
          </p>
        </div>

        {/* Rico, posé au sol : sans halo ni ombre de contact, un personnage
            détouré flotte au milieu de rien. */}
        <figure className="relative order-first lg:order-none h-[210px] sm:h-[280px] lg:h-[360px]">
          <span aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 bottom-[6%] w-[300px] h-[270px]
                       rounded-full blur-[38px]
                       bg-[radial-gradient(circle,rgba(58,255,163,.22),transparent_66%)]" />
          <span aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 bottom-[4%] w-[210px] h-[22px]
                       rounded-[50%] blur-[10px]
                       bg-[radial-gradient(ellipse,rgba(0,0,0,.6),transparent_70%)]" />
          {/* Centré par `mx-auto` et non par `-translate-x-1/2` : l'animation
              d'entrée écrit `transform: translateY(...)`, ce qui effacerait le
              décalage horizontal — le coq partait alors sur la droite. */}
          <img src={RICO} alt="" aria-hidden="true"
            className="absolute inset-x-0 mx-auto bottom-[4%] h-full w-auto object-contain
                       pointer-events-none animate-monter [animation-duration:620ms]
                       [animation-delay:90ms] drop-shadow-[0_18px_26px_rgba(0,0,0,.55)]" />
        </figure>
      </div>
    </main>
  );
}
