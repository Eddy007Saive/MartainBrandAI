import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Calendar, Loader2, ChevronLeft, ChevronRight, X, ExternalLink, Image as ImageIcon, Clock, Check, AlertTriangle, Ban, Send, Trash2, RefreshCw,
  Target, TrendingUp, Users, Pencil, Plus, CalendarClock, Lightbulb, Rocket, ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { contenuService } from '../services/contenuService';
import { agentService } from '../services/agentService';
import { analyticsService } from '../services/analyticsService';
import { useUser } from '../context/UserContext';
import { LogoReseau } from '../components/LogoReseau';
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

// Réseau d'un contenu (« LinkedIn », « Google Business »…) -> id de logo
const idReseau = (r) => (r || '').toLowerCase().replace(/\s+/g, '');
const RESEAUX_IDS = ['instagram', 'linkedin', 'facebook', 'tiktok', 'youtube', 'googlebusiness', 'twitter'];
// Couleurs des groupes de sujets (par objectif)
const COULEURS_GROUPES = ['#8A6CFF', '#38bdf8', '#3AFFA3', '#f472b6', '#fbbf24'];
// Hauteur d'une heure dans les vues semaine / jour
const HAUTEUR_HEURE = 48;
// Anneau de focus clavier commun
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70';

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
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  const [view, setView] = useState('mois'); // mois | semaine | jour
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

  // Légende des états de publication
  const Legende = () => (
    <div className="mt-3.5 pt-3.5 border-t border-white/[0.07] flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-[12px] text-slate-400 font-inter">{t('planif.legendeEtat')}</span>
      {Object.values(PUB).map((p) => (
        <span key={p.labelKey} className="flex items-center gap-1.5 text-[12px] text-slate-300 font-inter">
          <p.Icon className="w-3.5 h-3.5" style={{ color: p.color }} strokeWidth={2.5} aria-hidden="true" />{t(`planif.${p.labelKey}`)}
        </span>
      ))}
    </div>
  );

  // --- Période affichée (mois / semaine / jour) ---
  const debutSemaine = useMemo(() => {
    const d = new Date(current); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }, [current]);
  const joursVue = useMemo(() => (view === 'jour'
    ? [new Date(current.getFullYear(), current.getMonth(), current.getDate())]
    : Array.from({ length: 7 }, (_, i) => { const d = new Date(debutSemaine); d.setDate(debutSemaine.getDate() + i); return d; })), [view, current, debutSemaine]);
  const changePeriode = (dir) => {
    if (view === 'mois') setCurrent(new Date(year, month + dir, 1));
    else { const d = new Date(current); d.setDate(d.getDate() + dir * (view === 'semaine' ? 7 : 1)); setCurrent(d); }
  };
  const goToday = () => { setCurrent(new Date()); };
  const langue = i18n.resolvedLanguage || i18n.language || 'fr';
  const libellePeriode = view === 'mois'
    ? <>{t(`planif.${MOIS_KEYS[month]}`)} <span className="text-slate-400 font-medium">{year}</span></>
    : view === 'semaine'
      ? t('planif.semaineDu', { date: debutSemaine.toLocaleDateString(langue, { day: 'numeric', month: 'long' }) })
      : current.toLocaleDateString(langue, { weekday: 'long', day: 'numeric', month: 'long' });
  const heureDe = (c) => (c.date_publication ? Number(utcToInput(c.date_publication, tz).split('T')[1].slice(0, 2)) : -1);
  // Grille horaire : on fait défiler jusqu'à 7 h à l'ouverture (les heures de nuit restent accessibles)
  const grilleRef = useRef(null);
  useEffect(() => {
    if ((view === 'semaine' || view === 'jour') && grilleRef.current) grilleRef.current.scrollTop = 7 * HAUTEUR_HEURE;
  }, [view, loading]);

  // --- Données des blocs (plan du mois, statistiques, sujets) ---
  const [plan, setPlan] = useState([]);
  const [insights, setInsights] = useState(null);
  const [sujets, setSujets] = useState([]);
  useEffect(() => {
    agentService.plan(year, month + 1).then((d) => setPlan(d.plan || [])).catch(() => setPlan([]));
  }, [year, month]);
  useEffect(() => {
    analyticsService.insights(30).then(setInsights).catch(() => setInsights(null));
    agentService.sujetsList().then((d) => setSujets(d || [])).catch(() => {});
  }, []);
  const objectifs = useMemo(() => ({
    needed: plan.reduce((a, p) => a + p.needed, 0),
    filled: plan.reduce((a, p) => a + p.filled, 0),
    done: plan.filter((p) => p.remaining === 0).length,
  }), [plan]);
  const reseauxConnectes = RESEAUX_IDS.filter((id) => !!user?.[`late_account_${id}`]);
  const engagement = useMemo(() => {
    if (!insights?.ok || !insights.connected || insights.addon_required) return null;
    const tot = insights.comparaison?.totals || insights.kpis || {};
    const prev = insights.comparaison?.previousTotals;
    const taux = Number(tot.engagementRate || 0);
    const variation = prev && Number(prev.engagementRate) ? Math.round(((taux - Number(prev.engagementRate)) / Number(prev.engagementRate)) * 100) : null;
    const serie = (insights.serie || []).filter((r) => r.date).sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((r) => Number(r.engagement ?? ((r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0))) || 0);
    return { taux, variation, serie };
  }, [insights]);
  const creneaux = (insights?.creneaux || []).slice(0, 3);
  const groupesSujets = useMemo(() => {
    const m = new Map();
    for (const s of sujets) { const k = s.dimensions?.objectif || t('planif.autres'); m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sujets, t]);
  const prochains = useMemo(() => contenus
    .filter((c) => c.date_publication && new Date(c.date_publication) >= new Date())
    .sort((a, b) => new Date(a.date_publication) - new Date(b.date_publication))
    .slice(0, 6), [contenus]);
  const supprimerLigne = async (c) => {
    if (!window.confirm(t('planif.confirmSuppression'))) return;
    try {
      await contenuService.remove(c.id);
      setContenus((prev) => prev.filter((x) => x.id !== c.id));
      toast.success(t('planif.postSupprime'));
    } catch (e) { toast.error(e.response?.data?.detail || t('planif.echecSuppression')); }
  };

  // Vignette : visuel du post si dispo, sinon logo du réseau
  const Thumb = ({ c, className = '' }) => {
    const visual = c.lien_visuel || (Array.isArray(c.slides_images) && c.slides_images[0]);
    if (visual) return (
      <span className={`relative rounded-lg overflow-hidden bg-cover bg-center shrink-0 ring-1 ring-white/10 ${className}`} style={{ backgroundImage: `url(${visual})` }}>
        <LogoReseau id={idReseau(c.reseau_cible)} className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-[4px] ring-2 ring-[#0b1326]" />
      </span>
    );
    return <LogoReseau id={idReseau(c.reseau_cible)} className={`rounded-lg ${className}`} />;
  };
  const formatDe = (c) => (c.type === 'Story' ? 'Story' : Array.isArray(c.slides_images) && c.slides_images.length ? t('planif.formatCarrousel')
    : c.video_url || c.type === 'Reel' ? t('planif.formatVideo') : t('planif.formatPost'));
  const EtatChip = ({ c }) => {
    const pub = pubOf(c.publish_status);
    if (pub) return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: pub.color, background: `${pub.color}1f` }}>
        <pub.Icon className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />{t(`planif.${pub.labelKey}`)}
      </span>
    );
    const st = stOf(c.statut);
    return <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: st.bg, color: st.co }}>{t(`planif.${st.labelKey}`)}</span>;
  };

  // Contenu déplaçable (glisser-déposer pour replanifier) — compact (mois) ou carte (semaine / jour)
  const Pill = ({ c, carteHoraire = false }) => {
    const pub = pubOf(c.publish_status);
    const justDragged = useRef(false);
    const cible = (point) => document.elementFromPoint(point.x, point.y)?.closest('[data-cal-cle]');
    const ouvrir = () => { if (!justDragged.current) openContenu(c); };
    return (
      <motion.div
        layout
        layoutId={`pill-${c.id}`}
        transition={{ type: 'spring', damping: 24, stiffness: 340 }}
        drag
        dragSnapToOrigin
        dragElastic={0.18}
        dragMomentum={false}
        whileDrag={{ scale: 1.06, zIndex: 60, boxShadow: '0 18px 44px rgba(0,0,0,.55)', cursor: 'grabbing' }}
        onDrag={(e, info) => setHoverDate(cible(info.point)?.getAttribute('data-cal-cle') || null)}
        onDragEnd={(e, info) => {
          setHoverDate(null);
          if (Math.hypot(info.offset.x, info.offset.y) <= 6) return;
          justDragged.current = true;
          setTimeout(() => { justDragged.current = false; }, 250);
          const cell = cible(info.point);
          const newDate = cell?.getAttribute('data-cal-date');
          if (!newDate) return;
          const heureCase = cell.getAttribute('data-cal-heure');
          const ancienne = c.date_publication ? utcToInput(c.date_publication, tz).split('T')[1] : '09:00';
          const time = heureCase != null ? `${String(heureCase).padStart(2, '0')}:${ancienne.slice(3, 5)}` : ancienne;
          const curDate = c.date_publication ? format(new Date(c.date_publication), 'yyyy-MM-dd') : null;
          if (newDate === curDate && time === ancienne) return;
          const x = Math.min(Math.max(info.point.x, 130), window.innerWidth - 130);
          const y = Math.min(info.point.y, window.innerHeight - 200);
          setDropPending({ contenu: c, dateStr: newDate, time, point: { x, y } });
        }}
        onClick={(e) => { e.stopPropagation(); ouvrir(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }}
        role="button" tabIndex={0}
        aria-label={`${c.titre || t('planif.sansTitre')} · ${c.reseau_cible || ''} · ${hhmm(c.date_publication)}`}
        title={`${c.titre || ''}${pub ? ` · ${t(`planif.${pub.labelKey}`)}` : ''} · ${t('planif.glisseReplanifier')}`}
        className={`w-full flex flex-col gap-1 rounded-lg border text-left cursor-grab active:cursor-grabbing transition-colors ${FOCUS} ${carteHoraire ? 'px-2 py-1.5 border-white/[0.1] bg-[#16203a] hover:bg-[#1c2848]' : 'px-1.5 py-1.5 border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]'}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <LogoReseau id={idReseau(c.reseau_cible)} className={carteHoraire ? 'w-[18px] h-[18px] rounded-[5px]' : 'w-4 h-4 rounded-[4px]'} />
          <span className={`flex-1 min-w-0 truncate ${carteHoraire ? 'text-[11.5px] font-semibold text-white' : 'text-[10.5px] text-slate-300'}`}>{carteHoraire ? formatDe(c) : hhmm(c.date_publication)}</span>
          {pub ? <pub.Icon className="w-3 h-3 shrink-0" style={{ color: pub.color }} strokeWidth={2.5} aria-hidden="true" />
            : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stOf(c.statut).sw }} aria-hidden="true" />}
        </div>
        <span className={`leading-[1.25] text-slate-200 line-clamp-2 ${carteHoraire ? 'text-[11px]' : 'text-[10.5px] font-medium'}`}>{c.titre || c.contenu?.slice(0, 40) || t('planif.sansTitre')}</span>
      </motion.div>
    );
  };

  const carte = 'rounded-2xl border border-white/[0.08] bg-[#0b1326]';
  const lienCarte = `text-[12.5px] font-semibold text-[#c9c1ff] hover:text-white whitespace-nowrap rounded ${FOCUS}`;
  const max = engagement?.serie?.length ? Math.max(...engagement.serie, 1) : 1;
  const courbe = engagement?.serie?.length > 1
    ? engagement.serie.map((v, i) => `${(i / (engagement.serie.length - 1)) * 96 + 2},${34 - (v / max) * 30}`).join(' ')
    : null;

  return (
    <div className="w-full space-y-5 pb-10">
      {/* ─── En-tête ─── */}
      <header className="flex flex-wrap items-center gap-4">
        <span className="w-12 h-12 rounded-xl bg-[#5a4ae8] grid place-items-center text-white flex-none" aria-hidden="true"><Calendar className="w-6 h-6" /></span>
        <div className="min-w-0">
          <h1 className="font-sora font-extrabold text-[26px] sm:text-[30px] leading-tight text-white tracking-tight">{t('planif.titre')}</h1>
          <p className="text-[14.5px] text-slate-300 font-inter">{t('planif.sousTitre')}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          {/* ─── Barre d'outils ─── */}
          <div className={`${carte} flex items-center gap-x-4 gap-y-3 flex-wrap px-4 py-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => changePeriode(-1)} aria-label={t('planif.precedent')} className={`w-9 h-9 rounded-lg border border-white/15 grid place-items-center hover:bg-white/[0.06] ${FOCUS}`}><ChevronLeft className="w-[18px] h-[18px]" /></button>
              <h2 className="font-sora font-semibold text-[18px] text-white sm:min-w-[170px] text-center first-letter:uppercase" aria-live="polite">{libellePeriode}</h2>
              <button type="button" onClick={() => changePeriode(1)} aria-label={t('planif.suivant')} className={`w-9 h-9 rounded-lg border border-white/15 grid place-items-center hover:bg-white/[0.06] ${FOCUS}`}><ChevronRight className="w-[18px] h-[18px]" /></button>
              <button type="button" onClick={goToday} className={`px-3 py-2 rounded-lg border border-white/15 text-slate-200 hover:text-white hover:bg-white/[0.06] text-[12.5px] font-semibold font-inter ${FOCUS}`}>{t('planif.aujourdhui')}</button>
            </div>
            <p className="text-[12.5px] text-slate-300 font-inter">{t('planif.resumeMois', { prog: stats.prog, pub: stats.pub, valid: stats.valid })}</p>
            <div className="ml-auto flex gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08]" role="group" aria-label={t('planif.vue')}>
              {[['mois', t('planif.vueMois')], ['semaine', t('planif.vueSemaine')], ['jour', t('planif.vueJour')]].map(([id, lab]) => (
                <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id}
                  className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${FOCUS} ${view === id ? 'bg-[#5a4ae8] text-white' : 'text-slate-300 hover:text-white'}`}>{lab}</button>
              ))}
            </div>
          </div>

          {/* ─── Chiffres du mois ─── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link to="/dashboard/plan" className={`${carte} p-4 flex gap-3 hover:border-white/20 transition-colors ${FOCUS}`}>
              <span className="w-10 h-10 rounded-xl bg-[#3AFFA3]/12 grid place-items-center text-[#3AFFA3] flex-none" aria-hidden="true"><Target className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1 font-inter">
                <span className="block text-[13px] text-slate-300">{t('planif.objectifsMois')}</span>
                <span className="block text-[22px] font-bold font-sora text-white tabular-nums">{objectifs.filled}<span className="text-slate-400 text-[16px] font-medium"> / {objectifs.needed || 0}</span></span>
                <span className="block h-1.5 mt-1 rounded-full bg-white/[0.08] overflow-hidden" aria-hidden="true"><span className="block h-full rounded-full bg-[#2fd393]" style={{ width: `${objectifs.needed ? Math.min(100, Math.round((objectifs.filled / objectifs.needed) * 100)) : 0}%` }} /></span>
                <span className="block text-[12px] text-slate-400 mt-1.5">{t('planif.reseauxBouclesN', { done: objectifs.done, total: plan.length })}</span>
              </span>
            </Link>
            <Link to="/dashboard/performance" className={`${carte} p-4 flex gap-3 hover:border-white/20 transition-colors ${FOCUS}`}>
              <span className="w-10 h-10 rounded-xl bg-[#8A6CFF]/15 grid place-items-center text-[#c9c1ff] flex-none" aria-hidden="true"><TrendingUp className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1 font-inter">
                <span className="block text-[13px] text-slate-300">{t('planif.engagement30j')}</span>
                {engagement ? (
                  <>
                    <span className="flex items-end justify-between gap-2">
                      <span className="text-[22px] font-bold font-sora text-white tabular-nums">{engagement.taux.toLocaleString(langue)} %</span>
                      {courbe && <svg viewBox="0 0 100 36" className="w-[90px] h-[32px]" aria-hidden="true"><polyline points={courbe} fill="none" stroke="#3AFFA3" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>}
                    </span>
                    <span className="block text-[12px] mt-1">
                      {engagement.variation == null ? <span className="text-slate-400">{t('planif.pasDeComparaison')}</span>
                        : <span className={engagement.variation >= 0 ? 'text-[#7ff5c4]' : 'text-red-300'}>{engagement.variation >= 0 ? '+' : ''}{engagement.variation} % <span className="text-slate-400">{t('planif.vsPeriodePrecedente')}</span></span>}
                    </span>
                  </>
                ) : (
                  <span className="block text-[12.5px] text-slate-300 mt-1">{t('planif.analyticsAConnecter')} <span className="text-[#c9c1ff]">→</span></span>
                )}
              </span>
            </Link>
            <Link to="/dashboard/parametres" className={`${carte} p-4 flex gap-3 hover:border-white/20 transition-colors ${FOCUS}`}>
              <span className="w-10 h-10 rounded-xl bg-sky-400/12 grid place-items-center text-sky-300 flex-none" aria-hidden="true"><Users className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1 font-inter">
                <span className="block text-[13px] text-slate-300">{t('planif.reseauxActifs')}</span>
                <span className="flex flex-wrap gap-1.5 mt-1.5">
                  {reseauxConnectes.length ? reseauxConnectes.map((id) => <LogoReseau key={id} id={id} className="w-7 h-7 rounded-lg" />)
                    : <span className="text-[12.5px] text-amber-200">{t('planif.aucunReseau')}</span>}
                </span>
                <span className="block text-[12px] text-slate-400 mt-1.5">{t('planif.nReseauxConnectes', { count: reseauxConnectes.length })}</span>
              </span>
            </Link>
          </div>

          {/* ─── Calendrier ─── */}
          {loading ? (
            <div className={`${carte} flex items-center justify-center py-24`}><Loader2 className="w-8 h-8 animate-spin text-[#8A6CFF]" /></div>
          ) : view === 'mois' ? (
            <div className={`${carte} p-3.5`}>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 gap-2 mb-2 min-w-[640px]">
                  {JOURS_KEYS.map((j) => <div key={j} className="px-2.5 py-0.5 text-[12px] text-slate-300 font-semibold font-inter">{t(`planif.${j}`)}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-2 min-w-[640px]">
                  {days.map((d, i) => {
                    const evs = d.out ? [] : forDate(d.date);
                    const isToday = !d.out && d.date.toDateString() === today.toDateString();
                    const cellDate = format(d.date, 'yyyy-MM-dd');
                    const isDropHover = hoverDate === cellDate;
                    return (
                      <div key={i} data-cal-date={cellDate} data-cal-cle={cellDate}
                        className={`min-h-[116px] rounded-xl border p-2 flex flex-col gap-1.5 transition-colors ${d.out ? 'bg-white/[0.01] border-white/[0.04] opacity-40' : 'bg-[#0a1120] border-white/[0.07] hover:border-white/15'} ${isToday ? 'border-[#8A6CFF]/70' : ''} ${isDropHover ? 'ring-2 ring-[#3AFFA3] border-[#3AFFA3] bg-[#3AFFA3]/[0.06]' : ''}`}>
                        <div className={`text-[12.5px] font-semibold font-inter ${isToday ? 'text-white' : 'text-slate-300'}`}>
                          {isToday ? <span className="w-5 h-5 rounded-full bg-[#5a4ae8] text-white text-[11px] inline-grid place-items-center">{d.date.getDate()}</span> : d.date.getDate()}
                        </div>
                        {evs.slice(0, 3).map((c) => <Pill key={c.id} c={c} />)}
                        {evs.length > 3 && (
                          <button type="button" onClick={() => { setCurrent(d.date); setView('jour'); }} className={`text-[11px] text-slate-300 hover:text-white px-1.5 font-medium text-left rounded ${FOCUS}`}>{t('planif.autresPlus', { n: evs.length - 3 })}</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <Legende />
            </div>
          ) : (
            <div className={`${carte} p-3.5`}>
              <div className="overflow-x-auto">
                <div className={view === 'semaine' ? 'min-w-[760px]' : ''}>
                  <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: `52px repeat(${joursVue.length}, minmax(0,1fr))` }}>
                    <span />
                    {joursVue.map((d) => {
                      const auj = d.toDateString() === today.toDateString();
                      return (
                        <button key={d.toISOString()} type="button" onClick={() => { setCurrent(d); setView('jour'); }} disabled={view === 'jour'}
                          className={`text-center rounded-lg py-1 font-inter ${FOCUS} ${auj ? 'bg-[#5a4ae8]/25' : ''}`}>
                          <span className="block text-[12px] text-slate-300 capitalize">{d.toLocaleDateString(langue, { weekday: view === 'jour' ? 'long' : 'short' }).replace('.', '')}</span>
                          <span className={`block text-[17px] font-semibold font-sora ${auj ? 'text-white' : 'text-slate-200'}`}>{d.getDate()}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div ref={grilleRef} className="max-h-[620px] overflow-y-auto overscroll-contain [scrollbar-width:thin] rounded-xl border border-white/[0.07]">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="grid gap-1.5 border-b border-white/[0.05] last:border-b-0" style={{ gridTemplateColumns: `52px repeat(${joursVue.length}, minmax(0,1fr))`, minHeight: HAUTEUR_HEURE }}>
                        <span className="text-[11.5px] text-slate-400 font-inter tabular-nums pt-1.5 pl-2">{String(h).padStart(2, '0')}:00</span>
                        {joursVue.map((d) => {
                          const cellDate = format(d, 'yyyy-MM-dd');
                          const cle = `${cellDate}@${h}`;
                          const evs = forDate(d).filter((c) => heureDe(c) === h);
                          return (
                            <div key={cle} data-cal-date={cellDate} data-cal-heure={h} data-cal-cle={cle}
                              className={`p-1 flex flex-col gap-1 border-l border-white/[0.05] transition-colors ${hoverDate === cle ? 'bg-[#3AFFA3]/[0.08] ring-1 ring-inset ring-[#3AFFA3]' : ''}`}>
                              {evs.map((c) => <Pill key={c.id} c={c} carteHoraire />)}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <Legende />
            </div>
          )}

          {/* ─── Prochains contenus ─── */}
          <section className={`${carte} p-4`} aria-labelledby="planif-prochains">
            <div className="flex items-center gap-2 mb-3">
              <h2 id="planif-prochains" className="font-sora font-bold text-[16px] text-white">{t('planif.prochainsContenus')}</h2>
              <Link to="/dashboard/contenus" className={`ml-auto ${lienCarte}`}>{t('planif.voirTousContenus')} →</Link>
            </div>
            {prochains.length === 0 ? (
              <p className="text-[13.5px] text-slate-300 font-inter py-4 text-center">{t('planif.aucunePubAVenir')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left font-inter">
                  <thead>
                    <tr className="text-[12px] text-slate-400">
                      <th scope="col" className="font-medium pb-2 pr-3">{t('planif.colDate')}</th>
                      <th scope="col" className="font-medium pb-2 pr-3">{t('planif.colContenu')}</th>
                      <th scope="col" className="font-medium pb-2 pr-3">{t('planif.colReseau')}</th>
                      <th scope="col" className="font-medium pb-2 pr-3">{t('planif.colStatut')}</th>
                      <th scope="col" className="font-medium pb-2 text-right">{t('planif.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {prochains.map((c) => (
                      <tr key={c.id} className="text-[13px]">
                        <td className="py-2.5 pr-3 text-slate-200 whitespace-nowrap tabular-nums">{new Date(c.date_publication).toLocaleDateString(langue, { weekday: 'short', day: 'numeric', month: 'short' })} · {hhmm(c.date_publication)}</td>
                        <td className="py-2.5 pr-3">
                          <button type="button" onClick={() => openContenu(c)} className={`flex items-center gap-2.5 text-left rounded-lg min-w-0 ${FOCUS}`}>
                            <Thumb c={c} className="w-9 h-9" />
                            <span className="min-w-0">
                              <span className="block text-white font-medium truncate max-w-[260px]">{c.titre || c.contenu?.slice(0, 50) || t('planif.sansTitre')}</span>
                              <span className="block text-[12px] text-slate-400">{formatDe(c)}</span>
                            </span>
                          </button>
                        </td>
                        <td className="py-2.5 pr-3"><LogoReseau id={idReseau(c.reseau_cible)} className="w-7 h-7 rounded-lg" /></td>
                        <td className="py-2.5 pr-3"><EtatChip c={c} /></td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <button type="button" onClick={() => openContenu(c)} aria-label={`${t('planif.modifier')} : ${c.titre || ''}`} title={t('planif.modifier')}
                            className={`p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 ${FOCUS}`}><Pencil className="w-4 h-4" /></button>
                          <button type="button" onClick={() => supprimerLigne(c)} aria-label={`${t('planif.supprimerPost')} : ${c.titre || ''}`} title={t('planif.supprimerPost')}
                            className={`p-2 rounded-lg text-slate-300 hover:text-red-300 hover:bg-white/5 ${FOCUS}`}><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ─── Colonne droite ─── */}
        <aside className="flex flex-col gap-4 min-w-0">
          <Link to="/dashboard/studio" className={`flex items-center justify-center gap-2 h-12 rounded-xl bg-[#5a4ae8] hover:bg-[#6757f0] text-white font-semibold font-inter text-[14.5px] ${FOCUS}`}>
            <Plus className="w-5 h-5" aria-hidden="true" />{t('planif.genererSujets')}
          </Link>

          <section className={`${carte} p-4 flex gap-3`} aria-labelledby="planif-creneaux">
            <span className="w-10 h-10 rounded-xl bg-[#8A6CFF]/15 grid place-items-center text-[#c9c1ff] flex-none" aria-hidden="true"><CalendarClock className="w-5 h-5" /></span>
            <div className="min-w-0 font-inter">
              <h2 id="planif-creneaux" className="font-sora font-bold text-[14.5px] text-white">{t('planif.planifierFacilement')}</h2>
              {creneaux.length ? (
                <>
                  <p className="text-[12.5px] text-slate-300 mt-0.5">{t('planif.meilleursCreneaux')}</p>
                  <ul className="flex flex-wrap gap-1.5 mt-2">
                    {creneaux.map((c) => (
                      <li key={`${c.jour}-${c.heure}`} className="text-[12px] text-white bg-white/[0.07] rounded-md px-2 py-0.5 tabular-nums">
                        {new Date(Date.UTC(2026, 0, 5 + c.jour)).toLocaleDateString(langue, { weekday: 'short', timeZone: 'UTC' }).replace('.', '')} {String(c.heure).padStart(2, '0')}h
                      </li>
                    ))}
                  </ul>
                  <Link to="/dashboard/performance" className={`inline-block mt-2 ${lienCarte}`}>{t('planif.voirPerformances')} →</Link>
                </>
              ) : (
                <>
                  <p className="text-[12.5px] text-slate-300 mt-0.5">{t('planif.creneauxCadence')}</p>
                  <Link to="/dashboard/parametres" className={`inline-block mt-2 ${lienCarte}`}>{t('planif.reglerCreneaux')} →</Link>
                </>
              )}
            </div>
          </section>

          {aProgrammer.length > 0 && (
            <section className={`${carte} p-4`} aria-labelledby="planif-a-programmer">
              <h2 id="planif-a-programmer" className="font-sora font-bold text-[14.5px] text-white flex items-center gap-2 mb-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-300" aria-hidden="true" />{t('planif.aProgrammer')}
                <span className="ml-auto text-[12px] text-slate-200 bg-white/[0.07] px-2 py-0.5 rounded-full">{aProgrammer.length}</span>
              </h2>
              <ul className="divide-y divide-white/[0.06]">
                {aProgrammer.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => openContenu(c)} className={`w-full flex items-center gap-2.5 py-2 text-left rounded-lg hover:bg-white/[0.03] ${FOCUS}`}>
                      <Thumb c={c} className="w-9 h-9" />
                      <span className="flex-1 min-w-0 font-inter">
                        <span className="block text-[13px] text-white truncate">{c.titre || c.contenu?.slice(0, 40) || t('planif.sansTitre')}</span>
                        <span className="block text-[12px] text-slate-400">{c.date_publication ? `${new Date(c.date_publication).getDate()} ${t(`planif.${MOIS_COURT_KEYS[new Date(c.date_publication).getMonth()]}`)}` : t('planif.pasDeDate')}{c.publish_status === 'échec' ? ` · ${t('planif.pubEchec')}` : ''}</span>
                      </span>
                      <span className="text-[12px] font-semibold text-[#c9c1ff] flex-none">{t('planif.programmer')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${carte} p-4`} aria-labelledby="planif-sujets">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-amber-300" aria-hidden="true" />
              <h2 id="planif-sujets" className="font-sora font-bold text-[14.5px] text-white">{t('planif.sujetsATraiter')}</h2>
              <Link to="/dashboard/studio" className={`ml-auto ${lienCarte}`}>{t('planif.voirTout')} →</Link>
            </div>
            {groupesSujets.length === 0 ? (
              <p className="text-[12.5px] text-slate-300 font-inter">{t('planif.aucunSujetReserve')} <Link to="/dashboard/studio" className="text-[#c9c1ff] hover:text-white underline">{t('planif.genererSujets')}</Link></p>
            ) : (
              <ul className="flex flex-col gap-1.5 font-inter">
                {groupesSujets.map(([nom, n], i) => (
                  <li key={nom} className="flex items-center gap-2.5 text-[13px]">
                    <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: COULEURS_GROUPES[i % COULEURS_GROUPES.length] }} aria-hidden="true" />
                    <span className="text-slate-100 truncate">{nom}</span>
                    <span className="ml-auto text-slate-400 tabular-nums">{t('planif.nSujets', { count: n })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {plan.length > 0 && (
            <section className={`${carte} p-4`} aria-labelledby="planif-reseaux">
              <div className="flex items-center gap-2 mb-2.5">
                <h2 id="planif-reseaux" className="font-sora font-bold text-[14.5px] text-white">{t('planif.reseauxTitre')}</h2>
                <Link to="/dashboard/plan" className={`ml-auto ${lienCarte}`}>{t('planif.voirTout')} →</Link>
              </div>
              <ul className="flex flex-col gap-2.5">
                {plan.map((p) => (
                  <li key={p.platform} className="flex items-center gap-2.5 font-inter">
                    <LogoReseau id={p.platform} className="w-7 h-7 rounded-lg" />
                    <span className="flex-1 h-2 rounded-full bg-white/[0.08] overflow-hidden" role="progressbar" aria-label={p.label} aria-valuemin={0} aria-valuemax={p.needed} aria-valuenow={p.filled}>
                      <span className={`block h-full rounded-full ${p.remaining === 0 ? 'bg-[#3AFFA3]' : 'bg-[#8A6CFF]'}`} style={{ width: `${p.needed ? Math.min(100, Math.round((p.filled / p.needed) * 100)) : 0}%` }} />
                    </span>
                    <span className="text-[12.5px] text-slate-200 tabular-nums w-11 text-right">{p.filled}/{p.needed}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${carte} p-4 flex gap-3`} aria-labelledby="planif-evenement">
            <span className="w-10 h-10 rounded-xl bg-[#5a4ae8]/30 grid place-items-center text-[#c9c1ff] flex-none" aria-hidden="true"><Rocket className="w-5 h-5" /></span>
            <div className="min-w-0 font-inter">
              <h2 id="planif-evenement" className="font-sora font-bold text-[14.5px] text-white">{t('planif.evenementTitre')}</h2>
              <p className="text-[12.5px] text-slate-300 mt-0.5">{t('planif.evenementTexte')}</p>
              <Link to="/dashboard/coach" className={`inline-flex items-center gap-1.5 mt-2.5 text-[13px] font-semibold text-white bg-[#5a4ae8] hover:bg-[#6757f0] rounded-lg px-3 py-1.5 ${FOCUS}`}>{t('planif.evenementBouton')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
            </div>
          </section>
        </aside>
      </div>

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
                  <LogoReseau id={idReseau(selected.reseau_cible)} className="w-6 h-6 rounded-md" />
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
