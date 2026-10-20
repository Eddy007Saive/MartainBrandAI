import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Check, Zap, Info, ArrowRight,
  Loader2, Lightbulb, AlertTriangle, Trash2, ClipboardList, Crown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { agentService } from '../services/agentService';
import { contenuService } from '../services/contenuService';
import { useUser } from '../context/UserContext';
import { useDemarrage } from '../context/DemarrageContext';
import { Button } from '../components/ui/button';
import { LogoReseau } from '../components/LogoReseau';

const MOIS_KEYS = ['moisJanvier', 'moisFevrier', 'moisMars', 'moisAvril', 'moisMai', 'moisJuin', 'moisJuillet', 'moisAout', 'moisSeptembre', 'moisOctobre', 'moisNovembre', 'moisDecembre'];

const FORMAT_LABEL_KEY = { post: 'formatPostEcrit', reel: 'formatReel', video: 'formatVideo', story: 'formatStory' };
// coût crédits par (kind × qualité) — kind: post | script
const COST = {
  post:      { rapide: 8, equilibre: 20, premium: 40 },
  script:    { rapide: 12, equilibre: 30, premium: 60 },
  carrousel: { rapide: 40, equilibre: 80, premium: 140 },
};
// libellés des formats (clés i18n — les ids restent les valeurs API)
const FORMAT_LBL_KEY = { post: 'fmtPost', carrousel: 'fmtCarrousel', reel: 'fmtReel', video: 'fmtVideo', story: 'fmtStory' };
// formats acceptés PAR réseau (chaque réseau n'accepte pas tout) — story : Instagram/Facebook (Zernio)
const FORMATS_BY_NET = {
  linkedin:  ['post', 'carrousel', 'video'],
  instagram: ['post', 'carrousel', 'reel', 'video', 'story'],
  facebook:  ['post', 'carrousel', 'reel', 'video', 'story'],
  tiktok:    ['reel', 'video'],
  youtube:   ['video', 'reel'],
  googlebusiness: ['post'],
};
const formatsFor = (netId) => FORMATS_BY_NET[netId] || ['post'];
// La dimension « format » recommandée par l'IA sur le sujet (même vocabulaire que le Studio IA)
// -> format de la rafale. Le réseau garde le dernier mot (formatsFor).
const FORMAT_DIM_TO_PLAN = { 'Post': 'post', 'Article': 'post', 'Carrousel': 'carrousel', 'Story': 'story', 'Reel': 'reel', 'Vidéo longue': 'video' };
const formatDuSujet = (s) => FORMAT_DIM_TO_PLAN[s?.dimensions?.format] || null;
// Brief du sujet : mêmes dimensions (et mêmes libellés) que le Studio IA.
const DIMS_BRIEF = [['objectif', 'dimObjectif'], ['angle', 'dimAngle'], ['cible', 'dimCible'], ['format', 'dimFormat'], ['offre', 'dimOffre']];
const defaultFormat = (netId, configFmt) => {
  const allowed = formatsFor(netId);
  return allowed.includes(configFmt) ? configFmt : allowed[0];
};
// Une seule qualité, la même que le Studio IA : le choix rapide/équilibré/premium
// n'apportait qu'une question de plus au client. Le serveur garde le paramètre.
const QUALITE = 'equilibre';
const costKey = (fmt) => (fmt === 'post' || fmt === 'story' ? 'post' : fmt === 'carrousel' ? 'carrousel' : 'script');
// Au-delà, un quota est considéré comme illimité (comptes Boss / admin) : on n'affiche pas le chiffre brut.
const SEUIL_ILLIMITE = 100000;
// Réseau d'un contenu (« LinkedIn », « Google Business »…) -> id de logo
const idReseau = (r) => (r || '').toLowerCase().replace(/\s+/g, '').replace('x(twitter)', 'twitter');
// Statut affiché d'un contenu planifié (texte + couleur, jamais la couleur seule)
const statutDe = (c) => {
  if (c.publish_status === 'publié' || c.statut === 'Publie') return { cle: 'statutPublie', cls: 'text-sky-200 bg-sky-400/15' };
  if (c.publish_status === 'échec') return { cle: 'statutEchec', cls: 'text-red-200 bg-red-400/15' };
  if (['programmé', 'envoi'].includes(c.publish_status)) return { cle: 'statutProgramme', cls: 'text-emerald-200 bg-emerald-400/15' };
  if (c.statut === 'A valider') return { cle: 'statutAValider', cls: 'text-amber-100 bg-amber-400/15' };
  return { cle: 'statutBrouillon', cls: 'text-slate-200 bg-white/10' };
};
// Anneau de focus clavier commun
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70';
const carte = 'rounded-2xl border border-white/[0.08] bg-[#0b1326]';

export default function PlanEditorial() {
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const { etat: demarrage } = useDemarrage();
  // Même verrou que le Studio IA : profil minimum, réseau, carte (état du démarrage guidé).
  const marqueOk = demarrage ? !demarrage.bloquant : !!(user?.secteur && String(user.secteur).trim());
  const champsManquants = (demarrage?.etapes || []).find((e) => e.id === 'profil')?.manquants || [];

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const [plan, setPlan] = useState([]);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [sel, setSel] = useState({}); // { [subjectId]: { checked, nets:{netId: format} } } — réseaux + format PAR sujet
  const [nbSujets, setNbSujets] = useState(6);
  const [genSujets, setGenSujets] = useState(false);
  const [running, setRunning] = useState(false);
  const [usage, setUsage] = useState(null); // jauges de quotas (résultats restants), remplace les crédits
  const [contenus, setContenus] = useState([]); // contenus planifiés (prochains contenus + aperçu de la semaine)

  const fetchPlan = useCallback(async (y, m) => {
    setLoadingPlan(true);
    try {
      const d = await agentService.plan(y, m);
      setPlan(d.plan || []);
    } catch (e) {
      setPlan([]);
    } finally {
      setLoadingPlan(false);
    }
  }, []);
  const fetchContenus = useCallback(() => {
    contenuService.getAll().then((d) => setContenus(Array.isArray(d) ? d : (d?.contenus || []))).catch(() => {});
  }, []);

  useEffect(() => { fetchPlan(year, month); }, [year, month, fetchPlan]);
  useEffect(() => { agentService.sujetsList().then((d) => setSubjects(d || [])).catch(() => {}); }, []);
  useEffect(() => { agentService.usage().then(setUsage).catch(() => {}); }, []);
  useEffect(() => { fetchContenus(); }, [fetchContenus]);

  // Jauge « post » = les contenus que la rafale consomme réellement (script vidéo compris) -> contenus restants ce mois
  const postGauge = useMemo(() => (usage?.gauges || []).find((g) => g.action_type === 'post') || null, [usage]);
  const illimite = !!postGauge && postGauge.limit >= SEUIL_ILLIMITE;
  const postsLeft = postGauge ? Math.max(0, postGauge.limit - postGauge.used) : null;

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  // Un réseau n'est utilisable que si le compte est connecté (Paramètres → Réseaux)
  const isConnected = (netId) => !!user?.[`late_account_${netId}`];
  // Réseaux disponibles pour cibler un sujet = ceux du plan ET connectés
  const networks = plan.filter((p) => isConnected(p.platform)).map((p) => ({ id: p.platform, label: p.label, format: p.format }));

  const totals = useMemo(() => {
    const needed = plan.reduce((a, p) => a + p.needed, 0);
    const filled = plan.reduce((a, p) => a + p.filled, 0);
    const done = plan.filter((p) => p.remaining === 0).length;
    return { needed, filled, done, nets: plan.length, allDone: plan.length > 0 && done === plan.length };
  }, [plan]);

  // total posts + coût de la rafale
  const rafale = useMemo(() => {
    let posts = 0, videos = 0, cost = 0;
    const items = [];
    for (const s of subjects) {
      const st = sel[s.id];
      if (!st?.checked || !st.nets || !Object.keys(st.nets).length) continue;
      for (const [netId, fmt] of Object.entries(st.nets)) {
        posts += 1;
        if (fmt === 'reel' || fmt === 'video') videos += 1;  // scripts vidéo → « À tourner »
        cost += COST[costKey(fmt)][QUALITE];
        items.push({ sujet: s.titre, reseau: netId, format: fmt, qualite: QUALITE,
          ...(s.dimensions ? { dimensions: s.dimensions } : {}) });
      }
    }
    return { posts, videos, cost, items };
  }, [subjects, sel]);
  const depasse = !illimite && postsLeft != null && rafale.posts > postsLeft;

  // Prochains contenus (à partir de maintenant) et nombre de contenus par jour de la semaine en cours
  const prochains = useMemo(() => contenus
    .filter((c) => c.date_publication && new Date(c.date_publication) >= new Date())
    .sort((a, b) => new Date(a.date_publication) - new Date(b.date_publication))
    .slice(0, 4), [contenus]);
  const semaine = useMemo(() => {
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const lundi = new Date(auj); lundi.setDate(auj.getDate() - ((auj.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const j = new Date(lundi); j.setDate(lundi.getDate() + i);
      const n = contenus.filter((c) => c.date_publication && new Date(c.date_publication).toDateString() === j.toDateString()).length;
      return { j, n, auj: j.getTime() === auj.getTime() };
    });
  }, [contenus]);
  const maxSemaine = Math.max(1, ...semaine.map((d) => d.n));
  const langue = i18n.resolvedLanguage || i18n.language || 'fr';
  const jourCourt = (d) => d.toLocaleDateString(langue, { weekday: 'short' }).replace('.', '');
  const dateProchain = (iso) => {
    const d = new Date(iso);
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const ecart = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - auj) / 86400000);
    const heure = d.toLocaleTimeString(langue, { hour: '2-digit', minute: '2-digit' });
    const jour = ecart === 0 ? t('plan.aujourdhui') : ecart === 1 ? t('plan.demain') : d.toLocaleDateString(langue, { day: 'numeric', month: 'short' });
    return `${jour} · ${heure}`;
  };

  // coche/décoche un sujet ; le décocher vide ses réseaux
  const toggleSubj = (id) => setSel((p) => {
    const cur = p[id] || { checked: false, nets: {} };
    const isOn = !cur.checked;
    return { ...p, [id]: { checked: isOn, nets: isOn ? cur.nets : {} } };
  });
  // ajoute/retire un réseau POUR ce sujet (format par défaut = format du réseau)
  const toggleNet = (id, netId) => setSel((p) => {
    const cur = p[id] || { checked: true, nets: {} };
    const nets = { ...cur.nets };
    if (netId in nets) { delete nets[netId]; }
    else {
      const sujet = subjects.find((x) => x.id === id);
      nets[netId] = defaultFormat(netId, formatDuSujet(sujet) || networks.find((n) => n.id === netId)?.format);
    }
    return { ...p, [id]: { checked: true, nets } };
  });
  // change le format d'un réseau pour ce sujet
  const setNetFormat = (id, netId, fmt) => setSel((p) => {
    const cur = p[id] || { checked: true, nets: {} };
    return { ...p, [id]: { checked: true, nets: { ...cur.nets, [netId]: fmt } } };
  });

  const proposerSujets = async () => {
    if (!marqueOk) { toast.error(t('plan.toastSecteurRequis')); return; }
    setGenSujets(true);
    try {
      const d = await agentService.sujets(nbSujets);
      setSubjects((prev) => [...(d.sujets || []), ...prev]);
      agentService.usage().then(setUsage).catch(() => {}); // rafraîchit les jauges (sujets consommés)
    } catch (e) {
      if (!e?.__handled) toast.error(e?.response?.data?.detail || t('plan.toastErreurGeneration'));
    } finally {
      setGenSujets(false);
    }
  };

  // Suppression d'un sujet avec « Annuler » (suppression réelle après 5 s, ou en quittant la page)
  const suppressions = useRef({});
  useEffect(() => () => {
    Object.values(suppressions.current).forEach(({ timer, definitif }) => { clearTimeout(timer); definitif(); });
  }, []);
  const supprimerSujet = (id) => {
    const idx = subjects.findIndex((s) => s.id === id);
    const sujet = subjects[idx];
    if (!sujet) return;
    const selection = sel[id];
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setSel((p) => { const n = { ...p }; delete n[id]; return n; });
    const definitif = () => { if (id) agentService.supprimerSujet(id).catch(() => {}); };
    const timer = setTimeout(() => { delete suppressions.current[id]; definitif(); }, 5000);
    suppressions.current[id] = { timer, definitif };
    toast(t('plan.sujetSupprime'), {
      duration: 5000,
      action: {
        label: t('plan.annuler'),
        onClick: () => {
          clearTimeout(timer); delete suppressions.current[id];
          setSubjects((prev) => { const n = [...prev]; n.splice(Math.min(idx, n.length), 0, sujet); return n; });
          if (selection) setSel((p) => ({ ...p, [id]: selection }));
        },
      },
    });
  };

  const lancerRafale = async () => {
    if (!rafale.posts) return;
    setRunning(true);
    try {
      const d = await agentService.rafale(rafale.items, year, month);
      if (d.usage) setUsage(d.usage); // rafraîchit les contenus restants
      const ko = (d.errors || []).length;
      const okMsg = t('plan.toastRafaleSuccess', { count: d.created });
      toast.success(ko ? `${okMsg}${t('plan.toastRafaleEchecs', { count: ko })}` : okMsg);
      // retire les sujets utilisés du pool
      const used = subjects.filter((s) => sel[s.id]?.checked && Object.keys(sel[s.id]?.nets || {}).length);
      used.forEach((s) => agentService.supprimerSujet(s.id).catch(() => {}));
      setSubjects((prev) => prev.filter((s) => !used.includes(s)));
      setSel({});
      fetchPlan(year, month);
      fetchContenus();
    } catch (e) {
      if (e?.__handled) return;
      if (e?.response?.status === 402) toast.error(t('plan.toastQuotaAtteint'));
      else toast.error(e?.response?.data?.detail || t('plan.toastEchecRafale'));
    } finally {
      setRunning(false);
    }
  };

  const quota = postGauge && (
    <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-white/[0.08] bg-[#0b1326] font-inter"
      title={!illimite ? t('plan.jaugeTitre', { used: postGauge.used, limit: postGauge.limit }) : undefined}>
      {illimite ? (
        <><Crown className="w-4 h-4 text-amber-300" aria-hidden="true" /><span className="text-[13px] text-slate-100">{t('plan.contenusIllimites')}</span></>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-[#3AFFA3]" aria-hidden="true" />
          <span className="text-[13px] text-slate-300">{t('plan.contenusRestants')}</span>
          <b className="text-[15px] text-white tabular-nums">{postsLeft} / {postGauge.limit}</b>
        </>
      )}
    </div>
  );

  return (
    <div className={`w-full space-y-5 ${rafale.posts > 0 ? 'pb-32' : 'pb-10'}`}>
      {/* ─── En-tête ─── */}
      <header className="flex flex-wrap items-center gap-4">
        <span className="w-12 h-12 rounded-xl bg-[#5a4ae8] grid place-items-center text-white flex-none" aria-hidden="true"><CalendarDays className="w-6 h-6" /></span>
        <div className="min-w-0">
          <h1 className="font-sora font-extrabold text-[26px] sm:text-[30px] leading-tight text-white tracking-tight">{t('plan.titre')}</h1>
          <p className="text-[14.5px] text-slate-300 font-inter">{t('plan.sousTitre')}</p>
        </div>
        <div className="sm:ml-auto">{quota}</div>
      </header>

      {/* ─── Mois ─── */}
      <div className={`${carte} flex items-center gap-x-5 gap-y-3 flex-wrap px-4 py-3`}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} aria-label={t('plan.moisPrecedent')} className={`w-9 h-9 rounded-lg border border-white/15 text-slate-100 grid place-items-center hover:bg-white/[0.06] transition-colors ${FOCUS}`}>
            <ChevronLeft className="w-[18px] h-[18px]" />
          </button>
          <h2 className="font-sora font-semibold text-[19px] text-white min-w-[160px] text-center" aria-live="polite">
            {t(`plan.${MOIS_KEYS[month - 1]}`)} <span className="text-slate-400 font-medium">{year}</span>
          </h2>
          <button type="button" onClick={() => changeMonth(1)} aria-label={t('plan.moisSuivant')} className={`w-9 h-9 rounded-lg border border-white/15 text-slate-100 grid place-items-center hover:bg-white/[0.06] transition-colors ${FOCUS}`}>
            <ChevronRight className="w-[18px] h-[18px]" />
          </button>
        </div>
        <p className="text-[14px] text-slate-300 font-inter md:ml-auto">
          {totals.allDone ? (
            <span className="text-[#7ff5c4] font-medium">{t('plan.moisBoucle')}</span>
          ) : (
            <><b className="text-white tabular-nums">{totals.filled}</b> / {totals.needed} {t('plan.contenusDuMois')} · <b className="text-white tabular-nums">{totals.done}</b>/{totals.nets} {t('plan.reseauxBoucles')}</>
          )}
        </p>
        <Link to="/dashboard/parametres" className={`inline-flex items-center gap-1.5 text-[12.5px] text-slate-300 border border-white/10 rounded-full px-3 py-1 hover:text-white hover:border-white/25 ${FOCUS}`}>
          <Info className="w-3.5 h-3.5" aria-hidden="true" />{t('plan.calculeCadence')}
        </Link>
      </div>

      {/* ─── Profil incomplet ─── */}
      {!marqueOk && (
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3.5 rounded-[14px] border border-orange-400/45 bg-orange-400/10 px-4 py-3" role="status">
          <span className="w-[38px] h-[38px] rounded-full bg-orange-400 grid place-items-center text-[#2a1600] flex-none"><AlertTriangle className="w-5 h-5" aria-hidden="true" /></span>
          <div className="min-w-0 font-inter">
            <p className="text-[14.5px] font-semibold text-orange-200">{t('plan.profilIncompletTitre')}</p>
            <p className="text-[13px] text-slate-300">
              {champsManquants.length > 0
                ? <>{t('studio.champsManquants')} <span className="text-orange-100">{champsManquants.map((c) => t(`demarrage.champs.${c}`)).join(', ')}.</span></>
                : t('plan.profilIncompletTexte')}
            </p>
          </div>
          <Link to="/dashboard/parametres" className={`sm:ml-auto text-[13px] font-semibold text-orange-100 border border-orange-400/40 rounded-[9px] px-3 py-2 whitespace-nowrap hover:bg-orange-400/10 ${FOCUS}`}>{t('studio.allerParametres')} →</Link>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          {/* ─── Objectifs du mois ─── */}
          <section aria-labelledby="plan-objectifs">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 id="plan-objectifs" className="flex items-center gap-2 font-sora font-bold text-[18px] text-white"><Zap className="w-5 h-5 text-[#3AFFA3]" aria-hidden="true" />{t('plan.objectifsDuMois')}</h2>
                          </div>
            {loadingPlan ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <div key={i} className={`${carte} h-[132px] animate-pulse`} />)}
              </div>
            ) : plan.length === 0 ? (
              <p className={`${carte} text-[14px] text-slate-300 font-inter p-5`}>
                {t('plan.aucunReseauActifCourt')} <Link to="/dashboard/parametres" className="underline text-white">{t('plan.definirCadence')}</Link>
              </p>
            ) : (
              <ul className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {plan.map((p) => {
                  const pct = p.needed ? Math.min(100, Math.round((p.filled / p.needed) * 100)) : 0;
                  const done = p.remaining === 0;
                  const conn = isConnected(p.platform);
                  return (
                    <li key={p.platform} className={`${carte} p-3.5 flex flex-col gap-3 ${done && conn ? 'border-[#3AFFA3]/35' : ''}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <LogoReseau id={p.platform} className={`w-9 h-9 rounded-[10px] ${conn ? '' : 'grayscale opacity-60'}`} />
                        <div className="min-w-0">
                          <div className="font-semibold text-[14px] text-white font-inter truncate">{p.label}</div>
                          <div className="text-[12px] text-slate-400 font-inter truncate">{FORMAT_LABEL_KEY[p.format] ? t(`plan.${FORMAT_LABEL_KEY[p.format]}`) : p.format}</div>
                        </div>
                      </div>
                      {conn ? (
                        <>
                          <div className="flex items-baseline justify-between gap-2 font-inter">
                            <span className="text-[17px] font-bold text-white tabular-nums">{p.filled}<span className="text-slate-400 font-medium text-[14px]"> / {p.needed}</span></span>
                            <span className={`text-[12px] ${done ? 'text-[#7ff5c4]' : 'text-slate-300'}`}>{done ? t('plan.boucle') : t('plan.aFaire', { count: p.remaining })}</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={p.needed} aria-valuenow={p.filled} aria-label={p.label}>
                            <div className={`h-full rounded-full transition-[width] duration-500 ${done ? 'bg-[#3AFFA3]' : 'bg-[#2fd393]'}`} style={{ width: `${pct}%` }} />
                          </div>
                          {/* Les stories ne comptent pas dans l'objectif (elles ne construisent pas le feed) */}
                          {p.stories > 0 && <div className="text-[12px] text-slate-300 font-inter" data-testid={`plan-stories-${p.platform}`}>{t('plan.storiesAPart', { count: p.stories })}</div>}
                        </>
                      ) : (
                        <div className="font-inter">
                          <div className="text-[12.5px] text-slate-400">{t('plan.nonConnecteCourt')}</div>
                          <Link to="/dashboard/parametres" className={`text-[13px] font-semibold text-[#c9c1ff] hover:text-white rounded ${FOCUS}`}>{t('plan.connecter')} →</Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ─── Sujets du mois ─── */}
          <section aria-labelledby="plan-sujets">
            <h2 id="plan-sujets" className="flex items-center gap-2 font-sora font-bold text-[18px] text-white mb-3"><Lightbulb className="w-5 h-5 text-amber-300" aria-hidden="true" />{t('plan.sujetsDuMois')}</h2>
            <div className="flex items-end gap-3 flex-wrap mb-4">
              <label className="font-inter">
                <span className="block text-[12.5px] text-slate-300 mb-1.5">{t('plan.nombreSujets')}</span>
                <select value={nbSujets} onChange={(e) => setNbSujets(parseInt(e.target.value, 10))}
                  className={`w-[84px] rounded-[10px] bg-[#111b33] border border-white/[0.12] text-slate-100 text-[14px] px-3 py-2.5 outline-none focus:border-[#8A6CFF]/70 ${FOCUS}`}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <Button onClick={proposerSujets} disabled={!marqueOk || genSujets} className={`h-[44px] bg-[#5a4ae8] text-white hover:bg-[#6757f0] disabled:opacity-40 ${FOCUS}`}>
                {genSujets ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                <span className="ml-2">{t('plan.genererSujets')}</span>
              </Button>
              <p className="text-[13px] text-slate-300 font-inter self-center">{t('plan.aideSujets')}</p>
            </div>

            {subjects.length === 0 ? (
              <div className={`${carte} flex flex-col items-center text-center gap-1.5 py-10 px-6 font-inter`}>
                <Lightbulb className="w-6 h-6 text-amber-300 mb-1" aria-hidden="true" />
                <b className="font-sora text-[15px] text-white">{t('plan.aucunSujetTitre')}</b>
                <span className="text-[13.5px] text-slate-300 max-w-[46ch]">{t('plan.aucunSujet')}</span>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {subjects.map((s) => {
                  const st = sel[s.id] || { checked: false, nets: {} };
                  const cnt = Object.keys(st.nets || {}).length;
                  const d = s.dimensions || {};
                  const sousTitre = [d.format, d.angle].filter(Boolean).join(' · ');
                  return (
                    <li key={s.id} data-testid={`plan-sujet-${s.id}`}
                      className={`rounded-2xl border transition-colors ${st.checked ? 'border-[#8A6CFF]/55 bg-[#6f5cff]/[0.07]' : 'border-white/[0.08] bg-[#0b1326] hover:border-white/20'}`}>
                      <div className="flex items-start gap-3 p-4">
                        <button type="button" role="checkbox" aria-checked={st.checked} onClick={() => toggleSubj(s.id)}
                          aria-label={`${t('plan.cocherSujet')} : ${s.titre}`}
                          className={`mt-0.5 w-[22px] h-[22px] rounded-md grid place-items-center flex-none border transition-colors ${FOCUS} ${st.checked ? 'bg-[#5a4ae8] border-[#8A6CFF]' : 'border-white/30 hover:border-white/50'}`}>
                          {st.checked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} aria-hidden="true" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <button type="button" onClick={() => toggleSubj(s.id)} className={`text-left rounded ${FOCUS}`} tabIndex={-1}>
                            <span className="block text-[14.5px] font-semibold text-white font-inter leading-snug">{s.titre}</span>
                          </button>
                          {sousTitre && <span className="block text-[12.5px] text-slate-300 font-inter mt-0.5">{sousTitre}</span>}
                          {st.checked && (
                            <div className="mt-3.5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                              {DIMS_BRIEF.some(([k]) => d[k]) && (
                                <div data-testid={`plan-brief-${s.id}`}>
                                  <div className="text-[12.5px] font-semibold text-slate-200 font-inter mb-1.5">{t('plan.briefIA')}</div>
                                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px] font-inter">
                                    {DIMS_BRIEF.filter(([k]) => d[k]).map(([k, cle]) => (
                                      <div key={k} className="contents">
                                        <dt className="text-slate-400">{t(`studio.${cle}`)}</dt>
                                        <dd className="text-slate-100">{d[k]}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                  <Link to="/dashboard/studio" className={`inline-flex items-center gap-1 mt-2 text-[12.5px] text-[#c9c1ff] hover:text-white rounded ${FOCUS}`}>{t('plan.briefModifier')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-[12.5px] font-semibold text-slate-200 font-inter">{t('plan.reseauxFormats')}</span>
                                  <span className={`ml-auto text-[12px] font-inter rounded-full px-2 py-0.5 ${cnt ? 'text-[#d8d2ff] bg-[#6f5cff]/20' : 'text-amber-100 bg-amber-400/15'}`}>
                                    {cnt ? t('plan.nbReseaux', { count: cnt }) : t('plan.choisisUnReseau')}
                                  </span>
                                </div>
                                {networks.length === 0 ? (
                                  <Link to="/dashboard/parametres" className="text-[12.5px] text-amber-300 hover:underline">{t('plan.aucunReseauConnecte')}</Link>
                                ) : (
                                  <ul className="flex flex-col gap-1.5">
                                    {networks.map((n) => {
                                      const on = n.id in (st.nets || {});
                                      return (
                                        <li key={n.id} className="flex items-center gap-2">
                                          <button type="button" aria-pressed={on} onClick={() => toggleNet(s.id, n.id)}
                                            className={`flex-1 min-w-0 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[13px] font-inter transition-colors ${FOCUS} ${on ? 'text-white border-[#8A6CFF]/60 bg-[#6f5cff]/15' : 'text-slate-300 border-white/10 hover:text-white hover:border-white/25'}`}>
                                            <LogoReseau id={n.id} className="w-5 h-5 rounded-[5px]" />
                                            <span className="truncate">{n.label}</span>
                                            {on && <Check className="w-3.5 h-3.5 ml-auto text-[#c9c1ff] flex-none" strokeWidth={2.6} aria-hidden="true" />}
                                          </button>
                                          {on && (
                                            <select value={st.nets[n.id]} onChange={(e) => setNetFormat(s.id, n.id, e.target.value)}
                                              aria-label={`${t('plan.formatPour')} ${n.label}`}
                                              className={`w-[118px] flex-none rounded-lg bg-[#111b33] border border-white/15 text-slate-100 text-[12.5px] px-2 py-1.5 outline-none focus:border-[#8A6CFF]/70 cursor-pointer ${FOCUS}`}>
                                              {formatsFor(n.id).map((f) => <option key={f} value={f}>{t(`plan.${FORMAT_LBL_KEY[f]}`)}</option>)}
                                            </select>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={() => supprimerSujet(s.id)} title={t('plan.supprimerSujet')} aria-label={`${t('plan.supprimerSujet')} : ${s.titre}`}
                          className={`flex-none p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-red-300 hover:bg-white/5 ${FOCUS}`}>
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ─── Colonne droite : Rico, prochains contenus, semaine ─── */}
        <aside className="flex flex-col gap-4 min-w-0 xl:sticky xl:top-4">
          <section className={`${carte} p-4 flex items-center gap-3`} aria-labelledby="plan-rico">
            <img src="/images/mascotte.png" alt="" className="w-[88px] h-[88px] object-contain flex-none -my-2" />
            <div className="min-w-0 font-inter">
              <h2 id="plan-rico" className="font-sora font-bold text-[15.5px] text-white">{t('plan.ricoTitre')}</h2>
              <p className="text-[12.5px] text-slate-300 mt-0.5">{t('plan.ricoTexte')}</p>
              <Link to="/dashboard/coach" className={`inline-flex items-center gap-1.5 mt-2 text-[13px] font-semibold text-white bg-[#5a4ae8] hover:bg-[#6757f0] rounded-lg px-3 py-1.5 ${FOCUS}`}>{t('plan.ricoBouton')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
            </div>
          </section>

          <section className={`${carte} p-4`} aria-labelledby="plan-prochains">
            <div className="flex items-center gap-2 mb-2">
              <h2 id="plan-prochains" className="font-sora font-bold text-[15.5px] text-white">{t('plan.prochainsContenus')}</h2>
              <Link to="/dashboard/contenus" className={`ml-auto text-[12.5px] font-semibold text-[#c9c1ff] hover:text-white rounded ${FOCUS}`}>{t('plan.voirTout')} →</Link>
            </div>
            {prochains.length === 0 ? (
              <p className="text-[13px] text-slate-300 font-inter py-3">{t('plan.aucunProchain')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-white/[0.07]">
                {prochains.map((c) => {
                  const s = statutDe(c);
                  return (
                    <li key={c.id}>
                      <Link to={`/dashboard/contenus?ouvrir=${c.id}`} className={`flex items-start gap-2.5 py-2.5 rounded-lg hover:bg-white/[0.03] ${FOCUS}`}>
                        <LogoReseau id={idReseau(c.reseau_cible)} className="w-8 h-8 rounded-lg" />
                        <span className="min-w-0 flex-1 font-inter">
                          <span className="block text-[12px] text-slate-400 tabular-nums">{dateProchain(c.date_publication)}</span>
                          <span className="block text-[13px] text-white truncate">{c.titre || (c.contenu || '').slice(0, 60) || t('plan.sansTitre')}</span>
                        </span>
                        <span className={`flex-none self-center text-[11.5px] font-inter rounded-full px-2 py-0.5 ${s.cls}`}>{t(`plan.${s.cle}`)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={`${carte} p-4`} aria-labelledby="plan-semaine">
            <div className="flex items-center gap-2 mb-3">
              <h2 id="plan-semaine" className="font-sora font-bold text-[15.5px] text-white whitespace-nowrap">{t('plan.apercuSemaine')}</h2>
              <Link to="/dashboard/planification" className={`ml-auto whitespace-nowrap text-[12.5px] font-semibold text-[#c9c1ff] hover:text-white rounded ${FOCUS}`}>{t('plan.planificationLien')} →</Link>
            </div>
            <ul className="grid grid-cols-7 gap-1.5 items-end h-[118px]" aria-label={t('plan.apercuSemaine')}>
              {semaine.map(({ j, n, auj }) => (
                <li key={j.toISOString()} className="flex flex-col items-center justify-end gap-1 h-full font-inter" aria-label={`${jourCourt(j)} : ${n}`}>
                  <span className="text-[12px] text-slate-200 tabular-nums">{n}</span>
                  <span className={`w-full max-w-[22px] rounded-md ${auj ? 'bg-[#3AFFA3]' : n ? 'bg-[#8A6CFF]/80' : 'bg-white/[0.08]'}`} style={{ height: `${Math.max(6, Math.round((n / maxSemaine) * 64))}px` }} aria-hidden="true" />
                  <span className={`text-[11.5px] capitalize ${auj ? 'text-white font-semibold' : 'text-slate-400'}`}>{jourCourt(j)}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {/* ─── Barre rafale (collée en bas) ─── */}
      {rafale.posts > 0 && (
        <div className="fixed bottom-0 left-0 md:left-64 right-0 z-20 border-t border-white/10 bg-[#090d18]/95 px-4 md:px-8 py-3 flex items-center gap-x-5 gap-y-2 flex-wrap" role="region" aria-label={t('plan.genererEnRafale', { count: rafale.posts })}>
          <span className="hidden sm:grid w-10 h-10 rounded-xl bg-[#5a4ae8] place-items-center text-white flex-none" aria-hidden="true"><ClipboardList className="w-5 h-5" /></span>
          <div className="flex flex-col font-inter min-w-0">
            <div className="text-[15px] font-semibold text-white"><span className="tabular-nums">{rafale.posts}</span> {t('plan.aGenerer', { count: rafale.posts })}</div>
            <div className="text-[12.5px] text-slate-300">
              {t('plan.planifiesSur', { mois: t(`plan.${MOIS_KEYS[month - 1]}`).toLowerCase() })}
              {rafale.videos > 0 ? t('plan.dontScriptsVideo', { count: rafale.videos }) : t('plan.pretsAValider')}
            </div>
          </div>
          {postGauge && !illimite && (
            <div className={`flex items-center gap-1.5 text-[13px] font-inter ${depasse ? 'text-red-200' : 'text-slate-200'}`}
              title={t('plan.jaugeRestantsTitre', { count: postsLeft, used: postGauge.used, limit: postGauge.limit })}>
              {depasse ? <AlertTriangle className="w-4 h-4 text-red-300" aria-hidden="true" /> : <Check className="w-4 h-4 text-[#3AFFA3]" aria-hidden="true" />}
              {depasse ? t('plan.quotaDepasse', { count: rafale.posts - postsLeft }) : t('plan.restantsSur', { count: postsLeft, limit: postGauge.limit })}
            </div>
          )}
          <Button onClick={lancerRafale} disabled={running}
            className={`md:ml-auto h-11 px-5 bg-[#3AFFA3] text-[#03241a] font-semibold hover:bg-[#5effb6] disabled:opacity-50 ${FOCUS}`}>
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            <span className="ml-2">{running ? t('plan.generationEnCours') : t('plan.genererEnRafale', { count: rafale.posts })}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
