import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Loader2, Lock, Plug, Heart, EyeOff, Eye, Trash2, Send, CornerDownRight, X, ExternalLink, ArrowLeft, ChevronDown, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { SocialIcon } from '../components/SocialIcon';
import { inboxService } from '../services/inboxService';

/* Commentaires — inbox en deux panneaux : les posts à gauche, le fil du post choisi à
   droite (commentaires, réponses imbriquées, zone de réponse en bas). Maquette :
   _design/commentaires/commentaires-v2.html, direction A. */

const NETS = [
  { id: '', labelKey: 'allNetworks' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
];
const NET_BG = { linkedin: '#0a66c2', instagram: 'linear-gradient(135deg,#feda75,#d62976,#962fbf)', facebook: '#1877f2', tiktok: '#111', youtube: '#ff0000' };
const NET_NOM = { linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };
const normPlat = (p) => (p || '').toString().toLowerCase().split('.').pop();
const since = (iso, t) => {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return t('comments.minutesAgo', { count: Math.max(1, Math.floor(d / 60)) });
  if (d < 86400) return t('comments.hoursAgo', { count: Math.floor(d / 3600) });
  return t('comments.daysAgo', { count: Math.floor(d / 86400) });
};

/** Titre d'un post : sa première ligne (un post LinkedIn ou Instagram commence par son
 * accroche), sans le reste du texte. */
const titrePost = (content, repli) => {
  const premiere = String(content || '').split(/\n/).map((l) => l.trim()).find(Boolean);
  return premiere || repli;
};

/** Un commentaire attend une réponse s'il n'est pas de toi et qu'aucune de ses réponses
 * n'est de toi. */
const enAttente = (c) => !c.from?.isOwner && !(c.replies || []).some((r) => r.from?.isOwner);
const nbEnAttente = (comments) => (comments || []).filter(enAttente).length;

function Avatar({ from, petit }) {
  const taille = petit ? 'w-6 h-6 text-[10.5px]' : 'w-8 h-8 text-[13px]';
  const fond = from?.isOwner ? 'bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF]' : 'bg-slate-700';
  return (
    <span className={`${taille} ${fond} rounded-full grid place-items-center text-white font-semibold shrink-0 overflow-hidden`}
      style={from?.picture ? { backgroundImage: `url(${from.picture})`, backgroundSize: 'cover' } : {}}>
      {!from?.picture && (from?.name || from?.username || '?').charAt(0).toUpperCase()}
    </span>
  );
}

function Miniature({ post, petit }) {
  const np = normPlat(post.platform);
  const taille = petit ? 'w-9 h-9 rounded-lg' : 'w-[52px] h-[52px] rounded-xl';
  const [casse, setCasse] = useState(false);
  // Le CDN d'Instagram refuse les images demandées avec un referer d'un autre site.
  if (post.picture && !casse) {
    return <img src={post.picture} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setCasse(true)}
      className={`${taille} object-cover shrink-0 bg-white/[0.05]`} />;
  }
  return (
    <span className={`${taille} grid place-items-center text-white shrink-0`} style={{ background: NET_BG[np] || '#334155' }}>
      {np ? <SocialIcon network={np} className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
    </span>
  );
}

/** La bulle d'un commentaire ou d'une réponse : texte, méta, actions. Volontairement non
 * récursive (le plugin visual-edits du serveur de dev boucle sur un composant qui s'appelle
 * lui-même) ; Instagram et Facebook n'ont de toute façon qu'un niveau de réponses. */
function Bulle({ c, reponse, cible, onRepondre, onAction }) {
  const { t } = useTranslation();
  const moi = c.from?.isOwner;
  const nouveau = !reponse && enAttente(c);
  return (
    <div className={`flex gap-2.5 ${c.isHidden ? 'opacity-50' : ''}`} data-testid={reponse ? `reponse-${c.id}` : `commentaire-${c.id}`}>
      <Avatar from={c.from} petit={reponse} />
      <div className="flex-1 min-w-0">
        <div className={`inline-block max-w-full rounded-[4px_14px_14px_14px] border px-3 py-2 ${moi ? 'bg-[#8A6CFF]/[0.08] border-[#8A6CFF]/20' : 'bg-white/[0.035] border-white/[0.07]'} ${cible ? 'ring-2 ring-[#8A6CFF]/40' : ''}`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12.5px] font-semibold text-slate-100">{c.from?.name || c.from?.username || t('comments.userFallback')}</span>
            {moi && <span className="text-[10px] font-semibold px-1.5 py-px rounded-full bg-[#8A6CFF]/15 text-[#c4b5fd] border border-[#8A6CFF]/30">{t('comments.toi')}</span>}
            {nouveau && <span className="text-[10px] font-semibold px-1.5 py-px rounded-full bg-[#3AFFA3]/10 text-[#3AFFA3] border border-[#3AFFA3]/25">{t('comments.aRepondre')}</span>}
          </div>
          <p className="text-[13.5px] text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{c.message}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 mt-1.5 text-[12px]">
          <span className="text-slate-500 text-[11.5px]">{since(c.createdTime, t)}{c.isHidden ? ` · ${t('comments.hidden')}` : ''}</span>
          {c.canReply !== false && !reponse && (
            <button onClick={() => onRepondre(c)} className="inline-flex items-center gap-1 text-[#c4b5fd] hover:text-white" data-testid={`repondre-${c.id}`}>
              <CornerDownRight className="w-3.5 h-3.5" />{t('comments.reply')}
            </button>
          )}
          {c.canLike && (
            <button onClick={() => onAction(c.isLiked ? 'unlike' : 'like', c)} className={`inline-flex items-center gap-1 ${c.isLiked ? 'text-red-400' : 'text-slate-400 hover:text-white'}`}>
              <Heart className={`w-3.5 h-3.5 ${c.isLiked ? 'fill-current' : ''}`} />{c.isLiked ? t('comments.liked') : t('comments.like')}{c.likeCount ? ` ${c.likeCount}` : ''}
            </button>
          )}
          {c.canHide !== false && (
            <button onClick={() => onAction(c.isHidden ? 'unhide' : 'hide', c)} className="inline-flex items-center gap-1 text-slate-400 hover:text-white">
              {c.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}{c.isHidden ? t('comments.show') : t('comments.hide')}
            </button>
          )}
          {c.canDelete && (
            <button onClick={() => onAction('delete', c)} className="inline-flex items-center gap-1 text-slate-400 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />{t('comments.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Un commentaire et ses réponses, en retrait. */
function Commentaire({ c, cible, onRepondre, onAction }) {
  return (
    <div>
      <Bulle c={c} cible={cible} onRepondre={onRepondre} onAction={onAction} />
      {(c.replies || []).length > 0 && (
        <div className="mt-3 ml-[42px] pl-3.5 border-l-2 border-[#8A6CFF]/25 space-y-3">
          {c.replies.map((r) => <Bulle key={r.id} c={r} reponse onRepondre={onRepondre} onAction={onAction} />)}
        </div>
      )}
    </div>
  );
}

/** Le fil d'un post : commentaires + zone de réponse. */
function Fil({ post, comments, chargement, recharger, onRetour }) {
  const { t } = useTranslation();
  const [cible, setCible] = useState(null); // commentaire visé, null = commenter le post
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);
  const np = normPlat(post.platform);

  useEffect(() => { setCible(null); setTexte(''); }, [post.id]);

  const repondre = (c) => { setCible(c); setTimeout(() => champ.current?.focus(), 0); };

  const envoyer = async () => {
    if (!texte.trim()) return;
    setEnvoi(true);
    try {
      await inboxService.reply(post.id, post.accountId, texte.trim(), cible?.id);
      toast.success(t('comments.replySent'));
      setTexte(''); setCible(null);
      recharger();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.message || t('comments.sendFailed'));
    } finally {
      setEnvoi(false);
    }
  };

  const action = async (kind, c) => {
    try {
      await inboxService.action(kind, post.id, c.id, post.accountId);
      toast.success(t('comments.done'));
      recharger();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.message || t('comments.actionFailed'));
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 w-full">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-white/[0.06]">
        <button onClick={onRetour} className="lg:hidden w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-white -ml-1" aria-label={t('comments.retour')}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Miniature post={post} petit />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-white font-sora truncate">{titrePost(post.content, t('comments.postFallback'))}</p>
          <p className="text-[11.5px] text-slate-500">{t('comments.nbCommentaires', { count: post.commentCount || 0 })} · {NET_NOM[np] || np}</p>
        </div>
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-white shrink-0">
            {t('comments.voirSur', { reseau: NET_NOM[np] || np })}<ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-[240px]">
        {chargement ? (
          <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF] inline" /></div>
        ) : !comments?.length ? (
          <p className="py-10 text-center text-slate-500 text-[12.5px]">{t('comments.noCommentsFetched')}</p>
        ) : comments.map((c) => (
          <Commentaire key={c.id} c={c} cible={cible?.id === c.id} onRepondre={repondre} onAction={action} />
        ))}
      </div>

      <div className="border-t border-white/[0.06] bg-[#0b1222]">
        {cible && (
          <div className="flex items-center justify-between gap-2 px-4 pt-2.5 text-[11.5px] text-slate-400">
            <span className="truncate">{t('comments.reponseA')} <b className="text-white">{cible.from?.name || cible.from?.username}</b> · « {(cible.message || '').slice(0, 60)} »</span>
            <button onClick={() => setCible(null)} className="text-slate-500 hover:text-white shrink-0" aria-label={t('comments.annulerCible')}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <div className="flex items-center gap-2 p-3">
          <input ref={champ} value={texte} onChange={(e) => setTexte(e.target.value)} data-testid="commentaire-saisie"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
            placeholder={cible ? t('comments.replyPlaceholder') : t('comments.commenterPost')}
            className="flex-1 min-w-0 h-10 rounded-xl bg-white/[0.03] border border-white/10 text-slate-100 text-[13.5px] px-3.5 outline-none focus:border-[#8A6CFF]/60" />
          <button onClick={envoyer} disabled={envoi || !texte.trim()} aria-label={t('comments.envoyer')} data-testid="commentaire-envoyer"
            className="w-10 h-10 grid place-items-center rounded-xl bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white disabled:opacity-40 shrink-0">
            {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommentairesPage() {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState(null);
  const [filPrincipal, setFilPrincipal] = useState(false); // mobile : le fil occupe l'écran
  const [tri, setTri] = useState('recent');
  const [seulementAttente, setSeulementAttente] = useState(false);
  const [fils, setFils] = useState({}); // postId -> { comments, chargement }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await inboxService.list(platform || undefined)); }
    catch (e) { setData({ ok: false, error: t('comments.loadError') }); }
    finally { setLoading(false); }
  }, [platform, t]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const chargerFil = useCallback(async (post) => {
    setFils((f) => ({ ...f, [post.id]: { ...(f[post.id] || {}), chargement: !f[post.id]?.comments } }));
    try {
      const d = await inboxService.postComments(post.id, post.accountId);
      setFils((f) => ({ ...f, [post.id]: { comments: d.comments || [], chargement: false } }));
    } catch {
      setFils((f) => ({ ...f, [post.id]: { comments: f[post.id]?.comments || [], chargement: false } }));
    }
  }, []);

  const items = useMemo(() => data?.items || [], [data]);

  // Les fils des posts commentés sont chargés d'avance : c'est ce qui permet le point
  // « à répondre » et le filtre « Non répondus » sans ouvrir chaque post.
  useEffect(() => {
    items.filter((p) => (p.commentCount || 0) > 0).slice(0, 20).forEach((p) => { if (!fils[p.id]) chargerFil(p); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const posts = useMemo(() => {
    let l = [...items];
    if (seulementAttente) l = l.filter((p) => nbEnAttente(fils[p.id]?.comments) > 0);
    l.sort((a, b) => (tri === 'commentaires'
      ? (b.commentCount || 0) - (a.commentCount || 0)
      : new Date(b.createdTime || 0) - new Date(a.createdTime || 0)));
    return l;
  }, [items, tri, seulementAttente, fils]);

  const totalAttente = useMemo(() => items.reduce((n, p) => n + nbEnAttente(fils[p.id]?.comments), 0), [items, fils]);

  // Sur ordinateur, le premier post est ouvert d'office.
  useEffect(() => {
    if (!posts.length) return;
    if (!selection || !posts.some((p) => p.id === selection)) setSelection(posts[0].id);
  }, [posts, selection]);

  const postSel = posts.find((p) => p.id === selection) || null;
  // Le fil du post affiché est chargé s'il ne l'a pas été d'avance (post sans commentaire,
  // ou au-delà des 20 premiers).
  useEffect(() => { if (postSel && !fils[postSel.id]) chargerFil(postSel); }, [postSel, fils, chargerFil]);
  const ouvrir = (p) => { setSelection(p.id); setFilPrincipal(true); if (!fils[p.id]) chargerFil(p); };

  return (
    <div className="w-full space-y-5 pb-6">
      <PageHeader icon={MessageCircle} title={t('comments.title')} subtitle={t('comments.subtitle')} />

      <div className="flex gap-2 flex-wrap items-center">
        {NETS.map((n) => (
          <button key={n.id} onClick={() => setPlatform(n.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12.5px] font-medium transition-all ${platform === n.id ? 'text-white border-white/15 bg-white/[0.06]' : 'text-slate-400 border-white/[0.06] bg-white/[0.02] hover:text-white'}`}>
            {n.id && <span className="w-4 h-4 rounded grid place-items-center text-white" style={{ background: NET_BG[n.id] }}><SocialIcon network={n.label} className="w-2.5 h-2.5" /></span>}
            {n.labelKey ? t(`comments.${n.labelKey}`) : n.label}
          </button>
        ))}
        <button onClick={() => setSeulementAttente((v) => !v)} data-testid="filtre-non-repondus"
          className={`sm:ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12.5px] font-medium transition-all ${seulementAttente ? 'text-white border-[#3AFFA3]/40 bg-[#3AFFA3]/10' : 'text-slate-400 border-white/[0.06] bg-white/[0.02] hover:text-white'}`}>
          {t('comments.nonRepondus')}
          {totalAttente > 0 && <span className="min-w-[18px] px-1.5 rounded-full bg-[#3AFFA3]/15 text-[#3AFFA3] text-[11px] font-semibold">{totalAttente}</span>}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" /></div>
      ) : data?.addon_required ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-8 text-center max-w-lg mx-auto">
          <Lock className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold font-sora text-white">{t('comments.addonTitle')}</h3>
          <p className="text-sm text-slate-400 font-inter mt-2">{t('comments.addonDescBefore')} <b>Inbox</b> {t('comments.addonDescAfter')}</p>
        </div>
      ) : data?.connected === false ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-8 text-center max-w-lg mx-auto">
          <Plug className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold font-sora text-white">{t('comments.notConnectedTitle')}</h3>
          <p className="text-sm text-slate-400 font-inter mt-2">{t('comments.notConnectedDesc')}</p>
          <Link to="/dashboard/parametres" className="inline-block mt-4 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm hover:bg-white/10">{t('comments.goToSettings')}</Link>
        </div>
      ) : !data?.ok ? (
        <div className="text-center py-16 text-slate-500 font-inter text-sm">{data?.error || t('comments.unavailable')}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500 font-inter text-sm">{t('comments.emptyState')}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] rounded-2xl border border-white/[0.06] bg-[#0f172a] overflow-hidden lg:h-[calc(100dvh-15rem)] lg:min-h-[520px]">
          {/* Liste des posts */}
          <aside className={`${filPrincipal ? 'hidden lg:flex' : 'flex'} flex-col min-w-0 min-h-0 lg:border-r border-white/[0.06]`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-[14px] font-semibold font-sora text-white">{t('comments.posts')}</h3>
              <label className="relative inline-flex items-center">
                <select value={tri} onChange={(e) => setTri(e.target.value)} data-testid="tri-posts"
                  className="appearance-none h-8 pl-2.5 pr-7 rounded-lg bg-white/[0.03] border border-white/10 text-[12px] text-slate-300 focus:outline-none">
                  <option value="recent" className="bg-[#0f172a]">{t('comments.triRecent')}</option>
                  <option value="commentaires" className="bg-[#0f172a]">{t('comments.triCommentaires')}</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 pointer-events-none" />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto">
              {posts.length === 0 ? (
                <p className="py-10 px-4 text-center text-slate-500 text-[12.5px]">{t('comments.toutRepondu')}</p>
              ) : posts.map((p) => {
                const np = normPlat(p.platform);
                const actif = p.id === selection;
                const attente = nbEnAttente(fils[p.id]?.comments);
                return (
                  <button key={p.id} onClick={() => ouvrir(p)} data-testid={`post-${p.id}`}
                    className={`relative w-full flex gap-3 px-4 py-3.5 text-left border-b border-white/[0.05] transition-colors ${actif ? 'bg-[#8A6CFF]/[0.08]' : 'hover:bg-white/[0.02]'}`}>
                    {actif && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-gradient-to-b from-[#5B6CFF] to-[#8A6CFF]" />}
                    <Miniature post={p} />
                    <span className="flex-1 min-w-0">
                      <span className="text-[13px] text-slate-200 leading-snug line-clamp-2 break-words">{titrePost(p.content, t('comments.postFallback'))}</span>
                      <span className="flex items-center gap-1.5 mt-1.5 text-[11.5px] text-slate-500">
                        <span className="w-3.5 h-3.5 rounded grid place-items-center text-white shrink-0" style={{ background: NET_BG[np] || '#334155' }}><SocialIcon network={np} className="w-2 h-2" /></span>
                        <span className="truncate">@{p.accountUsername}</span>
                        <span className="shrink-0">· {since(p.createdTime, t)}</span>
                        <span className="inline-flex items-center gap-0.5 shrink-0">· <MessageCircle className="w-3 h-3" />{p.commentCount || 0}</span>
                        {attente > 0 && <span className="ml-auto w-2 h-2 rounded-full bg-[#3AFFA3] shadow-[0_0_10px_rgba(58,255,163,0.6)] shrink-0" title={t('comments.nbAttente', { count: attente })} />}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Fil du post choisi */}
          <section className={`${filPrincipal ? 'flex' : 'hidden lg:flex'} flex-col min-w-0 min-h-[70dvh] lg:min-h-0`}>
            {postSel ? (
              <Fil
                post={postSel}
                comments={fils[postSel.id]?.comments}
                chargement={!fils[postSel.id] || fils[postSel.id].chargement}
                recharger={() => chargerFil(postSel)}
                onRetour={() => setFilPrincipal(false)}
              />
            ) : (
              <p className="m-auto text-slate-500 text-[13px]">{t('comments.choisirPost')}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
