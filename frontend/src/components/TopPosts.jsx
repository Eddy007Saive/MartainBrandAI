import { useState, useEffect } from 'react';
import { Loader2, Eye, Heart, MessageCircle, Users, Trophy } from 'lucide-react';
import { SocialIcon } from './SocialIcon';
import { analyticsService } from '../services/analyticsService';

const NET_BG = {
  linkedin: '#0a66c2', instagram: 'linear-gradient(135deg,#feda75,#d62976,#962fbf)',
  facebook: '#1877f2', tiktok: '#111', youtube: '#ff0000',
};
const normPlat = (p) => (p || '').toString().toLowerCase().split('.').pop();
const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'k';
  return String(Math.round(n));
};

// Top des publications (par impressions) — mêmes données Late que la page Performance.
export default function TopPosts({ limit = 5 }) {
  const [posts, setPosts] = useState(null); // null = chargement

  useEffect(() => {
    analyticsService.insights(30)
      .then((d) => setPosts((d?.posts || []).filter((p) => (p.metrics?.impressions || 0) > 0).slice(0, limit)))
      .catch(() => setPosts([]));
  }, [limit]);

  if (posts === null) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-8 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#5B6CFF]" />
      </div>
    );
  }
  if (!posts.length) return null; // rien à montrer → on n'encombre pas l'Accueil

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
        <Trophy className="w-[18px] h-[18px] text-amber-400" />
        <h2 className="text-lg font-semibold font-sora text-white">Publications les plus performantes</h2>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {posts.map((p, i) => {
          const np = normPlat(p.platform);
          const m = p.metrics || {};
          const inner = (
            <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
              <span className="text-[13px] font-bold text-slate-600 w-4 text-center tabular-nums shrink-0">{i + 1}</span>
              <span className="w-9 h-9 rounded-lg grid place-items-center text-white shrink-0"
                style={{ background: NET_BG[np] || '#334155', backgroundImage: p.thumbnailUrl ? `url(${p.thumbnailUrl})` : undefined, backgroundSize: 'cover' }}>
                {!p.thumbnailUrl && <SocialIcon network={np} className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-slate-200 truncate">{(p.content || 'Publication').slice(0, 80)}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {np}{p.publishedAt ? ' · ' + new Date(p.publishedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-[12px] text-slate-400 shrink-0">
                <span title="Impressions — nombre de fois où le post a été affiché" className="flex items-center gap-1 cursor-help"><Eye className="w-3.5 h-3.5" />{fmt(m.impressions)}</span>
                <span title="Portée — nombre de comptes uniques qui ont vu le post" className="flex items-center gap-1 cursor-help"><Users className="w-3.5 h-3.5" />{fmt(m.reach)}</span>
                <span title="J'aime — nombre de likes" className="flex items-center gap-1 cursor-help"><Heart className="w-3.5 h-3.5" />{fmt(m.likes)}</span>
                <span title="Commentaires reçus" className="flex items-center gap-1 cursor-help"><MessageCircle className="w-3.5 h-3.5" />{fmt(m.comments)}</span>
              </div>
              <span title="Taux d'engagement = (j'aime + commentaires + partages) ÷ impressions"
                className="text-[13px] font-bold text-[#3AFFA3] w-12 text-right shrink-0 tabular-nums cursor-help">{(p.engagementRate || 0)}%</span>
            </div>
          );
          return p.url
            ? <a key={p.id || i} href={p.url} target="_blank" rel="noopener noreferrer" className="block">{inner}</a>
            : <div key={p.id || i}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
