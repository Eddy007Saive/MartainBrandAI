import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, RotateCcw, ArrowRight } from 'lucide-react';
import { useDemarrage } from '../context/DemarrageContext';
import { useUser } from '../context/UserContext';
import BoutonDemo from './LecteurDemo';

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
  const suivante = etapes.find((e) => e.id === etat.courante) || etapes.find((e) => e.fait !== true);

  const reprendre = () => {
    try { sessionStorage.removeItem(`postorico_visite_plus_tard_${user?.telegram_id || 'anon'}`); } catch (e) { /* ignore */ }
    setVisiteForcee(true);
  };

  return (
    <div data-testid="accueil-premiers-pas"
      className="rounded-2xl border border-[#3AFFA3]/25 bg-[#0b1326] p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-white font-semibold font-sora">
            {t('demarrage.carte.titre')} <span className="text-[#3AFFA3]">· {faites}/{etapes.length}</span>
          </p>
          <p className="text-slate-300 text-sm font-inter">{t('demarrage.carte.sousN', { count: etapes.length })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        <BoutonDemo variante="carte" />
        <button type="button" onClick={reprendre} data-testid="accueil-reprendre-visite"
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-[13px] font-semibold text-slate-200 hover:text-white border border-white/10 hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70">
          <RotateCcw className="w-3.5 h-3.5" /> {t('demarrage.carte.reprendre')}
        </button>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={etapes.length} aria-valuenow={faites} aria-label={t('demarrage.carte.titre')}>
        <div className="h-full rounded-full bg-[#2fd393] transition-[width] duration-700"
          style={{ width: `${Math.round((faites / Math.max(1, etapes.length)) * 100)}%` }} />
      </div>
      {suivante && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[#8A6CFF]/40 bg-[#6f5cff]/10 p-4" data-testid="premiers-pas-suivante">
          <div className="min-w-0 flex-1 font-inter">
            <p className="text-[12.5px] text-[#c9c1ff] font-semibold">{t('demarrage.carte.prochaine')}</p>
            <p className="text-[15px] text-white font-semibold mt-0.5">{t(`demarrage.etapes.${suivante.id}.titre`)}</p>
            <p className="text-[13px] text-slate-300 mt-0.5">{t(`demarrage.etapes.${suivante.id}.texte`)}</p>
          </div>
          <Link to={LIENS[suivante.id] || '/dashboard'} className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-[#5a4ae8] hover:bg-[#6757f0] text-white text-[13.5px] font-semibold font-inter shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70">
            {t('demarrage.carte.commencer')} <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      )}
      <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {etapes.map((e, i) => {
          const fait = e.fait === true;
          const courante = etat.courante === e.id;
          return (
            <li key={e.id}>
              <Link to={LIENS[e.id] || '/dashboard'} data-testid={`premiers-pas-${e.id}`}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70 ${
                  fait ? 'border-white/[0.06] bg-white/[0.02] text-slate-400'
                    : courante ? 'border-[#8A6CFF]/60 bg-[#6f5cff]/15 text-white'
                      : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/20'}`}>
                <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${
                  fait ? 'bg-[#3AFFA3]/20 text-[#3AFFA3]' : 'bg-white/[0.06] text-slate-300'}`}>
                  {fait ? <Check className="w-3.5 h-3.5" aria-label={t('demarrage.carte.fait')} /> : i + 1}
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
