import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, PauseCircle, Play } from 'lucide-react';

import { billingService } from '../services/billingService';
import { useAbonnement } from '../context/AbonnementContext';

/**
 * Le mur d'un compte en pause.
 *
 * La pause suspend la facturation ET l'accès — sinon elle serait un abonnement
 * gratuit et tout le monde la choisirait plutôt que de payer. Elle bloque donc
 * le tableau de bord entier, contrairement au mur de paiement qui ne ferme que
 * la génération.
 *
 * Ce n'est pas une sanction et l'écran ne doit pas en avoir l'air : c'est un
 * choix que la personne a fait elle-même, et la reprise tient en un bouton.
 * Rien n'a été supprimé, et le dire explicitement est la moitié du message.
 */
const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_420,q_auto,f_auto/'
           + 'brand/rico-v4/presente-calme.png';

export default function MurPause() {
  const { t } = useTranslation();
  const { usage, recharger } = useAbonnement();
  const [envoi, setEnvoi] = useState(false);

  const jusqua = usage?.subscription?.pause_jusqu_au;
  if (!jusqua) return null;

  const reprendre = async () => {
    setEnvoi(true);
    try {
      await billingService.reprendre();
      toast.success(t('pause.repriseOk'));
      await recharger();
    } catch (e) {
      setEnvoi(false);
      toast.error(e?.response?.data?.detail || t('pause.erreur'));
    }
  };

  return (
    <div data-testid="mur-pause"
      className="fixed inset-0 z-[97] grid place-items-center p-4 bg-[#020617]/92 backdrop-blur-sm">
      <div className="relative w-[min(560px,100%)] overflow-hidden rounded-[20px]
                      border border-white/[0.09] bg-[#0f172a] p-7 sm:p-8
                      shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_20px_50px_-18px_rgba(0,0,0,.85)]
                      animate-monter [animation-duration:260ms] motion-reduce:animate-none">

        <div className="grid sm:grid-cols-[1fr_150px] gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase
                             tracking-[0.11em] text-[#8A6CFF] font-inter">
              <PauseCircle className="w-3.5 h-3.5" />{t('pause.surTitre')}
            </span>

            <h2 className="mt-3 font-sora text-[23px] font-bold leading-[1.18] text-white">
              {t('pause.titre')}
            </h2>
            <p className="mt-2.5 text-[14.5px] leading-[1.62] text-slate-400 font-inter">
              {t('pause.texte', { date: new Date(jusqua).toLocaleDateString('fr-FR') })}
            </p>
            <p className="mt-2.5 text-[13.5px] leading-[1.6] text-slate-500 font-inter">
              {t('pause.conserve')}
            </p>

            <button onClick={reprendre} disabled={envoi} data-testid="reprendre-abonnement"
              className="mt-6 inline-flex items-center justify-center gap-2.5 h-12 px-6 rounded-[13px]
                         font-inter font-semibold text-[15px] text-white
                         bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97]
                         disabled:opacity-70 disabled:active:scale-100 hover:brightness-110
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_30px_-9px_rgba(91,108,255,0.65)]
                         transition-[transform,filter] duration-150 ease-out-strong">
              {envoi ? <Loader2 className="w-[18px] h-[18px] animate-spin" />
                     : <Play className="w-[18px] h-[18px]" />}
              {t('pause.cta')}
            </button>

            <p className="mt-3 text-[12.5px] text-slate-600 font-inter">{t('pause.note')}</p>
          </div>

          <div className="relative hidden sm:block">
            <span aria-hidden="true"
              className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[160px] h-[150px]
                         rounded-full blur-[28px]
                         bg-[radial-gradient(circle,rgba(138,108,255,.22),transparent_66%)]" />
            <img src={RICO} alt="" aria-hidden="true"
              className="absolute inset-x-0 mx-auto bottom-0 h-[215px] w-auto object-contain
                         pointer-events-none opacity-90 drop-shadow-[0_16px_24px_rgba(0,0,0,.5)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
