import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, ExternalLink, Loader2, Rocket, Pause, Play, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { publiciteService } from '../services/publiciteService';

const PERIODES = [7, 30, 90];
const STATUTS = {
  active: 'border-[#3AFFA3]/30 text-[#3AFFA3] bg-[#3AFFA3]/10',
  validation: 'border-sky-400/30 text-sky-300 bg-sky-400/10',
  pause: 'border-slate-500/40 text-slate-300 bg-slate-500/10',
  refusee: 'border-red-400/40 text-red-300 bg-red-400/10',
  erreur: 'border-red-400/40 text-red-300 bg-red-400/10',
  terminee: 'border-slate-600/40 text-slate-400 bg-slate-600/10',
};
const erreurDe = (e, defaut) => e?.response?.data?.message || e?.response?.data?.detail || defaut;
const ilYa = (jours) => { const d = new Date(); d.setDate(d.getDate() - jours); return d.toISOString().slice(0, 10); };

/** Suivre ses publicités Meta : statut, dépense, portée, clics ; pause et reprise. */
export default function PublicitePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState('');
  const [compte, setCompte] = useState('');
  const [periode, setPeriode] = useState(30);
  const [pubs, setPubs] = useState(null);
  const [action, setAction] = useState('');

  const nombre = (n, d = 0) => new Intl.NumberFormat(i18n.language || 'fr', { maximumFractionDigits: d }).format(n || 0);
  const cp = (etat?.comptes || []).find((c) => c.id === compte);
  const argent = (n) => new Intl.NumberFormat(i18n.language || 'fr', { style: 'currency', currency: cp?.devise || 'EUR', maximumFractionDigits: 2 }).format(n || 0);

  useEffect(() => {
    publiciteService.etat()
      .then((d) => { setEtat(d); const c = (d.comptes || []).find((x) => x.utilisable) || (d.comptes || [])[0]; if (c) setCompte(c.id); })
      .catch((e) => setErreur(erreurDe(e, t('publicite.erreur'))));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chargerPubs = () => {
    if (!compte) return;
    setPubs(null);
    publiciteService.pubs(compte, ilYa(periode - 1), ilYa(0))
      .then((d) => setPubs(d.pubs || []))
      .catch((e) => { setPubs([]); toast.error(erreurDe(e, t('publicite.erreur'))); });
  };
  useEffect(chargerPubs, [compte, periode]); // eslint-disable-line react-hooks/exhaustive-deps

  const basculer = async (p) => {
    setAction(p.id);
    try {
      const maj = await publiciteService.changerStatut(p.id, !p.allumee);
      setPubs((l) => l.map((x) => (x.id === p.id ? { ...x, ...maj, stats: x.stats } : x)));
      toast.success(p.allumee ? t('publicite.misEnPause') : t('publicite.relancee'));
    } catch (e) { toast.error(erreurDe(e, t('publicite.erreur'))); }
    setAction('');
  };

  const totaux = (pubs || []).reduce((s, p) => ({
    depense: s.depense + p.stats.depense, portee: s.portee + p.stats.portee, clics: s.clics + p.stats.clics, impressions: s.impressions + p.stats.impressions,
  }), { depense: 0, portee: 0, clics: 0, impressions: 0 });

  const bloquant = !etat ? null
    : !etat.page_connectee ? 'pageAbsente'
    : etat.reconnexion ? 'reconnexion'
    : !(etat.comptes || []).length ? 'sansCompte' : null;

  return (
    <div className="max-w-5xl mx-auto space-y-5" data-testid="publicite">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-11 h-11 rounded-xl bg-[#1877F2]/15 border border-[#1877F2]/30 grid place-items-center"><Rocket className="w-5 h-5 text-[#6fa8ff]" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold font-sora text-white">{t('publicite.titre')}</h1>
          <p className="text-sm text-slate-500 font-inter">{t('publicite.sousTitre')}</p>
        </div>
        {(etat?.comptes || []).length > 1 && (
          <select className="bg-[#0c111f] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-slate-200 font-inter" value={compte} onChange={(e) => setCompte(e.target.value)}>
            {etat.comptes.map((c) => <option key={c.id} value={c.id}>{c.nom || c.id}</option>)}
          </select>
        )}
      </div>

      {!etat && !erreur && <div className="py-16 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>}
      {erreur && <p className="text-sm text-red-400 font-inter">{erreur}</p>}

      {bloquant && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100 font-inter space-y-3">
          <p className="flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{t(`publicite.bloquant.${bloquant}`)}</p>
          {bloquant === 'sansCompte'
            ? <a href="https://adsmanager.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">{t('publicite.ouvrirMeta')}</a>
            : <button type="button" onClick={() => navigate('/dashboard/parametres?s=connections')} className="underline">{t('publicite.allerReseaux')}</button>}
        </div>
      )}

      {cp && cp.alertes.length > 0 && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4 space-y-1.5">
          {cp.alertes.map((a) => (
            <p key={a} className="text-[13px] text-amber-200 font-inter flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{t(`publicite.alertes.${a}`, { fuseau: cp.fuseau })}</p>
          ))}
          <a href="https://adsmanager.facebook.com/billing_hub/payment_settings" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-amber-100 underline font-inter">{t('publicite.ouvrirMeta')}<ExternalLink className="w-3 h-3" /></a>
        </div>
      )}

      {cp && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {PERIODES.map((p) => (
              <button key={p} type="button" onClick={() => setPeriode(p)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold font-inter border ${periode === p ? 'border-[#1877F2]/60 bg-[#1877F2]/15 text-white' : 'border-white/10 text-slate-400 hover:text-white'}`}>
                {t('publicite.joursN', { n: p })}
              </button>
            ))}
            <button type="button" onClick={chargerPubs} aria-label={t('publicite.actualiser')} className="ml-auto p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['depense', argent(totaux.depense)], ['portee', nombre(totaux.portee)], ['impressions', nombre(totaux.impressions)], ['clics', nombre(totaux.clics)]].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.06] bg-[#0f172a] p-4">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter">{t(`publicite.stats.${k}`)}</p>
                <p className="text-lg font-bold text-white font-sora tabular-nums mt-1">{v}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] overflow-hidden">
            {pubs === null && <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>}
            {pubs?.length === 0 && (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-slate-400 font-inter">{t('publicite.vide')}</p>
                <Button onClick={() => navigate('/dashboard/contenus')} className="bg-[#1877F2] hover:bg-[#1877F2]/90 text-white rounded-[11px] font-sora">{t('publicite.allerContenus')}</Button>
              </div>
            )}
            {pubs?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] font-inter">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
                      <th className="px-4 py-3 font-medium">{t('publicite.colonnes.pub')}</th>
                      <th className="px-3 py-3 font-medium">{t('publicite.colonnes.statut')}</th>
                      <th className="px-3 py-3 font-medium text-right">{t('publicite.stats.depense')}</th>
                      <th className="px-3 py-3 font-medium text-right">{t('publicite.stats.portee')}</th>
                      <th className="px-3 py-3 font-medium text-right">{t('publicite.stats.clics')}</th>
                      <th className="px-3 py-3 font-medium text-right">{t('publicite.colonnes.cpc')}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pubs.map((p) => (
                      <tr key={p.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-4 py-3 max-w-[260px]">
                          <p className="text-slate-200 truncate">{p.nom}</p>
                          <p className="text-[11px] text-slate-500">
                            {p.objectif ? t(`publicite.objectifs.${p.objectif}`, { defaultValue: p.objectif }) : ''}
                            {p.budget ? ` · ${argent(p.budget.montant)} ${p.budget.type === 'daily' ? t('publicite.parJourCourt') : t('publicite.auTotalCourt')}` : ''}
                            {p.externe ? ` · ${t('publicite.externe')}` : ''}
                          </p>
                          {p.motif_refus && <p className="text-[11px] text-red-300 mt-0.5">{p.motif_refus}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUTS[p.statut] || STATUTS.terminee}`}>
                            {t(`publicite.statuts.${p.statut}`, { defaultValue: p.statut })}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-200">{argent(p.stats.depense)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-300">{nombre(p.stats.portee)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-300">{nombre(p.stats.clics)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-300">{p.stats.clics ? argent(p.stats.cpc) : '–'}</td>
                        <td className="px-4 py-3 text-right">
                          {['active', 'pause', 'validation'].includes(p.statut) && (
                            <button type="button" onClick={() => basculer(p)} disabled={action === p.id} data-testid={`pub-basculer-${p.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/25 text-[12px] disabled:opacity-50">
                              {action === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : p.allumee ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              {p.allumee ? t('publicite.pause') : t('publicite.relancer')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[12px] text-slate-500 font-inter">{t('publicite.piedPage')}</p>
        </>
      )}
    </div>
  );
}
