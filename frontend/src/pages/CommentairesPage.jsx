import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Loader2, Lock, Plug, Heart, EyeOff, Trash2, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { SocialIcon } from '../components/SocialIcon';
import { inboxService } from '../services/inboxService';

const NETS = [
  { id: '', label: 'Tous' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
];
const NET_BG = { linkedin: '#0a66c2', instagram: 'linear-gradient(135deg,#feda75,#d62976,#962fbf)', facebook: '#1877f2', tiktok: '#111', youtube: '#ff0000' };
const normPlat = (p) => (p || '').toString().toLowerCase().split('.').pop();
const since = (iso) => {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `il y a ${Math.max(1, Math.floor(d / 60))} min`;
  if (d < 86400) return `il y a ${Math.floor(d / 3600)} h`;
  return `il y a ${Math.floor(d / 86400)} j`;
};

function Thread({ post }) {
  const acc = post.accountId;
  const [comments, setComments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState(null); // comment id
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await inboxService.postComments(post.id, acc);
      setComments(d.comments || []);
    } catch (e) { setComments([]); }
    finally { setLoading(false); }
  }, [post.id, acc]);
  useEffect(() => { load(); }, [load]);

  const doReply = async (commentId) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await inboxService.reply(post.id, acc, text.trim(), commentId);
      toast.success('Réponse envoyée');
      setText(''); setReplyTo(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Échec de l'envoi"); }
    finally { setBusy(false); }
  };
  const act = async (kind, c) => {
    try {
      await inboxService.action(kind, post.id, c.id, acc);
      toast.success('Fait');
      setComments((prev) => prev.map((x) => x.id === c.id ? { ...x, isLiked: kind === 'like' ? true : kind === 'unlike' ? false : x.isLiked, isHidden: kind === 'hide' ? true : kind === 'unhide' ? false : x.isHidden } : (kind === 'delete' && x.id === c.id ? null : x)).filter(Boolean));
    } catch (e) { toast.error(e.response?.data?.detail || "Échec"); }
  };

  if (loading) return <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF] inline" /></div>;
  if (!comments?.length) return <p className="py-5 text-center text-slate-500 text-[12.5px] font-inter">Aucun commentaire récupéré.</p>;

  return (
    <div className="space-y-3 pt-1">
      {comments.map((c) => (
        <div key={c.id} className={`rounded-xl border border-white/[0.06] bg-[#0a1120] p-3.5 ${c.isHidden ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full grid place-items-center text-white text-sm font-semibold shrink-0 overflow-hidden bg-slate-700" style={c.from?.picture ? { backgroundImage: `url(${c.from.picture})`, backgroundSize: 'cover' } : {}}>
              {!c.from?.picture && (c.from?.name || '?').charAt(0).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-slate-200">{c.from?.name || 'Utilisateur'}</div>
              <div className="text-[11px] text-slate-500">{since(c.createdTime)}{c.isHidden ? ' · masqué' : ''}</div>
            </div>
          </div>
          <p className="text-[13.5px] text-slate-200 mt-2 leading-relaxed">{c.message}</p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {c.canReply !== false && <button onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setText(''); }} className="text-[12px] font-medium px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/[0.06]">Répondre</button>}
            {c.canLike !== false && <button onClick={() => act(c.isLiked ? 'unlike' : 'like', c)} className={`text-[12px] font-medium px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1.5 ${c.isLiked ? 'text-red-400 border-red-400/30 bg-red-500/10' : 'border-white/10 text-slate-300 hover:bg-white/[0.06]'}`}><Heart className="w-3.5 h-3.5" />{c.isLiked ? 'Aimé' : "J'aime"}{c.likeCount ? ` ${c.likeCount}` : ''}</button>}
            {c.canHide !== false && <button onClick={() => act(c.isHidden ? 'unhide' : 'hide', c)} className="text-[12px] font-medium px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/[0.06] inline-flex items-center gap-1.5"><EyeOff className="w-3.5 h-3.5" />{c.isHidden ? 'Afficher' : 'Masquer'}</button>}
            {c.canDelete && <button onClick={() => act('delete', c)} className="text-[12px] font-medium px-2.5 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:text-red-400 hover:bg-red-500/10 inline-flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Supprimer</button>}
          </div>
          {replyTo === c.id && (
            <div className="flex gap-2 mt-2.5">
              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Écris ta réponse…"
                className="flex-1 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] px-3 py-2 outline-none focus:border-[#5B6CFF]/50" />
              <button onClick={() => doReply(c.id)} disabled={busy || !text.trim()} className="px-3 rounded-lg bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white disabled:opacity-40">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CommentairesPage() {
  const [platform, setPlatform] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // post id ouvert

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await inboxService.list(platform || undefined)); }
    catch (e) { setData({ ok: false, error: 'Erreur' }); }
    finally { setLoading(false); }
  }, [platform]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const items = data?.items || [];

  return (
    <div className="w-full space-y-5 pb-10">
      <PageHeader icon={MessageCircle} title="Commentaires" subtitle="Réponds à ta communauté depuis un seul endroit" />

      <div className="flex gap-2 flex-wrap">
        {NETS.map((n) => (
          <button key={n.id} onClick={() => setPlatform(n.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12.5px] font-medium transition-all ${platform === n.id ? 'text-white border-white/15 bg-white/[0.06]' : 'text-slate-400 border-white/[0.06] bg-white/[0.02] hover:text-white'}`}>
            {n.id && <span className="w-4 h-4 rounded grid place-items-center text-white" style={{ background: NET_BG[n.id] }}><SocialIcon network={n.label} className="w-2.5 h-2.5" /></span>}
            {n.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" /></div>
      ) : data?.addon_required ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-8 text-center max-w-lg mx-auto">
          <Lock className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold font-sora text-white">Inbox non activé</h3>
          <p className="text-sm text-slate-400 font-inter mt-2">La gestion des commentaires nécessite l'add-on <b>Inbox</b> de ta plateforme de publication (essai gratuit disponible). Active-le pour répondre à ta communauté ici.</p>
        </div>
      ) : data?.connected === false ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-8 text-center max-w-lg mx-auto">
          <Plug className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold font-sora text-white">Aucun réseau connecté</h3>
          <p className="text-sm text-slate-400 font-inter mt-2">Connecte un compte dans Paramètres pour gérer tes commentaires.</p>
          <Link to="/dashboard/parametres" className="inline-block mt-4 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm hover:bg-white/10">Aller aux Paramètres →</Link>
        </div>
      ) : !data?.ok ? (
        <div className="text-center py-16 text-slate-500 font-inter text-sm">{data?.error || 'Indisponible'}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500 font-inter text-sm">Aucun commentaire pour le moment.</div>
      ) : (
        <div className="space-y-3">
          {items.map((post) => {
            const np = normPlat(post.platform);
            const isOpen = open === post.id;
            return (
              <div key={post.id} className="rounded-2xl border border-white/[0.06] bg-[#0f172a] overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : post.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02]">
                  <span className="w-9 h-9 rounded-lg grid place-items-center text-white shrink-0" style={{ background: NET_BG[np] || '#334155' }}><SocialIcon network={np} className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-slate-200 truncate">{(post.content || 'Publication').slice(0, 70)}</div>
                    <div className="text-[11.5px] text-slate-500 mt-0.5">{post.accountUsername} · {since(post.createdTime)}</div>
                  </div>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-slate-400 shrink-0"><MessageCircle className="w-4 h-4" />{post.commentCount || 0}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {isOpen && <div className="px-4 pb-4 border-t border-white/[0.06]"><Thread post={post} /></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
