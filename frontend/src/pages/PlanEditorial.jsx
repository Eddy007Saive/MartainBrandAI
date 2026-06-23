import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Sparkles, Check, Zap,
  Loader2, Lightbulb, AlertTriangle, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { agentService } from '../services/agentService';
import { useUser } from '../context/UserContext';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { SocialIcon } from '../components/SocialIcon';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// Métadonnées réseaux (badge)
const NET_META = {
  linkedin:  { short: 'in', cls: 'bg-[#0a66c2]' },
  instagram: { short: '◎', cls: 'bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#962fbf]' },
  facebook:  { short: 'f', cls: 'bg-[#1877f2]' },
  tiktok:    { short: '♪', cls: 'bg-[#111] border border-[#2b2b2b]' },
  youtube:   { short: '▶', cls: 'bg-[#ff0000]' },
};
const FORMAT_LABEL = { post: 'Post écrit', reel: 'Réel', video: 'Vidéo' };
// coût crédits par (kind × qualité) — kind: post | script
const COST = {
  post:      { rapide: 8, equilibre: 20, premium: 40 },
  script:    { rapide: 12, equilibre: 30, premium: 60 },
  carrousel: { rapide: 40, equilibre: 80, premium: 140 },
};
// libellés des formats
const FORMAT_LBL = { post: 'Post', carrousel: 'Carrousel', reel: 'Réel', video: 'Vidéo' };
// formats acceptés PAR réseau (chaque réseau n'accepte pas tout)
const FORMATS_BY_NET = {
  linkedin:  ['post', 'carrousel', 'video'],
  instagram: ['post', 'carrousel', 'reel', 'video'],
  facebook:  ['post', 'carrousel', 'reel', 'video'],
  tiktok:    ['reel', 'video'],
  youtube:   ['video', 'reel'],
};
const formatsFor = (netId) => FORMATS_BY_NET[netId] || ['post'];
const defaultFormat = (netId, configFmt) => {
  const allowed = formatsFor(netId);
  return allowed.includes(configFmt) ? configFmt : allowed[0];
};
const QUALITES = [
  { id: 'rapide', label: 'Rapide' },
  { id: 'equilibre', label: 'Équilibré' },
  { id: 'premium', label: 'Premium' },
];
const costKey = (fmt) => (fmt === 'post' ? 'post' : fmt === 'carrousel' ? 'carrousel' : 'script');

export default function PlanEditorial() {
  const { user, updateUser } = useUser();
  const marqueOk = !!(user?.secteur && String(user.secteur).trim());

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const [plan, setPlan] = useState([]);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [sel, setSel] = useState({}); // { [subjectId]: { checked, nets:{netId: format} } } — réseaux + format PAR sujet
  const [quality, setQuality] = useState('equilibre');
  const [nbSujets, setNbSujets] = useState(6);
  const [genSujets, setGenSujets] = useState(false);
  const [running, setRunning] = useState(false);

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
    let posts = 0, cost = 0;
    const items = [];
    for (const s of subjects) {
      const st = sel[s.id];
      if (!st?.checked || !st.nets || !Object.keys(st.nets).length) continue;
      for (const [netId, fmt] of Object.entries(st.nets)) {
        posts += 1;
        cost += COST[costKey(fmt)][quality];
        items.push({ sujet: s.titre, reseau: netId, format: fmt, qualite: quality });
      }
    }
    return { posts, cost, items };
  }, [subjects, sel, quality]);

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
    else { nets[netId] = defaultFormat(netId, networks.find((n) => n.id === netId)?.format); }
    return { ...p, [id]: { checked: true, nets } };
  });
  // change le format d'un réseau pour ce sujet
  const setNetFormat = (id, netId, fmt) => setSel((p) => {
    const cur = p[id] || { checked: true, nets: {} };
    return { ...p, [id]: { checked: true, nets: { ...cur.nets, [netId]: fmt } } };
  });

  const proposerSujets = async () => {
    if (!marqueOk) { toast.error('Renseignez votre secteur dans Paramètres → Voix de marque.'); return; }
    setGenSujets(true);
    try {
      const d = await agentService.sujets(nbSujets);
      setSubjects((prev) => [...(d.sujets || []), ...prev]);
      if (d.credits != null) updateUser({ credits: d.credits });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erreur lors de la génération');
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
      if (d.credits != null) updateUser({ credits: d.credits });
      const ko = (d.errors || []).length;
      toast.success(`${d.created} contenu${d.created > 1 ? 's' : ''} généré${d.created > 1 ? 's' : ''} → onglet Contenus${ko ? ` (${ko} échec${ko > 1 ? 's' : ''})` : ''}`);
      // retire les sujets utilisés du pool
      const used = subjects.filter((s) => sel[s.id]?.checked && Object.keys(sel[s.id]?.nets || {}).length);
      used.forEach((s) => agentService.supprimerSujet(s.id).catch(() => {}));
      setSubjects((prev) => prev.filter((s) => !used.includes(s)));
      setSel({});
      fetchPlan(year, month);
    } catch (e) {
      if (e?.response?.status === 402) toast.error('Crédits insuffisants');
      else toast.error(e?.response?.data?.detail || 'Échec de la rafale');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full space-y-6 pb-28">
      <PageHeader
        icon={CalendarDays}
        title="Plan éditorial"
        subtitle="Remplis ton calendrier du mois, réseau par réseau."
        actions={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] shadow-[0_0_8px_#3AFFA3]" />
            <span className="text-xs text-slate-400 font-inter">Crédits</span>
            <span className="text-sm font-semibold text-white font-inter">{user?.credits ?? '—'}</span>
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
            {MOIS[month - 1]} <span className="text-slate-500 font-medium">{year}</span>
          </div>
          <button onClick={() => changeMonth(1)} className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] text-slate-200 grid place-items-center hover:bg-white/[0.06] transition-colors">
            <ChevronRight className="w-[18px] h-[18px]" />
          </button>
        </div>
        <div className="text-[12.5px] text-slate-400 font-inter">
          {totals.allDone ? (
            <span className="text-emerald-400 font-medium">Mois bouclé ✓ — passez au mois suivant ▶</span>
          ) : (
            <span><b className="text-slate-200">{totals.filled}</b> / {totals.needed} contenus du mois · <b className="text-slate-200">{totals.done}</b>/{totals.nets} réseaux bouclés</span>
          )}
        </div>
      </div>

      {/* Garde-fou marque */}
      {!marqueOk && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300 font-inter">
            Renseignez votre <span className="font-medium">secteur</span> dans{' '}
            <Link to="/dashboard/parametres" className="underline text-amber-200 hover:text-white">Paramètres → Voix de marque</Link> pour générer.
          </p>
        </div>
      )}

      {/* Objectifs du mois */}
      <div>
        <div className="flex items-center justify-between mb-3 px-0.5">
          <h3 className="text-[13px] font-semibold flex items-center gap-2"><Zap className="w-[15px] h-[15px] text-[#3AFFA3]" /> Objectifs du mois</h3>
          <span className="text-xs text-slate-600 font-inter">depuis ta cadence (Paramètres → Planification)</span>
        </div>
        {loadingPlan ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#5B6CFF]" /></div>
        ) : plan.length === 0 ? (
          <div className="text-sm text-slate-500 font-inter p-5 rounded-xl border border-white/[0.06] bg-[#0f172a]">
            Aucun réseau actif. Définis ta cadence dans{' '}
            <Link to="/dashboard/parametres" className="underline hover:text-white">Paramètres → Planification</Link> (fréquence + format par réseau).
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
                    <div><div className="font-semibold text-sm">{p.label}</div><div className="text-[11px] text-slate-500">{FORMAT_LABEL[p.format] || p.format}</div></div>
                    <div className="ml-auto text-right">
                      {conn ? (<>
                        <div className="text-[15px] font-bold font-sora">{p.filled}<span className="text-slate-500 font-medium text-[13px]">/{p.needed}</span></div>
                        <div className={`text-[11px] ${done ? 'text-[#3AFFA3]' : 'text-slate-500'}`}>{done ? 'bouclé ✓' : `${p.remaining} à faire`}</div>
                      </>) : (
                        <Link to="/dashboard/parametres" className="text-[11px] text-amber-400 hover:underline whitespace-nowrap">Non connecté →</Link>
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
          <h3 className="text-[13px] font-semibold flex items-center gap-2"><Lightbulb className="w-[15px] h-[15px] text-amber-400" /> Sujets du mois</h3>
          <span className="text-xs text-slate-600 font-inter">coche, puis choisis les réseaux</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <input type="number" min={1} max={12} value={nbSujets}
            onChange={(e) => setNbSujets(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)))}
            className="w-16 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-2 outline-none focus:border-[#5B6CFF]/50" />
          <Button onClick={proposerSujets} disabled={!marqueOk || genSujets}
            className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white disabled:opacity-40">
            {genSujets ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span className="ml-2">Générer des sujets</span>
          </Button>
          <span className="text-[12.5px] text-slate-600 font-inter">coche un sujet, puis choisis ses réseaux (un ou plusieurs)</span>
        </div>

        {subjects.length === 0 ? (
          <div className="text-center py-10 text-slate-600 font-inter text-sm rounded-xl border border-white/[0.06] bg-[#0f172a]">
            Aucun sujet. Génère un lot d'idées pour démarrer.
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
                        {cnt ? `${cnt} réseau${cnt > 1 ? 'x' : ''}` : 'choisis un réseau'}
                      </span>
                    ); })()}
                    <button onClick={(e) => { e.stopPropagation(); supprimerSujet(s.id); }} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {st.checked && (
                    <div className="px-4 pb-4 pt-3 border-t border-white/[0.06]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-500 mr-0.5">Réseaux :</span>
                        {networks.length === 0 && <Link to="/dashboard/parametres" className="text-[11px] text-amber-400 hover:underline">Aucun réseau connecté — connecte un compte dans Paramètres →</Link>}
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
                                  {formatsFor(n.id).map((f) => <option key={f} value={f} className="bg-slate-900">{FORMAT_LBL[f]}</option>)}
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
            <div className="text-sm font-semibold"><span className="text-[#3AFFA3]">{rafale.posts}</span> post{rafale.posts > 1 ? 's' : ''} à générer</div>
            <div className="text-[12px] text-slate-500">planifiés sur {MOIS[month - 1]} · prêts à valider dans Contenus</div>
          </div>
          <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] md:ml-auto">
            {QUALITES.map((q) => (
              <button key={q.id} onClick={() => setQuality(q.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${quality === q.id ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'text-slate-400 hover:text-white'}`}>
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13px]">
            ≈ <span className="font-bold text-[#3AFFA3]">{rafale.cost}</span> crédits
          </div>
          <Button onClick={lancerRafale} disabled={running}
            className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            <span className="ml-2">{running ? 'Génération…' : `Générer en rafale · ${rafale.posts}`}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
