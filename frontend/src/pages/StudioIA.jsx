import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Loader2, Lightbulb, PenLine, Check, CheckCircle2,
  RefreshCw, Image as ImageIcon, AlertTriangle, Wand2, Clapperboard, Trash2, LayoutGrid, Camera,
} from 'lucide-react';
import { toast } from 'sonner';
import { agentService } from '../services/agentService';
import { takePhoto, cameraAvailable } from '../lib/photo';
import { useUser } from '../context/UserContext';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';

const FORMATS = [
  { id: 'post', label: 'Post écrit', icon: PenLine },
  { id: 'carrousel', label: 'Carrousel', icon: LayoutGrid },
  { id: 'script', label: 'Script vidéo', icon: Clapperboard },
];
const RESEAUX = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' },
];
const TYPES_VIDEO = [
  { id: 'Reel', label: 'Reel' },
  { id: 'Short', label: 'Short' },
  { id: 'Video', label: 'Vidéo' },
  { id: 'Interview', label: 'Interview' },
];
// Niveaux de qualité (le modèle réel est caché côté serveur) + coût en crédits
const QUALITES = [
  { id: 'rapide', label: 'Rapide', icon: '⚡', cout: { post: 8, script: 12, carrousel: 40 } },
  { id: 'equilibre', label: 'Équilibré', icon: '⚖️', cout: { post: 20, script: 30, carrousel: 80 } },
  { id: 'premium', label: 'Premium', icon: '💎', cout: { post: 40, script: 60, carrousel: 140 } },
];

const LOGS_SUJETS = [
  'Lecture de votre voix de marque…',
  'Analyse de votre secteur et de votre audience…',
  "Recherche d'angles pertinents…",
  'Formulation des sujets…',
];

const STEPS = [
  { n: 1, label: 'Sujets', icon: Lightbulb },
  { n: 2, label: 'Génération', icon: PenLine },
  { n: 3, label: 'Validation', icon: CheckCircle2 },
];

let _uid = 0;
const nextId = () => `c${++_uid}`;

const Pill = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-sm font-medium font-inter transition-all border ${
      active
        ? 'bg-gradient-to-r from-[#5B6CFF]/20 to-[#8A6CFF]/20 text-white border-[#5B6CFF]/50'
        : 'text-slate-400 border-white/10 hover:text-white hover:border-white/20'
    }`}
  >
    {children}
  </button>
);

export default function StudioIA() {
  const { user, updateUser } = useUser();
  const marqueOk = !!(user?.secteur && String(user.secteur).trim());
  // On ne propose que les réseaux dont le compte est connecté (Paramètres → Réseaux)
  const reseaux = RESEAUX.filter((r) => !!user?.[`late_account_${r.id}`]);

  const erreurGen = (e) => {
    if (e?.response?.status === 402) toast.error('Crédits insuffisants — rechargez vos crédits.');
    else toast.error(e?.response?.data?.detail || 'Erreur lors de la génération');
  };

  const [nbSujets, setNbSujets] = useState(6);
  const [sujets, setSujets] = useState([]);
  const [openId, setOpenId] = useState(null); // sujet en cours de configuration
  const [cfgFormat, setCfgFormat] = useState('post');
  const [cfgReseau, setCfgReseau] = useState('linkedin');
  const [cfgType, setCfgType] = useState('Reel');
  const [cfgQualite, setCfgQualite] = useState('equilibre');
  const [nbSlides, setNbSlides] = useState(5); // carrousel

  // Brief perso (sujet libre écrit par l'utilisateur)
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [bFormat, setBFormat] = useState('post');
  const [bReseau, setBReseau] = useState('linkedin');
  const [bType, setBType] = useState('Reel');
  const [bQualite, setBQualite] = useState('equilibre');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoReseau, setPhotoReseau] = useState('linkedin');
  const [photoQualite, setPhotoQualite] = useState('equilibre');

  // Aligne les réseaux sélectionnés sur ceux réellement connectés
  useEffect(() => {
    if (!reseaux.length) return;
    const ids = reseaux.map((r) => r.id);
    if (!ids.includes(bReseau)) setBReseau(reseaux[0].id);
    if (!ids.includes(cfgReseau)) setCfgReseau(reseaux[0].id);
    if (!ids.includes(photoReseau)) setPhotoReseau(reseaux[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoRef = useRef(null);

  const [loadingSujets, setLoadingSujets] = useState(false);
  const [logIndex, setLogIndex] = useState(0);
  const [contenus, setContenus] = useState([]);
  const draftsLoaded = useRef(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!loadingSujets) { setLogIndex(0); return; }
    const t = setInterval(() => setLogIndex((i) => Math.min(i + 1, LOGS_SUJETS.length - 1)), 1100);
    return () => clearInterval(t);
  }, [loadingSujets]);

  useEffect(() => {
    agentService.sujetsList().then((data) => setSujets(data || [])).catch(() => {});
  }, []);

  // Charge les brouillons du compte (et recharge si on change de compte sur le même navigateur)
  useEffect(() => {
    const uid = user?.telegram_id;
    if (!uid) return;
    draftsLoaded.current = false;
    agentService.getDrafts()
      .then((data) => setContenus(Array.isArray(data) ? data.filter((c) => c.statut !== 'redaction') : []))
      .catch(() => setContenus([]))
      .finally(() => { draftsLoaded.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.telegram_id]);

  // Sauvegarde auto (debounce) côté compte — uniquement après le chargement initial
  useEffect(() => {
    if (!draftsLoaded.current || !user?.telegram_id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      agentService.saveDrafts(contenus.filter((c) => c.statut !== 'redaction')).catch(() => {});
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenus, user?.telegram_id]);

  const supprimerContenu = (id) => setContenus((prev) => prev.filter((c) => c.id !== id));

  const step = contenus.length === 0 ? 1 : 2;

  // --- Sujets ---
  const proposerSujets = async () => {
    if (!marqueOk) { toast.error('Renseignez votre secteur dans Paramètres → Voix de marque.'); return; }
    setLoadingSujets(true);
    try {
      const data = await agentService.sujets(nbSujets);
      const nouveaux = data.sujets || [];
      setSujets((prev) => [...nouveaux, ...prev]);
      if (data.credits != null) updateUser({ credits: data.credits });
      if (!nouveaux.length) toast.info('Aucun sujet généré, réessayez.');
    } catch (e) {
      erreurGen(e);
    } finally {
      setLoadingSujets(false);
    }
  };

  const supprimerSujet = async (id) => {
    setSujets((prev) => prev.filter((s) => s.id !== id));
    if (openId === id) setOpenId(null);
    if (id) { try { await agentService.supprimerSujet(id); } catch (e) { /* ignore */ } }
  };

  const ouvrir = (s) => {
    setOpenId(s.id);
    setCfgFormat('post');
  };

  // --- Transformation d'un sujet en contenu (le sujet RESTE dispo : réutilisable sur plusieurs réseaux) ---
  const genererContenu = async (s) => {
    const fmt = cfgFormat;
    const meta = fmt === 'script' ? cfgType : cfgReseau;
    const qualite = cfgQualite;
    const cardId = nextId();
    setContenus((prev) => [{ id: cardId, sujet: s.titre, texte: '', statut: 'redaction', format: fmt, meta, qualite }, ...prev]);
    setOpenId(null);
    // le sujet n'est PAS supprimé : on peut le réutiliser pour un autre réseau
    try {
      if (fmt === 'carrousel') {
        const d = await agentService.carrousel(s.titre, meta, nbSlides, qualite);
        if (d.credits != null) updateUser({ credits: d.credits });
        setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'carrousel', images: d.slides_images || [] } : c)));
        return;
      }
      const d = fmt === 'script'
        ? await agentService.script(s.titre, meta, qualite)
        : await agentService.rediger(s.titre, meta, false, qualite);
      if (d.credits != null) updateUser({ credits: d.credits });
      const texte = fmt === 'script' ? (d.script || '') : (d.contenu || '');
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, texte, statut: 'pret' } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: fmt === 'carrousel' ? 'carrousel' : 'pret', images: c.images || [] } : c)));
      erreurGen(e);
    }
  };

  // --- Génération depuis un brief libre écrit par l'utilisateur ---
  const genererBrief = async () => {
    const txt = briefText.trim();
    if (!txt) return;
    if (!marqueOk) { toast.error('Renseignez votre secteur dans Paramètres → Voix de marque.'); return; }
    const fmt = bFormat;
    const meta = fmt === 'script' ? bType : bReseau;
    const qualite = bQualite;
    const cardId = nextId();
    const titre = txt.length > 80 ? txt.slice(0, 80) + '…' : txt;
    setContenus((prev) => [{ id: cardId, sujet: titre, promptFull: txt, texte: '', statut: 'redaction', format: fmt, meta, qualite }, ...prev]);
    setBriefText('');
    setBriefOpen(false);
    try {
      if (fmt === 'carrousel') {
        const d = await agentService.carrousel(txt, meta, nbSlides, qualite);
        if (d.credits != null) updateUser({ credits: d.credits });
        setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'carrousel', images: d.slides_images || [] } : c)));
        return;
      }
      const d = fmt === 'script'
        ? await agentService.script(txt, meta, qualite)
        : await agentService.rediger(txt, meta, false, qualite);
      if (d.credits != null) updateUser({ credits: d.credits });
      const texte = fmt === 'script' ? (d.script || '') : (d.contenu || '');
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, texte, statut: 'pret' } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: fmt === 'carrousel' ? 'carrousel' : 'pret', images: c.images || [] } : c)));
      erreurGen(e);
    }
  };

  // --- Génération d'un post à partir d'une photo (vision) ---
  const prendrePhoto = async () => {
    try {
      const f = await takePhoto();
      if (f) genererPhoto(f);
    } catch (e) {
      // annulation utilisateur ou permission refusée -> silencieux
    }
  };

  const genererPhoto = async (file) => {
    if (!file) return;
    if (!marqueOk) { toast.error('Renseignez votre secteur dans Paramètres → Voix de marque.'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Choisissez une image (jpg, png, webp).'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image trop lourde (max 10 Mo).'); return; }
    setPhotoLoading(true);
    const cardId = nextId();
    setContenus((prev) => [{ id: cardId, sujet: 'Post depuis une photo', statut: 'redaction', format: 'photo', meta: photoReseau, qualite: photoQualite }, ...prev]);
    setPhotoOpen(false);
    try {
      const d = await agentService.redigerPhoto(file, photoReseau, photoQualite);
      if (d.credits != null) updateUser({ credits: d.credits });
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'photo', texte: d.contenu || '', image: d.lien_visuel } : c)));
    } catch (e) {
      setContenus((prev) => prev.filter((c) => c.id !== cardId));
      erreurGen(e);
    } finally {
      setPhotoLoading(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  const regenerer = async (id) => {
    const card = contenus.find((c) => c.id === id);
    if (!card) return;
    const prompt = card.promptFull || card.sujet;
    setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'redaction' } : c)));
    try {
      const d = card.format === 'script'
        ? await agentService.script(prompt, card.meta, card.qualite)
        : await agentService.rediger(prompt, card.meta, false, card.qualite);
      if (d.credits != null) updateUser({ credits: d.credits });
      const texte = card.format === 'script' ? (d.script || '') : (d.contenu || '');
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, texte, statut: 'pret' } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'pret' } : c)));
      erreurGen(e);
    }
  };

  const editer = (id, texte) => setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, texte } : c)));

  const valider = async (id) => {
    const card = contenus.find((c) => c.id === id);
    if (!card || !card.texte.trim()) return;
    setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, saving: true } : c)));
    try {
      if (card.format === 'script') await agentService.enregistrerScript(card.texte, card.sujet, card.meta);
      else await agentService.enregistrer(card.texte, card.sujet, card.meta);
      setContenus((prev) => prev.filter((c) => c.id !== id)); // validé → quitte le Studio
      toast.success(card.format === 'script' ? 'Script validé → onglet Contenus' : 'Post validé → onglet Contenus');
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, saving: false } : c)));
      toast.error(e.response?.data?.detail || 'Erreur lors de la validation');
    }
  };

  return (
    <div className="w-full space-y-6 pb-10">
      <PageHeader
        icon={Sparkles}
        title="Studio IA"
        subtitle="Votre IA génère vos contenus à partir de votre marque"
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <span className="text-xs text-slate-400 font-inter">Crédits</span>
            <span className="text-sm font-semibold text-white font-inter">{user?.credits ?? '—'}</span>
          </div>
        }
      />

      {/* Fil de progression */}
      <div className="flex items-center max-w-2xl">
        {STEPS.map((s, i) => {
          const done = step > s.n;
          const active = step === s.n;
          const Icon = s.icon;
          return (
            <div key={s.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-inter transition-all duration-300 ${
                  done ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : active ? 'bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] text-white'
                    : 'bg-slate-800 text-slate-500 border border-white/10'
                }`}>
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-xs font-inter font-medium hidden sm:block ${active || done ? 'text-slate-200' : 'text-slate-500'}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 transition-all duration-300 ${step > s.n ? 'bg-emerald-500/40' : 'bg-white/10'}`} />}
            </div>
          );
        })}
      </div>

      {/* Garde-fou */}
      {!marqueOk && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm font-inter">
            <p className="text-amber-300 font-medium">Complétez votre marque d'abord</p>
            <p className="text-amber-400/80 text-xs mt-1 leading-relaxed">
              Renseignez au moins votre <span className="font-medium">secteur</span> dans{' '}
              <Link to="/dashboard/parametres" className="underline text-amber-200 hover:text-white">Paramètres → Voix de marque</Link>.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ─── GAUCHE : Réserve de sujets ─── */}
        <section className="bg-slate-900/60 border border-white/[0.06] rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h2 className="font-medium font-inter text-slate-200">1. Réserve de sujets</h2>
          </div>

          {/* Génération : nombre + bouton */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-inter">Nombre</span>
            <input
              type="number" min={1} max={12} value={nbSujets}
              onChange={(e) => setNbSujets(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)))}
              className="w-16 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-1.5 outline-none focus:border-[#5B6CFF]/50"
            />
            <Button onClick={proposerSujets} disabled={!marqueOk || loadingSujets} data-testid="studio-generer-sujets"
              className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white disabled:opacity-40 ml-auto">
              {loadingSujets ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="ml-2">Générer des sujets</span>
            </Button>
          </div>

          {/* Brief perso (sujet libre) */}
          <div className="rounded-xl border border-white/5 bg-slate-950/40">
            <button onClick={() => setBriefOpen((o) => !o)} data-testid="studio-brief-toggle"
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-inter text-slate-300 hover:text-white transition-colors">
              <PenLine className="w-4 h-4 text-[#8A6CFF]" />
              <span>Écrire mon propre brief</span>
              <span className="ml-auto text-xs text-slate-500">{briefOpen ? '▲' : '▼'}</span>
            </button>
            {briefOpen && (
              <div className="px-4 pb-4 space-y-3 animate-fade-in">
                <Textarea
                  value={briefText} onChange={(e) => setBriefText(e.target.value)} rows={3}
                  data-testid="studio-brief-text"
                  placeholder="Ex : Promo pour la sortie du module Goodtime — ton enthousiaste, bénéfices clés, CTA inscription."
                  className="bg-slate-950/60 border-white/10 text-slate-100 font-inter resize-y text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-inter">Format</span>
                  {FORMATS.map((f) => {
                    const Icon = f.icon;
                    return (
                      <Pill key={f.id} active={bFormat === f.id} onClick={() => setBFormat(f.id)}>
                        <span className="inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{f.label}</span>
                      </Pill>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-inter">{bFormat === 'script' ? 'Type' : 'Réseau'}</span>
                  {bFormat !== 'script' && reseaux.length === 0
                    ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">Connecte un réseau dans Paramètres →</Link>
                    : (bFormat === 'script' ? TYPES_VIDEO : reseaux).map((r) => (
                    <Pill key={r.id}
                      active={bFormat === 'script' ? bType === r.id : bReseau === r.id}
                      onClick={() => (bFormat === 'script' ? setBType(r.id) : setBReseau(r.id))}>
                      {r.label}
                    </Pill>
                  ))}
                </div>
                {bFormat === 'carrousel' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-inter">Slides</span>
                    <input type="number" min={3} max={10} value={nbSlides}
                      onChange={(e) => setNbSlides(Math.max(3, Math.min(10, parseInt(e.target.value, 10) || 5)))}
                      className="w-16 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-1 outline-none focus:border-[#5B6CFF]/50" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-inter">Qualité</span>
                  {QUALITES.map((q) => (
                    <Pill key={q.id} active={bQualite === q.id} onClick={() => setBQualite(q.id)}>
                      {q.icon} {q.label} · {q.cout[bFormat]} cr.
                    </Pill>
                  ))}
                </div>
                <div className="flex items-center justify-end">
                  <Button onClick={genererBrief} disabled={!marqueOk || !briefText.trim()} data-testid="studio-brief-generer"
                    className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white disabled:opacity-40">
                    <Wand2 className="w-4 h-4" /><span className="ml-2">Rédiger · {QUALITES.find((q) => q.id === bQualite)?.cout[bFormat]} cr.</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Depuis une photo (vision) */}
          <div className="rounded-xl border border-white/5 bg-slate-950/40">
            <button onClick={() => setPhotoOpen((o) => !o)} data-testid="studio-photo-toggle"
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-inter text-slate-300 hover:text-white transition-colors">
              <ImageIcon className="w-4 h-4 text-[#3AFFA3]" />
              <span>Générer depuis une photo</span>
              <span className="ml-auto text-xs text-slate-500">{photoOpen ? '▲' : '▼'}</span>
            </button>
            {photoOpen && (
              <div className="px-4 pb-4 space-y-3 animate-fade-in">
                <p className="text-xs text-slate-500 font-inter">Importe une photo : l'IA l'analyse et écrit un post adapté au réseau. La photo devient le visuel.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-inter">Réseau</span>
                  {reseaux.length === 0
                    ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">Connecte un réseau dans Paramètres →</Link>
                    : reseaux.map((r) => <Pill key={r.id} active={photoReseau === r.id} onClick={() => setPhotoReseau(r.id)}>{r.label}</Pill>)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-inter">Qualité</span>
                  {QUALITES.map((q) => <Pill key={q.id} active={photoQualite === q.id} onClick={() => setPhotoQualite(q.id)}>{q.icon} {q.label} · {q.cout.post} cr.</Pill>)}
                </div>
                <input ref={photoRef} type="file" accept="image/*" className="hidden" data-testid="studio-photo-input"
                  onChange={(e) => genererPhoto(e.target.files?.[0])} />
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  {cameraAvailable() && (
                    <Button onClick={prendrePhoto} disabled={!marqueOk || photoLoading}
                      className="bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 disabled:opacity-40">
                      <Camera className="w-4 h-4" />
                      <span className="ml-2">Prendre une photo</span>
                    </Button>
                  )}
                  <Button onClick={() => photoRef.current?.click()} disabled={!marqueOk || photoLoading}
                    className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white disabled:opacity-40">
                    {photoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    <span className="ml-2">{cameraAvailable() ? 'Importer' : 'Choisir une photo'} · {QUALITES.find((q) => q.id === photoQualite)?.cout.post} cr.</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Logs */}
          {loadingSujets && (
            <div className="space-y-2 rounded-xl bg-slate-950/50 border border-white/5 p-4 animate-fade-in">
              {LOGS_SUJETS.map((log, i) => {
                if (i > logIndex) return null;
                const isCurrent = i === logIndex;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm font-inter animate-fade-in">
                    {isCurrent ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5B6CFF]" /> : <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    <span className={isCurrent ? 'text-slate-300' : 'text-slate-500'}>{log}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* État vide */}
          {!loadingSujets && sujets.length === 0 && (
            <div className="flex flex-col items-center text-center gap-3 py-10 text-slate-500">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center">
                <Wand2 className="w-7 h-7 text-[#5B6CFF]" />
              </div>
              <p className="text-sm font-inter max-w-xs">
                Générez une réserve d'idées. Vous choisirez le format et le réseau au moment de transformer chaque sujet.
              </p>
            </div>
          )}

          {/* Liste des sujets */}
          {sujets.length > 0 && (
            <div className="space-y-2 animate-fade-in">
              {sujets.map((s) => {
                const open = openId === s.id;
                return (
                  <div key={s.id} data-testid={`studio-sujet-${s.id}`}
                    className={`rounded-xl border transition-all ${open ? 'border-[#5B6CFF]/40 bg-[#5B6CFF]/[0.06]' : 'border-white/5 bg-slate-800/40 hover:border-white/15'}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="flex-1 text-sm text-slate-200 font-inter">{s.titre}</span>
                      {!open && (
                        <>
                          <button onClick={() => ouvrir(s)} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[#5B6CFF]/20 text-white hover:bg-[#5B6CFF]/30 transition-all flex-shrink-0">
                            Créer →
                          </button>
                          <button onClick={() => supprimerSujet(s.id)} title="Supprimer" className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Config inline : format + réseau/type */}
                    {open && (
                      <div className="px-4 pb-4 pt-1 space-y-3 animate-fade-in">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-500 font-inter">Format</span>
                          {FORMATS.map((f) => {
                            const Icon = f.icon;
                            return (
                              <Pill key={f.id} active={cfgFormat === f.id} onClick={() => setCfgFormat(f.id)}>
                                <span className="inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{f.label}</span>
                              </Pill>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-500 font-inter">{cfgFormat === 'script' ? 'Type' : 'Réseau'}</span>
                          {cfgFormat !== 'script' && reseaux.length === 0
                            ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">Connecte un réseau dans Paramètres →</Link>
                            : (cfgFormat === 'script' ? TYPES_VIDEO : reseaux).map((r) => (
                            <Pill key={r.id}
                              active={cfgFormat === 'script' ? cfgType === r.id : cfgReseau === r.id}
                              onClick={() => (cfgFormat === 'script' ? setCfgType(r.id) : setCfgReseau(r.id))}>
                              {r.label}
                            </Pill>
                          ))}
                        </div>
                        {cfgFormat === 'carrousel' && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-inter">Slides</span>
                            <input type="number" min={3} max={10} value={nbSlides}
                              onChange={(e) => setNbSlides(Math.max(3, Math.min(10, parseInt(e.target.value, 10) || 5)))}
                              className="w-16 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-1 outline-none focus:border-[#5B6CFF]/50" />
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-500 font-inter">Qualité</span>
                          {QUALITES.map((q) => (
                            <Pill key={q.id} active={cfgQualite === q.id} onClick={() => setCfgQualite(q.id)}>
                              {q.icon} {q.label} · {q.cout[cfgFormat]} cr.
                            </Pill>
                          ))}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setOpenId(null)} className="text-xs text-slate-400 hover:text-white font-inter px-2">Annuler</button>
                          <Button onClick={() => genererContenu(s)} className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white">
                            <Wand2 className="w-4 h-4" /><span className="ml-2">Générer · {QUALITES.find((q) => q.id === cfgQualite)?.cout[cfgFormat]} cr.</span>
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── DROITE : Contenus ─── */}
        <section className="bg-slate-900/60 border border-white/[0.06] rounded-2xl p-5 space-y-4 min-h-[320px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenLine className="w-4 h-4 text-[#3AFFA3]" />
              <h2 className="font-medium font-inter text-slate-200">2. Vos contenus</h2>
            </div>
            {contenus.length > 0 && (
              <span className="text-xs text-slate-500 font-inter">{contenus.length} brouillon{contenus.length > 1 ? 's' : ''}</span>
            )}
          </div>

          {contenus.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-3 py-16 text-slate-500">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center">
                <PenLine className="w-6 h-6 text-slate-600" />
              </div>
              <p className="text-sm font-inter max-w-[15rem]">
                Transformez un sujet (à gauche) en post ou en script — il apparaîtra ici.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {contenus.map((c) => (
                <div key={c.id} data-testid={`studio-contenu-${c.id}`}
                  className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 space-y-3 transition-all duration-300 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-inter flex-shrink-0">
                      {c.format === 'script' ? `🎬 ${c.meta}` : c.format === 'carrousel' ? `🖼 ${c.meta}` : c.format === 'photo' ? `📷 ${c.meta}` : c.meta}
                    </span>
                    <span className="text-xs font-medium text-slate-400 font-inter flex-1 truncate">{c.sujet}</span>
                    <button onClick={() => supprimerContenu(c.id)} title="Retirer" className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {c.statut === 'redaction' ? (
                    <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-[#5B6CFF]" />
                      <span className="font-inter text-sm">{c.format === 'carrousel' ? 'Création du carrousel… (slides + images)' : c.format === 'photo' ? 'Analyse de la photo…' : c.format === 'script' ? 'Écriture du script…' : 'Rédaction du post…'}</span>
                    </div>
                  ) : c.format === 'photo' ? (
                    <div className="space-y-3">
                      {c.image && <img src={c.image} alt="" className="w-full rounded-lg border border-white/10 max-h-60 object-cover" />}
                      <p className="text-sm text-slate-200 font-inter whitespace-pre-wrap">{c.texte}</p>
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-inter">
                        <Check className="w-3.5 h-3.5" /> Post + photo enregistrés → onglet Contenus
                      </div>
                    </div>
                  ) : c.format === 'carrousel' ? (
                    <div className="space-y-3">
                      {c.images && c.images.length ? (
                        <div className="grid grid-cols-3 gap-2">
                          {c.images.map((u, i) => (
                            <img key={i} src={u} alt={`slide ${i + 1}`} className="w-full rounded-lg border border-white/10" />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-400 font-inter py-4 text-center">Aucune image générée — réessaie.</p>
                      )}
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-inter">
                        <Check className="w-3.5 h-3.5" /> Carrousel enregistré → onglet Contenus
                      </div>
                    </div>
                  ) : (
                    <>
                      <Textarea value={c.texte} onChange={(e) => editer(c.id, e.target.value)}
                        rows={c.format === 'script' ? 12 : 9}
                        className="bg-slate-950/60 border-white/10 text-slate-100 font-inter resize-y" />
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={() => regenerer(c.id)} className="text-slate-400 hover:text-white">
                          <RefreshCw className="w-4 h-4" /><span className="ml-2">Régénérer</span>
                        </Button>
                        <Button data-testid={`studio-valider-${c.id}`} onClick={() => valider(c.id)} disabled={c.saving || !c.texte.trim()}
                          className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30">
                          {c.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}<span className="ml-2">Valider</span>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
