import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { ArrowRight, ArrowUpRight, ArrowDownRight, Clock, Users, TrendingUp, Eye, FileText, Gauge, CalendarClock } from 'lucide-react';
import { SocialIcon } from '../SocialIcon';

import { analyticsService } from '../../services/analyticsService';

/* Briques du tableau de performance (onglet Performance) et du résumé de l'accueil.
   Toutes lisent la réponse de GET /analytics/insights ; un bloc dont la donnée manque
   (ancien cache, compte trop récent, réseau qui ne la fournit pas) ne s'affiche pas. */

export const NET_BG = {
  linkedin: '#0a66c2', instagram: 'linear-gradient(135deg,#feda75,#d62976,#962fbf)',
  facebook: '#1877f2', tiktok: '#111', youtube: '#ff0000', googlebusiness: '#4285f4',
};
const NET_NOM = { linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', googlebusiness: 'Google Business' };
export const normPlat = (p) => (p || '').toString().toLowerCase().split('.').pop();
export const nomReseau = (p) => NET_NOM[normPlat(p)] || p;

export const fmt = (n) => {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'k';
  return String(Math.round(n));
};
const pct = (n) => `${String(Math.round((Number(n) || 0) * 10) / 10).replace('.', ',')} %`;

/** Variation relative en %, ou null quand la période précédente est vide (division par 0). */
export const variation = (cur, prev) => {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (!p) return null;
  return Math.round(((c - p) / p) * 100);
};

export const Carte = ({ titre, icone: Icone, sous, droite, children, className = '' }) => (
  <div className={`rounded-2xl border border-white/[0.06] bg-[#0f172a] p-5 min-w-0 ${className}`}>
    {(titre || droite) && (
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-semibold font-sora text-[15px] text-white flex items-center gap-2">
            {Icone && <Icone className="w-4 h-4 text-[#8A6CFF] shrink-0" />}{titre}
          </h3>
          {sous && <p className="text-[12px] text-slate-500 font-inter mt-0.5">{sous}</p>}
        </div>
        {droite}
      </div>
    )}
    {children}
  </div>
);

export function VariationBadge({ valeur, inverse = false }) {
  const { t } = useTranslation();
  if (valeur === null || valeur === undefined) return null;
  const hausse = valeur >= 0;
  const bon = inverse ? !hausse : hausse;
  const Icone = hausse ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11.5px] font-semibold ${bon ? 'text-[#3AFFA3]' : 'text-rose-400'}`}
      title={t('perf.dash.vsPrecedente')}>
      <Icone className="w-3.5 h-3.5" />{hausse ? '+' : ''}{valeur} %
    </span>
  );
}

/** Les 5 chiffres clés, avec la variation par rapport à la période précédente. */
export function ChiffresCles({ data }) {
  const { t } = useTranslation();
  const cmp = data?.comparaison;
  const tot = cmp?.totals || data?.kpis || {};
  const prev = cmp?.previousTotals;
  const ab = data?.abonnes;
  const nbPosts = (data?.posts || []).length;
  const tuiles = [
    { k: 'eng', label: t('perf.kpiEngagement'), icon: TrendingUp, color: '#3AFFA3', val: pct(tot.engagementRate), v: prev ? variation(tot.engagementRate, prev.engagementRate) : null, tip: t('perf.tipEngagement') },
    { k: 'reach', label: t('perf.kpiReach'), icon: Users, color: '#E879F9', val: fmt(tot.reach), v: prev ? variation(tot.reach, prev.reach) : null, tip: t('perf.tipReach') },
    { k: 'impr', label: t('perf.kpiImpressions'), icon: Eye, color: '#8A6CFF', val: fmt(tot.impressions), v: prev ? variation(tot.impressions, prev.impressions) : null, tip: t('perf.tipImpressions') },
    ab && { k: 'abo', label: t('perf.dash.abonnes'), icon: Users, color: '#60a5fa', val: fmt(ab.current), sous: t('perf.dash.abonnesGagnes', { n: (ab.gained >= 0 ? '+' : '') + fmt(ab.gained) }), tip: t('perf.dash.tipAbonnes') },
    { k: 'posts', label: t('perf.dash.publications'), icon: FileText, color: '#F59E0B', val: String(nbPosts), tip: t('perf.dash.tipPublications') },
  ].filter(Boolean);
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 ${tuiles.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
      {tuiles.map((m) => (
        <div key={m.k} title={m.tip} className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-4 cursor-help min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] text-slate-400 font-inter truncate">{m.label}</span>
            <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0" style={{ background: `${m.color}22` }}><m.icon className="w-4 h-4" style={{ color: m.color }} /></span>
          </div>
          <div className="text-2xl font-bold font-sora mt-2 text-white">{m.val}</div>
          <div className="mt-1 min-h-[16px] text-[11.5px] text-slate-500">
            {m.sous ? <span className="text-[#3AFFA3] font-semibold">{m.sous}</span> : <VariationBadge valeur={m.v} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/* Série de la courbe : le tableau de bord Zernio donne une ligne PAR JOUR au niveau du
   compte (impressions, portée, vues, interactions). La série `daily` des posts, elle, ne
   contient que les jours où un post est sorti — une courbe d'un seul point. */
const SERIE = [
  { key: 'impressions', color: '#8A6CFF' },
  { key: 'reach', color: '#E879F9' },
  { key: 'views', color: '#34D399' },
  { key: 'engagement', color: '#F87171' },
];

/** Regroupe la série par semaine (lundi) au-delà de 30 jours : 90 points quotidiens
 * deviennent illisibles sur un téléphone. */
function parSemaine(series) {
  const map = new Map();
  for (const r of series) {
    const d = new Date(r.date);
    if (isNaN(d.getTime())) continue;
    const lundi = new Date(d);
    lundi.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = lundi.toISOString().slice(0, 10);
    const acc = map.get(k) || { date: k };
    for (const m of SERIE) acc[m.key] = (acc[m.key] || 0) + (r[m.key] || 0);
    map.set(k, acc);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Les volumes (impressions, portée, vues) écrasent les interactions sur une même échelle :
// deux axes, comme sur le tableau Zernio.
const GRANDS = ['impressions', 'reach', 'views'];

function InfoBulle({ active, payload, label, t, langue }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b1120]/95 backdrop-blur px-3 py-2.5 shadow-xl">
      <div className="text-[11px] text-slate-400 font-inter mb-1.5">{new Date(label).toLocaleDateString(langue, { day: 'numeric', month: 'short' })}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[12px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.stroke }} />
          <span className="text-slate-400">{t(`perf.dash.m.${p.dataKey}`)}</span>
          <span className="ml-auto pl-3 font-semibold text-white tabular-nums">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function CourbeEngagement({ data, days }) {
  const { t, i18n } = useTranslation();
  const series = useMemo(() => {
    const s = (data?.serie || [])
      .map((r) => Object.fromEntries([['date', r.date], ...SERIE.map((m) => [m.key, Number(r[m.key]) || 0])]))
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    return days > 30 ? parSemaine(s) : s;
  }, [data, days]);
  const totals = useMemo(() => Object.fromEntries(SERIE.map((m) => [m.key, series.reduce((a, r) => a + (r[m.key] || 0), 0)])), [series]);
  const dispo = SERIE.filter((m) => totals[m.key] > 0);
  const [actives, setActives] = useState(['impressions', 'engagement']);
  if (series.length < 2 || dispo.length === 0) return null;
  const visibles = dispo.filter((m) => actives.includes(m.key));
  const traces = visibles.length ? visibles : dispo.slice(0, 1);
  const toggle = (k) => setActives((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const fmtX = (s) => new Date(s).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' });
  const aGauche = traces.some((m) => !GRANDS.includes(m.key));
  const aDroite = traces.some((m) => GRANDS.includes(m.key));
  return (
    <Carte titre={t('perf.dash.courbeTitre')} icone={TrendingUp} sous={days > 30 ? t('perf.dash.parSemaine') : t('perf.dash.parJour')}>
      <div className="flex flex-wrap gap-2 mb-4">
        {dispo.map((m) => {
          const on = traces.includes(m);
          return (
            <button key={m.key} onClick={() => toggle(m.key)} data-testid={`perf-courbe-${m.key}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[12px] transition-all ${on ? 'border-white/15 bg-white/[0.06] text-white' : 'border-white/[0.06] text-slate-500 hover:text-slate-300'}`}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? m.color : 'transparent', border: `2px solid ${m.color}` }} />
              {t(`perf.dash.m.${m.key}`)}
              <b className="tabular-nums">{fmt(totals[m.key])}</b>
            </button>
          );
        })}
      </div>
      <div className="h-[240px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtX} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis yAxisId="petit" hide={!aGauche} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} tickFormatter={fmt} />
            <YAxis yAxisId="grand" orientation="right" hide={!aDroite} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={38} allowDecimals={false} tickFormatter={fmt} />
            <Tooltip content={<InfoBulle t={t} langue={i18n.language} />} />
            {traces.map((m) => (
              <Line key={m.key} yAxisId={GRANDS.includes(m.key) ? 'grand' : 'petit'} type="monotone" dataKey={m.key}
                stroke={m.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Carte>
  );
}

/** Noms courts des jours dans la langue de l'interface, lundi en premier. */
function joursCourts(langue) {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 5 + i, 12)).toLocaleDateString(langue, { weekday: 'short', timeZone: 'UTC' }).replace('.', ''));
}

export function CarteCreneaux({ data }) {
  const { t, i18n } = useTranslation();
  const creneaux = data?.creneaux || [];
  if (!creneaux.length) return null;
  const jours = joursCourts(i18n.language);
  const max = Math.max(...creneaux.map((c) => c.engagement), 0.0001);
  const grille = new Map(creneaux.map((c) => [`${c.jour}-${c.heure}`, c]));
  const top = creneaux.slice(0, 3);
  const heure = (h) => `${h} h`;
  return (
    <Carte titre={t('perf.dash.creneauxTitre')} icone={Clock} sous={t('perf.dash.creneauxSous')}>
      <div className="flex flex-wrap gap-2 mb-4">
        {top.map((c, i) => (
          <span key={`${c.jour}-${c.heure}`} className="px-2.5 py-1 rounded-lg text-[12px] font-semibold bg-[#3AFFA3]/10 text-[#3AFFA3] border border-[#3AFFA3]/20">
            {i + 1}. {jours[c.jour]} {heure(c.heure)}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[560px]">
          {jours.map((j, d) => (
            <div key={j} className="flex items-center gap-[3px] mb-[3px]">
              <span className="w-9 shrink-0 text-[11px] text-slate-500 capitalize">{j}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const c = grille.get(`${d}-${h}`);
                const force = c ? 0.18 + 0.82 * (c.engagement / max) : 0;
                return (
                  <span key={h} className="flex-1 h-5 rounded-[3px]"
                    style={{ background: c ? `rgba(58,255,163,${force.toFixed(2)})` : 'rgba(255,255,255,0.035)' }}
                    title={c ? t('perf.dash.creneauTip', { jour: j, heure: heure(h), eng: String(c.engagement).replace('.', ','), posts: c.posts }) : `${j} ${heure(h)}`} />
                );
              })}
            </div>
          ))}
          <div className="flex gap-[3px] pl-9 mt-1">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="flex-1 text-[10px] text-slate-600 text-center">{h % 3 === 0 ? h : ''}</span>
            ))}
          </div>
        </div>
      </div>
    </Carte>
  );
}

/** Une carte par compte : sur une même échelle, 62 abonnés Instagram disparaîtraient
 * à côté de 1 200 sur LinkedIn. */
export function AbonnesParCompte({ data }) {
  const { t, i18n } = useTranslation();
  const series = data?.abonnesSerie || [];
  if (!series.length) return null;
  return (
    <Carte titre={t('perf.dash.abonnesTitre')} icone={Users} sous={t('perf.dash.abonnesSous')}>
      <div className="grid sm:grid-cols-2 gap-3">
        {series.map((s) => {
          const np = normPlat(s.platform);
          return (
            <div key={`${np}-${s.username}`} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3.5 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-md grid place-items-center text-white shrink-0" style={{ background: NET_BG[np] || '#334155' }}><SocialIcon network={np} className="w-3.5 h-3.5" /></span>
                <span className="text-[12.5px] text-slate-300 truncate">{nomReseau(np)} · {s.username}</span>
              </div>
              <div className="flex items-end justify-between gap-2 mt-2">
                <span className="text-2xl font-bold font-sora text-white">{fmt(s.current)}</span>
                <span className={`text-[12px] font-semibold ${s.gained >= 0 ? 'text-[#3AFFA3]' : 'text-rose-400'}`}>{s.gained >= 0 ? '+' : ''}{fmt(s.gained)}</span>
              </div>
              <div className="h-[56px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={s.points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id={`abo-${np}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8A6CFF" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#8A6CFF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <XAxis dataKey="date" hide />
                    <Tooltip cursor={false} content={({ active, payload }) => (active && payload?.length ? (
                      <div className="rounded-lg border border-white/10 bg-[#0b1120]/95 px-2.5 py-1.5 text-[11.5px] text-white">
                        {new Date(payload[0].payload.date).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} · <b>{fmt(payload[0].value)}</b>
                      </div>
                    ) : null)} />
                    <Area type="monotone" dataKey="followers" stroke="#8A6CFF" strokeWidth={2} fill={`url(#abo-${np})`} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </Carte>
  );
}

export function DetailReseaux({ data }) {
  const { t } = useTranslation();
  const lignes = useMemo(() => {
    const map = new Map();
    for (const p of data?.posts || []) {
      const np = normPlat(p.platform);
      const m = p.metrics || {};
      const acc = map.get(np) || { np, posts: 0, likes: 0, comments: 0, shares: 0, saves: 0, impressions: 0, reach: 0 };
      acc.posts += 1;
      for (const k of ['likes', 'comments', 'shares', 'saves', 'impressions', 'reach']) acc[k] += Number(m[k]) || 0;
      map.set(np, acc);
    }
    return [...map.values()]
      .map((l) => ({ ...l, er: l.impressions ? ((l.likes + l.comments + l.shares + l.saves) / l.impressions) * 100 : 0 }))
      .sort((a, b) => b.impressions - a.impressions);
  }, [data]);
  if (!lignes.length) return null;
  const cols = [
    ['posts', t('perf.dash.publications')], ['likes', t('perf.kpiLikes')], ['comments', t('perf.kpiComments')],
    ['shares', t('perf.kpiShares')], ['impressions', t('perf.kpiImpressions')], ['reach', t('perf.kpiReach')],
  ];
  return (
    <Carte titre={t('perf.dash.reseauxTitre')} icone={Gauge}>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="font-medium pb-2 pr-3">{t('perf.dash.reseau')}</th>
              {cols.map(([k, l]) => <th key={k} className="font-medium pb-2 px-2 text-right">{l}</th>)}
              <th className="font-medium pb-2 pl-2 text-right" title={t('perf.tipEngagement')}>{t('perf.dash.tauxCourt')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {lignes.map((l) => (
              <tr key={l.np} className="text-slate-300">
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded grid place-items-center text-white shrink-0" style={{ background: NET_BG[l.np] || '#334155' }}><SocialIcon network={l.np} className="w-3 h-3" /></span>
                    {nomReseau(l.np)}
                  </span>
                </td>
                {cols.map(([k]) => <td key={k} className="py-2.5 px-2 text-right tabular-nums">{fmt(l[k])}</td>)}
                <td className="py-2.5 pl-2 text-right font-semibold text-[#3AFFA3] tabular-nums">{pct(l.er)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Carte>
  );
}

/** Cadence conseillée : la cadence au meilleur taux d'engagement, parmi celles observées
 * au moins deux semaines (une seule semaine ne prouve rien). */
export function FrequenceConseillee({ data }) {
  const { t } = useTranslation();
  const parReseau = useMemo(() => {
    const map = new Map();
    for (const f of data?.frequence || []) {
      const np = normPlat(f.platform);
      map.set(np, [...(map.get(np) || []), f]);
    }
    return [...map.entries()].map(([np, liste]) => {
      liste.sort((a, b) => a.postsParSemaine - b.postsParSemaine);
      const fiables = liste.filter((f) => f.semaines >= 2);
      const meilleur = (fiables.length ? fiables : liste).reduce((a, b) => (b.tauxEngagement > a.tauxEngagement ? b : a));
      return { np, liste, meilleur, max: Math.max(...liste.map((f) => f.tauxEngagement), 0.0001) };
    });
  }, [data]);
  if (!parReseau.length) return null;
  return (
    <Carte titre={t('perf.dash.frequenceTitre')} icone={CalendarClock} sous={t('perf.dash.frequenceSous')}>
      <div className="grid sm:grid-cols-2 gap-3">
        {parReseau.map(({ np, liste, meilleur, max }) => (
          <div key={np} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md grid place-items-center text-white shrink-0" style={{ background: NET_BG[np] || '#334155' }}><SocialIcon network={np} className="w-3.5 h-3.5" /></span>
              <span className="text-[13px] text-white font-semibold">{nomReseau(np)}</span>
            </div>
            <p className="text-[12.5px] text-slate-300 mt-2">
              {t('perf.dash.frequenceConseil', { count: meilleur.postsParSemaine, taux: pct(meilleur.tauxEngagement) })}
            </p>
            <div className="mt-3 space-y-1.5">
              {liste.map((f) => (
                <div key={f.postsParSemaine} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-16 shrink-0 text-slate-500">{t('perf.dash.parSem', { count: f.postsParSemaine })}</span>
                  <span className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${(f.tauxEngagement / max) * 100}%`, background: f === meilleur ? '#3AFFA3' : '#8A6CFF' }} />
                  </span>
                  <span className="w-12 text-right tabular-nums text-slate-400">{pct(f.tauxEngagement)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Carte>
  );
}

/** Bandeau de l'accueil : 4 chiffres sur 30 jours + accès à l'onglet Performance.
 * Lit le cache des insights (aucun appel Zernio en direct). Sans réseau connecté ou sans
 * add-on, affiche `repli` (les anciennes cartes de l'accueil). */
export function ResumePerformance({ repli = null }) {
  const { t } = useTranslation();
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let vivant = true;
    analyticsService.insights(30).then((d) => vivant && setData(d)).catch(() => vivant && setData(null));
    return () => { vivant = false; };
  }, []);
  if (data === undefined) return null;
  if (!data?.ok || !data?.connected || data?.addon_required) return repli;
  const cmp = data.comparaison;
  const tot = cmp?.totals || data.kpis || {};
  const prev = cmp?.previousTotals;
  const ab = data.abonnes;
  const tuiles = [
    { k: 'eng', label: t('perf.kpiEngagement'), val: pct(tot.engagementRate), v: prev ? variation(tot.engagementRate, prev.engagementRate) : null },
    { k: 'reach', label: t('perf.kpiReach'), val: fmt(tot.reach), v: prev ? variation(tot.reach, prev.reach) : null },
    ab ? { k: 'abo', label: t('perf.dash.abonnes'), val: fmt(ab.current), sous: t('perf.dash.abonnesGagnes', { n: (ab.gained >= 0 ? '+' : '') + fmt(ab.gained) }) }
      : { k: 'impr', label: t('perf.kpiImpressions'), val: fmt(tot.impressions), v: prev ? variation(tot.impressions, prev.impressions) : null },
    { k: 'posts', label: t('perf.dash.publications'), val: String((data.posts || []).length) },
  ];
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-5" data-testid="accueil-resume-performance">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold font-sora text-white">{t('perf.dash.resumeTitre')}</h2>
          <p className="text-[12.5px] text-slate-500 font-inter">{t('perf.dash.resumeSous')}</p>
        </div>
        <Link to="/dashboard/performance" className="flex items-center gap-1.5 text-[#8A6CFF] text-sm font-medium font-inter hover:gap-2.5 transition-all shrink-0">
          <span className="hidden sm:inline">{t('perf.dash.voirTout')}</span> <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tuiles.map((m) => (
          <div key={m.k} className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3.5 min-w-0">
            <div className="text-[12px] text-slate-400 font-inter truncate">{m.label}</div>
            <div className="text-2xl font-bold font-sora text-white mt-1">{m.val}</div>
            <div className="min-h-[16px] text-[11.5px]">
              {m.sous ? <span className="text-[#3AFFA3] font-semibold">{m.sous}</span> : <VariationBadge valeur={m.v} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
