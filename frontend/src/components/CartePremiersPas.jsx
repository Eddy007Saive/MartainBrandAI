import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, RotateCcw } from 'lucide-react';
import { useDemarrage } from '../context/DemarrageContext';
import { useUser } from '../context/UserContext';

const LIENS = {
  profil: '/dashboard/parametres?s=marque',
  reseau: '/dashboard/parametres?s=connections',
  carte: '/dashboard/parametres?s=abonnement',
  sujets: '/dashboard/studio',
  post: '/dashboard/studio',
  validation: '/dashboard/contenus',
};

/**
 * Carte « Premiers pas · k/6 » de l'Accueil : la même liste d'étapes que la visite
 * guidée, calculée depuis les données. Disparaît quand tout est fait.
 */
export default function CartePremiersPas() {
  const { t } = useTranslation();
  const { etat, setVisiteForcee } = useDemarrage();
  const { user } = useUser();
  if (!etat || etat.termine) return null;
  const etapes = etat.etapes || [];
  const faites = etapes.filter((e) => e.fait === true).length;

  const reprendre = () => {
    try { sessionStorage.removeItem(`postorico_visite_plus_tard_${user?.telegram_id || 'anon'}`); } catch (e) { /* ignore */ }
    setVisiteForcee(true);
  };

  return (
    <div data-testid="accueil-premiers-pas"
      className="rounded-2xl border border-[#3AFFA3]/25 bg-gradient-to-br from-[#3AFFA3]/[0.07] to-[#5B6CFF]/[0.05] p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-white font-semibold font-sora">
            {t('demarrage.carte.titre')} <span className="text-[#3AFFA3]">· {faites}/{etapes.length}</span>
          </p>
          <p className="text-slate-400 text-sm font-inter">{t('demarrage.carte.sous')}</p>
        </div>
        <button type="button" onClick={reprendre} data-testid="accueil-reprendre-visite"
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-[13px] font-semibold text-white bg-white/[0.06] border border-white/10 hover:border-white/25">
          <RotateCcw className="w-3.5 h-3.5" /> {t('demarrage.carte.reprendre')}
        </button>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-[#3AFFA3] to-[#5B6CFF] transition-all duration-700"
          style={{ width: `${Math.round((faites / Math.max(1, etapes.length)) * 100)}%` }} />
      </div>
      <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {etapes.map((e, i) => {
          const fait = e.fait === true;
          const courante = etat.courante === e.id;
          return (
            <li key={e.id}>
              <Link to={LIENS[e.id] || '/dashboard'} data-testid={`premiers-pas-${e.id}`}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  fait ? 'border-white/[0.06] bg-white/[0.02] text-slate-500'
                    : courante ? 'border-[#5B6CFF]/50 bg-[#5B6CFF]/10 text-white'
                      : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/20'}`}>
                <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${
                  fait ? 'bg-[#3AFFA3]/20 text-[#3AFFA3]' : 'bg-white/[0.06] text-slate-300'}`}>
                  {fait ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span className={`text-[13px] font-inter flex-1 ${fait ? 'line-through' : ''}`}>
                  {t(`demarrage.etapes.${e.id}.titre`)}
                </span>
                {!fait && <ChevronRight className="w-4 h-4 opacity-60" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
