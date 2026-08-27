import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles, Loader2, Lightbulb, PenLine, Check, CheckCircle2,
  RefreshCw, Image as ImageIcon, AlertTriangle, Wand2, Clapperboard, Trash2, LayoutGrid, Camera,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { agentService } from '../services/agentService';
import { videoService } from '../services/videoService';
import { contenuService } from '../services/contenuService';
import { takePhoto, cameraAvailable } from '../lib/photo';
import { useUser } from '../context/UserContext';
import { track } from '../lib/analytics';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';

const FORMATS = [
  { id: 'post', labelKey: 'formatPost', icon: PenLine },
  { id: 'carrousel', labelKey: 'formatCarousel', icon: LayoutGrid },
  { id: 'story', labelKey: 'formatStory', icon: ImageIcon },
  { id: 'script', labelKey: 'formatScript', icon: Clapperboard },
];
// Les stories ne se publient que sur Instagram et Facebook (Zernio)
const RESEAUX_STORY = ['instagram', 'facebook'];
// Réseaux proposés pour un POST écrit (YouTube exclu : il faut une vidéo).
// La liste affichée est ensuite filtrée sur les comptes réellement connectés.
const RESEAUX = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'googlebusiness', label: 'Google Business' },
  { id: 'twitter', label: 'X (Twitter)' },
];
// Les ids sont envoyés tels quels à l'API — seuls les labels (labelKey) se traduisent.
const TYPES_VIDEO = [
  { id: 'Reel', labelKey: 'typeReel' },
  { id: 'Short', labelKey: 'typeShort' },
  { id: 'Video', labelKey: 'typeVideo' },
  { id: 'Interview', labelKey: 'typeInterview' },
];
// Qualité de génération : plus de choix côté client (héritage du système de crédits).
// Tout passe en 'equilibre' ; le backend garde le paramètre (réactivable par offre si besoin).

// Les 4 dimensions d'un sujet (brief actionnable) — emoji + libellé pour filtres et tags
const DIM_META = [
  { cle: 'objectif', emoji: '🎯', label: 'Objectif' },
  { cle: 'angle', emoji: '🧠', label: 'Angle' },
  { cle: 'cible', emoji: '👥', label: 'Cible' },
  { cle: 'format', emoji: '📱', label: 'Format' },
];

// Clés i18n (préfixe studio.) des logs affichés pendant la génération de sujets
const LOGS_SUJETS = ['logBrandVoice', 'logSectorAudience', 'logAngles', 'logTopics'];

const STEPS = [
  { n: 1, labelKey: 'stepSubjects', icon: Lightbulb },
  { n: 2, labelKey: 'stepGeneration', icon: PenLine },
  { n: 3, labelKey: 'stepValidation', icon: CheckCircle2 },
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser } = useUser();
  const [usage, setUsage] = useState(null);
  const refreshUsage = () => agentService.usage().then(setUsage).catch(() => {});
  useEffect(() => { refreshUsage(); }, []);
  const sujetsReste = () => {
    const g = usage?.gauges?.find((x) => x.action_type === 'subject');
    return g ? Math.max(0, g.limit - g.used) : null;
  };
  const marqueOk = !!(user?.secteur && String(user.secteur).trim());
  // On ne propose que les réseaux dont le compte est connecté (Paramètres → Réseaux)
  const reseaux = RESEAUX.filter((r) => !!user?.[`late_account_${r.id}`]);
  // Story : seulement Instagram/Facebook
  const reseauxPour = (fmt) => (fmt === 'story' ? reseaux.filter((r) => RESEAUX_STORY.includes(r.id)) : reseaux);

  const erreurGen = (e) => {
    if (e?.response?.status === 402) toast.error(e?.response?.data?.detail || t('studio.quotaReached'));
    else toast.error(e?.response?.data?.detail || t('studio.generationError'));
    refreshUsage();
  };

  const [nbSujets, setNbSujets] = useState(6);
  const [sujets, setSujets] = useState([]);
  const [dims, setDims] = useState(null);      // listes de valeurs des dimensions (backend)
  const [filtres, setFiltres] = useState({});  // dimensions imposées à la génération (optionnel)
  const [filtresOpen, setFiltresOpen] = useState(false); // panneau de ciblage optionnel
  const [openId, setOpenId] = useState(null); // sujet en cours de configuration
  const [cfgFormat, setCfgFormat] = useState('post');
  // Multi-réseaux : on peut cocher plusieurs réseaux — le 1er devient le post principal,
  // les autres reçoivent une copie planifiée sur leur propre créneau (même méca que Recycler).
  const [cfgReseaux, setCfgReseaux] = useState(['linkedin']);
  const [cfgType, setCfgType] = useState('Reel');
  const cfgQualite = 'equilibre'; // qualité unique (sélecteur retiré avec le système de crédits)
  const [nbSlides, setNbSlides] = useState(5); // carrousel

  // Coche/décoche un réseau (toujours au moins un de coché)
  const toggleReseau = (setter) => (id) =>
    setter((arr) => (arr.includes(id) ? (arr.length > 1 ? arr.filter((x) => x !== id) : arr) : [...arr, id]));

  // Brief perso (sujet libre écrit par l'utilisateur)
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [bFormat, setBFormat] = useState('post');
  const [bReseaux, setBReseaux] = useState(['linkedin']);
  const [bType, setBType] = useState('Reel');
  const bQualite = 'equilibre';
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoReseau, setPhotoReseau] = useState('linkedin');
  const photoQualite = 'equilibre';

  // Aligne les réseaux sélectionnés sur ceux réellement connectés
  useEffect(() => {
    if (!reseaux.length) return;
    const ids = reseaux.map((r) => r.id);
    const garde = (arr) => { const ok = arr.filter((x) => ids.includes(x)); return ok.length ? ok : [reseaux[0].id]; };
    setBReseaux(garde);
    setCfgReseaux(garde);
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
    agentService.dimensions().then(setDims).catch(() => {});
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

  // Affichage traduit d'un type vidéo (la valeur stockée/envoyée à l'API reste l'id, ex. 'Video')
  const typeVideoLabel = (id) => {
    const v = TYPES_VIDEO.find((x) => x.id === id);
    return v ? t(`studio.${v.labelKey}`) : id;
  };

  const step = contenus.length === 0 ? 1 : 2;

  // --- Sujets ---
  const proposerSujets = async () => {
    if (!marqueOk) { toast.error(t('studio.fillSectorFirst')); return; }
    setLoadingSujets(true);
    try {
      const data = await agentService.sujets(nbSujets, filtres);
      const nouveaux = data.sujets || [];
      setSujets((prev) => [...nouveaux, ...prev]);
      refreshUsage();
      if (!nouveaux.length) toast.info(t('studio.noSubjectsGenerated'));
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

  // --- Transformation d'un sujet en contenu ---
  // Le sujet reste dans la réserve tant que rien n'est validé (réutilisable pour un autre réseau/format),
  // puis en sort automatiquement dès qu'un contenu généré à partir de lui est enregistré (carrousel : à la
  // génération, qui sauvegarde direct ; post/script : au clic sur "Valider").
  const genererContenu = async (s) => {
    const fmt = cfgFormat;
    const meta = fmt === 'script' ? cfgType : cfgReseaux[0];
    const extras = fmt === 'script' ? [] : cfgReseaux.slice(1); // réseaux additionnels cochés
    const qualite = cfgQualite;
    const cardId = nextId();
    setContenus((prev) => [{ id: cardId, sujet: s.titre, sujetId: s.id, texte: '', statut: 'redaction', format: fmt, meta, extras, qualite }, ...prev]);
    setOpenId(null);
    // le sujet reste dispo tant que rien n'est validé : on peut le réutiliser pour un autre réseau
    // (il disparaît de la réserve seulement quand un contenu généré à partir de lui est validé — voir `valider`)
    try {
      if (fmt === 'carrousel') {
        const d = await agentService.carrousel(s.titre, meta, nbSlides, qualite, null, s.dimensions);
        if (d.credits != null) updateUser({ credits: d.credits });
        track('contenu_genere', { format: 'carrousel', reseau: meta, qualite });
        setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'carrousel', images: d.slides_images || [] } : c)));
        if (s.id) supprimerSujet(s.id); // carrousel enregistré directement → le sujet est traité
        // Réseaux additionnels cochés : copie du carrousel sur chacun (slides re-rendues, créneau propre)
        if (extras.length && d.contenu_id) {
          try {
            await contenuService.recycler(d.contenu_id, extras);
            toast.success(t('studio.carouselDuplicated', { count: extras.length }));
          } catch (err) {
            toast.error(t('studio.carouselCopiesFailed'));
          }
        }
        return;
      }
      const d = fmt === 'script'
        ? await agentService.script(s.titre, meta, qualite, s.dimensions)
        : await agentService.rediger(s.titre, meta, false, qualite, s.dimensions);
      if (d.credits != null) updateUser({ credits: d.credits });
      track('contenu_genere', { format: fmt, reseau: meta, qualite });
      const texte = fmt === 'script' ? (d.script || '') : (d.contenu || '');
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, texte, statut: 'pret' } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'erreur' } : c)));
      erreurGen(e);
    }
  };

  // --- Génération depuis un brief libre écrit par l'utilisateur ---
  const genererBrief = async () => {
    const txt = briefText.trim();
    if (!txt) return;
    if (!marqueOk) { toast.error(t('studio.fillSectorFirst')); return; }
    const fmt = bFormat;
    const meta = fmt === 'script' ? bType : bReseaux[0];
    const extras = fmt === 'script' ? [] : bReseaux.slice(1);
    const qualite = bQualite;
    const cardId = nextId();
    const titre = txt.length > 80 ? txt.slice(0, 80) + '…' : txt;
    setContenus((prev) => [{ id: cardId, sujet: titre, promptFull: txt, texte: '', statut: 'redaction', format: fmt, meta, extras, qualite }, ...prev]);
    setBriefText('');
    setBriefOpen(false);
    try {
      if (fmt === 'carrousel') {
        const d = await agentService.carrousel(txt, meta, nbSlides, qualite);
        if (d.credits != null) updateUser({ credits: d.credits });
        track('contenu_genere', { format: 'carrousel', reseau: meta, qualite, source: 'brief' });
        setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'carrousel', images: d.slides_images || [] } : c)));
        if (extras.length && d.contenu_id) {
          try {
            await contenuService.recycler(d.contenu_id, extras);
            toast.success(t('studio.carouselDuplicated', { count: extras.length }));
          } catch (err) {
            toast.error(t('studio.carouselCopiesFailed'));
          }
        }
        return;
      }
      const d = fmt === 'script'
        ? await agentService.script(txt, meta, qualite)
        : await agentService.rediger(txt, meta, false, qualite);
      if (d.credits != null) updateUser({ credits: d.credits });
      track('contenu_genere', { format: fmt, reseau: meta, qualite, source: 'brief' });
      const texte = fmt === 'script' ? (d.script || '') : (d.contenu || '');
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, texte, statut: 'pret' } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'erreur' } : c)));
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
    if (!marqueOk) { toast.error(t('studio.fillSectorFirst')); return; }
    if (!file.type.startsWith('image/')) { toast.error(t('studio.invalidImage')); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('studio.imageTooLarge')); return; }
    setPhotoLoading(true);
    const cardId = nextId();
    setContenus((prev) => [{ id: cardId, sujet: t('studio.postFromPhoto'), statut: 'redaction', format: 'photo', meta: photoReseau, qualite: photoQualite }, ...prev]);
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
      if (card.format === 'carrousel') {
        const d = await agentService.carrousel(prompt, card.meta, nbSlides, card.qualite);
        if (d.credits != null) updateUser({ credits: d.credits });
        setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'carrousel', images: d.slides_images || [] } : c)));
        const extras = card.extras || [];
        if (extras.length && d.contenu_id) {
          try {
            await contenuService.recycler(d.contenu_id, extras);
            toast.success(t('studio.carouselDuplicated', { count: extras.length }));
          } catch (err) {
            toast.error(t('studio.carouselCopiesFailed'));
          }
        }
        return;
      }
      const d = card.format === 'script'
        ? await agentService.script(prompt, card.meta, card.qualite)
        : await agentService.rediger(prompt, card.meta, false, card.qualite);
      if (d.credits != null) updateUser({ credits: d.credits });
      const texte = card.format === 'script' ? (d.script || '') : (d.contenu || '');
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, texte, statut: 'pret' } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'erreur' } : c)));
      erreurGen(e);
    }
  };

  const editer = (id, texte) => setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, texte } : c)));

  const valider = async (id) => {
    const card = contenus.find((c) => c.id === id);
    if (!card || !card.texte.trim()) return;
    setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, saving: true } : c)));
    try {
      if (card.format === 'script') {
        // Script vidéo → contenu « À tourner » (apparaît dans Contenus, prêt à monter)
        const d = await videoService.createDraft({ script: card.texte, titre: card.sujet });
        setContenus((prev) => prev.filter((c) => c.id !== id));
        if (card.sujetId) supprimerSujet(card.sujetId); // le sujet est traité → sort de la réserve
        toast.success(t('studio.scriptReady'), {
          action: d?.contenu_id ? { label: t('studio.editVideoAction'), onClick: () => navigate(`/dashboard/video?contenu_id=${d.contenu_id}`) } : undefined,
        });
        return;
      }
      const d = await agentService.enregistrer(card.texte, card.sujet, card.meta, card.format === 'story' ? 'Story' : null);
      // Réseaux additionnels cochés : on NE duplique PLUS tout de suite (le post n'a pas encore
      // d'image → ça obligeait à régénérer une image par copie). On duplique seulement une fois
      // qu'une image existe sur cette fiche, via le bouton ♻️ Recycler dans Contenus — la même
      // image est alors reprise pour toutes les copies, zéro régénération.
      setContenus((prev) => prev.filter((c) => c.id !== id)); // validé → quitte le Studio
      if (card.sujetId) supprimerSujet(card.sujetId); // le sujet est traité → sort de la réserve
      if (card.extras?.length) {
        toast.success(t('studio.postValidatedRecycle'), { duration: 8000 });
      } else {
        toast.success(card.format === 'story'
          ? t('studio.storyValidated')
          : t('studio.postValidated'));
      }
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, saving: false } : c)));
      toast.error(e.response?.data?.detail || t('studio.validationError'));
    }
  };

  return (
    <div className="w-full space-y-6 pb-10">
      <PageHeader
        icon={Sparkles}
        title={t('studio.pageTitle')}
        subtitle={t('studio.pageSubtitle')}
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3]" />
            <span className="text-sm font-semibold text-white font-inter">{sujetsReste() ?? '—'}</span>
            <span className="text-xs text-slate-400 font-inter">{t('studio.subjectsRemaining')}</span>
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
                <span className={`text-xs font-inter font-medium hidden sm:block ${active || done ? 'text-slate-200' : 'text-slate-500'}`}>{t(`studio.${s.labelKey}`)}</span>
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
            <p className="text-amber-300 font-medium">{t('studio.completeBrandFirst')}</p>
            <p className="text-amber-400/80 text-xs mt-1 leading-relaxed">
              {t('studio.guardIntro')} <span className="font-medium">{t('studio.guardSector')}</span> {t('studio.guardIn')}{' '}
              <Link to="/dashboard/parametres" className="underline text-amber-200 hover:text-white">{t('studio.settingsBrandVoice')}</Link>.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ─── GAUCHE : Réserve de sujets ─── */}
        <section className="bg-slate-900/60 border border-white/[0.06] rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h2 className="font-medium font-inter text-slate-200">{t('studio.subjectsReserveTitle')}</h2>
          </div>

          {/* Génération : nombre + bouton */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-inter">{t('studio.countLabel')}</span>
            <input
              type="number" min={1} max={12} value={nbSujets}
              onChange={(e) => setNbSujets(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)))}
              className="w-16 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-1.5 outline-none focus:border-[#5B6CFF]/50"
            />
            <Button onClick={proposerSujets} disabled={!marqueOk || loadingSujets} data-testid="studio-generer-sujets"
              className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white disabled:opacity-40 ml-auto">
              {loadingSujets ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="ml-2">{t('studio.generateSubjects')}</span>
            </Button>
          </div>

          {/* Ciblage optionnel : impose une ou plusieurs dimensions à la génération (sinon l'IA varie) */}
          {dims && (
            <div className="rounded-xl border border-white/5 bg-slate-950/40">
              <button onClick={() => setFiltresOpen((o) => !o)} data-testid="studio-filtres-toggle"
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-inter text-slate-300 hover:text-white transition-colors">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>{t('studio.targetSubjects')}</span>
                {Object.values(filtres).filter(Boolean).length > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#5B6CFF]/20 text-[#c9d2ff]">
                    {Object.values(filtres).filter(Boolean).length}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-500">{filtresOpen ? '▲' : '▼'}</span>
              </button>
              {filtresOpen && (
                <div className="px-4 pb-4 grid grid-cols-2 gap-3 animate-fade-in">
                  {DIM_META.map(({ cle, emoji, label }) => (
                    <label key={cle} className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500 font-inter">{emoji} {label}</span>
                      <select
                        value={filtres[cle] || ''}
                        onChange={(e) => setFiltres((f) => ({ ...f, [cle]: e.target.value }))}
                        data-testid={`studio-filtre-${cle}`}
                        className="rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-2.5 py-1.5 outline-none focus:border-[#5B6CFF]/50">
                        <option value="">{t('studio.filterAny')}</option>
                        {(dims[cle] || []).map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </label>
                  ))}
                  {Object.values(filtres).filter(Boolean).length > 0 && (
                    <button onClick={() => setFiltres({})}
                      className="col-span-2 text-xs text-slate-500 hover:text-slate-300 transition-colors text-left">
                      {t('studio.filterReset')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Brief perso (sujet libre) */}
          <div className="rounded-xl border border-white/5 bg-slate-950/40">
            <button onClick={() => setBriefOpen((o) => !o)} data-testid="studio-brief-toggle"
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-inter text-slate-300 hover:text-white transition-colors">
              <PenLine className="w-4 h-4 text-[#8A6CFF]" />
              <span>{t('studio.writeOwnBrief')}</span>
              <span className="ml-auto text-xs text-slate-500">{briefOpen ? '▲' : '▼'}</span>
            </button>
            {briefOpen && (
              <div className="px-4 pb-4 space-y-3 animate-fade-in">
                <Textarea
                  value={briefText} onChange={(e) => setBriefText(e.target.value)} rows={3}
                  data-testid="studio-brief-text"
                  placeholder={t('studio.briefPlaceholder')}
                  className="bg-slate-950/60 border-white/10 text-slate-100 font-inter resize-y text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-inter">{t('studio.formatLabel')}</span>
                  {FORMATS.map((f) => {
                    const Icon = f.icon;
                    return (
                      <Pill key={f.id} active={bFormat === f.id} onClick={() => {
                        setBFormat(f.id);
                        if (f.id === 'story') setBReseaux((arr) => { const ok = arr.filter((x) => RESEAUX_STORY.includes(x)); return ok.length ? ok : [reseauxPour('story')[0]?.id].filter(Boolean); });
                      }}>
                        <span className="inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{t(`studio.${f.labelKey}`)}</span>
                      </Pill>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-inter">{bFormat === 'script' ? t('studio.typeLabel') : t('studio.networksLabel')}</span>
                  {bFormat !== 'script' && reseaux.length === 0
                    ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                    : (bFormat === 'script' ? TYPES_VIDEO : reseauxPour(bFormat)).map((r) => (
                    <Pill key={r.id}
                      active={bFormat === 'script' ? bType === r.id : bReseaux.includes(r.id)}
                      onClick={() => (bFormat === 'script' ? setBType(r.id) : toggleReseau(setBReseaux)(r.id))}>
                      {bFormat !== 'script' && bReseaux.includes(r.id) ? '✓ ' : ''}{r.labelKey ? t(`studio.${r.labelKey}`) : r.label}
                    </Pill>
                  ))}
                  {bFormat !== 'script' && bReseaux.length > 1 && (
                    <span className="text-[11px] text-[#3AFFA3] font-inter">{t('studio.onePostNNetworks', { n: bReseaux.length })}</span>
                  )}
                </div>
                {bFormat === 'carrousel' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-inter">{t('studio.slidesLabel')}</span>
                    <input type="number" min={3} max={10} value={nbSlides}
                      onChange={(e) => setNbSlides(Math.max(3, Math.min(10, parseInt(e.target.value, 10) || 5)))}
                      className="w-16 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-1 outline-none focus:border-[#5B6CFF]/50" />
                  </div>
                )}
                <div className="flex items-center justify-end">
                  <Button onClick={genererBrief} disabled={!marqueOk || !briefText.trim()} data-testid="studio-brief-generer"
                    className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white disabled:opacity-40">
                    <Wand2 className="w-4 h-4" /><span className="ml-2">{t('studio.writeButton')}</span>
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
              <span>{t('studio.generateFromPhoto')}</span>
              <span className="ml-auto text-xs text-slate-500">{photoOpen ? '▲' : '▼'}</span>
            </button>
            {photoOpen && (
              <div className="px-4 pb-4 space-y-3 animate-fade-in">
                <p className="text-xs text-slate-500 font-inter">{t('studio.photoHint')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-inter">{t('studio.networkLabel')}</span>
                  {reseaux.length === 0
                    ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                    : reseaux.map((r) => <Pill key={r.id} active={photoReseau === r.id} onClick={() => setPhotoReseau(r.id)}>{r.label}</Pill>)}
                </div>
                <input ref={photoRef} type="file" accept="image/*" className="hidden" data-testid="studio-photo-input"
                  onChange={(e) => genererPhoto(e.target.files?.[0])} />
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  {cameraAvailable() && (
                    <Button onClick={prendrePhoto} disabled={!marqueOk || photoLoading}
                      className="bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 disabled:opacity-40">
                      <Camera className="w-4 h-4" />
                      <span className="ml-2">{t('studio.takePhotoButton')}</span>
                    </Button>
                  )}
                  <Button onClick={() => photoRef.current?.click()} disabled={!marqueOk || photoLoading}
                    className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white disabled:opacity-40">
                    {photoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    <span className="ml-2">{cameraAvailable() ? t('studio.importButton') : t('studio.choosePhotoButton')}</span>
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
                    <span className={isCurrent ? 'text-slate-300' : 'text-slate-500'}>{t(`studio.${log}`)}</span>
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
                {t('studio.emptySubjectsHint')}
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
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm text-slate-200 font-inter">{s.titre}</span>
                        {s.dimensions && Object.values(s.dimensions).some(Boolean) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {DIM_META.map(({ cle, emoji }) => s.dimensions?.[cle] ? (
                              <span key={cle} className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/5 text-slate-400 font-inter">
                                {emoji} {s.dimensions[cle]}
                              </span>
                            ) : null)}
                          </div>
                        )}
                      </div>
                      {!open && (
                        <>
                          <button onClick={() => ouvrir(s)} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[#5B6CFF]/20 text-white hover:bg-[#5B6CFF]/30 transition-all flex-shrink-0">
                            {t('studio.createButton')}
                          </button>
                          <button onClick={() => supprimerSujet(s.id)} title={t('studio.deleteTitle')} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Config inline : format + réseau/type */}
                    {open && (
                      <div className="px-4 pb-4 pt-1 space-y-3 animate-fade-in">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-500 font-inter">{t('studio.formatLabel')}</span>
                          {FORMATS.map((f) => {
                            const Icon = f.icon;
                            return (
                              <Pill key={f.id} active={cfgFormat === f.id} onClick={() => {
                                setCfgFormat(f.id);
                                if (f.id === 'story') setCfgReseaux((arr) => { const ok = arr.filter((x) => RESEAUX_STORY.includes(x)); return ok.length ? ok : [reseauxPour('story')[0]?.id].filter(Boolean); });
                              }}>
                                <span className="inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{t(`studio.${f.labelKey}`)}</span>
                              </Pill>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-500 font-inter">{cfgFormat === 'script' ? t('studio.typeLabel') : t('studio.networksLabel')}</span>
                          {cfgFormat !== 'script' && reseaux.length === 0
                            ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                            : (cfgFormat === 'script' ? TYPES_VIDEO : reseauxPour(cfgFormat)).map((r) => (
                            <Pill key={r.id}
                              active={cfgFormat === 'script' ? cfgType === r.id : cfgReseaux.includes(r.id)}
                              onClick={() => (cfgFormat === 'script' ? setCfgType(r.id) : toggleReseau(setCfgReseaux)(r.id))}>
                              {cfgFormat !== 'script' && cfgReseaux.includes(r.id) ? '✓ ' : ''}{r.labelKey ? t(`studio.${r.labelKey}`) : r.label}
                            </Pill>
                          ))}
                          {cfgFormat !== 'script' && cfgReseaux.length > 1 && (
                            <span className="text-[11px] text-[#3AFFA3] font-inter">{t('studio.onePostNNetworks', { n: cfgReseaux.length })}</span>
                          )}
                        </div>
                        {cfgFormat === 'carrousel' && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-inter">{t('studio.slidesLabel')}</span>
                            <input type="number" min={3} max={10} value={nbSlides}
                              onChange={(e) => setNbSlides(Math.max(3, Math.min(10, parseInt(e.target.value, 10) || 5)))}
                              className="w-16 rounded-lg bg-slate-950/60 border border-white/10 text-slate-200 text-sm px-3 py-1 outline-none focus:border-[#5B6CFF]/50" />
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setOpenId(null)} className="text-xs text-slate-400 hover:text-white font-inter px-2">{t('studio.cancel')}</button>
                          <Button onClick={() => genererContenu(s)} className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white">
                            <Wand2 className="w-4 h-4" /><span className="ml-2">{t('studio.generateButton')}</span>
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
              <h2 className="font-medium font-inter text-slate-200">{t('studio.yourContentsTitle')}</h2>
            </div>
            {contenus.length > 0 && (
              <span className="text-xs text-slate-500 font-inter">{t('studio.draftsCount', { count: contenus.length })}</span>
            )}
          </div>

          {contenus.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-3 py-16 text-slate-500">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center">
                <PenLine className="w-6 h-6 text-slate-600" />
              </div>
              <p className="text-sm font-inter max-w-[15rem]">
                {t('studio.emptyContentsHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {contenus.map((c) => (
                <div key={c.id} data-testid={`studio-contenu-${c.id}`}
                  className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 space-y-3 transition-all duration-300 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-inter flex-shrink-0">
                      {c.format === 'script' ? `🎬 ${typeVideoLabel(c.meta)}` : c.format === 'carrousel' ? `🖼 ${c.meta}` : c.format === 'photo' ? `📷 ${c.meta}` : c.meta}
                    </span>
                    <span className="text-xs font-medium text-slate-400 font-inter flex-1 truncate">{c.sujet}</span>
                    <button onClick={() => supprimerContenu(c.id)} title={t('studio.removeTitle')} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {c.statut === 'erreur' ? (
                    <div className="flex flex-col items-center gap-2 text-center py-6">
                      <p className="text-xs text-red-400 font-inter">
                        {c.format === 'carrousel'
                          ? t('studio.carouselGenerationErrorLong')
                          : t('studio.generationErrorShort')}
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => regenerer(c.id)} className="text-slate-400 hover:text-white">
                        <RefreshCw className="w-4 h-4" /><span className="ml-2">{t('studio.retry')}</span>
                      </Button>
                    </div>
                  ) : c.statut === 'redaction' ? (
                    <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-[#5B6CFF]" />
                      <span className="font-inter text-sm">{c.format === 'carrousel' ? t('studio.creatingCarousel') : c.format === 'photo' ? t('studio.analyzingPhoto') : c.format === 'script' ? t('studio.writingScript') : t('studio.writingPost')}</span>
                    </div>
                  ) : c.format === 'photo' ? (
                    <div className="space-y-3">
                      {c.image && <img src={c.image} alt="" className="w-full rounded-lg border border-white/10 max-h-60 object-cover" />}
                      <p className="text-sm text-slate-200 font-inter whitespace-pre-wrap">{c.texte}</p>
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-inter">
                        <Check className="w-3.5 h-3.5" /> {t('studio.photoSaved')}
                      </div>
                    </div>
                  ) : c.format === 'carrousel' ? (
                    <div className="space-y-3">
                      {c.images && c.images.length ? (
                        <div className="grid grid-cols-3 gap-2">
                          {c.images.map((u, i) => (
                            <div key={i} className="w-full aspect-[4/5] rounded-lg border border-white/10 overflow-hidden bg-slate-950/60">
                              <img src={u} alt={t('studio.slideAlt', { n: i + 1 })} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-400 font-inter py-4 text-center">{t('studio.noImagesGenerated')}</p>
                      )}
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-inter">
                        <Check className="w-3.5 h-3.5" /> {t('studio.carouselSaved')}
                      </div>
                    </div>
                  ) : (
                    <>
                      <Textarea value={c.texte} onChange={(e) => editer(c.id, e.target.value)}
                        rows={c.format === 'script' ? 12 : 9}
                        className="bg-slate-950/60 border-white/10 text-slate-100 font-inter resize-y" />
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={() => regenerer(c.id)} className="text-slate-400 hover:text-white">
                          <RefreshCw className="w-4 h-4" /><span className="ml-2">{t('studio.regenerate')}</span>
                        </Button>
                        <Button data-testid={`studio-valider-${c.id}`} onClick={() => valider(c.id)} disabled={c.saving || !c.texte.trim()}
                          className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30">
                          {c.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}<span className="ml-2">{t('studio.validate')}</span>
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
