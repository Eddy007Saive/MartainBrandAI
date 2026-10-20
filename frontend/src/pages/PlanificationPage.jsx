import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Calendar, Loader2, ChevronLeft, ChevronRight, X, ExternalLink, Image as ImageIcon, Clock, Check, AlertTriangle, Ban, Trash2, RefreshCw,
  Target, TrendingUp, Pencil, Plus, CalendarClock, Lightbulb, Rocket, ArrowRight, CheckCircle2, CircleDot, Circle, MousePointerClick,
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
import { fr, enUS, es } from 'date-fns/locale';

const JOURS_KEYS = ['jours0', 'jours1', 'jours2', 'jours3', 'jours4', 'jours5', 'jours6'];
const MOIS_KEYS = ['mois0', 'mois1', 'mois2', 'mois3', 'mois4', 'mois5', 'mois6', 'mois7', 'mois8', 'mois9', 'mois10', 'mois11'];
const LOCALES_DATE = { fr, en: enUS, es };

// Un seul vocabulaire d'état, toujours icône + texte (jamais la couleur seule).
// L'état d'envoi (Zernio) prime sur le statut éditorial.
const ETATS = {
  publie:    { Icon: CheckCircle2,  color: '#6ee7b7', labelKey: 'etatPublie' },
  programme: { Icon: Clock,         color: '#a5b4fc', labelKey: 'etatProgramme' },
  partiel:   { Icon: AlertTriangle, color: '#fcd34d', labelKey: 'etatPartiel' },
  echec:     { Icon: AlertTriangle, color: '#fca5a5', labelKey: 'etatEchec' },
  annule:    { Icon: Ban,           color: '#cbd5e1', labelKey: 'etatAnnule' },
  aValider:  { Icon: CircleDot,     color: '#fcd770', labelKey: 'etatAValider' },
  valide:    { Icon: Check,         color: '#c4b5fd', labelKey: 'etatValide' },
  brouillon: { Icon: Circle,        color: '#cbd5e1', labelKey: 'etatBrouillon' },
};
const cleEtat = (c) => {
  if (c.publish_status === 'publié' || c.statut === 'Publie') return 'publie';
  if (c.publish_status === 'échec') return 'echec';
  if (c.publish_status === 'partiel') return 'partiel';
  if (['programmé', 'programme', 'envoi'].includes(c.publish_status)) return 'programme';
  if (c.publish_status === 'annulé') return 'annule';
  if (c.statut === 'A valider') return 'aValider';
  if (c.statut === 'Valider') return 'valide';
  return 'brouillon';
};
const etatDe = (c) => ETATS[cleEtat(c)];
// Contenu déjà envoyé à la publication : le déplacer le reprogramme sur le réseau
const estProgramme = (c) => ['envoi', 'programmé', 'programme'].includes(c.publish_status);
const estProgrammable = (c) => c.statut === 'Valider' || ['envoi', 'programmé', 'programme', 'échec', 'annulé'].includes(c.publish_status);

// Réseau d'un contenu (« LinkedIn », « Google Business »…) -> id de logo
const idReseau = (r) => (r || '').toLowerCase().replace(/\s+/g, '');
const RESEAUX_IDS = ['instagram', 'linkedin', 'facebook', 'tiktok', 'youtube', 'googlebusiness', 'twitter'];
const NOMS_RESEAUX = { instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', googlebusiness: 'Fiche Google', twitter: 'X' };
// Couleurs des groupes de sujets (par objectif)
const COULEURS_GROUPES = ['#8A6CFF', '#38bdf8', '#3AFFA3', '#f472b6', '#fbbf24'];
// Hauteur d'une heure dans la vue semaine
const HAUTEUR_HEURE = 48;
// Anneau de focus clavier commun
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70';
const CLE_ASTUCE = 'planif-astuce-vue';

export default function PlanificationPage() {
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const sansAnimation = useReducedMotion();
  const langue = i18n.resolvedLanguage || i18n.language || 'fr';
  const localeDate = LOCALES_DATE[langue.slice(0, 2)] || fr;
  // Écran tactile : pas de glisser (il gênerait le défilement), on touche pour ouvrir la fiche
  const tactile = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const petitEcran = typeof window !== 'undefined' && window.innerWidth < 768;

  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  // mois | semaine | jour | liste — sur téléphone on ouvre l'agenda en liste
  const [view, setView] = useState(petitEcran ? 'liste' : 'mois');
  const [filtreReseau, setFiltreReseau] = useState('');
  const [selected, setSelected] = useState(null);
  const [dateVal, setDateVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const [astuceVue, setAstuceVue] = useState(() => { try { return localStorage.getItem(CLE_ASTUCE) === '1'; } catch (e) { return false; } });
  const masquerAstuce = () => { setAstuceVue(true); try { localStorage.setItem(CLE_ASTUCE, '1'); } catch (e) { /* stockage indisponible */ } };

  // Glisser-déposer : case survolée + fenêtre de confirmation à l'endroit du dépôt.
  // `placer` : clic sur une case vide -> on choisit le contenu « à programmer » à y placer.
  const [hoverDate, setHoverDate] = useState(null);
  const [dropPending, setDropPending] = useState(null); // { contenu, dateStr, time, point:{x,y} } ou { placer:true, dateStr, time, point }
  const [dropBusy, setDropBusy] = useState(false);
  const dropRef = useRef(null);

  const tz = user?.timezone || browserTz();
  const hhmm = (iso) => timeInTz(iso, tz);
  const dateLongue = (iso) => new Date(iso).toLocaleString(langue, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const majContenu = (id, patch) => setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  // Change la date d'un contenu et le reprogramme sur son réseau s'il était dans la file d'envoi.
  const changerDate = async (contenu, iso) => {
    await contenuService.update(contenu.id, { date_publication: iso });
    majContenu(contenu.id, { date_publication: iso });
    if (estProgrammable(contenu) && contenu.reseau_cible) {
      try {
        const pub = await contenuService.publier(contenu.id);
        majContenu(contenu.id, { publish_status: pub.publish_status, late_post_id: pub.late_post_id, publish_error: null });
        return 'reprogramme';
      } catch (e) {
        majContenu(contenu.id, { publish_status: 'échec', publish_error: e.response?.data?.detail });
        return 'echec';
      }
    }
    return 'deplace';
  };

  const isoDuDepot = (p) => (p?.dateStr && p?.time ? inputToUtc(`${p.dateStr}T${p.time}`, tz) : null);
  const depotPasse = dropPending && !dropPending.placer && isoDuDepot(dropPending) && new Date(isoDuDepot(dropPending)).getTime() < Date.now();

  const commitDrop = async () => {
    if (!dropPending?.contenu || depotPasse) return;
    const { contenu } = dropPending;
    const ancienne = contenu.date_publication;
    const iso = isoDuDepot(dropPending);
    setDropBusy(true);
    try {
      const r = await changerDate(contenu, iso);
      setDropPending(null);
      const annulerDeplacement = ancienne && new Date(ancienne).getTime() > Date.now() ? {
        label: t('planif.annuler'),
        onClick: async () => {
          try { await changerDate({ ...contenu }, ancienne); toast.success(t('planif.deplacementAnnule')); } catch (e) { toast.error(t('planif.echecDeplacement')); }
        },
      } : undefined;
      if (r === 'echec') toast.error(t('planif.deplaceReprogEchec'), { duration: 7000, action: annulerDeplacement });
      else toast.success(r === 'reprogramme' ? t('planif.replanifieOk') : t('planif.postDeplace'), { action: annulerDeplacement });
    } catch (e) {
      toast.error(t('planif.echecDeplacement'));
    } finally {
      setDropBusy(false);
    }
  };

  // Fenêtre de dépôt : Échap ferme, le focus reste dedans
  useEffect(() => {
    if (!dropPending) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !dropBusy) { e.preventDefault(); setDropPending(null); }
      if (e.key === 'Tab' && dropRef.current) {
        const f = [...dropRef.current.querySelectorAll('button:not([disabled]), input')];
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dropPending, dropBusy]);

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

  const openContenu = (c) => {
    setSelected(c); setDateVal(utcToInput(c.date_publication, tz));
    // Rafraîchit le statut RÉEL : un webhook a pu passer le post à « publié »
    // depuis le chargement de la page → on évite d'afficher un ancien « échec » figé.
    contenuService.getById(c.id)
      .then((fresh) => {
        setSelected((prev) => (prev && prev.id === c.id ? { ...prev, ...fresh } : prev));
        majContenu(c.id, fresh);
      })
      .catch(() => { /* on garde l'instantané */ });
  };
  const patchSel = (patch) => {
    majContenu(selected.id, patch);
    setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveDate = async () => {
    if (!dateVal || !selected) return;
    const iso = inputToUtc(dateVal, tz);
    if (new Date(iso).getTime() < Date.now()) { toast.error(t('planif.dateFutur')); return; }
    setBusy(true);
    try {
      const r = await changerDate(selected, iso);
      setSelected((prev) => (prev ? { ...prev, date_publication: iso } : prev));
      if (r === 'echec') toast.error(t('planif.dateEnregReprogEchec'), { duration: 7000 });
      else toast.success(r === 'reprogramme' ? t('planif.dateMajReprog') : t('planif.dateMaj'));
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

  // Replanifier : le serveur trouve le prochain créneau libre (cadence + dates occupées)
  const replanifier = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const d = await contenuService.replanifier(selected.id);
      patchSel({ date_publication: d.date_publication, publish_status: d.publish_status, publish_error: d.error || null });
      if (d.date_publication) setDateVal(utcToInput(d.date_publication, tz));
      if (d.publish_status === 'envoi') toast.success(t('planif.replanifieVers', { date: d.date_publication ? dateLongue(d.date_publication) : '' }));
      else toast.error(d.error || t('planif.replanifieEnvoiEchec'));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('planif.echecReplanification'));
    } finally { setBusy(false); }
  };

  const annuler = async () => {
    if (!selected) return;
    const contenu = selected;
    setBusy(true);
    try {
      const d = await contenuService.annuler(contenu.id);
      patchSel({ publish_status: d.publish_status, late_post_id: null });
      toast.success(t('planif.envoiAnnule'), {
        action: {
          label: t('planif.reprogrammer'),
          onClick: async () => {
            try {
              const p = await contenuService.publier(contenu.id);
              majContenu(contenu.id, { publish_status: p.publish_status, late_post_id: p.late_post_id, publish_error: null });
              toast.success(t('planif.pubProgrammee'));
            } catch (e) { toast.error(e.response?.data?.detail || t('planif.echecProgrammation')); }
          },
        },
      });
    } catch (e) { toast.error(e.response?.data?.detail || t('planif.echecAnnulation')); }
    finally { setBusy(false); }
  };

  // Suppression avec « Annuler » : le contenu disparaît tout de suite, la suppression réelle
  // a lieu après 5 s (ou en quittant la page) si l'utilisateur n'a pas annulé.
  const suppressions = useRef({});
  useEffect(() => () => {
    Object.values(suppressions.current).forEach(({ timer, definitif }) => { clearTimeout(timer); definitif(); });
  }, []);
  const supprimerContenu = (c) => {
    if (!c) return;
    if (selected?.id === c.id) setSelected(null);
    setContenus((prev) => prev.filter((x) => x.id !== c.id));
    const definitif = () => {
      contenuService.remove(c.id).catch((e) => {
        setContenus((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
        toast.error(e.response?.data?.detail || t('planif.echecSuppression'));
      });
    };
    const timer = setTimeout(() => { delete suppressions.current[c.id]; definitif(); }, 5000);
    suppressions.current[c.id] = { timer, definitif };
    toast(t(estProgramme(c) ? 'planif.postSupprimeProgramme' : 'planif.postSupprime'), {
      duration: 5000,
      action: {
        label: t('planif.annuler'),
        onClick: () => {
          clearTimeout(timer); delete suppressions.current[c.id];
          setContenus((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
        },
      },
    });
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

  // Filtre par réseau : appliqué au calendrier, à la liste et aux prochains contenus
  const visibles = useMemo(() => (filtreReseau ? contenus.filter((c) => idReseau(c.reseau_cible) === filtreReseau) : contenus), [contenus, filtreReseau]);
  const parHeure = (a, b) => new Date(a.date_publication) - new Date(b.date_publication);

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

  const forDate = (date) => visibles.filter((c) => c.date_publication && new Date(c.date_publication).toDateString() === date.toDateString()).sort(parHeure);

  const moisContenus = useMemo(() => visibles
    .filter((c) => { if (!c.date_publication) return false; const d = new Date(c.date_publication); return d.getFullYear() === year && d.getMonth() === month; })
    .sort(parHeure), [visibles, year, month]);

  // Contenus prêts mais pas encore envoyés (sans date, date passée, échec ou annulé)
  const aProgrammerTous = useMemo(() => contenus
    .filter((c) => c.reseau_cible && c.statut !== 'Publie'
      && ['', null, undefined, 'échec', 'annulé'].includes(c.publish_status))
    .sort((a, b) => new Date(a.date_publication || 0) - new Date(b.date_publication || 0)), [contenus]);
  const aProgrammer = aProgrammerTous.slice(0, 4);

  const stats = useMemo(() => ({
    prog: moisContenus.filter((c) => estProgramme(c)).length,
    pub: moisContenus.filter((c) => c.publish_status === 'publié' || c.statut === 'Publie').length,
    valid: moisContenus.filter((c) => c.statut === 'A valider').length,
  }), [moisContenus]);

  // --- Période affichée ---
  const debutSemaine = useMemo(() => {
    const d = new Date(current); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }, [current]);
  const joursSemaine = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(debutSemaine); d.setDate(debutSemaine.getDate() + i); return d; }), [debutSemaine]);
  const changePeriode = useCallback((dir) => {
    setCurrent((c) => {
      if (view === 'mois' || view === 'liste') return new Date(c.getFullYear(), c.getMonth() + dir, 1);
      const d = new Date(c); d.setDate(d.getDate() + dir * (view === 'semaine' ? 7 : 1)); return d;
    });
  }, [view]);
  const goToday = () => { setCurrent(new Date()); };
  const libellePeriode = view === 'mois' || view === 'liste'
    ? <>{t(`planif.${MOIS_KEYS[month]}`)} <span className="text-slate-400 font-medium">{year}</span></>
    : view === 'semaine'
      ? t('planif.semaineDu', { date: debutSemaine.toLocaleDateString(langue, { day: 'numeric', month: 'long' }) })
      : current.toLocaleDateString(langue, { weekday: 'long', day: 'numeric', month: 'long' });
  const heureDe = (c) => (c.date_publication ? Number(utcToInput(c.date_publication, tz).split('T')[1].slice(0, 2)) : -1);

  // Raccourcis clavier : ← → période, T aujourd'hui, M / S / J / L vues
  useEffect(() => {
    const onKey = (e) => {
      if (selected || dropPending || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = document.activeElement;
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft') changePeriode(-1);
      else if (e.key === 'ArrowRight') changePeriode(1);
      else if (k === 't') setCurrent(new Date());
      else if (k === 'm') setView('mois');
      else if (k === 's') setView('semaine');
      else if (k === 'j') setView('jour');
      else if (k === 'l') setView('liste');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, dropPending, changePeriode]);

  // Vue semaine : on fait défiler jusqu'au premier contenu de la semaine (7 h si aucun)
  const grilleRef = useRef(null);
  const contenusSemaine = joursSemaine.flatMap((d) => forDate(d));
  const premiereHeure = contenusSemaine.length ? Math.min(...contenusSemaine.map(heureDe).filter((h) => h >= 0)) : 7;
  useEffect(() => {
    if (view === 'semaine' && grilleRef.current) grilleRef.current.scrollTop = Math.max(0, Math.min(premiereHeure, 7) - 0.3) * HAUTEUR_HEURE;
  }, [view, loading, debutSemaine, premiereHeure]);
  const maintenant = new Date();
  const ligneMaintenant = (maintenant.getHours() + maintenant.getMinutes() / 60) * HAUTEUR_HEURE;

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
    return { taux, variation };
  }, [insights]);
  const creneaux = (insights?.creneaux || []).slice(0, 3);
  const groupesSujets = useMemo(() => {
    const m = new Map();
    for (const s of sujets) { const k = s.dimensions?.objectif || t('planif.autres'); m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sujets, t]);
  const prochains = useMemo(() => visibles
    .filter((c) => c.date_publication && new Date(c.date_publication) >= new Date())
    .sort(parHeure)
    .slice(0, 6), [visibles]);

  // --- Petits composants d'affichage ---
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
  const titreDe = (c) => c.titre || c.contenu?.slice(0, 50) || t('planif.sansTitre');
  const EtatChip = ({ c }) => {
    const e = etatDe(c);
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: e.color, background: `${e.color}1c` }}>
        <e.Icon className="w-3.5 h-3.5" strokeWidth={2.4} aria-hidden="true" />{t(`planif.${e.labelKey}`)}
      </span>
    );
  };
  const Legende = () => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
      {Object.values(ETATS).map((e) => (
        <span key={e.labelKey} className="flex items-center gap-1.5 text-[12px] text-slate-300 font-inter">
          <e.Icon className="w-3.5 h-3.5" style={{ color: e.color }} strokeWidth={2.4} aria-hidden="true" />{t(`planif.${e.labelKey}`)}
        </span>
      ))}
    </div>
  );

  // Contenu déplaçable (glisser-déposer) — compact (mois) ou carte (semaine)
  const Pill = ({ c, carteHoraire = false }) => {
    const e = etatDe(c);
    const justDragged = useRef(false);
    const cible = (point) => document.elementFromPoint(point.x, point.y)?.closest('[data-cal-cle]');
    const ouvrir = () => { if (!justDragged.current) openContenu(c); };
    return (
      <motion.div
        layout={!sansAnimation}
        layoutId={sansAnimation ? undefined : `pill-${c.id}`}
        transition={sansAnimation ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 360 }}
        drag={!tactile}
        dragSnapToOrigin
        dragElastic={0.18}
        dragMomentum={false}
        whileDrag={{ scale: 1.05, zIndex: 60, boxShadow: '0 12px 28px rgba(0,0,0,.5)', cursor: 'grabbing' }}
        onDrag={(ev, info) => setHoverDate(cible(info.point)?.getAttribute('data-cal-cle') || null)}
        onDragEnd={(ev, info) => {
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
          setDropPending({ contenu: c, dateStr: newDate, time, point: pointFenetre(info.point) });
        }}
        onClick={(ev) => { ev.stopPropagation(); ouvrir(); }}
        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); ouvrir(); } }}
        role="button" tabIndex={0}
        aria-label={`${titreDe(c)} · ${NOMS_RESEAUX[idReseau(c.reseau_cible)] || c.reseau_cible || ''} · ${hhmm(c.date_publication)} · ${t(`planif.${e.labelKey}`)}`}
        className={`w-full flex flex-col gap-1 rounded-lg border text-left transition-colors ${tactile ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${FOCUS} ${carteHoraire ? 'px-2 py-1.5 border-white/[0.1] bg-[#16203a] hover:bg-[#1c2848]' : 'px-1.5 py-1.5 border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]'}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <LogoReseau id={idReseau(c.reseau_cible)} className={carteHoraire ? 'w-[18px] h-[18px] rounded-[5px]' : 'w-4 h-4 rounded-[4px]'} />
          <span className={`flex-1 min-w-0 truncate tabular-nums ${carteHoraire ? 'text-[11.5px] font-semibold text-white' : 'text-[11px] text-slate-200'}`}>
            {hhmm(c.date_publication)}
          </span>
          <e.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: e.color }} strokeWidth={2.4} aria-hidden="true" />
        </div>
        <span className={`leading-[1.25] text-slate-100 line-clamp-2 ${carteHoraire ? 'text-[11.5px]' : 'text-[11px] font-medium'}`}>{titreDe(c)}</span>
      </motion.div>
    );
  };

  // Carte détaillée (agenda en liste, vue jour, prochains contenus sur mobile)
  const CarteAgenda = ({ c }) => (
    <li>
      <button type="button" onClick={() => openContenu(c)}
        className={`w-full flex items-start gap-3 rounded-xl border border-white/[0.08] bg-[#0a1120] hover:border-white/20 p-3 text-left transition-colors ${FOCUS}`}>
        <Thumb c={c} className="w-12 h-12" />
        <span className="min-w-0 flex-1 font-inter">
          <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-slate-300 tabular-nums">
            <b className="text-white">{hhmm(c.date_publication)}</b>{NOMS_RESEAUX[idReseau(c.reseau_cible)] || c.reseau_cible} · {formatDe(c)}
          </span>
          <span className="block text-[14px] font-semibold text-white mt-0.5 line-clamp-2">{titreDe(c)}</span>
          {c.contenu && c.titre && <span className="block text-[12.5px] text-slate-400 mt-0.5 line-clamp-2">{c.contenu}</span>}
          <span className="block mt-1.5 sm:hidden"><EtatChip c={c} /></span>
        </span>
        <span className="hidden sm:block flex-none self-center"><EtatChip c={c} /></span>
      </button>
    </li>
  );

  const pointFenetre = (p) => ({ x: Math.min(Math.max(p.x, 150), window.innerWidth - 150), y: Math.min(p.y, window.innerHeight - 260) });
  // Clic sur une case vide : proposer d'y placer un contenu « à programmer »
  const ouvrirPlacement = (ev, dateStr, heure) => {
    if (ev.target.closest('[role="button"]') || !aProgrammerTous.length) return;
    const ancienneOuNeuf = heure != null ? `${String(heure).padStart(2, '0')}:00` : '09:00';
    setDropPending({ placer: true, dateStr, time: ancienneOuNeuf, point: pointFenetre({ x: ev.clientX, y: ev.clientY }) });
  };

  const carte = 'rounded-2xl border border-white/[0.08] bg-[#0b1326]';
  const lienCarte = `text-[12.5px] font-semibold text-[#c9c1ff] hover:text-white whitespace-nowrap rounded ${FOCUS}`;
  const nomMoisDe = (d) => d.toLocaleDateString(langue, { day: 'numeric', month: 'long' });
  const joursListe = useMemo(() => {
    const m = new Map();
    for (const c of moisContenus) { const k = new Date(c.date_publication).toDateString(); if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
    return [...m.entries()].map(([k, l]) => ({ date: new Date(k), contenus: l }));
  }, [moisContenus]);

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
        <div className="flex flex-col gap-4 min-w-0">
          {/* ─── Barre d'outils ─── */}
          <div className={`${carte} px-4 py-3 flex flex-col gap-3`}>
            <div className="flex items-center gap-x-3 gap-y-2.5 flex-wrap">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => changePeriode(-1)} aria-label={t('planif.precedent')} title="←" className={`w-9 h-9 rounded-lg border border-white/15 grid place-items-center hover:bg-white/[0.06] ${FOCUS}`}><ChevronLeft className="w-[18px] h-[18px]" /></button>
                <h2 className="font-sora font-semibold text-[18px] text-white sm:min-w-[170px] text-center first-letter:uppercase" aria-live="polite">{libellePeriode}</h2>
                <button type="button" onClick={() => changePeriode(1)} aria-label={t('planif.suivant')} title="→" className={`w-9 h-9 rounded-lg border border-white/15 grid place-items-center hover:bg-white/[0.06] ${FOCUS}`}><ChevronRight className="w-[18px] h-[18px]" /></button>
                <button type="button" onClick={goToday} title="T" className={`px-3 py-2 rounded-lg border border-white/15 text-slate-100 hover:text-white hover:bg-white/[0.06] text-[12.5px] font-semibold font-inter ${FOCUS}`}>{t('planif.aujourdhui')}</button>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                {reseauxConnectes.length > 1 && (
                  <select value={filtreReseau} onChange={(e) => setFiltreReseau(e.target.value)} aria-label={t('planif.filtreReseau')}
                    className={`rounded-lg bg-[#111b33] border border-white/15 text-slate-100 text-[13px] px-2.5 py-2 outline-none focus:border-[#8A6CFF]/70 ${FOCUS}`}>
                    <option value="">{t('planif.tousReseaux')}</option>
                    {reseauxConnectes.map((id) => <option key={id} value={id}>{NOMS_RESEAUX[id]}</option>)}
                  </select>
                )}
                <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08]" role="group" aria-label={t('planif.vue')}>
                  {[['liste', t('planif.vueListe'), 'L'], ['mois', t('planif.vueMois'), 'M'], ['semaine', t('planif.vueSemaine'), 'S'], ['jour', t('planif.vueJour'), 'J']].map(([id, lab, raccourci]) => (
                    <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id} title={raccourci}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${FOCUS} ${view === id ? 'bg-[#5a4ae8] text-white' : 'text-slate-300 hover:text-white'}`}>{lab}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* Chiffres du mois, compacts (le calendrier reste le cœur de la page) */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] pt-3 font-inter text-[13px]">
              <span className="text-slate-200">{t('planif.resumeMois', { prog: stats.prog, pub: stats.pub, valid: stats.valid })}</span>
              <Link to="/dashboard/plan" className={`hidden md:inline-flex items-center gap-2 text-slate-200 hover:text-white rounded ${FOCUS}`}>
                <Target className="w-4 h-4 text-[#3AFFA3]" aria-hidden="true" />{t('planif.objectifsMois')} : <b className="text-white tabular-nums">{objectifs.filled}/{objectifs.needed || 0}</b>
                <span className="w-16 h-1.5 rounded-full bg-white/[0.08] overflow-hidden" aria-hidden="true"><span className="block h-full bg-[#2fd393]" style={{ width: `${objectifs.needed ? Math.min(100, Math.round((objectifs.filled / objectifs.needed) * 100)) : 0}%` }} /></span>
              </Link>
              <Link to="/dashboard/performance" className={`hidden md:inline-flex items-center gap-1.5 text-slate-200 hover:text-white rounded ${FOCUS}`}>
                <TrendingUp className="w-4 h-4 text-[#c9c1ff]" aria-hidden="true" />{t('planif.engagement30j')} :
                {engagement ? (
                  <><b className="text-white tabular-nums">{engagement.taux.toLocaleString(langue)} %</b>
                    {engagement.variation != null && <span className={engagement.variation >= 0 ? 'text-[#7ff5c4]' : 'text-red-300'}>({engagement.variation >= 0 ? '+' : ''}{engagement.variation} %)</span>}</>
                ) : <span className="text-slate-400">{t('planif.analyticsCourt')}</span>}
              </Link>
              <Link to="/dashboard/parametres" className={`hidden md:inline-flex items-center gap-1.5 ml-auto rounded ${FOCUS}`} aria-label={t('planif.nReseauxConnectes', { count: reseauxConnectes.length })}>
                {reseauxConnectes.map((id) => <LogoReseau key={id} id={id} className="w-6 h-6 rounded-md" />)}
              </Link>
            </div>
          </div>

          {/* ─── Astuce (une fois) ─── */}
          {!astuceVue && view !== 'liste' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-slate-200 font-inter">
              <MousePointerClick className="w-4 h-4 text-[#c9c1ff] flex-none" aria-hidden="true" />
              <span className="flex-1">{tactile ? t('planif.astuceTactile') : t('planif.astuceSouris')}</span>
              <button type="button" onClick={masquerAstuce} aria-label={t('planif.compris')} className={`p-1 rounded text-slate-300 hover:text-white ${FOCUS}`}><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* ─── Calendrier ─── */}
          {loading ? (
            <div className={`${carte} flex items-center justify-center py-24`}><Loader2 className="w-8 h-8 animate-spin text-[#8A6CFF]" /></div>
          ) : view === 'liste' ? (
            <div className={`${carte} p-4`}>
              {joursListe.length === 0 ? (
                <EtatVide />
              ) : (
                <div className="flex flex-col gap-4">
                  {joursListe.map(({ date, contenus: liste }) => {
                    const auj = date.toDateString() === today.toDateString();
                    return (
                      <section key={date.toISOString()} aria-label={nomMoisDe(date)}>
                        <h3 className={`font-sora font-semibold text-[14px] mb-2 capitalize ${auj ? 'text-[#c9c1ff]' : 'text-white'}`}>
                          {auj ? `${t('planif.aujourdhui')} · ` : ''}{date.toLocaleDateString(langue, { weekday: 'long', day: 'numeric', month: 'long' })}
                        </h3>
                        <ul className="flex flex-col gap-2">{liste.map((c) => <CarteAgenda key={c.id} c={c} />)}</ul>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          ) : view === 'jour' ? (
            <div className={`${carte} p-4`}>
              {forDate(current).length === 0 ? (
                <div className="text-center py-12 font-inter">
                  <p className="text-[14px] text-slate-200">{t('planif.jourVide')}</p>
                  {aProgrammerTous.length > 0 && (
                    <button type="button" onClick={(e) => ouvrirPlacement(e, format(current, 'yyyy-MM-dd'), 9)} className={`mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#c9c1ff] hover:text-white rounded ${FOCUS}`}>
                      <Plus className="w-4 h-4" aria-hidden="true" />{t('planif.placerIci')}
                    </button>
                  )}
                </div>
              ) : (
                <ul className="flex flex-col gap-2">{forDate(current).map((c) => <CarteAgenda key={c.id} c={c} />)}</ul>
              )}
            </div>
          ) : view === 'mois' ? (
            <div className={`${carte} p-3.5`}>
              {moisContenus.length === 0 && <div className="mb-3 rounded-xl border border-white/[0.07] bg-white/[0.02]"><EtatVide /></div>}
              <Legende />
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
                    if (d.out) return <div key={i} aria-hidden="true" className="min-h-[116px] rounded-xl border border-white/[0.04] bg-white/[0.01] p-2 text-[12.5px] text-slate-500 font-inter">{d.date.getDate()}</div>;
                    return (
                      <div key={i} data-cal-date={cellDate} data-cal-cle={cellDate}
                        onClick={(e) => ouvrirPlacement(e, cellDate, null)}
                        aria-label={`${nomMoisDe(d.date)}, ${t('planif.nContenus', { count: evs.length })}`} role="group"
                        className={`min-h-[116px] rounded-xl border p-2 flex flex-col gap-1.5 transition-colors bg-[#0a1120] border-white/[0.07] hover:border-white/15 ${aProgrammerTous.length ? 'cursor-copy' : ''} ${isToday ? 'border-[#8A6CFF]/70' : ''} ${isDropHover ? 'ring-2 ring-[#3AFFA3] border-[#3AFFA3] bg-[#3AFFA3]/[0.06]' : ''}`}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setCurrent(d.date); setView('jour'); }}
                          aria-label={t('planif.voirJour', { date: nomMoisDe(d.date) })}
                          className={`self-start text-[12.5px] font-semibold font-inter rounded ${FOCUS} ${isToday ? 'w-6 h-6 rounded-full bg-[#5a4ae8] text-white grid place-items-center' : 'text-slate-200 hover:text-white px-0.5'}`}>
                          {d.date.getDate()}
                        </button>
                        {evs.slice(0, 3).map((c) => <Pill key={c.id} c={c} />)}
                        {evs.length > 3 && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setCurrent(d.date); setView('jour'); }} className={`text-[11.5px] text-slate-200 hover:text-white px-1.5 font-medium text-left rounded ${FOCUS}`}>{t('planif.autresPlus', { n: evs.length - 3 })}</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className={`${carte} p-3.5`}>
              <Legende />
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: `52px repeat(7, minmax(0,1fr))` }}>
                    <span />
                    {joursSemaine.map((d) => {
                      const auj = d.toDateString() === today.toDateString();
                      const n = forDate(d).length;
                      return (
                        <button key={d.toISOString()} type="button" onClick={() => { setCurrent(d); setView('jour'); }}
                          aria-label={`${t('planif.voirJour', { date: nomMoisDe(d) })}, ${t('planif.nContenus', { count: n })}`}
                          className={`text-center rounded-lg py-1 font-inter hover:bg-white/[0.04] ${FOCUS} ${auj ? 'bg-[#5a4ae8]/25' : ''}`}>
                          <span className="block text-[12px] text-slate-300 capitalize">{d.toLocaleDateString(langue, { weekday: 'short' }).replace('.', '')}</span>
                          <span className={`block text-[17px] font-semibold font-sora ${auj ? 'text-white' : 'text-slate-100'}`}>{d.getDate()}</span>
                          <span className="block text-[11px] text-[#c9c1ff] min-h-[16px]">{n ? t('planif.nContenus', { count: n }) : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div ref={grilleRef} className="relative max-h-[560px] overflow-y-auto overscroll-contain [scrollbar-width:thin] rounded-xl border border-white/[0.07]">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="grid gap-1.5 border-b border-white/[0.05] last:border-b-0" style={{ gridTemplateColumns: `52px repeat(7, minmax(0,1fr))`, minHeight: HAUTEUR_HEURE }}>
                        <span className="text-[11.5px] text-slate-400 font-inter tabular-nums pt-1.5 pl-2">{String(h).padStart(2, '0')}:00</span>
                        {joursSemaine.map((d) => {
                          const cellDate = format(d, 'yyyy-MM-dd');
                          const cle = `${cellDate}@${h}`;
                          const evs = forDate(d).filter((c) => heureDe(c) === h);
                          return (
                            <div key={cle} data-cal-date={cellDate} data-cal-heure={h} data-cal-cle={cle}
                              onClick={(e) => ouvrirPlacement(e, cellDate, h)}
                              className={`p-1 flex flex-col gap-1 border-l border-white/[0.05] transition-colors ${aProgrammerTous.length ? 'cursor-copy hover:bg-white/[0.02]' : ''} ${hoverDate === cle ? 'bg-[#3AFFA3]/[0.08] ring-1 ring-inset ring-[#3AFFA3]' : ''}`}>
                              {evs.map((c) => <Pill key={c.id} c={c} carteHoraire />)}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {/* Ligne de l'heure actuelle (colonne d'aujourd'hui si la semaine l'inclut) */}
                    {joursSemaine.some((d) => d.toDateString() === today.toDateString()) && (
                      <span aria-hidden="true" className="pointer-events-none absolute left-[52px] right-0 h-0.5 bg-[#3AFFA3]/80" style={{ top: ligneMaintenant }} />
                    )}
                  </div>
                </div>
              </div>
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
              <>
                <ul className="flex flex-col gap-2 md:hidden">{prochains.map((c) => <CarteAgenda key={c.id} c={c} />)}</ul>
                <table className="hidden md:table w-full text-left font-inter">
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
                              <span className="block text-white font-medium truncate max-w-[260px]">{titreDe(c)}</span>
                              <span className="block text-[12px] text-slate-400">{formatDe(c)}</span>
                            </span>
                          </button>
                        </td>
                        <td className="py-2.5 pr-3"><LogoReseau id={idReseau(c.reseau_cible)} className="w-7 h-7 rounded-lg" /></td>
                        <td className="py-2.5 pr-3"><EtatChip c={c} /></td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <button type="button" onClick={() => openContenu(c)} aria-label={`${t('planif.modifier')} : ${titreDe(c)}`} title={t('planif.modifier')}
                            className={`p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 ${FOCUS}`}><Pencil className="w-4 h-4" /></button>
                          <span className="inline-block w-2" aria-hidden="true" />
                          <button type="button" onClick={() => supprimerContenu(c)} aria-label={`${t('planif.supprimerPost')} : ${titreDe(c)}`} title={t('planif.supprimerPost')}
                            className={`p-2 rounded-lg text-slate-300 hover:text-red-300 hover:bg-white/5 ${FOCUS}`}><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </div>

        {/* ─── Colonne droite ─── */}
        <aside className="flex flex-col gap-4 min-w-0">
          {/* Ce qu'il reste à régler sur cette page passe en premier */}
          {aProgrammerTous.length > 0 && (
            <section className={`${carte} border-amber-300/35 p-4`} aria-labelledby="planif-a-programmer">
              <h2 id="planif-a-programmer" className="font-sora font-bold text-[14.5px] text-white flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-300" aria-hidden="true" />{t('planif.aProgrammer')}
                <span className="ml-auto text-[12px] text-amber-100 bg-amber-300/15 px-2 py-0.5 rounded-full tabular-nums">{aProgrammerTous.length}</span>
              </h2>
              <p className="text-[12.5px] text-slate-300 font-inter mb-2">{t('planif.aProgrammerAide')}</p>
              <ul className="divide-y divide-white/[0.06]">
                {aProgrammer.map((c) => {
                  const passee = c.date_publication && new Date(c.date_publication).getTime() < Date.now();
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => openContenu(c)} className={`w-full flex items-center gap-2.5 py-2 text-left rounded-lg hover:bg-white/[0.03] ${FOCUS}`}>
                        <Thumb c={c} className="w-9 h-9" />
                        <span className="flex-1 min-w-0 font-inter">
                          <span className="block text-[13px] text-white truncate">{titreDe(c)}</span>
                          <span className={`block text-[12px] ${passee || c.publish_status === 'échec' ? 'text-amber-200' : 'text-slate-400'}`}>
                            {c.publish_status === 'échec' ? t('planif.etatEchec') : passee ? t('planif.datePassee') : c.date_publication ? dateLongue(c.date_publication) : t('planif.pasDeDate')}
                          </span>
                        </span>
                        <span className="text-[12px] font-semibold text-[#c9c1ff] flex-none">{t('planif.choisirCreneau')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <Link to="/dashboard/studio" className={`flex items-center justify-center gap-2 h-11 rounded-xl font-semibold font-inter text-[14px] ${FOCUS} ${aProgrammerTous.length ? 'border border-white/15 text-white hover:bg-white/5' : 'bg-[#5a4ae8] hover:bg-[#6757f0] text-white'}`}>
            <Plus className="w-5 h-5" aria-hidden="true" />{t('planif.genererSujets')}
          </Link>

          <section className={`${carte} p-4 flex gap-3`} aria-labelledby="planif-creneaux">
            <CalendarClock className="w-5 h-5 text-[#c9c1ff] flex-none mt-0.5" aria-hidden="true" />
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

          <section className={`${carte} p-4`} aria-labelledby="planif-sujets">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-amber-300" aria-hidden="true" />
              <h2 id="planif-sujets" className="font-sora font-bold text-[14.5px] text-white">{t('planif.sujetsATraiter')}</h2>
              <Link to="/dashboard/studio" className={`ml-auto ${lienCarte}`}>{t('planif.ouvrirStudio')} →</Link>
            </div>
            {groupesSujets.length === 0 ? (
              <p className="text-[12.5px] text-slate-300 font-inter">{t('planif.aucunSujetReserve')}</p>
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
                <Link to="/dashboard/plan" className={`ml-auto ${lienCarte}`}>{t('planif.ouvrirPlan')} →</Link>
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
            <Rocket className="w-5 h-5 text-[#c9c1ff] flex-none mt-0.5" aria-hidden="true" />
            <div className="min-w-0 font-inter">
              <h2 id="planif-evenement" className="font-sora font-bold text-[14.5px] text-white">{t('planif.evenementTitre')}</h2>
              <p className="text-[12.5px] text-slate-300 mt-0.5">{t('planif.evenementTexte')}</p>
              <Link to="/dashboard/coach" className={`inline-flex items-center gap-1.5 mt-2.5 ${lienCarte}`}>{t('planif.evenementBouton')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
            </div>
          </section>
        </aside>
      </div>

      {/* ─── Fenêtre de dépôt / placement (à l'endroit du clic) ─── */}
      <AnimatePresence>
        {dropPending && (
          <>
            <motion.div key="drop-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !dropBusy && setDropPending(null)} className="fixed inset-0 z-[90]" />
            <motion.div
              key="drop-popover" ref={dropRef} role="dialog" aria-modal="true" aria-labelledby="planif-depot-titre"
              initial={sansAnimation ? false : { opacity: 0, scale: 0.94, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={sansAnimation ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
              transition={sansAnimation ? { duration: 0 } : { duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              style={{ position: 'fixed', left: dropPending.point.x - 150, top: dropPending.point.y, zIndex: 91 }}
              className="w-[300px] rounded-xl border border-white/15 bg-[#0f172a] shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-3.5 space-y-3 font-inter"
            >
              <div id="planif-depot-titre" className="text-[13.5px] font-semibold text-white font-sora flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#c9c1ff]" aria-hidden="true" />
                {dropPending.placer ? t('planif.placerLe', { date: format(parseISO(dropPending.dateStr), 'EEEE d MMMM', { locale: localeDate }) })
                  : t('planif.replanifierAu', { date: format(parseISO(dropPending.dateStr), 'EEEE d MMMM', { locale: localeDate }) })}
              </div>

              {dropPending.placer ? (
                <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {aProgrammerTous.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setDropPending((p) => ({ ...p, placer: false, contenu: c }))}
                        className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06] ${FOCUS}`}>
                        <Thumb c={c} className="w-7 h-7" />
                        <span className="text-[13px] text-white truncate">{titreDe(c)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  {/* Conséquence du déplacement, dite avant de confirmer */}
                  <p className="text-[12.5px] text-slate-200">
                    {estProgramme(dropPending.contenu)
                      ? t('planif.consequenceReprog', { reseau: NOMS_RESEAUX[idReseau(dropPending.contenu.reseau_cible)] || dropPending.contenu.reseau_cible })
                      : estProgrammable(dropPending.contenu) && dropPending.contenu.reseau_cible
                        ? t('planif.consequenceProgrammer', { reseau: NOMS_RESEAUX[idReseau(dropPending.contenu.reseau_cible)] || dropPending.contenu.reseau_cible })
                        : t('planif.consequenceDate')}
                  </p>
                  {dropPending.contenu.date_publication && (
                    <p className="text-[12px] text-slate-400 tabular-nums">{t('planif.ancienneDate', { date: dateLongue(dropPending.contenu.date_publication) })}</p>
                  )}
                  <label className="block">
                    <span className="block text-[12px] text-slate-300 mb-1">{t('planif.heure')}</span>
                    <input type="time" step="300" autoFocus value={dropPending.time}
                      onChange={(e) => setDropPending((p) => ({ ...p, time: e.target.value }))}
                      className={`w-full rounded-lg bg-[#111b33] border border-white/15 text-slate-100 text-sm px-3 py-2 outline-none focus:border-[#8A6CFF]/70 ${FOCUS}`} />
                  </label>
                  {depotPasse && <p className="text-[12.5px] text-red-200" role="alert">{t('planif.dateFutur')}</p>}
                </>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={() => setDropPending(null)} disabled={dropBusy}
                  className={`flex-1 bg-transparent text-slate-200 hover:bg-white/10 border border-white/15 ${FOCUS}`}>{t('planif.annuler')}</Button>
                {!dropPending.placer && (
                  <Button size="sm" onClick={commitDrop} disabled={dropBusy || depotPasse}
                    className={`flex-1 bg-[#5a4ae8] hover:bg-[#6757f0] text-white disabled:opacity-50 ${FOCUS}`}>
                    {dropBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('planif.confirmer')}
                  </Button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Fiche d'un contenu ─── */}
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
                  <div className="w-full aspect-square rounded-xl bg-slate-800/40 border border-dashed border-white/15 grid place-items-center text-slate-300 gap-2">
                    <ImageIcon className="w-10 h-10" aria-hidden="true" />
                    <span className="text-xs font-inter">{t('planif.aucunVisuel')}</span>
                  </div>
                )}
                {!(Array.isArray(selected.slides_images) && selected.slides_images.length) && (
                  <>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={importImage} />
                    <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing}
                      className={`w-full bg-white/5 text-slate-100 hover:bg-white/10 border border-white/15 ${FOCUS}`}>
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
                  <span className="text-sm text-slate-200 font-inter">{NOMS_RESEAUX[idReseau(selected.reseau_cible)] || selected.reseau_cible || '—'}</span>
                  <span className="ml-auto"><EtatChip c={selected} /></span>
                </div>
                <p className="text-[13px] text-slate-200 font-inter whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">{selected.contenu}</p>

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-inter">{t('planif.datePublication')} <span className="text-slate-400">({tz.split('/').pop().replace('_', ' ')} · {tzAbbrev(tz)})</span></label>
                  <div className="flex gap-2 flex-wrap items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className={`flex-1 min-w-[150px] flex items-center gap-2 rounded-lg bg-[#111b33] border border-white/15 text-slate-100 text-sm px-3 py-2 hover:border-[#8A6CFF]/50 transition-colors text-left ${FOCUS}`}>
                          <Calendar className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
                          <span className="truncate">{dateVal?.split('T')[0] ? format(parseISO(dateVal.split('T')[0]), 'EEE d MMM yyyy', { locale: localeDate }) : t('planif.choisirDate')}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0 bg-[#0f172a] border-white/10">
                        <DayCalendar mode="single" locale={localeDate} initialFocus
                          selected={dateVal?.split('T')[0] ? parseISO(dateVal.split('T')[0]) : undefined}
                          disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                          onSelect={(d) => { if (d) setDateVal(`${format(d, 'yyyy-MM-dd')}T${(dateVal?.split('T')[1]) || '09:00'}`); }} />
                      </PopoverContent>
                    </Popover>
                    <input type="time" step="300" value={dateVal?.split('T')[1] || ''} aria-label={t('planif.heure')}
                      onChange={(e) => setDateVal(`${dateVal?.split('T')[0] || format(new Date(), 'yyyy-MM-dd')}T${e.target.value}`)}
                      className={`w-[112px] rounded-lg bg-[#111b33] border border-white/15 text-slate-100 text-sm px-3 py-2 outline-none focus:border-[#8A6CFF]/50 ${FOCUS}`} />
                    <Button size="sm" onClick={saveDate} disabled={busy || !dateVal || utcToInput(selected.date_publication, tz) === dateVal}
                      className={`bg-white/5 text-slate-100 hover:bg-white/10 border border-white/15 ${FOCUS}`}>{t('planif.enregistrer')}</Button>
                  </div>
                  {estProgramme(selected) && <p className="text-[12px] text-slate-300 font-inter">{t('planif.aideDateProgrammee')}</p>}
                </div>

                {selected.publish_status === 'échec' && selected.publish_error && (
                  <p className="text-[12.5px] text-red-200 font-inter" role="alert">{t('planif.echecDetail', { erreur: selected.publish_error })}</p>
                )}

                {/* Actions publication */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.statut !== 'Publie' && selected.reseau_cible
                    && ['', null, undefined, 'échec', 'annulé'].includes(selected.publish_status) && (
                    <Button size="sm" onClick={programmer} disabled={busy}
                      className={`bg-[#5a4ae8] text-white hover:bg-[#6757f0] ${FOCUS}`}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
                      {selected.publish_status === 'échec' ? t('planif.reessayer') : t('planif.programmer')}
                    </Button>
                  )}
                  {selected.statut !== 'Publie' && selected.reseau_cible && selected.publish_status !== 'publié' && (
                    <Button size="sm" onClick={replanifier} disabled={busy} data-testid="replanifier-btn"
                      title={t('planif.replanifierTooltip')}
                      className={`bg-transparent text-slate-100 hover:bg-white/10 border border-white/15 ${FOCUS}`}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                      {t('planif.prochainCreneauLibre')}
                    </Button>
                  )}
                  {estProgramme(selected) && (
                    <Button size="sm" onClick={annuler} disabled={busy}
                      className={`bg-transparent text-red-200 hover:bg-red-500/15 border border-red-400/35 ${FOCUS}`}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <X className="w-4 h-4 mr-1.5" />}
                      {t('planif.annulerPublication')}
                    </Button>
                  )}
                  {selected.statut === 'Publie' && selected.lien_publication && (
                    <a href={selected.lien_publication} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" className={`bg-transparent text-slate-100 hover:bg-white/10 border border-white/15 ${FOCUS}`}>
                        <ExternalLink className="w-4 h-4 mr-1.5" />{t('planif.voirPost')}
                      </Button>
                    </a>
                  )}
                  <Button size="sm" onClick={() => supprimerContenu(selected)} disabled={busy}
                    className={`ml-auto bg-transparent text-slate-300 hover:text-red-200 hover:bg-red-500/10 border border-transparent ${FOCUS}`}>
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

  // État vide de l'agenda : on dit quoi faire et on mène au bon endroit
  function EtatVide() {
    return (
      <div className="text-center py-12 px-6 font-inter">
        <Calendar className="w-7 h-7 text-[#c9c1ff] mx-auto mb-2" aria-hidden="true" />
        <p className="font-sora font-semibold text-[15px] text-white">{t('planif.agendaVideTitre', { mois: t(`planif.${MOIS_KEYS[month]}`) })}</p>
        <p className="text-[13.5px] text-slate-300 mt-1 max-w-[46ch] mx-auto">{t('planif.agendaVideTexte')}</p>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <Link to="/dashboard/plan" className={`inline-flex items-center gap-1.5 rounded-lg bg-[#5a4ae8] hover:bg-[#6757f0] text-white text-[13px] font-semibold px-3.5 py-2 ${FOCUS}`}>{t('planif.remplirMois')}</Link>
          <Link to="/dashboard/studio" className={`inline-flex items-center gap-1.5 rounded-lg border border-white/15 text-white text-[13px] font-semibold px-3.5 py-2 hover:bg-white/5 ${FOCUS}`}>{t('planif.genererSujets')}</Link>
        </div>
      </div>
    );
  }
}
