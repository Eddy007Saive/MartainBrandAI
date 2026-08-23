import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Ban, CalendarClock, CreditCard, Loader2, ShieldCheck, X } from 'lucide-react';

import { billingService } from '../services/billingService';

/**
 * Le mur de paiement du parcours en libre-service.
 *
 * Il ne s'ouvre qu'au premier clic sur « générer ». C'est délibéré : quelqu'un
 * qui arrive s'inscrit sans carte, explore le studio, comprend ce que le
 * produit fait — et c'est seulement quand il demande un résultat qu'on lui
 * demande sa carte. Réclamer la carte à l'inscription, c'est faire payer avant
 * d'avoir montré.
 *
 * Il s'affiche sur un événement émis par l'intercepteur de `lib/api.js`, pas
 * par un appel depuis chaque page : les générations partent de neuf endroits
 * différents, et il en existera d'autres. Un seul point d'écoute évite d'avoir
 * à s'en souvenir à chaque nouvelle fonctionnalité.
 */
// « presente-cote » : la mascotte présente le bouton, comme sur la connexion.
const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_420,q_auto,f_auto/'
           + 'brand/rico-v4/presente-cote.png';

const Garantie = ({ icone: Icone, children }) => (
  <li className="flex items-start gap-2.5 text-[13.5px] text-slate-400 font-inter">
    <Icone className="w-4 h-4 mt-[3px] text-[#3AFFA3] shrink-0" />
    <span>{children}</span>
  </li>
);

export default function MurPaiement() {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const boutonRef = useRef(null);

  useEffect(() => {
    const surRefus = () => setOuvert(true);
    window.addEventListener('postorico:mur-paiement', surRefus);
    return () => window.removeEventListener('postorico:mur-paiement', surRefus);
  }, []);

  useEffect(() => {
    if (!ouvert) return undefined;
    boutonRef.current?.focus();
    const auClavier = (e) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('keydown', auClavier);
    return () => document.removeEventListener('keydown', auClavier);
  }, [ouvert]);

  if (!ouvert) return null;

  const demarrer = async () => {
    setEnvoi(true);
    try {
      // Redirige vers Stripe : la page se quitte, l'état de chargement reste
      // affiché jusque-là plutôt que de laisser croire à un clic sans effet.
      await billingService.checkout('pro', true);
    } catch (e) {
      setEnvoi(false);
      toast.error(e?.response?.data?.detail || t('quota.sansCarte.erreur'));
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="mur-titre" data-testid="mur-paiement"
      onClick={() => setOuvert(false)}
      className="fixed inset-0 z-[95] grid place-items-center p-4 bg-[#020617]/75 backdrop-blur-sm
                 animate-fondu motion-reduce:animate-none">
      <div onClick={(e) => e.stopPropagation()}
        className="relative w-[min(620px,100%)] overflow-hidden rounded-[20px]
                   border border-white/[0.09] bg-[#0f172a]
                   shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_20px_50px_-18px_rgba(0,0,0,.85)]
                   animate-monter [animation-duration:260ms] motion-reduce:animate-none">

        <span aria-hidden="true" className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 92% 112%, rgba(58,255,163,.13), transparent 55%),'
            + 'radial-gradient(ellipse at 74% 122%, rgba(91,108,255,.2), transparent 62%)',
          }} />

        <button onClick={() => setOuvert(false)} aria-label={t('mur.fermer')}
          data-testid="mur-fermer"
          className="absolute top-3.5 right-3.5 z-10 w-[30px] h-[30px] grid place-items-center rounded-[9px]
                     bg-white/[0.04] text-slate-500 hover:text-white hover:bg-white/[0.1] active:scale-90
                     transition-[color,background-color,transform] duration-150 ease-out-strong">
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="relative grid sm:grid-cols-[1fr_180px] gap-4 p-7 sm:p-8">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase
                             tracking-[0.11em] text-[#3AFFA3] font-inter">
              <span className="w-[5px] h-[5px] rounded-full bg-[#3AFFA3]" />
              {t('mur.surTitre')}
            </span>

            <h2 id="mur-titre" className="mt-3 font-sora text-[23px] sm:text-[27px] font-bold
                                          leading-[1.16] tracking-[-0.5px] text-white">
              {t('mur.titre')}
            </h2>
            <p className="mt-2.5 max-w-[46ch] text-[14px] leading-[1.62] text-slate-400 font-inter">
              {t('mur.texte')}
            </p>

            {/* Les trois garanties sont à côté du bouton, pas en petits
                caractères : c'est exactement là que se prend la décision. */}
            <ul className="mt-5 space-y-2.5">
              <Garantie icone={Ban}>{t('mur.g1')}</Garantie>
              <Garantie icone={CalendarClock}>{t('mur.g2')}</Garantie>
              <Garantie icone={ShieldCheck}>{t('mur.g3')}</Garantie>
            </ul>

            <button ref={boutonRef} onClick={demarrer} disabled={envoi}
              data-testid="mur-demarrer"
              className="mt-6 inline-flex items-center justify-center gap-2.5 h-12 px-6 rounded-[13px]
                         font-inter font-semibold text-[15px] text-white
                         bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97]
                         disabled:opacity-70 disabled:active:scale-100
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_5px_rgba(0,0,0,0.3),0_14px_30px_-9px_rgba(91,108,255,0.65)]
                         hover:brightness-110
                         transition-[transform,filter,box-shadow] duration-150 ease-out-strong">
              {envoi ? <Loader2 className="w-[18px] h-[18px] animate-spin" />
                     : <CreditCard className="w-[18px] h-[18px]" />}
              {t('mur.cta')}
            </button>

            <p className="mt-3 text-[12.5px] text-slate-600 font-inter">{t('mur.stripe')}</p>
          </div>

          <div className="relative hidden sm:block">
            <span aria-hidden="true"
              className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[190px] h-[170px]
                         rounded-full blur-[30px]
                         bg-[radial-gradient(circle,rgba(58,255,163,.2),transparent_66%)]" />
            <img src={RICO} alt="" aria-hidden="true"
              className="absolute inset-x-0 mx-auto bottom-0 h-[240px] w-auto object-contain
                         pointer-events-none drop-shadow-[0_16px_24px_rgba(0,0,0,.5)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
