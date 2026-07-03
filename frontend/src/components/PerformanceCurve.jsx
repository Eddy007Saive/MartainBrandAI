import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Loader2, Lock, Plug, RefreshCw, TrendingUp } from 'lucide-react';
import { analyticsService } from '../services/analyticsService';

// Métriques traçables — chacune sa couleur (style Google Search Console).
// `src` = variantes de clés possibles dans la série journalière de la plateforme.
const METRICS = [
  { key: 'impressions', label: 'Impressions', color: '#8A6CFF', src: ['impressions'] },
  { key: 'reach',       label: 'Portée',      color: '#E879F9', src: ['reach', 'portee', 'portée'] },
  { key: 'views',       label: 'Vues',        color: '#34D399', src: ['views', 'vues', 'videoViews', 'video_views'] },
  { key: 'likes',       label: "J'aime",      color: '#F87171', src: ['likes'] },
  { key: 'comments',    label: 'Commentaires', color: '#60A5FA', src: ['comments', 'commentaires'] },
  { key: 'shares',      label: 'Partages',    color: '#F59E0B', src: ['shares', 'partages'] },
];
const DEFAULT_ON = ['impressions', 'reach', 'likes', 'comments'];

const num = (v) => Number(v) || 0;
const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'k';
  return String(Math.round(n));
};
const fmtDate = (s) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s).slice(5);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

// Normalise la série journalière (formats de clés variables selon la plateforme).
function normalizeDaily(daily) {
  if (!Array.isArray(daily)) return [];
  return daily
    .map((d) => {
      const flat = { ...(d.metrics || {}), ...(d.analytics || {}), ...d };
      const date = d.date || d.day || d._id || d.label || d.timestamp || '';
      const row = { date };
      for (const m of METRICS) {
        let v = 0;
        for (const k of m.src) { if (flat[k] != null) { v = num(flat[k]); break; } }
        row[m.key] = v;
      }
      return row;
    })
    .filter((r) => r.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b1120]/95 backdrop-blur px-3 py-2.5 shadow-xl">
      <div className="text-[11px] text-slate-400 font-inter mb-1.5">{fmtDate(label)}</div>
      <div className="space-y-1">
        {payload.map((p) => {
          const m = METRICS.find((x) => x.key === p.dataKey);
          return (
            <div key={p.dataKey} className="flex items-center gap-2 text-[12px]">
              <span className="w-2 h-2 rounded-full" style={{ background: p.stroke }} />
              <span className="text-slate-400">{m?.label}</span>
              <span className="ml-auto font-semibold text-white tabular-nums">{fmt(p.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PerformanceCurve() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState(DEFAULT_ON);

  const fetchData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const d = await analyticsService.insights(days, undefined, refresh);
      setData(d);
    } catch {
      setData({ ok: false });
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const series = useMemo(() => normalizeDaily(data?.daily), [data]);
  const totals = useMemo(() => {
    const t = {};
    for (const m of METRICS) t[m.key] = series.reduce((a, r) => a + r[m.key], 0);
    return t;
  }, [series]);
  // On n'affiche que les métriques qui ont des données (ou celles activées par défaut).
  const shown = useMemo(
    () => METRICS.filter((m) => totals[m.key] > 0 || DEFAULT_ON.includes(m.key)),
    [totals]
  );
  // La 1ʳᵉ métrique active devient l'aire « héroïque » (dégradé) ; les autres restent en lignes.
  const activeShown = useMemo(() => shown.filter((m) => active.includes(m.key)), [shown, active]);
  const heroKey = activeShown[0]?.key;

  const toggle = (k) =>
    setActive((p) => (p.includes(k) ? (p.length > 1 ? p.filter((x) => x !== k) : p) : [...p, k]));

  const Header = (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
      <h2 className="text-lg font-semibold font-sora text-white flex items-center gap-2">
        <TrendingUp className="w-[18px] h-[18px] text-[#8A6CFF]" /> Évolution des performances
      </h2>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          {[[7, '7 j'], [30, '30 j'], [90, '90 j']].map(([d, l]) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all ${days === d ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'text-slate-400 hover:text-white'}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing || loading} title="Synchroniser"
          className="w-9 h-9 grid place-items-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-5">
      {Header}

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-[#5B6CFF]" /></div>
      ) : data?.addon_required ? (
        <div className="flex flex-col items-center text-center py-14 px-6">
          <Lock className="w-9 h-9 text-amber-400 mb-3" />
          <p className="text-white font-semibold font-sora">Analytics non activé</p>
          <p className="text-sm text-slate-400 font-inter mt-1.5 max-w-md">Les courbes détaillées (vues, j'aime, commentaires, impressions) nécessitent l'add-on <b>Analytics</b> de ta plateforme de publication.</p>
        </div>
      ) : data?.connected === false ? (
        <div className="flex flex-col items-center text-center py-14 px-6">
          <Plug className="w-9 h-9 text-slate-500 mb-3" />
          <p className="text-white font-semibold font-sora">Aucun réseau connecté</p>
          <p className="text-sm text-slate-400 font-inter mt-1.5">Connecte un compte pour suivre l'évolution de tes performances.</p>
          <Link to="/dashboard/parametres" className="inline-block mt-4 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm hover:bg-white/10">Aller aux Paramètres →</Link>
        </div>
      ) : series.length === 0 ? (
        <div className="flex flex-col items-center text-center py-14 px-6">
          <TrendingUp className="w-9 h-9 text-slate-600 mb-3" />
          <p className="text-white font-semibold font-sora">Pas encore de données</p>
          <p className="text-sm text-slate-400 font-inter mt-1.5">Tes courbes apparaîtront ici dès que tes publications auront des statistiques (la synchro peut prendre un moment).</p>
        </div>
      ) : (
        <>
          {/* Cartes-métriques cliquables (toggle des courbes) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-5">
            {shown.map((m) => {
              const on = active.includes(m.key);
              return (
                <button key={m.key} onClick={() => toggle(m.key)}
                  className={`text-left rounded-xl border px-3.5 py-3 transition-all ${on ? 'bg-white/[0.03]' : 'bg-transparent hover:bg-white/[0.02]'}`}
                  style={{ borderColor: on ? `${m.color}66` : 'rgba(255,255,255,0.06)', borderBottomWidth: on ? 3 : 1, borderBottomColor: on ? m.color : 'rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full transition-opacity" style={{ background: m.color, opacity: on ? 1 : 0.3 }} />
                    <span className={`text-[11.5px] font-inter ${on ? 'text-slate-300' : 'text-slate-500'}`}>{m.label}</span>
                  </div>
                  <div className={`text-xl font-bold font-sora mt-1 tabular-nums ${on ? 'text-white' : 'text-slate-500'}`}>{fmt(totals[m.key])}</div>
                </button>
              );
            })}
          </div>

          {/* Aire « héroïque » (1ʳᵉ métrique active) + lignes ; chaque métrique son échelle */}
          <div style={{ width: '100%', height: 264 }}>
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <defs>
                  {activeShown.map((m) => (
                    <linearGradient key={m.key} id={`sv-grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={m.color} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.09)" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false} tickLine={false} minTickGap={28} />
                {shown.map((m) => (
                  <YAxis key={m.key} yAxisId={m.key} hide domain={[0, 'dataMax']} />
                ))}
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(148,163,184,0.25)', strokeWidth: 1 }} />
                {activeShown.map((m) => (
                  m.key === heroKey ? (
                    <Area key={m.key} yAxisId={m.key} type="monotone" dataKey={m.key} stroke={m.color}
                      strokeWidth={2.4} fill={`url(#sv-grad-${m.key})`} fillOpacity={1}
                      dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive />
                  ) : (
                    <Line key={m.key} yAxisId={m.key} type="monotone" dataKey={m.key} stroke={m.color}
                      strokeWidth={1.7} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive />
                  )
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
