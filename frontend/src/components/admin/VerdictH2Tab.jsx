import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, MessageSquareWarning } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Cell } from 'recharts';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { adminService } from '../../services/adminService';

const SEUIL_ECHANTILLON = 20; // en dessous, on prévient que le verdict est encore fragile
const BAR_COLOR = '#8A6CFF';
const BAR_COLOR_FAIBLE = '#3AFFA3';

const tooltipStyle = { contentStyle: { background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#94a3b8' } };

export default function VerdictH2Tab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await adminService.getVerdictH2());
    } catch (e) {
      toast.error('Erreur de chargement du vérdict H2');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>;
  }
  if (!data) return null;

  const distribution = [1, 2, 3, 4, 5].map((n) => ({ note: `${n}`, n: data.distribution_note?.[String(n)] || 0 }));
  const echantillonFaible = data.n_note < SEUIL_ECHANTILLON;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-sora text-white">Vérdict H2 — ressemblance de voix</h2>
          <p className="text-sm text-slate-400 font-inter mt-1">
            « Ce contenu sonne-t-il comme vous ? » (déclaré) croisé avec le taux de réécriture (mesuré) à la validation.
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" size="sm" className="border-white/10 text-slate-300">
          {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}Actualiser
        </Button>
      </div>

      {echantillonFaible && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <MessageSquareWarning className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300/90 font-inter">
            Échantillon encore faible ({data.n_note} validation{data.n_note > 1 ? 's' : ''} avec note) — le verdict se précisera avec quelques semaines de collecte supplémentaires.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
          <p className="text-xs text-slate-400">Note de ressemblance moyenne</p>
          <p className="text-2xl font-bold text-white font-sora">{data.moyenne_note != null ? `${data.moyenne_note} / 5` : '—'}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{data.n_note} note{data.n_note > 1 ? 's' : ''} collectée{data.n_note > 1 ? 's' : ''}</p>
        </div>
        <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
          <p className="text-xs text-slate-400">Taux de réécriture moyen</p>
          <p className="text-2xl font-bold text-white font-sora">{data.moyenne_taux_reecriture != null ? `${Math.round(data.moyenne_taux_reecriture * 100)}%` : '—'}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{data.n_taux} contenu{data.n_taux > 1 ? 's' : ''} mesuré{data.n_taux > 1 ? 's' : ''} · 0% = validé tel quel</p>
        </div>
        <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
          <p className="text-xs text-slate-400">Contenus validés</p>
          <p className="text-2xl font-bold text-white font-sora">{data.n_valides}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">échantillon total de la période</p>
        </div>
        <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
          <p className="text-xs text-slate-400">Refusés</p>
          <p className="text-2xl font-bold text-white font-sora">{data.n_refuses}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{data.n_motifs} avec motif renseigné</p>
        </div>
      </div>

      {/* Distribution des notes */}
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white font-sora mb-1">Distribution des notes (1 à 5)</h3>
        <p className="text-[11px] text-slate-500 mb-3">1 = pas du tout · 5 = tout à fait</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="note" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
              <ChartTooltip {...tooltipStyle} formatter={(v) => [v, 'réponses']} labelFormatter={(l) => `Note ${l}`} />
              <Bar dataKey="n" radius={[6, 6, 0, 0]}>
                {distribution.map((d, i) => <Cell key={i} fill={Number(d.note) >= 4 ? BAR_COLOR_FAIBLE : BAR_COLOR} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Croisement note x taux de réécriture (le coeur du verdict H2) */}
      {data.croisement_note_taux?.length > 0 && (
        <div className="bg-slate-900/40 border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white font-sora mb-1">Taux de réécriture moyen, par note de ressemblance</h3>
          <p className="text-[11px] text-slate-500 mb-3">
            Si une note basse correspond à un taux de réécriture bas, le client valide vite sans que ça lui ressemble vraiment — le signal que la note seule révèle.
          </p>
          <div className="space-y-2">
            {data.croisement_note_taux.map((c) => (
              <div key={c.note} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-inter w-16 shrink-0">Note {c.note}</span>
                <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]" style={{ width: `${Math.min(100, c.taux_reecriture_moyen * 100)}%` }} />
                </div>
                <span className="text-xs text-slate-300 font-inter w-28 text-right">{Math.round(c.taux_reecriture_moyen * 100)}% · n={c.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Moyenne par réseau */}
      {data.moyenne_note_par_reseau?.length > 0 && (
        <div className="bg-slate-900/40 border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white font-sora mb-3">Note moyenne par réseau</h3>
          <div className="space-y-2">
            {data.moyenne_note_par_reseau.map((r) => (
              <div key={r.reseau} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-inter w-28 shrink-0">{r.reseau}</span>
                <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-[#3AFFA3]" style={{ width: `${(r.moyenne_note / 5) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-300 font-inter w-24 text-right">{r.moyenne_note}/5 · n={r.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Motifs de refus (qualitatif) */}
      {data.derniers_motifs_refus?.length > 0 && (
        <div className="bg-slate-900/40 border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white font-sora mb-3">Derniers motifs de refus</h3>
          <ul className="space-y-1.5">
            {data.derniers_motifs_refus.map((m, i) => (
              <li key={i} className="text-xs text-slate-400 font-inter border-l-2 border-white/10 pl-3">{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
