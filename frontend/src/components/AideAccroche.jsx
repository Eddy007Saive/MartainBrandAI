import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Lightbulb } from 'lucide-react';
import { conseilsAccroche, apercuInstagram } from '@/lib/accroche';

/**
 * Aide sous un post du Studio : ce qui peut renforcer la première ligne (calcul local, gratuit),
 * un chiffre absent des infos du client (signalé par le backend), et pour Instagram la légende
 * telle que le fil l'affiche avant « … plus ».
 */
export default function AideAccroche({ texte, reseau, chiffresNonSources = [] }) {
  const { t } = useTranslation();
  if (!(texte || '').trim()) return null;
  const conseils = conseilsAccroche(texte);
  const apercu = reseau === 'instagram' ? apercuInstagram(texte) : null;
  const chiffres = (chiffresNonSources || []).filter(Boolean);

  return (
    <div className="grid gap-2 text-xs font-inter" data-testid="aide-accroche">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-slate-500">{t('accroche.titre')}</span>
        {conseils.length === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300">
            <Check className="w-3 h-3" />{t('accroche.ok')}
          </span>
        ) : conseils.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-300">
            <Lightbulb className="w-3 h-3" />{t(`accroche.conseil.${c}`)}
          </span>
        ))}
      </div>
      {chiffres.length > 0 && (
        <div className="inline-flex items-start gap-1.5 rounded-md bg-rose-500/10 px-2 py-1.5 text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>{t('accroche.chiffre', { chiffres: chiffres.join(', ') })}</span>
        </div>
      )}
      {apercu && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <p className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">{t('accroche.apercuInstagram')}</p>
          <p className="whitespace-pre-line text-slate-300">
            {apercu.visible}
            {apercu.coupe && <span className="text-slate-500"> {t('accroche.plus')}</span>}
          </p>
        </div>
      )}
    </div>
  );
}
