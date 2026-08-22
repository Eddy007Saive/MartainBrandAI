import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CreditCard, Loader2, ShieldCheck, CalendarClock, Ban } from 'lucide-react';

import { billingService } from '../services/billingService';

/**
 * L'écran qu'obtient un compte sans abonnement.
 *
 * Il remplace le contenu du tableau de bord — il ne s'ajoute pas à lui. Un
 * bandeau au-dessus d'une interface qui ne répond à rien laisse croire à une
 * panne ; un écran unique avec un seul bouton dit ce qu'il manque et comment
 * le régler.
 *
 * Les trois garanties sont affichées à côté du bouton, pas en petits
 * caractères : c'est exactement là que se prend la décision de donner sa carte.
 */
// « presente-cote » : la mascotte présente le bouton. C'est la même pose que
// sur la page de connexion — le geste doit désigner l'action, pas le vide.
const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_520,q_auto,f_auto/'
           + 'brand/rico-v4/presente-cote.png';

const Garantie = ({ icone: Icone, children }) => (
  <li className="flex items-start gap-2.5 text-[13.5px] text-slate-400 font-inter">
    <Icone className="w-4 h-4 mt-[3px] text-[#3AFFA3] shrink-0" />
    <span>{children}</span>
  </li>
);

export default function CarteActivation() {
  const { t } = useTranslation();
  const [envoi, setEnvoi] = useState(false);

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
    <div className="grid place-items-center min-h-[70vh] py-6" data-testid="carte-activation">
      <div className="relative w-full max-w-[880px] overflow-hidden rounded-[22px]
                      border border-white/[0.09] bg-[#0f172a]
                      shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_20px_50px_-20px_rgba(0,0,0,.8)]">
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 88% 110%, rgba(58,255,163,.13), transparent 55%),'
            + 'radial-gradient(ellipse at 70% 120%, rgba(91,108,255,.2), transparent 62%)',
          }} />

        <div className="relative grid md:grid-cols-[1fr_270px] gap-6 p-7 sm:p-9">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase
                             tracking-[0.11em] text-[#3AFFA3] font-inter">
              <span className="w-[5px] h-[5px] rounded-full bg-[#3AFFA3]" />
              {t('quota.sansCarte.surTitre')}
            </span>

            <h1 className="mt-3 font-sora text-[25px] sm:text-[30px] font-bold leading-[1.15]
                           tracking-[-0.5px] text-white">
              {t('quota.sansCarte.titre')}
            </h1>
            <p className="mt-3 max-w-[54ch] text-[14.5px] leading-[1.62] text-slate-400 font-inter">
              {t('quota.sansCarte.texte')}
            </p>

            <ul className="mt-5 space-y-2.5">
              <Garantie icone={Ban}>{t('quota.sansCarte.g1')}</Garantie>
              <Garantie icone={CalendarClock}>{t('quota.sansCarte.g2')}</Garantie>
              <Garantie icone={ShieldCheck}>{t('quota.sansCarte.g3')}</Garantie>
            </ul>

            <button onClick={demarrer} disabled={envoi} data-testid="ajouter-carte"
              className="mt-7 inline-flex items-center justify-center gap-2.5 h-12 px-6 rounded-[13px]
                         font-inter font-semibold text-[15px] text-white
                         bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97]
                         disabled:opacity-70 disabled:active:scale-100
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_5px_rgba(0,0,0,0.3),0_14px_30px_-9px_rgba(91,108,255,0.65)]
                         hover:brightness-110
                         transition-[transform,filter,box-shadow] duration-150 ease-out-strong">
              {envoi ? <Loader2 className="w-[18px] h-[18px] animate-spin" />
                     : <CreditCard className="w-[18px] h-[18px]" />}
              {t('quota.sansCarte.cta')}
            </button>

            <p className="mt-3.5 text-[12.5px] text-slate-600 font-inter">
              {t('quota.sansCarte.stripe')}
            </p>
          </div>

          {/* Rico posé au sol, comme partout ailleurs : sans halo ni ombre de
              contact, une silhouette détourée flotte au milieu du cadre. */}
          <div className="relative hidden md:block min-h-[280px]">
            <span aria-hidden="true"
              className="absolute left-1/2 -translate-x-1/2 bottom-[8px] w-[240px] h-[220px]
                         rounded-full blur-[34px]
                         bg-[radial-gradient(circle,rgba(58,255,163,.2),transparent_66%)]" />
            <span aria-hidden="true"
              className="absolute left-1/2 -translate-x-1/2 bottom-[6px] w-[170px] h-[18px]
                         rounded-[50%] blur-[9px]
                         bg-[radial-gradient(ellipse,rgba(0,0,0,.6),transparent_70%)]" />
            <img src={RICO} alt="" aria-hidden="true"
              className="absolute inset-x-0 mx-auto bottom-[6px] h-[300px] w-auto object-contain
                         pointer-events-none drop-shadow-[0_18px_26px_rgba(0,0,0,.55)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
