import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Eye, Heart, MessageCircle, Share2, TrendingUp, Lock, Plug, BarChart3, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { SocialIcon } from '../components/SocialIcon';
import { analyticsService } from '../services/analyticsService';

const NETS = [
  { id: '', label: 'Tous' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
];
const NET_BG = {
  linkedin: '#0a66c2', instagram: 'linear-gradient(135deg,#feda75,#d62976,#962fbf)',
  facebook: '#1877f2', tiktok: '#111', youtube: '#ff0000',
};
const normPlat = (p) => (p || '').toString().toLowerCase().split('.').pop();
const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n);
};

export default function Performance() {
  const [days, setDays] = useState(30);
  const [platform, setPlatform] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const d = await analyticsService.insights(days, platform || undefined, refresh);
      setData(d);
    } catch (e) {
      setData({ ok: false, error: 'Erreur de chargement' });
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [days, platform]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sinceLabel = (iso) => {
    if (!iso) return null;
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60);
    return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
  };

  const kpis = data?.kpis || {};
  const posts = data?.posts || [];
  const KPI = [
    { k: 'impressions', label: 'Impressions', icon: Eye, color: '#8A6CFF', val: fmt(kpis.impressions) },
    { k: 'eng', label: 'Engagement', icon: TrendingUp, color: '#3AFFA3', val: (kpis.engagementRate || 0) + '%' },
    { k: 'likes', label: "J'aime", icon: Heart, color: '#f87171', val: fmt(kpis.likes) },
    { k: 'comments', label: 'Commentaires', icon: MessageCircle, color: '#60a5fa', val: fmt(kpis.comments) },
    { k: 'shares', label: 'Partages', icon: Share2, color: '#8A6CFF', val: fmt(kpis.shares) },
  ];

  return (
    <div className="w-full space-y-5 pb-10">
      <PageHeader icon={BarChart3} title="Performance des publications" subtitle="Likes, commentaires, partages et portée de tes posts" />

      {/* Filtres */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {NETS.map((n) => (
            <button key={n.id} onClick={() => setPlatform(n.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12.5px] font-medium transition-all ${platform === n.id ? 'text-white border-white/15 bg-white/[0.06]' : 'text-slate-400 border-white/[0.06] bg-white/[0.02] hover:text-white'}`}>
              {n.id && <span className="w-4 h-4 rounded grid place-items-center text-white" style={{ background: NET_BG[n.id] }}><SocialIcon network={n.label} className="w-2.5 h-2.5" /></span>}
              {n.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            {[[7, '7 j'], [30, '30 j'], [90, '90 j']].map(([d, l]) => (
              <button key={d} onClick={() => setDays(d)} className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all ${days === d ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'text-slate-400 hover:text-white'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => fetchData(true)} disabled={refreshing || loading} title="Synchroniser maintenant"
            className="w-9 h-9 grid place-items-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {data?.cached_at && !loading && (
        <p className="text-[11.5px] text-slate-500 -mt-2">Synchronisé {sinceLabel(data.cached_at)} · maj auto toutes les heures</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" /></div>
      ) : data?.addon_required ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-8 text-center max-w-lg mx-auto">
          <Lock className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold font-sora text-white">Analytics non activé</h3>
          <p className="text-sm text-slate-400 font-inter mt-2">Les statistiques détaillées (likes, partages, portée…) nécessitent l'add-on <b>Analytics</b> de ta plateforme de publication. Active-le pour voir tes performances.</p>
        </div>
      ) : data?.connected === false ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-8 text-center max-w-lg mx-auto">
          <Plug className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold font-sora text-white">Aucun réseau connecté</h3>
          <p className="text-sm text-slate-400 font-inter mt-2">Connecte un compte dans Paramètres pour suivre tes performances.</p>
          <Link to="/dashboard/parametres" className="inline-block mt-4 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm hover:bg-white/10">Aller aux Paramètres →</Link>
        </div>
      ) : !data?.ok ? (
        <div className="text-center py-16 text-slate-500 font-inter text-sm">{data?.error || 'Indisponible'}</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {KPI.map((m) => (
              <div key={m.k} className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-slate-400 font-inter">{m.label}</span>
                  <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: `${m.color}22` }}><m.icon className="w-4 h-4" style={{ color: m.color }} /></span>
                </div>
                <div className="text-2xl font-bold font-sora mt-2">{m.val}</div>
              </div>
            ))}
          </div>

          {/* Top posts */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06]"><h3 className="font-semibold font-sora text-[15px]">Publications</h3></div>
            {posts.length === 0 ? (
              <p className="text-center py-12 text-slate-500 font-inter text-sm">Aucune donnée sur la période (la synchro peut prendre un moment après publication).</p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {posts.map((p) => {
                  const np = normPlat(p.platform);
                  const m = p.metrics || {};
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02]">
                      <span className="w-9 h-9 rounded-lg grid place-items-center text-white shrink-0 relative" style={{ background: NET_BG[np] || '#334155', backgroundImage: p.thumbnailUrl ? `url(${p.thumbnailUrl})` : undefined, backgroundSize: 'cover' }}>
                        {!p.thumbnailUrl && <SocialIcon network={np} className="w-4 h-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-slate-200 truncate">{(p.content || 'Publication').slice(0, 70)}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{np} · {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}</div>
                      </div>
                      <div className="hidden sm:flex items-center gap-4 text-[12.5px] text-slate-400 shrink-0">
                        <span title="Impressions" className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{fmt(m.impressions)}</span>
                        <span title="J'aime" className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{fmt(m.likes)}</span>
                        <span title="Commentaires" className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{fmt(m.comments)}</span>
                        <span title="Partages" className="flex items-center gap-1"><Share2 className="w-3.5 h-3.5" />{fmt(m.shares)}</span>
                      </div>
                      <span className="text-[13px] font-bold text-[#3AFFA3] w-14 text-right shrink-0">{(p.engagementRate || 0)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
