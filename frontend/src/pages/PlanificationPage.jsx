import { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, Loader2, ChevronLeft, ChevronRight, X, ExternalLink, Image as ImageIcon, Clock, Check, AlertTriangle, Ban, Send } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { contenuService } from '../services/contenuService';
import { useUser } from '../context/UserContext';
import { SocialIcon } from '../components/SocialIcon';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { utcToInput, inputToUtc, timeInTz, tzAbbrev, browserTz } from '../lib/tz';

const PUBLISH_BADGE = {
  envoi: { label: '⏳ Envoi…', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  'programmé': { label: '⏱ Programmé', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  'publié': { label: '✅ Publié', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  partiel: { label: '⚠️ Partiel', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  'échec': { label: '❌ Échec', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  'annulé': { label: 'Annulé', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
};

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MOIS_COURT = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];

// Statuts (clés = valeurs enum DB) -> couleurs
const STATUT = {
  'A valider':       { label: 'À valider', bg: 'rgba(251,191,36,.15)',  co: '#fcd770', sw: '#fbbf24' },
  'Valider':         { label: 'Validé',    bg: 'rgba(52,211,153,.15)',  co: '#6ee7b7', sw: '#34d399' },
  'Planifie':        { label: 'Planifié',  bg: 'rgba(138,108,255,.18)', co: '#c4b5fd', sw: '#8A6CFF' },
  'Pret a publier':  { label: 'Prêt',      bg: 'rgba(138,108,255,.18)', co: '#c4b5fd', sw: '#8A6CFF' },
  'Publie':          { label: 'Publié',    bg: 'rgba(96,165,250,.15)',  co: '#93c5fd', sw: '#60a5fa' },
  'Refuse':          { label: 'Refusé',    bg: 'rgba(248,113,113,.15)', co: '#fca5a5', sw: '#f87171' },
};
const ST_DEFAUT = { label: '—', bg: 'rgba(148,163,184,.15)', co: '#cbd5e1', sw: '#94a3b8' };
const stOf = (s) => STATUT[s] || ST_DEFAUT;

// Réseaux -> pastille
const NET = {
  LinkedIn:  { s: 'in', style: { background: '#0a66c2' } },
  Instagram: { s: '◎', style: { background: 'linear-gradient(135deg,#feda75,#d62976 45%,#962fbf)' } },
  Facebook:  { s: 'f', style: { background: '#1877f2' } },
  TikTok:    { s: '♪', style: { background: '#111', border: '1px solid #2b2b2b' } },
  YouTube:   { s: '▶', style: { background: '#ff0000' } },
};
const netOf = (r) => NET[r] || { s: '•', style: { background: '#334155' } };

// État de publication (Late) -> icône + couleur
const PUB = {
  envoi:       { Icon: Send,          color: '#22d3ee', label: 'En cours d\'envoi' },
  'programmé': { Icon: Clock,         color: '#22d3ee', label: 'Programmé' },
  'publié':    { Icon: Check,         color: '#34d399', label: 'Publié' },
  partiel:     { Icon: AlertTriangle, color: '#fbbf24', label: 'Partiel' },
  'échec':     { Icon: X,             color: '#f87171', label: 'Échec' },
  'annulé':    { Icon: Ban,           color: '#94a3b8', label: 'Annulé' },
};
const pubOf = (s) => PUB[s] || null;

export default function PlanificationPage() {
  const { user } = useUser();
  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  const [view, setView] = useState('mois'); // mois | liste
  const [selected, setSelected] = useState(null);
  const [dateVal, setDateVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const importImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    if (!file.type.startsWith('image/')) { toast.error('Choisissez une image.'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image trop lourde (max 10 Mo).'); return; }
    setImporting(true);
    try {
      const d = await contenuService.uploadImage(selected.id, file);
      patchSel({ lien_visuel: d.lien_visuel, statut: d.statut || selected.statut, date_publication: d.date_publication || selected.date_publication });
      toast.success('Image importée ✓');
    } catch (err) {
      toast.error(err.response?.data?.detail || "Échec de l'import");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const tz = user?.timezone || browserTz();
  const openContenu = (c) => { setSelected(c); setDateVal(utcToInput(c.date_publication, tz)); };
  const patchSel = (patch) => {
    setContenus((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)));
    setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveDate = async () => {
    if (!dateVal || !selected) return;
    setBusy(true);
    try {
      const iso = inputToUtc(dateVal, tz);
      await contenuService.update(selected.id, { date_publication: iso });
      patchSel({ date_publication: iso });
      toast.success('Date mise à jour');
    } catch (e) { toast.error('Échec de la mise à jour de la date'); }
    finally { setBusy(false); }
  };

  const programmer = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const d = await contenuService.publier(selected.id);
      patchSel({ publish_status: d.publish_status, late_post_id: d.late_post_id, publish_error: null });
      toast.success('Publication programmée ✓ — partira à la date prévue');
    } catch (e) {
      const msg = e.response?.data?.detail || 'Échec de la programmation';
      patchSel({ publish_status: 'échec', publish_error: msg });
      toast.error(msg);
    } finally { setBusy(false); }
  };

  const annuler = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const d = await contenuService.annuler(selected.id);
      patchSel({ publish_status: d.publish_status, late_post_id: null });
      toast.success('Envoi annulé — post supprimé de Late');
    } catch (e) { toast.error(e.response?.data?.detail || "Échec de l'annulation"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    contenuService.getAll()
      .then((d) => setContenus(d || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date();
  const year = current.getFullYear();
  const month = current.getMonth();

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0).getDate();
    let start = firstDay.getDay() - 1; if (start < 0) start = 6; // lundi=0
    const arr = [];
    for (let i = start - 1; i >= 0; i--) arr.push({ date: new Date(year, month, -i), out: true });
    for (let i = 1; i <= last; i++) arr.push({ date: new Date(year, month, i), out: false });
    while (arr.length % 7 !== 0 || arr.length < 35) arr.push({ date: new Date(year, month, last + (arr.length % 7) + 1), out: true, pad: true });
    return arr.slice(0, arr.length <= 35 ? 35 : 42);
  }, [year, month]);

  const forDate = (date) => contenus.filter((c) => {
    if (!c.date_publication) return false;
    return new Date(c.date_publication).toDateString() === date.toDateString();
  });
  const hhmm = (iso) => timeInTz(iso, tz);

  const moisContenus = useMemo(() => contenus
    .filter((c) => { if (!c.date_publication) return false; const d = new Date(c.date_publication); return d.getFullYear() === year && d.getMonth() === month; })
    .sort((a, b) => new Date(a.date_publication) - new Date(b.date_publication)), [contenus, year, month]);

  const upcoming = useMemo(() => contenus
    .filter((c) => c.date_publication && new Date(c.date_publication) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))
    .sort((a, b) => new Date(a.date_publication) - new Date(b.date_publication))
    .slice(0, 5), [contenus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Posts prêts mais pas encore envoyés à la publication (actionnables)
  const aProgrammer = useMemo(() => contenus
    .filter((c) => c.reseau_cible && c.statut !== 'Publie'
      && ['', null, undefined, 'échec', 'annulé'].includes(c.publish_status))
    .sort((a, b) => new Date(a.date_publication || 0) - new Date(b.date_publication || 0))
    .slice(0, 4), [contenus]);

  const stats = useMemo(() => ({
    prog: moisContenus.filter((c) => ['programmé', 'envoi'].includes(c.publish_status)).length,
    pub: moisContenus.filter((c) => c.publish_status === 'publié' || c.statut === 'Publie').length,
    valid: moisContenus.filter((c) => c.statut === 'A valider').length,
  }), [moisContenus]);

  const changeMonth = (d) => { setCurrent(new Date(year, month + d, 1)); };
  const goToday = () => { setCurrent(new Date()); };

  // Vignette : visuel du post si dispo, sinon icône du réseau social
  const Thumb = ({ c, className = '' }) => {
    const visual = c.lien_visuel || (Array.isArray(c.slides_images) && c.slides_images[0]);
    const net = netOf(c.reseau_cible);
    if (visual) return (
      <span className={`relative rounded-lg overflow-hidden bg-cover bg-center shrink-0 ring-1 ring-white/10 ${className}`} style={{ backgroundImage: `url(${visual})` }}>
        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-md grid place-items-center text-white ring-2 ring-[#0f172a]" style={net.style}><SocialIcon network={c.reseau_cible} className="w-2 h-2" /></span>
      </span>
    );
    return <span className={`rounded-lg grid place-items-center text-white shrink-0 ${className}`} style={net.style}><SocialIcon network={c.reseau_cible} className="w-1/2 h-1/2" /></span>;
  };

  const Pill = ({ c }) => {
    const pub = pubOf(c.publish_status);
    const net = netOf(c.reseau_cible);
    return (
      <button
        onClick={(e) => { e.stopPropagation(); openContenu(c); }}
        title={`${c.titre || ''}${pub ? ` · ${pub.label}` : ''}`}
        className="w-full flex flex-col gap-1 px-1.5 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.08] transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <span className="w-[16px] h-[16px] rounded grid place-items-center text-white shrink-0" style={net.style}><SocialIcon network={c.reseau_cible} className="w-2.5 h-2.5" /></span>
          <span className="flex-1 text-[9px] text-slate-500 truncate">{hhmm(c.date_publication)}</span>
          {pub ? <pub.Icon className="w-3 h-3 shrink-0" style={{ color: pub.color }} strokeWidth={2.5} />
               : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stOf(c.statut).sw }} />}
        </div>
        <span className="text-[10px] leading-[1.22] font-medium text-slate-200 line-clamp-2">{c.titre || c.contenu?.slice(0, 40) || 'Sans titre'}</span>
      </button>
    );
  };

  return (
    <div className="w-full space-y-5 pb-10">
      <PageHeader
        icon={Calendar}
        title="Planification"
        subtitle="Vue calendrier de tes publications."
        actions={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] shadow-[0_0_8px_#3AFFA3]" />
            <span className="text-xs text-slate-400 font-inter">Crédits</span>
            <span className="text-sm font-semibold text-white font-inter">{user?.credits ?? '—'}</span>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] grid place-items-center hover:bg-white/[0.06] transition-colors"><ChevronLeft className="w-[18px] h-[18px]" /></button>
          <div className="text-lg font-semibold font-sora min-w-[150px] text-center">{MOIS[month]} <span className="text-slate-500 font-medium">{year}</span></div>
          <button onClick={() => changeMonth(1)} className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] grid place-items-center hover:bg-white/[0.06] transition-colors"><ChevronRight className="w-[18px] h-[18px]" /></button>
          <button onClick={goToday} className="px-3.5 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-slate-400 hover:text-white hover:bg-white/[0.06] text-xs font-semibold font-inter transition-colors">Aujourd'hui</button>
        </div>
        <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          {[['mois', 'Mois'], ['liste', 'Liste']].map(([id, lab]) => (
            <button key={id} onClick={() => setView(id)} className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all ${view === id ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'text-slate-400 hover:text-white'}`}>{lab}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" /></div>
      ) : view === 'mois' ? (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_322px] gap-5 items-start">
          {/* CALENDRIER */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-3.5">
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-2 mb-2 min-w-[640px]">
                {JOURS.map((j) => <div key={j} className="px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-slate-600 font-semibold font-inter">{j}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-2 min-w-[640px]">
                {days.map((d, i) => {
                  const evs = d.out ? [] : forDate(d.date);
                  const isToday = !d.out && d.date.toDateString() === today.toDateString();
                  return (
                    <div key={i} className={`min-h-[116px] rounded-xl border p-2 flex flex-col gap-1.5 transition-all ${d.out ? 'bg-white/[0.01] border-white/[0.04] opacity-40' : 'bg-[#0a1120] border-white/[0.06] hover:border-white/10'} ${isToday ? 'ring-1 ring-[#5B6CFF]/55 border-[#5B6CFF]/55' : ''}`}>
                      <div className={`text-[12.5px] font-semibold font-inter ${isToday ? 'text-white' : 'text-slate-500'}`}>
                        {isToday ? <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center text-white text-[11px] inline-grid">{d.date.getDate()}</span> : d.date.getDate()}
                      </div>
                      {evs.slice(0, 3).map((c) => <Pill key={c.id} c={c} />)}
                      {evs.length > 3 && <div className="text-[10.5px] text-slate-500 px-1.5 font-medium">+{evs.length - 3} autres</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Légende publication */}
            <div className="mt-3.5 pt-3.5 border-t border-white/[0.06] flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-600 font-inter">État</span>
              {Object.values(PUB).map((p) => (
                <div key={p.label} className="flex items-center gap-1.5 text-xs text-slate-400 font-inter">
                  <p.Icon className="w-3.5 h-3.5" style={{ color: p.color }} strokeWidth={2.5} />{p.label}
                </div>
              ))}
            </div>
          </div>

          {/* SIDEBAR */}
          <div className="space-y-4">
            {/* Mini-stats */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { n: stats.prog, c: '#22d3ee', l: 'Programmés' },
                { n: stats.pub, c: '#34d399', l: 'Publiés' },
                { n: stats.valid, c: '#fbbf24', l: 'À valider' },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border border-white/[0.06] bg-[#0f172a] px-3 py-3 text-center">
                  <div className="text-xl font-bold font-sora leading-none" style={{ color: s.c }}>{s.n}</div>
                  <div className="text-[10.5px] text-slate-500 mt-1.5 font-inter">{s.l}</div>
                </div>
              ))}
            </div>

            {/* À programmer */}
            {aProgrammer.length > 0 && (
              <div className="rounded-2xl border border-white/[0.06] bg-[#0b1322] p-4">
                <h3 className="text-[13.5px] font-semibold font-sora flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-[#fbbf24]" />À programmer
                  <span className="ml-auto text-[11px] text-slate-500 bg-white/[0.05] px-2 py-0.5 rounded-full">{aProgrammer.length}</span>
                </h3>
                <div className="divide-y divide-white/[0.06]">
                  {aProgrammer.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                      <Thumb c={c} className="w-10 h-10" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium text-slate-200 truncate">{c.titre || c.contenu?.slice(0, 40) || 'Sans titre'}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{c.reseau_cible || '—'}{c.date_publication ? ` · ${new Date(c.date_publication).getDate()} ${MOIS_COURT[new Date(c.date_publication).getMonth()]}` : ' · pas de date'}</div>
                      </div>
                      <button onClick={() => openContenu(c)} title="Programmer" className="w-8 h-8 rounded-lg border border-white/10 text-cyan-400 hover:bg-cyan-500/15 grid place-items-center shrink-0">
                        <Calendar className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prochaines publications */}
            <div className="rounded-2xl border border-white/[0.06] bg-[#0b1322] p-4">
              <h3 className="text-[13.5px] font-semibold font-sora flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-[#8A6CFF]" />Prochaines
                <span className="ml-auto text-[11px] text-slate-500 bg-white/[0.05] px-2 py-0.5 rounded-full">{upcoming.length}</span>
              </h3>
              {upcoming.length === 0 ? (
                <p className="text-slate-500 font-inter text-[12.5px] py-3 text-center">Aucune publication à venir.</p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {upcoming.map((c) => {
                    const pub = pubOf(c.publish_status);
                    return (
                      <div key={c.id} onClick={() => openContenu(c)} className="flex items-center gap-3 py-2.5 first:pt-0 cursor-pointer hover:opacity-80">
                        <Thumb c={c} className="w-10 h-10" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium text-slate-200 truncate">{c.titre || c.contenu?.slice(0, 40) || 'Sans titre'}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                            {pub && <pub.Icon className="w-3 h-3" style={{ color: pub.color }} strokeWidth={2.5} />}
                            {new Date(c.date_publication).getDate()} {MOIS_COURT[new Date(c.date_publication).getMonth()]} · {hhmm(c.date_publication)} · {c.reseau_cible}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Vue liste */
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-4 space-y-2.5">
          {moisContenus.length === 0 ? (
            <p className="text-center py-12 text-slate-500 font-inter text-sm">Aucun contenu planifié sur {MOIS[month]}.</p>
          ) : moisContenus.map((c) => {
            const st = stOf(c.statut), net = netOf(c.reseau_cible);
            return (
              <div key={c.id} onClick={() => openContenu(c)} className="flex items-center gap-4 p-3 rounded-xl border border-white/[0.06] bg-[#0a1120] cursor-pointer hover:border-white/[0.15] transition-colors">
                <div className="text-center min-w-[46px]">
                  <div className="text-xl font-bold font-sora leading-none">{new Date(c.date_publication).getDate()}</div>
                  <div className="text-[10.5px] text-slate-500 uppercase mt-0.5">{MOIS_COURT[new Date(c.date_publication).getMonth()]}</div>
                </div>
                <div className="w-[30px] h-[30px] rounded-lg grid place-items-center text-white shrink-0" style={net.style}><SocialIcon network={c.reseau_cible} className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-slate-200 truncate">{c.titre || c.contenu?.slice(0, 50)}</div>
                  <div className="text-[11.5px] text-slate-500 mt-0.5">{c.reseau_cible || '—'} · {hhmm(c.date_publication)}</div>
                </div>
                {pubOf(c.publish_status) && (() => { const p = pubOf(c.publish_status); return (
                  <span className="flex items-center gap-1 text-[10.5px] font-semibold px-2 py-1 rounded-full border shrink-0"
                    style={{ color: p.color, borderColor: `${p.color}55`, background: `${p.color}14` }}>
                    <p.Icon className="w-3 h-3" strokeWidth={2.5} />{p.label}
                  </span>); })()}
                <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: st.bg, color: st.co }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Prochaines publications (vue liste uniquement — en mois c'est dans la sidebar) */}
      {view === 'liste' && (
      <div>
        <h3 className="text-sm font-semibold font-sora mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-[#8A6CFF]" />Prochaines publications</h3>
        {upcoming.length === 0 ? (
          <p className="text-slate-500 font-inter text-sm">Aucune publication planifiée.</p>
        ) : (
          <div className="space-y-2.5">
            {upcoming.map((c) => {
              const st = stOf(c.statut), net = netOf(c.reseau_cible);
              return (
                <div key={c.id} onClick={() => openContenu(c)} className="flex items-center gap-4 p-3 rounded-2xl border border-white/[0.06] bg-[#0f172a] cursor-pointer hover:border-white/[0.15] transition-colors">
                  <div className="text-center min-w-[46px]">
                    <div className="text-xl font-bold font-sora leading-none">{new Date(c.date_publication).getDate()}</div>
                    <div className="text-[10.5px] text-slate-500 uppercase mt-0.5">{MOIS_COURT[new Date(c.date_publication).getMonth()]}</div>
                  </div>
                  <div className="w-[30px] h-[30px] rounded-lg grid place-items-center text-white shrink-0" style={net.style}><SocialIcon network={c.reseau_cible} className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-slate-200 truncate">{c.titre || c.contenu?.slice(0, 50)}</div>
                    <div className="text-[11.5px] text-slate-500 mt-0.5">{c.reseau_cible || '—'} · {hhmm(c.date_publication)}</div>
                  </div>
                  <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.co }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Pop-up détail / programmation */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-[#0b1322] border-white/10 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white font-sora pr-6">{selected?.titre || 'Contenu'}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Visuel */}
              <div className="space-y-2">
                {Array.isArray(selected.slides_images) && selected.slides_images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {selected.slides_images.slice(0, 6).map((u, i) => (
                      <img key={i} src={u} alt="" className="w-full rounded-lg object-cover ring-1 ring-white/10" />
                    ))}
                  </div>
                ) : selected.lien_visuel ? (
                  <img src={selected.lien_visuel} alt="" className="w-full rounded-xl object-cover ring-1 ring-white/10" />
                ) : (
                  <div className="w-full aspect-square rounded-xl bg-slate-800/40 border border-dashed border-white/10 grid place-items-center text-slate-600 gap-2">
                    <ImageIcon className="w-10 h-10" />
                    <span className="text-xs font-inter">Aucun visuel</span>
                  </div>
                )}
                {!(Array.isArray(selected.slides_images) && selected.slides_images.length) && (
                  <>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={importImage} />
                    <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing}
                      className="w-full bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10">
                      {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <ImageIcon className="w-4 h-4 mr-1.5" />}
                      {selected.lien_visuel ? "Changer l'image" : 'Importer une image'}
                    </Button>
                  </>
                )}
              </div>
              {/* Infos + actions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md grid place-items-center text-white" style={netOf(selected.reseau_cible).style}><SocialIcon network={selected.reseau_cible} className="w-3.5 h-3.5" /></span>
                  <span className="text-sm text-slate-300 font-inter">{selected.reseau_cible || '—'}</span>
                  {PUBLISH_BADGE[selected.publish_status] && (
                    <span className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full border ${PUBLISH_BADGE[selected.publish_status].cls}`}>{PUBLISH_BADGE[selected.publish_status].label}</span>
                  )}
                </div>
                <p className="text-[13px] text-slate-300 font-inter whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">{selected.contenu}</p>

                {/* Date picker */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-inter">Date de publication <span className="text-slate-600">({tz.split('/').pop().replace('_', ' ')} · {tzAbbrev(tz)})</span></label>
                  <div className="flex gap-2">
                    <input type="datetime-local" value={dateVal} onChange={(e) => setDateVal(e.target.value)}
                      className="flex-1 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-2 outline-none focus:border-[#5B6CFF]/50" />
                    <Button size="sm" onClick={saveDate} disabled={busy || !dateVal || utcToInput(selected.date_publication, tz) === dateVal}
                      className="bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10">Enregistrer</Button>
                  </div>
                </div>

                {selected.publish_status === 'échec' && selected.publish_error && (
                  <p className="text-[12px] text-red-400 font-inter">⚠ Échec : {selected.publish_error}</p>
                )}

                {/* Actions publication */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.statut !== 'Publie' && selected.reseau_cible
                    && ['', null, undefined, 'échec', 'annulé'].includes(selected.publish_status) && (
                    <Button size="sm" onClick={programmer} disabled={busy}
                      className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-500/30">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
                      {selected.publish_status === 'échec' ? 'Réessayer' : 'Programmer'}
                    </Button>
                  )}
                  {['envoi', 'programmé'].includes(selected.publish_status) && (
                    <Button size="sm" onClick={annuler} disabled={busy}
                      className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <X className="w-4 h-4 mr-1.5" />}
                      Annuler la publication
                    </Button>
                  )}
                  {selected.statut === 'Publie' && selected.lien_publication && (
                    <a href={selected.lien_publication} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" className="bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30">
                        <ExternalLink className="w-4 h-4 mr-1.5" />Voir le post
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
