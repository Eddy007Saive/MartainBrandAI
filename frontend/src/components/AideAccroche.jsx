import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Lightbulb, Loader2, Wand2 } from 'lucide-react';
import { conseilsAccroche, apercuInstagram, premiereLigne } from '@/lib/accroche';
import { agentService } from '@/services/agentService';

/**
 * Aide sous un post du Studio : ce qui peut renforcer la première ligne (calcul local, gratuit),
 * un chiffre absent des infos du client (signalé par le backend), et pour Instagram la légende
 * telle que le fil l'affiche avant « … plus ».
 *
 * Avec `onUtiliser` : six autres accroches proposées par l'IA (une par formule), à mettre en
 * première ligne d'un clic. `propositions` / `onPropositions` les gardent d'un onglet à l'autre.
 */
export default function AideAccroche({ texte, reseau, chiffresNonSources = [], propositions = null, onPropositions, onUtiliser }) {
  const { t } = useTranslation();
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  if (!(texte || '').trim()) return null;
  const actuelle = premiereLigne(texte);
  const proposer = async () => {
    setChargement(true);
    setErreur('');
    try {
      const d = await agentService.accroches(texte, reseau);
      const liste = d.accroches || [];
      onPropositions?.(liste);
      if (!liste.length) setErreur(t('accroche.aucune'));
    } catch (e) {
      setErreur(e?.response?.data?.detail || t('accroche.erreur'));
    } finally {
      setChargement(false);
    }
  };
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
      {onUtiliser && (
        <section className="mt-2 border-t border-white/[0.07] pt-3" aria-labelledby="accroches-titre">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="accroches-titre" className="text-[13px] font-semibold text-slate-100">{t('accroche.autresTitre')}</h3>
            <button type="button" onClick={proposer} disabled={chargement} data-testid="accroches-proposer"
              className="ml-auto inline-flex items-center gap-1.5 rounded-[9px] border border-white/15 px-3 py-1.5 text-[12.5px] text-slate-100 hover:bg-white/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70">
              {chargement ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />}
              {propositions?.length ? t('accroche.reproposer') : t('accroche.proposer')}
            </button>
          </div>
          {!propositions?.length && !chargement && <p className="mt-1.5 text-[12.5px] text-slate-400">{t('accroche.autresAide')}</p>}
          {erreur && <p role="alert" className="mt-2 text-[12.5px] text-red-300">{erreur}</p>}
          {propositions?.length > 0 && (
            <ul className="mt-2.5 grid gap-2" aria-busy={chargement}>
              {propositions.map((a) => {
                const enPlace = a.texte === actuelle;
                return (
                  <li key={a.formule + a.texte} className={`rounded-xl border px-3 py-2.5 ${enPlace ? 'border-[#3AFFA3]/40 bg-[#3AFFA3]/[0.05]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">{a.nom}</p>
                    <div className="mt-1 flex items-start gap-3">
                      <p className="flex-1 min-w-0 text-[13.5px] leading-snug text-slate-100">{a.texte}</p>
                      {enPlace ? (
                        <span className="flex-none inline-flex items-center gap-1 text-[12px] text-[#7ff5c4]"><Check className="w-3.5 h-3.5" aria-hidden="true" />{t('accroche.enPlace')}</span>
                      ) : (
                        <button type="button" onClick={() => onUtiliser(a.texte)} data-testid={`accroches-utiliser-${a.formule}`}
                          aria-label={`${t('accroche.utiliser')} : ${a.texte}`}
                          className="flex-none rounded-[8px] bg-[#5a4ae8] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#6757f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70">
                          {t('accroche.utiliser')}
                        </button>
                      )}
                    </div>
                    {a.chiffres_non_sources?.length > 0 && (
                      <p className="mt-1.5 inline-flex items-start gap-1.5 text-[12px] text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
                        {t('accroche.chiffre', { chiffres: a.chiffres_non_sources.join(', ') })}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
