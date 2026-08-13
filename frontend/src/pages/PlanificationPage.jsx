import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Loader2, ChevronLeft, ChevronRight, X, ExternalLink, Image as ImageIcon, Clock, Check, AlertTriangle, Ban, Send, Trash2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { contenuService } from '../services/contenuService';
import { useUser } from '../context/UserContext';
import { SocialIcon } from '../components/SocialIcon';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { utcToInput, inputToUtc, timeInTz, tzAbbrev, browserTz } from '../lib/tz';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as DayCalendar } from '../components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const PUBLISH_BADGE = {
  envoi: { labelKey: 'badgeEnvoi', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  'programmé': { labelKey: 'badgeProgramme', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  'publié': { labelKey: 'badgePublie', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  partiel: { labelKey: 'badgePartiel', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  'échec': { labelKey: 'badgeEchec', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  'annulé': { labelKey: 'badgeAnnule', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
};

const JOURS_KEYS = ['jours0', 'jours1', 'jours2', 'jours3', 'jours4', 'jours5', 'jours6'];
const MOIS_KEYS = ['mois0', 'mois1', 'mois2', 'mois3', 'mois4', 'mois5', 'mois6', 'mois7', 'mois8', 'mois9', 'mois10', 'mois11'];
const MOIS_COURT_KEYS = ['moisCourt0', 'moisCourt1', 'moisCourt2', 'moisCourt3', 'moisCourt4', 'moisCourt5', 'moisCourt6', 'moisCourt7', 'moisCourt8', 'moisCourt9', 'moisCourt10', 'moisCourt11'];

// Statuts (clés = valeurs enum DB) -> couleurs
const STATUT = {
  'A valider':       { labelKey: 'statutAValider', bg: 'rgba(251,191,36,.15)',  co: '#fcd770', sw: '#fbbf24' },
  'Valider':         { labelKey: 'statutValide',   bg: 'rgba(52,211,153,.15)',  co: '#6ee7b7', sw: '#34d399' },
  'Planifie':        { labelKey: 'statutPlanifie', bg: 'rgba(138,108,255,.18)', co: '#c4b5fd', sw: '#8A6CFF' },
  'Pret a publier':  { labelKey: 'statutPret',     bg: 'rgba(138,108,255,.18)', co: '#c4b5fd', sw: '#8A6CFF' },
  'Publie':          { labelKey: 'statutPublie',   bg: 'rgba(96,165,250,.15)',  co: '#93c5fd', sw: '#60a5fa' },
  'Refuse':          { labelKey: 'statutRefuse',   bg: 'rgba(248,113,113,.15)', co: '#fca5a5', sw: '#f87171' },
};
const ST_DEFAUT = { labelKey: 'statutAucun', bg: 'rgba(148,163,184,.15)', co: '#cbd5e1', sw: '#94a3b8' };
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
  envoi:       { Icon: Send,          color: '#22d3ee', labelKey: 'pubEnvoi' },
  'programmé': { Icon: Clock,         color: '#22d3ee', labelKey: 'pubProgramme' },
  'publié':    { Icon: Check,         color: '#34d399', labelKey: 'pubPublie' },
  partiel:     { Icon: AlertTriangle, color: '#fbbf24', labelKey: 'pubPartiel' },
  'échec':     { Icon: X,             color: '#f87171', labelKey: 'pubEchec' },
  'annulé':    { Icon: Ban,           color: '#94a3b8', labelKey: 'pubAnnule' },
};
const pubOf = (s) => PUB[s] || null;

export default function PlanificationPage() {
  const { t } = useTranslation();
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

  // Drag & drop replanification (Framer Motion) : survol de cellule + sélecteur d'heure au drop
  const [hoverDate, setHoverDate] = useState(null); // 'yyyy-MM-dd' de la cellule survolée pendant le drag
  const [dropPending, setDropPending] = useState(null); // { contenu, dateStr, time, point:{x,y} }
  const [dropBusy, setDropBusy] = useState(false);

  const commitDrop = async () => {
    if (!dropPending) return;
    const { contenu, dateStr, time } = dropPending;
    setDropBusy(true);
    try {
      const iso = inputToUtc(`${dateStr}T${time}`, tz);
      if (new Date(iso).getTime() < Date.now()) {
        toast.error(t('planif.dateFutur'));
        setDropBusy(false);
        return;
      }
      await contenuService.update(contenu.id, { date_publication: iso });
      setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, date_publication: iso } : c)));
      const programmable = contenu.statut === 'Valider'
        || ['envoi', 'programmé', 'programme', 'échec', 'annulé'].includes(contenu.publish_status);
      if (programmable && contenu.reseau_cible) {
        try {
          const pub = await contenuService.publier(contenu.id);
          setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, publish_status: pub.publish_status, late_post_id: pub.late_post_id, publish_error: null } : c)));
          toast.success(t('planif.replanifieOk'));
        } catch (e) {
          setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, publish_status: 'échec', publish_error: e.response?.data?.detail } : c)));
          toast.error(e.response?.data?.detail || t('planif.deplaceReprogEchec'), { duration: 7000 });
        }
      } else {
        toast.success(t('planif.postDeplace'));
      }
      setDropPending(null);
    } catch (e) {
      toast.error(t('planif.echecDeplacement'));
    } finally {
      setDropBusy(false);
    }
  };

  const importImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    if (!file.type.startsWith('image/')) { toast.error(t('planif.choisirImage')); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('planif.imageTropLourde')); return; }
    setImporting(true);
    try {
      const d = await contenuService.uploadImage(selected.id, file);
      patchSel({ lien_visuel: d.lien_visuel, statut: d.statut || selected.statut, date_publication: d.date_publication || selected.date_publication });
      toast.success(t('planif.imageImportee'));
    } catch (err) {
      toast.error(err.response?.data?.detail || t('planif.echecImport'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const tz = user?.timezone || browserTz();
  const openContenu = (c) => {
    setSelected(c); setDateVal(utcToInput(c.date_publication, tz));
    // Rafraîchit le statut RÉEL : un webhook Late a pu passer le post à « publié »
    // depuis le chargement de la page → on évite d'afficher un ancien « échec » figé.
    contenuService.getById(c.id)
      .then((fresh) => {
        setSelected((prev) => (prev && prev.id === c.id ? { ...prev, ...fresh } : prev));
        setContenus((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...fresh } : x)));
      })
      .catch(() => { /* on garde l'instantané */ });
  };
  const patchSel = (patch) => {
    setContenus((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)));
    setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveDate = async () => {
    if (!dateVal || !selected) return;
    setBusy(true);
    try {
      const iso = inputToUtc(dateVal, tz);
      if (new Date(iso).getTime() < Date.now()) {
        toast.error(t('planif.dateFutur'));
        setBusy(false);
        return;
      }
      await contenuService.update(selected.id, { date_publication: iso });
      patchSel({ date_publication: iso });
      // Re-programmation auto sur Late si le contenu est validé / déjà dans la file
      const programmable = selected.statut === 'Valider'
        || ['envoi', 'programmé', 'programme', 'échec', 'annulé'].includes(selected.publish_status);
      if (programmable && selected.reseau_cible) {
        try {
          const pub = await contenuService.publier(selected.id);
          patchSel({ publish_status: pub.publish_status, late_post_id: pub.late_post_id, publish_error: null });
          toast.success(t('planif.dateMajReprog'));
        } catch (e) {
          patchSel({ publish_status: 'échec', publish_error: e.response?.data?.detail });
          toast.error(e.response?.data?.detail || t('planif.dateEnregReprogEchec'), { duration: 7000 });
        }
      } else {
        toast.success(t('planif.dateMaj'));
      }
    } catch (e) { toast.error(t('planif.echecMajDate')); }
    finally { setBusy(false); }
  };

  const programmer = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const d = await contenuService.publier(selected.id);
      patchSel({ publish_status: d.publish_status, late_post_id: d.late_post_id, publish_error: null });
      toast.success(t('planif.pubProgrammee'));
    } catch (e) {
      const msg = e.response?.data?.detail || t('planif.echecProgrammation');
      patchSel({ publish_status: 'échec', publish_error: msg });
      toast.error(msg);
    } finally { setBusy(false); }
  };

  // Replanifier : le backend trouve le prochain créneau libre (planification + dates occupées)
  const replanifier = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const d = await contenuService.replanifier(selected.id);
      patchSel({ date_publication: d.date_publication, publish_status: d.publish_status, publish_error: d.error || null });
      const dt = d.date_publication ? new Date(d.date_publication).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      if (d.publish_status === 'envoi') toast.success(t('planif.replanifieVers', { date: dt }));
      else toast.error(d.error || t('planif.replanifieEnvoiEchec'));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('planif.echecReplanification'));
    } finally { setBusy(false); }
  };

  const annuler = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const d = await contenuService.annuler(selected.id);
      patchSel({ publish_status: d.publish_status, late_post_id: null });
      toast.success(t('planif.envoiAnnule'));
    } catch (e) { toast.error(e.response?.data?.detail || t('planif.echecAnnulation')); }
    finally { setBusy(false); }
  };

  const supprimer = async () => {
    if (!selected) return;
    if (!window.confirm(t('planif.confirmSuppression'))) return;
    setBusy(true);
    try {
      await contenuService.remove(selected.id);
      setContenus((prev) => prev.filter((c) => c.id !== selected.id));
      setSelected(null);
      toast.success(t('planif.postSupprime'));
    } catch (e) { toast.error(e.response?.data?.detail || t('planif.echecSuppression')); }
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
    const { t } = useTranslation();
    const pub = pubOf(c.publish_status);
    const net = netOf(c.reseau_cible);
    const justDragged = useRef(false);
    return (
      <motion.div
        layout
        layoutId={`pill-${c.id}`}
        transition={{ type: 'spring', damping: 24, stiffness: 340 }}
        drag
        dragSnapToOrigin
        dragElastic={0.18}
        dragMomentum={false}
        whileDrag={{ scale: 1.1, zIndex: 60, boxShadow: '0 18px 44px rgba(0,0,0,.55)', cursor: 'grabbing' }}
        onDrag={(e, info) => {
          const el = document.elementFromPoint(info.point.x, info.point.y);
          const cell = el?.closest('[data-cal-date]');
          setHoverDate(cell?.getAttribute('data-cal-date') || null);
        }}
        onDragEnd={(e, info) => {
          setHoverDate(null);
          const moved = Math.hypot(info.offset.x, info.offset.y) > 6;
          if (!moved) return;
          justDragged.current = true;
          setTimeout(() => { justDragged.current = false; }, 250);
          const el = document.elementFromPoint(info.point.x, info.point.y);
          const cell = el?.closest('[data-cal-date]');
          const newDate = cell?.getAttribute('data-cal-date');
          if (!newDate) return;
          const curDate = c.date_publication ? format(new Date(c.date_publication), 'yyyy-MM-dd') : null;
          if (newDate === curDate) return;
          const time = c.date_publication ? utcToInput(c.date_publication, tz).split('T')[1] : '09:00';
          const x = Math.min(Math.max(info.point.x, 130), window.innerWidth - 130);
          const y = Math.min(info.point.y, window.innerHeight - 200);
          setDropPending({ contenu: c, dateStr: newDate, time, point: { x, y } });
        }}
        onClick={(e) => { if (justDragged.current) return; e.stopPropagation(); openContenu(c); }}
        role="button" tabIndex={0}
        title={`${c.titre || ''}${pub ? ` · ${t(`planif.${pub.labelKey}`)}` : ''} — ${t('planif.glisseReplanifier')}`}
        className="w-full flex flex-col gap-1 px-1.5 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.08] transition-colors text-left cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-1.5">
          <span className="w-[16px] h-[16px] rounded grid place-items-center text-white shrink-0" style={net.style}><SocialIcon network={c.reseau_cible} className="w-2.5 h-2.5" /></span>
          {c.type === 'Story' && (
            <span className="text-[7.5px] font-bold uppercase tracking-wide px-1 py-px rounded bg-[#fbbf24]/15 text-[#fbbf24] shrink-0">Story</span>
          )}
          <span className="flex-1 text-[9px] text-slate-500 truncate">{hhmm(c.date_publication)}</span>
          {pub ? <pub.Icon className="w-3 h-3 shrink-0" style={{ color: pub.color }} strokeWidth={2.5} />
               : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stOf(c.statut).sw }} />}
        </div>
        <span className="text-[10px] leading-[1.22] font-medium text-slate-200 line-clamp-2">{c.titre || c.contenu?.slice(0, 40) || t('planif.sansTitre')}</span>
      </motion.div>
    );
  };

  return (
    <div className="w-full space-y-5 pb-10">
      <PageHeader
        icon={Calendar}
        title={t('planif.titre')}
        subtitle={t('planif.sousTitre')}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] grid place-items-center hover:bg-white/[0.06] transition-colors"><ChevronLeft className="w-[18px] h-[18px]" /></button>
          <div className="text-lg font-semibold font-sora min-w-[150px] text-center">{t(`planif.${MOIS_KEYS[month]}`)} <span className="text-slate-500 font-medium">{year}</span></div>
          <button onClick={() => changeMonth(1)} className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] grid place-items-center hover:bg-white/[0.06] transition-colors"><ChevronRight className="w-[18px] h-[18px]" /></button>
          <button onClick={goToday} className="px-3.5 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-slate-400 hover:text-white hover:bg-white/[0.06] text-xs font-semibold font-inter transition-colors">{t('planif.aujourdhui')}</button>
        </div>
        <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          {[['mois', t('planif.vueMois')], ['liste', t('planif.vueListe')]].map(([id, lab]) => (
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
                {JOURS_KEYS.map((j) => <div key={j} className="px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-slate-600 font-semibold font-inter">{t(`planif.${j}`)}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-2 min-w-[640px]">
                {days.map((d, i) => {
                  const evs = d.out ? [] : forDate(d.date);
                  const isToday = !d.out && d.date.toDateString() === today.toDateString();
                  const cellDate = format(d.date, 'yyyy-MM-dd');
                  const isDropHover = hoverDate === cellDate;
                  return (
                    <div key={i} data-cal-date={cellDate}
                      className={`min-h-[116px] rounded-xl border p-2 flex flex-col gap-1.5 transition-all ${d.out ? 'bg-white/[0.01] border-white/[0.04] opacity-40' : 'bg-[#0a1120] border-white/[0.06] hover:border-white/10'} ${isToday ? 'ring-1 ring-[#5B6CFF]/55 border-[#5B6CFF]/55' : ''} ${isDropHover ? 'ring-2 ring-[#3AFFA3] border-[#3AFFA3] bg-[#3AFFA3]/[0.06] scale-[1.02]' : ''}`}>
                      <div className={`text-[12.5px] font-semibold font-inter ${isToday ? 'text-white' : 'text-slate-500'}`}>
                        {isToday ? <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center text-white text-[11px] inline-grid">{d.date.getDate()}</span> : d.date.getDate()}
                      </div>
                      {evs.slice(0, 3).map((c) => <Pill key={c.id} c={c} />)}
                      {evs.length > 3 && <div className="text-[10.5px] text-slate-500 px-1.5 font-medium">{t('planif.autresPlus', { n: evs.length - 3 })}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Légende publication */}
            <div className="mt-3.5 pt-3.5 border-t border-white/[0.06] flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-600 font-inter">{t('planif.legendeEtat')}</span>
              {Object.values(PUB).map((p) => (
                <div key={p.labelKey} className="flex items-center gap-1.5 text-xs text-slate-400 font-inter">
                  <p.Icon className="w-3.5 h-3.5" style={{ color: p.color }} strokeWidth={2.5} />{t(`planif.${p.labelKey}`)}
                </div>
              ))}
            </div>
          </div>

          {/* SIDEBAR */}
          <div className="space-y-4">
            {/* Mini-stats */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { n: stats.prog, c: '#22d3ee', l: t('planif.statProgrammes') },
                { n: stats.pub, c: '#34d399', l: t('planif.statPublies') },
                { n: stats.valid, c: '#fbbf24', l: t('planif.statAValider') },
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
                  <AlertTriangle className="w-4 h-4 text-[#fbbf24]" />{t('planif.aProgrammer')}
                  <span className="ml-auto text-[11px] text-slate-500 bg-white/[0.05] px-2 py-0.5 rounded-full">{aProgrammer.length}</span>
                </h3>
                <div className="divide-y divide-white/[0.06]">
                  {aProgrammer.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                      <Thumb c={c} className="w-10 h-10" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium text-slate-200 truncate">{c.titre || c.contenu?.slice(0, 40) || t('planif.sansTitre')}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{c.reseau_cible || '—'}{c.date_publication ? ` · ${new Date(c.date_publication).getDate()} ${t(`planif.${MOIS_COURT_KEYS[new Date(c.date_publication).getMonth()]}`)}` : ` · ${t('planif.pasDeDate')}`}</div>
                      </div>
                      <button onClick={() => openContenu(c)} title={t('planif.programmer')} className="w-8 h-8 rounded-lg border border-white/10 text-cyan-400 hover:bg-cyan-500/15 grid place-items-center shrink-0">
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
                <Clock className="w-4 h-4 text-[#8A6CFF]" />{t('planif.prochaines')}
                <span className="ml-auto text-[11px] text-slate-500 bg-white/[0.05] px-2 py-0.5 rounded-full">{upcoming.length}</span>
              </h3>
              {upcoming.length === 0 ? (
                <p className="text-slate-500 font-inter text-[12.5px] py-3 text-center">{t('planif.aucunePubAVenir')}</p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {upcoming.map((c) => {
                    const pub = pubOf(c.publish_status);
                    return (
                      <div key={c.id} onClick={() => openContenu(c)} className="flex items-center gap-3 py-2.5 first:pt-0 cursor-pointer hover:opacity-80">
                        <Thumb c={c} className="w-10 h-10" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-medium text-slate-200 truncate">{c.titre || c.contenu?.slice(0, 40) || t('planif.sansTitre')}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                            {pub && <pub.Icon className="w-3 h-3" style={{ color: pub.color }} strokeWidth={2.5} />}
                            {new Date(c.date_publication).getDate()} {t(`planif.${MOIS_COURT_KEYS[new Date(c.date_publication).getMonth()]}`)} · {hhmm(c.date_publication)} · {c.reseau_cible}
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
            <p className="text-center py-12 text-slate-500 font-inter text-sm">{t('planif.aucunContenuMois', { mois: t(`planif.${MOIS_KEYS[month]}`) })}</p>
          ) : moisContenus.map((c) => {
            const st = stOf(c.statut), net = netOf(c.reseau_cible);
            return (
              <div key={c.id} onClick={() => openContenu(c)} className="flex items-center gap-4 p-3 rounded-xl border border-white/[0.06] bg-[#0a1120] cursor-pointer hover:border-white/[0.15] transition-colors">
                <div className="text-center min-w-[46px]">
                  <div className="text-xl font-bold font-sora leading-none">{new Date(c.date_publication).getDate()}</div>
                  <div className="text-[10.5px] text-slate-500 uppercase mt-0.5">{t(`planif.${MOIS_COURT_KEYS[new Date(c.date_publication).getMonth()]}`)}</div>
                </div>
                <div className="w-[30px] h-[30px] rounded-lg grid place-items-center text-white shrink-0" style={net.style}><SocialIcon network={c.reseau_cible} className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-slate-200 truncate flex items-center gap-2">
                    <span className="truncate">{c.titre || c.contenu?.slice(0, 50)}</span>
                    {c.type === 'Story' && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#fbbf24]/15 text-[#fbbf24] shrink-0">Story · 24h</span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-slate-500 mt-0.5">{c.reseau_cible || '—'} · {hhmm(c.date_publication)}</div>
                </div>
                {pubOf(c.publish_status) && (() => { const p = pubOf(c.publish_status); return (
                  <span className="flex items-center gap-1 text-[10.5px] font-semibold px-2 py-1 rounded-full border shrink-0"
                    style={{ color: p.color, borderColor: `${p.color}55`, background: `${p.color}14` }}>
                    <p.Icon className="w-3 h-3" strokeWidth={2.5} />{t(`planif.${p.labelKey}`)}
                  </span>); })()}
                <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: st.bg, color: st.co }}>{t(`planif.${st.labelKey}`)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Prochaines publications (vue liste uniquement — en mois c'est dans la sidebar) */}
      {view === 'liste' && (
      <div>
        <h3 className="text-sm font-semibold font-sora mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-[#8A6CFF]" />{t('planif.prochainesPublications')}</h3>
        {upcoming.length === 0 ? (
          <p className="text-slate-500 font-inter text-sm">{t('planif.aucunePubPlanifiee')}</p>
        ) : (
          <div className="space-y-2.5">
            {upcoming.map((c) => {
              const st = stOf(c.statut), net = netOf(c.reseau_cible);
              return (
                <div key={c.id} onClick={() => openContenu(c)} className="flex items-center gap-4 p-3 rounded-2xl border border-white/[0.06] bg-[#0f172a] cursor-pointer hover:border-white/[0.15] transition-colors">
                  <div className="text-center min-w-[46px]">
                    <div className="text-xl font-bold font-sora leading-none">{new Date(c.date_publication).getDate()}</div>
                    <div className="text-[10.5px] text-slate-500 uppercase mt-0.5">{t(`planif.${MOIS_COURT_KEYS[new Date(c.date_publication).getMonth()]}`)}</div>
                  </div>
                  <div className="w-[30px] h-[30px] rounded-lg grid place-items-center text-white shrink-0" style={net.style}><SocialIcon network={c.reseau_cible} className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-slate-200 truncate">{c.titre || c.contenu?.slice(0, 50)}</div>
                    <div className="text-[11.5px] text-slate-500 mt-0.5">{c.reseau_cible || '—'} · {hhmm(c.date_publication)}</div>
                  </div>
                  <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.co }}>{t(`planif.${st.labelKey}`)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Sélecteur d'heure — apparaît à l'endroit du drop après un glisser-déposer sur le calendrier */}
      <AnimatePresence>
        {dropPending && (
          <>
            <motion.div
              key="drop-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !dropBusy && setDropPending(null)}
              className="fixed inset-0 z-[90]"
            />
            <motion.div
              key="drop-popover"
              initial={{ opacity: 0, scale: 0.85, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 6 }}
              transition={{ type: 'spring', damping: 22, stiffness: 320 }}
              style={{ position: 'fixed', left: dropPending.point.x - 130, top: dropPending.point.y, zIndex: 91 }}
              className="w-[260px] rounded-xl border border-[#5B6CFF]/40 bg-[#0f172a] shadow-2xl p-3.5 space-y-3"
            >
              <div className="text-[12.5px] font-semibold text-white font-sora flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#8A6CFF]" />
                {t('planif.replanifierAu', { date: format(parseISO(dropPending.dateStr), 'EEE d MMM', { locale: fr }) })}
              </div>
              <input
                type="time" step="300" autoFocus value={dropPending.time}
                onChange={(e) => setDropPending((p) => ({ ...p, time: e.target.value }))}
                className="w-full rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-2 outline-none focus:border-[#5B6CFF]/50"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setDropPending(null)} disabled={dropBusy}
                  className="flex-1 bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10">{t('planif.annuler')}</Button>
                <Button size="sm" onClick={commitDrop} disabled={dropBusy}
                  className="flex-1 bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white">
                  {dropBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('planif.confirmer')}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pop-up détail / programmation */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-[#0b1322] border-white/10 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white font-sora pr-6">{selected?.titre || t('planif.contenu')}</DialogTitle>
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
                    <span className="text-xs font-inter">{t('planif.aucunVisuel')}</span>
                  </div>
                )}
                {!(Array.isArray(selected.slides_images) && selected.slides_images.length) && (
                  <>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={importImage} />
                    <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing}
                      className="w-full bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10">
                      {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <ImageIcon className="w-4 h-4 mr-1.5" />}
                      {selected.lien_visuel ? t('planif.changerImage') : t('planif.importerImage')}
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
                    <span className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full border ${PUBLISH_BADGE[selected.publish_status].cls}`}>{t(`planif.${PUBLISH_BADGE[selected.publish_status].labelKey}`)}</span>
                  )}
                </div>
                <p className="text-[13px] text-slate-300 font-inter whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">{selected.contenu}</p>

                {/* Date picker */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-inter">{t('planif.datePublication')} <span className="text-slate-600">({tz.split('/').pop().replace('_', ' ')} · {tzAbbrev(tz)})</span></label>
                  <div className="flex gap-2 flex-wrap items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex-1 min-w-[150px] flex items-center gap-2 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-2 hover:border-[#5B6CFF]/50 transition-colors text-left">
                          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate">{dateVal?.split('T')[0] ? format(parseISO(dateVal.split('T')[0]), 'EEE d MMM yyyy', { locale: fr }) : t('planif.choisirDate')}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0 bg-[#0f172a] border-white/10">
                        <DayCalendar mode="single" locale={fr} initialFocus
                          selected={dateVal?.split('T')[0] ? parseISO(dateVal.split('T')[0]) : undefined}
                          disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                          onSelect={(d) => { if (d) setDateVal(`${format(d, 'yyyy-MM-dd')}T${(dateVal?.split('T')[1]) || '09:00'}`); }} />
                      </PopoverContent>
                    </Popover>
                    <input type="time" step="300" value={dateVal?.split('T')[1] || ''}
                      onChange={(e) => setDateVal(`${dateVal?.split('T')[0] || format(new Date(), 'yyyy-MM-dd')}T${e.target.value}`)}
                      className="w-[112px] rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-2 outline-none focus:border-[#5B6CFF]/50" />
                    <Button size="sm" onClick={saveDate} disabled={busy || !dateVal || utcToInput(selected.date_publication, tz) === dateVal}
                      className="bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10">{t('planif.enregistrer')}</Button>
                  </div>
                </div>

                {selected.publish_status === 'échec' && selected.publish_error && (
                  <p className="text-[12px] text-red-400 font-inter">{t('planif.echecDetail', { erreur: selected.publish_error })}</p>
                )}

                {/* Actions publication */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.statut !== 'Publie' && selected.reseau_cible
                    && ['', null, undefined, 'échec', 'annulé'].includes(selected.publish_status) && (
                    <Button size="sm" onClick={programmer} disabled={busy}
                      className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-500/30">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
                      {selected.publish_status === 'échec' ? t('planif.reessayer') : t('planif.programmer')}
                    </Button>
                  )}
                  {selected.statut !== 'Publie' && selected.reseau_cible && selected.publish_status !== 'publié' && (
                    <Button size="sm" onClick={replanifier} disabled={busy} data-testid="replanifier-btn"
                      title={t('planif.replanifierTooltip')}
                      className="bg-[#3AFFA3]/10 text-[#3AFFA3] hover:bg-[#3AFFA3]/20 border border-[#3AFFA3]/30">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                      {t('planif.replanifier')}
                    </Button>
                  )}
                  {['envoi', 'programmé'].includes(selected.publish_status) && (
                    <Button size="sm" onClick={annuler} disabled={busy}
                      className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <X className="w-4 h-4 mr-1.5" />}
                      {t('planif.annulerPublication')}
                    </Button>
                  )}
                  {selected.statut === 'Publie' && selected.lien_publication && (
                    <a href={selected.lien_publication} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" className="bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30">
                        <ExternalLink className="w-4 h-4 mr-1.5" />{t('planif.voirPost')}
                      </Button>
                    </a>
                  )}
                  <Button size="sm" onClick={supprimer} disabled={busy}
                    className="ml-auto bg-transparent text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent">
                    <Trash2 className="w-4 h-4 mr-1.5" />{t('planif.supprimerPost')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
