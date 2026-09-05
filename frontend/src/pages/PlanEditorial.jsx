import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Sparkles, Check, Zap,
  Loader2, Lightbulb, AlertTriangle, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation, Trans } from 'react-i18next';
import { agentService } from '../services/agentService';
import { useUser } from '../context/UserContext';
import { useDemarrage } from '../context/DemarrageContext';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { SocialIcon } from '../components/SocialIcon';

const MOIS_KEYS = ['moisJanvier', 'moisFevrier', 'moisMars', 'moisAvril', 'moisMai', 'moisJuin', 'moisJuillet', 'moisAout', 'moisSeptembre', 'moisOctobre', 'moisNovembre', 'moisDecembre'];

// Métadonnées réseaux (badge)
const NET_META = {
  linkedin:  { short: 'in', cls: 'bg-[#0a66c2]' },
  instagram: { short: '◎', cls: 'bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#962fbf]' },
  facebook:  { short: 'f', cls: 'bg-[#1877f2]' },
  tiktok:    { short: '♪', cls: 'bg-[#111] border border-[#2b2b2b]' },
  youtube:   { short: '▶', cls: 'bg-[#ff0000]' },
  googlebusiness: { short: 'G', cls: 'bg-[#4285f4]' },
};
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
// Brief du sujet affiché sous le titre : mêmes dimensions que le Studio IA.
const DIMS_BRIEF = [['objectif', '🎯'], ['angle', '🧠'], ['cible', '👥'], ['format', '📱'], ['offre', '📦']];
const defaultFormat = (netId, configFmt) => {
  const allowed = formatsFor(netId);
  return allowed.includes(configFmt) ? configFmt : allowed[0];
};
// Une seule qualité, la même que le Studio IA : le choix rapide/équilibré/premium
// n'apportait qu'une question de plus au client. Le serveur garde le paramètre.
const QUALITE = 'equilibre';
const costKey = (fmt) => (fmt === 'post' || fmt === 'story' ? 'post' : fmt === 'carrousel' ? 'carrousel' : 'script');

export default function PlanEditorial() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { etat: demarrage } = useDemarrage();
  // Même verrou que le Studio IA : profil minimum, réseau, carte (état du démarrage guidé).
  const marqueOk = demarrage ? !demarrage.bloquant : !!(user?.secteur && String(user.secteur).trim());

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

  useEffect(() => { fetchPlan(year, month); }, [year, month, fetchPlan]);
  useEffect(() => { agentService.sujetsList().then((d) => setSubjects(d || [])).catch(() => {}); }, []);
  useEffect(() => { agentService.usage().then(setUsage).catch(() => {}); }, []);

  // Jauge « post » = les contenus que la rafale consomme réellement (script vidéo compris) -> contenus restants ce mois
  const postGauge = useMemo(() => (usage?.gauges || []).find((g) => g.action_type === 'post') || null, [usage]);
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
      toast.error(e?.response?.data?.detail || t('plan.toastErreurGeneration'));
    } finally {
      setGenSujets(false);
    }
  };

  const supprimerSujet = async (id) => {
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setSel((p) => { const n = { ...p }; delete n[id]; return n; });
    if (id) agentService.supprimerSujet(id).catch(() => {});
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
    } catch (e) {
      if (e?.response?.status === 402) toast.error(t('plan.toastQuotaAtteint'));
      else toast.error(e?.response?.data?.detail || t('plan.toastEchecRafale'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full space-y-6 pb-28">
      <PageHeader
        icon={CalendarDays}
        title={t('plan.titre')}
        subtitle={t('plan.sousTitre')}
        actions={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]"
            title={postGauge ? t('plan.jaugeTitre', { used: postGauge.used, limit: postGauge.limit }) : undefined}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] shadow-[0_0_8px_#3AFFA3]" />
            <span className="text-xs text-slate-400 font-inter">{t('plan.contenusRestants')}</span>
            <span className="text-sm font-semibold text-white font-inter">
              {postGauge ? `${postsLeft} / ${postGauge.limit}` : '—'}
            </span>
          </div>
        }
      />

      {/* Navigation mois */}
      <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-2xl border border-white/[0.06] bg-[#0f172a]">
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] text-slate-200 grid place-items-center hover:bg-white/[0.06] transition-colors">
            <ChevronLeft className="w-[18px] h-[18px]" />
          </button>
          <div className="text-lg font-semibold font-sora min-w-[150px] text-center">
            {t(`plan.${MOIS_KEYS[month - 1]}`)} <span className="text-slate-500 font-medium">{year}</span>
          </div>
          <button onClick={() => changeMonth(1)} className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] text-slate-200 grid place-items-center hover:bg-white/[0.06] transition-colors">
            <ChevronRight className="w-[18px] h-[18px]" />
          </button>
        </div>
        <div className="text-[12.5px] text-slate-400 font-inter">
          {totals.allDone ? (
            <span className="text-emerald-400 font-medium">{t('plan.moisBoucle')}</span>
          ) : (
            <span><b className="text-slate-200">{totals.filled}</b> / {totals.needed} {t('plan.contenusDuMois')} · <b className="text-slate-200">{totals.done}</b>/{totals.nets} {t('plan.reseauxBoucles')}</span>
          )}
        </div>
      </div>

      {/* Garde-fou marque */}
      {!marqueOk && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300 font-inter">
            <Trans
              i18nKey="plan.gardeFouMarque"
              components={{ gras: <span className="font-medium" />, lien: <Link to="/dashboard/parametres" className="underline text-amber-200 hover:text-white" /> }}
            />
          </p>
        </div>
      )}

      {/* Objectifs du mois */}
      <div>
        <div className="flex items-center justify-between mb-3 px-0.5">
          <h3 className="text-[13px] font-semibold flex items-center gap-2"><Zap className="w-[15px] h-[15px] text-[#3AFFA3]" /> {t('plan.objectifsDuMois')}</h3>
          <span className="text-xs text-slate-600 font-inter">{t('plan.depuisCadence')}</span>
        </div>
        {loadingPlan ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#5B6CFF]" /></div>
        ) : plan.length === 0 ? (
          <div className="text-sm text-slate-500 font-inter p-5 rounded-xl border border-white/[0.06] bg-[#0f172a]">
            <Trans
              i18nKey="plan.aucunReseauActif"
              components={{ lien: <Link to="/dashboard/parametres" className="underline hover:text-white" /> }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plan.map((p) => {
              const pct = p.needed ? Math.min(100, Math.round((p.filled / p.needed) * 100)) : 0;
              const done = p.remaining === 0;
              const meta = NET_META[p.platform] || { short: '•', cls: 'bg-slate-700' };
              const conn = isConnected(p.platform);
              return (
                <div key={p.platform} className={`rounded-2xl border p-4 transition-all ${!conn ? 'border-white/[0.06] bg-[#0f172a] opacity-55' : done ? 'border-[#3AFFA3]/30 bg-gradient-to-b from-[#3AFFA3]/[0.05] to-transparent' : 'border-white/[0.06] bg-[#0f172a]'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-lg grid place-items-center text-white ${meta.cls}`}><SocialIcon network={p.platform} className="w-4 h-4" /></div>
                    <div><div className="font-semibold text-sm">{p.label}</div><div className="text-[11px] text-slate-500">{FORMAT_LABEL_KEY[p.format] ? t(`plan.${FORMAT_LABEL_KEY[p.format]}`) : p.format}</div></div>
                    <div className="ml-auto text-right">
                      {conn ? (<>
                        <div className="text-[15px] font-bold font-sora">{p.filled}<span className="text-slate-500 font-medium text-[13px]">/{p.needed}</span></div>
                        <div className={`text-[11px] ${done ? 'text-[#3AFFA3]' : 'text-slate-500'}`}>{done ? t('plan.boucle') : t('plan.aFaire', { count: p.remaining })}</div>
                      </>) : (
                        <Link to="/dashboard/parametres" className="text-[11px] text-amber-400 hover:underline whitespace-nowrap">{t('plan.nonConnecte')}</Link>
                      )}
                    </div>
                  </div>
                  <div className="h-[7px] rounded-md bg-white/[0.06] overflow-hidden">
                    <div className={`h-full rounded-md transition-all duration-500 ${done ? 'bg-gradient-to-r from-emerald-500 to-[#3AFFA3]' : 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]'}`} style={{ width: `${conn ? pct : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sujets du mois */}
      <div>
        <div className="flex items-center justify-between mb-3 px-0.5">
          <h3 className="text-[13px] font-semibold flex items-center gap-2"><Lightbulb className="w-[15px] h-[15px] text-amber-400" /> {t('plan.sujetsDuMois')}</h3>
          <span className="text-xs text-slate-600 font-inter">{t('plan.cocheHintCourt')}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <input type="number" min={1} max={12} value={nbSujets}
            onChange={(e) => setNbSujets(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)))}
            className="w-16 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-2 outline-none focus:border-[#5B6CFF]/50" />
          <Button onClick={proposerSujets} disabled={!marqueOk || genSujets}
            className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white disabled:opacity-40">
            {genSujets ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span className="ml-2">{t('plan.genererSujets')}</span>
          </Button>
          <span className="text-[12.5px] text-slate-600 font-inter">{t('plan.cocheHintLong')}</span>
        </div>

        {subjects.length === 0 ? (
          <div className="text-center py-10 text-slate-600 font-inter text-sm rounded-xl border border-white/[0.06] bg-[#0f172a]">
            {t('plan.aucunSujet')}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {subjects.map((s) => {
              const st = sel[s.id] || { checked: false, nets: new Set() };
              return (
                <div key={s.id} className={`rounded-2xl border overflow-hidden transition-all ${st.checked ? 'border-[#5B6CFF]/45 bg-gradient-to-b from-[#5B6CFF]/[0.06] to-transparent' : 'border-white/[0.06] bg-[#0f172a]'}`}>
                  <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer" onClick={() => toggleSubj(s.id)}>
                    <div className={`w-5 h-5 rounded-md grid place-items-center flex-shrink-0 border transition-all ${st.checked ? 'bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] border-transparent' : 'border-white/15 bg-white/[0.02]'}`}>
                      <Check className={`w-3 h-3 text-white transition-all ${st.checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} />
                    </div>
                    <span className={`flex-1 text-sm ${st.checked ? 'text-white font-medium' : 'text-slate-200'}`}>{s.titre}</span>
                    {st.checked && (() => { const cnt = Object.keys(st.nets).length; return (
                      <span className={`text-[11px] whitespace-nowrap ${cnt ? 'text-[#3AFFA3]' : 'text-amber-400'}`}>
                        {cnt ? t('plan.nbReseaux', { count: cnt }) : t('plan.choisisUnReseau')}
                      </span>
                    ); })()}
                    <button onClick={(e) => { e.stopPropagation(); supprimerSujet(s.id); }} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {st.checked && (
                    <div className="px-4 pb-4 pt-3 border-t border-white/[0.06]">
                      {s.dimensions && DIMS_BRIEF.some(([k]) => s.dimensions[k]) && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-3" data-testid={`plan-brief-${s.id}`}>
                          <span className="text-[11px] text-slate-500 mr-0.5">{t('plan.briefSujet')}</span>
                          {DIMS_BRIEF.filter(([k]) => s.dimensions[k]).map(([k, emoji]) => (
                            <span key={k} className="text-[11px] px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-slate-300 font-inter">{emoji} {s.dimensions[k]}</span>
                          ))}
                          <Link to="/dashboard/studio" className="text-[11px] text-[#a5b0ff] hover:underline ml-1">{t('plan.briefModifier')}</Link>
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-500 mr-0.5">{t('plan.reseauxLabel')}</span>
                        {networks.length === 0 && <Link to="/dashboard/parametres" className="text-[11px] text-amber-400 hover:underline">{t('plan.aucunReseauConnecte')}</Link>}
                        {networks.map((n) => {
                          const on = n.id in st.nets;
                          const meta = NET_META[n.id] || { short: '•', cls: 'bg-slate-700' };
                          return (
                            <div key={n.id} className="inline-flex items-center gap-1.5">
                              <button onClick={() => toggleNet(s.id, n.id)}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-all ${on ? 'text-white border-[#5B6CFF]/50 bg-[#5B6CFF]/15' : 'text-slate-400 border-white/10 bg-white/[0.02] hover:text-white hover:border-white/20'}`}>
                                <span className={`w-[18px] h-[18px] rounded-[5px] grid place-items-center text-white ${meta.cls}`}><SocialIcon network={n.id} className="w-3 h-3" /></span>
                                {n.label}
                              </button>
                              {on && (
                                <select value={st.nets[n.id]} onChange={(e) => setNetFormat(s.id, n.id, e.target.value)}
                                  className="rounded-lg bg-slate-950/70 border border-[#5B6CFF]/30 text-slate-200 text-[11.5px] px-2 py-1.5 outline-none focus:border-[#5B6CFF]/60 cursor-pointer">
                                  {formatsFor(n.id).map((f) => <option key={f} value={f} className="bg-slate-900">{t(`plan.${FORMAT_LBL_KEY[f]}`)}</option>)}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barre rafale (sticky bas) */}
      {rafale.posts > 0 && (
        <div className="fixed bottom-0 left-0 md:left-64 right-0 z-20 border-t border-white/10 bg-[#090d18]/90 backdrop-blur-xl px-5 md:px-8 py-3.5 flex items-center gap-4 flex-wrap">
          <div className="flex flex-col">
            <div className="text-sm font-semibold"><span className="text-[#3AFFA3]">{rafale.posts}</span> {t('plan.aGenerer', { count: rafale.posts })}</div>
            <div className="text-[12px] text-slate-500">
              {t('plan.planifiesSur', { mois: t(`plan.${MOIS_KEYS[month - 1]}`) })}
              {rafale.videos > 0
                ? t('plan.dontScriptsVideo', { count: rafale.videos })
                : t('plan.pretsAValider')}
            </div>
          </div>
          {postGauge && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13px] md:ml-auto"
              title={t('plan.jaugeRestantsTitre', { count: postsLeft, used: postGauge.used, limit: postGauge.limit })}>
            <span className={`font-bold ${rafale.posts > postsLeft ? 'text-red-400' : 'text-[#3AFFA3]'}`}>{postsLeft}</span>
            <span className="text-slate-400">{t('plan.contenusRestantsBadge', { count: postsLeft })}</span>
          </div>
          )}
          <Button onClick={lancerRafale} disabled={running}
            className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            <span className="ml-2">{running ? t('plan.generationEnCours') : t('plan.genererEnRafale', { count: rafale.posts })}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
