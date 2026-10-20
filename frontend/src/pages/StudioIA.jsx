import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles, Loader2, Lightbulb, PenLine, Check, CheckCircle2,
  RefreshCw, Image as ImageIcon, AlertTriangle, Wand2, Clapperboard, Trash2, LayoutGrid, Camera,
  ChevronLeft, ChevronRight, ChevronDown, X, ArrowRight, Crown, Upload, Eye, Maximize2, Target, FileText,
} from 'lucide-react';
import { LogoReseau } from '../components/LogoReseau';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { agentService } from '../services/agentService';
import { videoService } from '../services/videoService';
import { contenuService } from '../services/contenuService';
import { takePhoto, cameraAvailable } from '../lib/photo';
import { useUser } from '../context/UserContext';
import { useDemarrage } from '../context/DemarrageContext';
import { track } from '../lib/analytics';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import AideAccroche from '../components/AideAccroche';

const FORMATS = [
  { id: 'post', labelKey: 'formatPost', icon: PenLine },
  { id: 'carrousel', labelKey: 'formatCarousel', icon: LayoutGrid },
  { id: 'story', labelKey: 'formatStory', icon: ImageIcon },
  { id: 'script', labelKey: 'formatScript', icon: Clapperboard },
];
// Les stories ne se publient que sur Instagram et Facebook (Zernio)
const RESEAUX_STORY = ['instagram', 'facebook'];
// Réseaux capables de publier un format vidéo (script). Reel = court/vertical ; Vidéo longue = YouTube.
const RESEAUX_POUR_FORMAT = { Reel: ['tiktok', 'instagram', 'youtube'], 'Vidéo longue': ['youtube'] };
const RESEAUX_VIDEO = ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin'];
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

// Identifiant UNIQUE de carte, même entre deux chargements de page : l'ancien compteur `c1, c2…`
// repartait de zéro à chaque chargement, une nouvelle carte reprenait l'id d'une carte restaurée
// depuis la sauvegarde, et « Fermer » / la corbeille retiraient toutes les cartes de même id.
let _uid = 0;
const nextId = () => `c${Date.now().toString(36)}${(++_uid).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// Cartes restaurées : ids en double (sauvegardes faites avant ce correctif) -> on les rend uniques.
const idsUniques = (cartes) => {
  const vus = new Set();
  return cartes.map((c) => {
    if (!c.id || vus.has(c.id)) { const id = nextId(); vus.add(id); return { ...c, id }; }
    vus.add(c.id);
    return c;
  });
};

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


// Titre de carte (icône dans un carré + titre + éléments à droite) et pastille de réseau social.
const TeteCarte = ({ icon: Icon, titre, children }) => (
  <div className="flex items-center gap-2.5 mb-2.5">
    <span className="w-[30px] h-[30px] rounded-[9px] border border-white/15 grid place-items-center text-[#b6abff] flex-none"><Icon className="w-4 h-4" /></span>
    <h2 className="font-sora font-bold text-[15.5px] text-white truncate min-w-0">{titre}</h2>
    {children}
  </div>
);
const Plateforme = ({ id, petit }) => (
  <LogoReseau id={id} className={petit ? 'w-[22px] h-[22px] rounded-md' : 'w-[34px] h-[34px] rounded-[9px]'} />
);

// Valeurs de repli des dimensions si le fetch backend n'a pas (encore) répondu — garde le sélecteur utilisable.
const DIM_FALLBACK = {
  objectif: ['Engagement', 'Notoriété', 'Éducation', 'Conversion', 'Génération de prospects', 'Fidélisation', 'Preuve sociale'],
  angle: ['Problème → solution', 'Astuce', 'Comparaison', 'Controverse', 'Storytelling', 'Témoignage', 'Démonstration', 'Inspiration', 'Humour', 'Curiosité'],
  cible: ['Nouvelle audience', 'Prospect', 'Client', 'Client fidèle', 'Segment spécifique'],
  format: ['Reel', 'Post', 'Carrousel', 'Story', 'Article', 'Vidéo longue'],
};
// La dimension "format" pilote le format de génération réel (cfgFormat).
const FORMAT_DIM_TO_CFG = {
  'Post': 'post', 'Article': 'post',
  'Carrousel': 'carrousel',
  'Story': 'story',
  'Reel': 'script', 'Vidéo longue': 'script',
};

// Sélecteur d'une dimension : valeur recommandée ⭐ (reco IA), changeable ; point vert = modifié.
const DimSelect = ({ emoji, label, value, reco, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const edited = value !== reco;
  // Garde la valeur courante sélectionnable même si elle sort de la liste filtrée (réseaux).
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="relative" ref={ref}>
      <div className="text-[10px] text-slate-500 font-medium mb-1 flex items-center gap-1">{emoji} {label}</div>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 w-full rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 text-left transition-colors border ${open ? 'border-[#5B6CFF]/55 bg-[#0e1830]' : 'border-white/10 bg-slate-950/60 hover:border-white/20'}`}>
        <span className="flex-1 min-w-0 truncate">{value || '—'}</span>
        {edited
          ? <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] flex-none" />
          : <span className="text-amber-400 text-[10px] leading-none">★</span>}
        <span className={`text-slate-500 text-[9px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 top-[calc(100%+5px)] bg-[#0c1424] border border-white/10 rounded-xl p-1.5 shadow-2xl max-h-48 overflow-auto animate-fade-in">
          {opts.map((v) => {
            const sel = v === value;
            return (
              <button key={v} type="button" onClick={() => { onChange(v); setOpen(false); }}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs text-left transition-colors ${sel ? 'bg-gradient-to-r from-[#5B6CFF]/25 to-[#8A6CFF]/15 text-white font-semibold' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                <span className="flex-1 min-w-0 truncate">{v}</span>
                {sel ? <span className="text-[#3AFFA3] text-[11px]">✓</span> : (v === reco ? <span className="text-amber-400 text-[10px]">★</span> : null)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function StudioIA() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updateUser } = useUser();
  const [, setUsage] = useState(null);
  const refreshUsage = () => agentService.usage().then(setUsage).catch(() => {});
  useEffect(() => { refreshUsage(); }, []);
  // Profil minimum (secteur, voix, audience, piliers) + réseau + carte : l'état
  // vient du serveur (démarrage guidé). Repli sur l'ancien test si pas encore chargé.
  const { etat: demarrage } = useDemarrage();
  const marqueOk = demarrage ? !demarrage.bloquant : !!(user?.secteur && String(user.secteur).trim());
  const champsManquants = (demarrage?.etapes || []).find((e) => e.id === 'profil')?.manquants || [];
  // On ne propose que les réseaux dont le compte est connecté (Paramètres → Réseaux)
  const reseaux = RESEAUX.filter((r) => !!user?.[`late_account_${r.id}`]);
  // Story : seulement Instagram/Facebook
  const reseauxPour = (fmt) => (fmt === 'story' ? reseaux.filter((r) => RESEAUX_STORY.includes(r.id)) : reseaux);
  // Réseaux proposés pour un script vidéo, selon le format-dimension (Reel/Vidéo longue).
  const reseauxVideo = (formatDim) => {
    const allow = RESEAUX_POUR_FORMAT[formatDim] || RESEAUX_VIDEO;
    return reseaux.filter((r) => allow.includes(r.id));
  };

  const erreurGen = (e) => {
    // Déjà traité par l'intercepteur (mur de paiement, toast quota, profil incomplet) : pas de doublon.
    if (e?.__handled) { refreshUsage(); return; }
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
  const [dimsEdit, setDimsEdit] = useState({}); // brief éditable du sujet ouvert (objectif/angle/cible/format)
  const [cfgFormat, setCfgFormat] = useState('post');
  // Multi-réseaux : on peut cocher plusieurs réseaux — le 1er devient le post principal,
  // les autres reçoivent une copie planifiée sur leur propre créneau (même méca que Recycler).
  const [cfgReseaux, setCfgReseaux] = useState(['linkedin']);
  const [cfgType, setCfgType] = useState('Reel');
  const cfgQualite = 'equilibre'; // qualité unique (sélecteur retiré avec le système de crédits)
  const [nbSlides, setNbSlides] = useState(5); // carrousel
  const [lightbox, setLightbox] = useState(null); // { images:[], index:number } — aperçu plein écran des slides

  // Navigation clavier dans la lightbox (← → Échap)
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') setLightbox((l) => l && ({ ...l, index: (l.index + 1) % l.images.length }));
      else if (e.key === 'ArrowLeft') setLightbox((l) => l && ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

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
  const [selId, setSelId] = useState(null);           // contenu affiché dans l'aperçu
  const [onglet, setOnglet] = useState('texte');      // texte | accroche | verif
  const [slideIdx, setSlideIdx] = useState(0);
  const [depotActif, setDepotActif] = useState(false); // glisser-déposer d'une photo
  // Police manuscrite du slogan : chargée seulement sur cette page (le site public reste léger)
  useEffect(() => {
    if (document.getElementById('police-caveat')) return;
    const l = document.createElement('link');
    l.id = 'police-caveat';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap';
    document.head.appendChild(l);
  }, []);
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
    // Les posts, stories et scripts rédigés vivent en base (statut Brouillon) : source de vérité,
    // id = id en base. La sauvegarde locale ne garde que les raccourcis (carrousels, photos).
    Promise.all([agentService.getDrafts().catch(() => []), agentService.brouillonsContenus().catch(() => [])])
      .then(([data, brouillons]) => {
        const deBase = (brouillons || []).map((b) => (b.script && !b.contenu
          ? {
            id: `b-${b.id}`, contenuId: b.id, brouillon: true, sujet: b.titre || '', texte: b.script,
            texteOriginal: b.script, statut: 'pret', format: 'script', meta: 'Reel',
            ...(b.reseau_cible ? { reseau: b.reseau_cible.toLowerCase() } : {}),
          }
          : {
            id: `b-${b.id}`, contenuId: b.id, brouillon: true, sujet: b.titre || '', texte: b.contenu || '',
            texteOriginal: b.contenu_original || b.contenu || '', statut: 'pret',
            format: b.type === 'Story' ? 'story' : 'post', meta: (b.reseau_cible || 'linkedin').toLowerCase(),
          }));
        const locales = (Array.isArray(data) ? data : [])
          .filter((c) => c.statut !== 'redaction' && !c.brouillon);
        setContenus(idsUniques([...deBase, ...locales]));
        // Reprise des anciennes cartes post/story/script (rédigées avant les brouillons en base) :
        // chacune devient un vrai brouillon dans Contenus, sans IA ni quota.
        locales.filter((c) => c.statut === 'pret' && ['post', 'story', 'script'].includes(c.format) && (c.texte || '').trim())
          .forEach((c) => {
            agentService.creerBrouillon(c.format === 'script'
              ? { titre: c.sujet, script: c.texte, ...(c.reseau ? { reseau: c.reseau } : {}) }
              : {
                titre: c.sujet, contenu: c.texte, contenu_original: c.texteOriginal || c.texte,
                reseau: c.meta, ...(c.format === 'story' ? { type: 'Story' } : {}),
              }).then((d) => {
              if (d?.contenu_id) {
                setContenus((prev) => {
                  // déjà présent depuis la base (reprise faite par un autre onglet) : on garde une seule carte
                  if (prev.some((x) => x.id !== c.id && x.contenuId === d.contenu_id)) return prev.filter((x) => x.id !== c.id);
                  return prev.map((x) => (x.id === c.id ? { ...x, contenuId: d.contenu_id, brouillon: true } : x));
                });
              }
            }).catch(() => {});
          });
      })
      .catch(() => setContenus([]))
      .finally(() => { draftsLoaded.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.telegram_id]);

  // Sauvegarde auto (debounce) côté compte — uniquement après le chargement initial
  useEffect(() => {
    if (!draftsLoaded.current || !user?.telegram_id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      agentService.saveDrafts(contenus.filter((c) => c.statut !== 'redaction' && !c.brouillon)).catch(() => {});
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenus, user?.telegram_id]);

  const supprimerContenu = (id) => {
    const card = contenus.find((c) => c.id === id);
    if (card?.brouillon && card.contenuId) agentService.supprimerBrouillon(card.contenuId).catch(() => {});
    setContenus((prev) => prev.filter((c) => c.id !== id));
  };

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

  // Applique un format (dimension "format") au format de génération réel + ajuste les réseaux (story).
  const appliquerFormat = (formatDim) => {
    const cfg = FORMAT_DIM_TO_CFG[formatDim] || 'post';
    setCfgFormat(cfg);
    if (cfg === 'story') {
      setCfgReseaux((arr) => { const ok = arr.filter((x) => RESEAUX_STORY.includes(x)); return ok.length ? ok : [reseauxPour('story')[0]?.id].filter(Boolean); });
    } else if (cfg === 'script') {
      const vids = reseauxVideo(formatDim).map((r) => r.id);
      setCfgReseaux((arr) => { const ok = arr.filter((x) => vids.includes(x)); return ok.length ? ok : [vids[0]].filter(Boolean); });
    }
  };

  // Enregistre l'override côté serveur + met à jour la réserve locale (persiste au rechargement).
  const persistDims = (id, dims) => {
    if (!id) return;
    const clean = { objectif: dims.objectif, angle: dims.angle, cible: dims.cible, format: dims.format, offre: dims.offre };
    setSujets((prev) => prev.map((x) => (x.id === id ? { ...x, dimensions: clean } : x)));
    agentService.majDimensions(id, clean).catch(() => {});
  };

  const ouvrir = (s) => {
    const d = s.dimensions || {};
    setDimsEdit({ objectif: d.objectif || '', angle: d.angle || '', cible: d.cible || '', format: d.format || '', offre: d.offre || '' });
    appliquerFormat(d.format);
    setOpenId(s.id);
  };

  // Change une dimension du brief ; la dimension "format" repilote le format de génération.
  // On persiste l'override (sans toucher à la reco d'origine de l'IA, l'⭐).
  const changeDim = (cle, val) => {
    setDimsEdit((prev) => { const next = { ...prev, [cle]: val }; persistDims(openId, next); return next; });
    if (cle === 'format') appliquerFormat(val);
  };

  // Rétablit tout le brief recommandé par l'IA pour ce sujet (et l'enregistre).
  const revertDims = (s) => {
    const d = s.dimensions_reco || s.dimensions || {};
    const next = { objectif: d.objectif || '', angle: d.angle || '', cible: d.cible || '', format: d.format || '', offre: d.offre || '' };
    setDimsEdit(next);
    persistDims(s.id, next);
    appliquerFormat(d.format);
  };

  // --- Transformation d'un sujet en contenu ---
  // Le sujet reste dans la réserve tant que rien n'est validé (réutilisable pour un autre réseau/format),
  // puis en sort automatiquement dès qu'un contenu généré à partir de lui est enregistré (carrousel : à la
  // génération, qui sauvegarde direct ; post/script : au clic sur "Valider").
  const genererContenu = async (s) => {
    const fmt = cfgFormat;
    const meta = fmt === 'script' ? cfgType : cfgReseaux[0];
    const reseau = fmt === 'script' ? cfgReseaux[0] : undefined; // réseau cible du Reel/vidéo
    const extras = fmt === 'script' ? [] : cfgReseaux.slice(1); // réseaux additionnels cochés
    const qualite = cfgQualite;
    const cardId = nextId();
    setContenus((prev) => [{ id: cardId, sujet: s.titre, sujetId: s.id, texte: '', statut: 'redaction', format: fmt, meta, reseau, extras, qualite }, ...prev]);
    setSelId(cardId);
    setOpenId(null);
    // le sujet reste dispo tant que rien n'est validé : on peut le réutiliser pour un autre réseau
    // (il disparaît de la réserve seulement quand un contenu généré à partir de lui est validé — voir `valider`)
    try {
      if (fmt === 'carrousel') {
        const d = await agentService.carrousel(s.titre, meta, nbSlides, qualite, null, dimsEdit);
        if (d.credits != null) updateUser({ credits: d.credits });
        track('contenu_genere', { format: 'carrousel', reseau: meta, qualite });
        setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'carrousel', images: d.slides_images || [], contenuId: d.contenu_id || null } : c)));
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
        ? await agentService.script(s.titre, meta, qualite, dimsEdit, { brouillon: true, ...(reseau ? { reseau } : {}) })
        : await agentService.rediger(s.titre, meta, false, qualite, dimsEdit, { brouillon: true, ...(fmt === 'story' ? { type: 'Story' } : {}) });
      if (d.credits != null) updateUser({ credits: d.credits });
      track('contenu_genere', { format: fmt, reseau: meta, qualite });
      const texte = fmt === 'script' ? (d.script || '') : (d.contenu || '');
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, texte, texteOriginal: texte, statut: 'pret', ...(d.contenu_id ? { contenuId: d.contenu_id, brouillon: true } : {}), accrocheAlerte: d.accroche_chiffres_non_sources || [] } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'erreur' } : c)));
      erreurGen(e);
    }
  };

  // --- Génération depuis un brief libre écrit par l'utilisateur ---
  // `force` : brief envoyé par Rico Coach ({ texte, format, reseau, type }), généré tel quel.
  const genererBrief = async (force = null) => {
    const txt = (force ? force.texte : briefText).trim();
    if (!txt) return;
    if (!marqueOk) { toast.error(t('studio.fillSectorFirst')); return; }
    const fmt = force ? force.format : bFormat;
    const meta = fmt === 'script' ? (force ? force.type || 'Reel' : bType) : (force ? force.reseau : bReseaux[0]);
    const extras = fmt === 'script' || force ? [] : bReseaux.slice(1);
    const qualite = bQualite;
    const cardId = nextId();
    const titre = txt.length > 80 ? txt.slice(0, 80) + '…' : txt;
    setContenus((prev) => [{ id: cardId, sujet: titre, promptFull: txt, texte: '', statut: 'redaction', format: fmt, meta, extras, qualite }, ...prev]);
    setSelId(cardId);
    if (!force) {
      setBriefText('');
      setBriefOpen(false);
    }
    try {
      if (fmt === 'carrousel') {
        const d = await agentService.carrousel(txt, meta, nbSlides, qualite);
        if (d.credits != null) updateUser({ credits: d.credits });
        track('contenu_genere', { format: 'carrousel', reseau: meta, qualite, source: 'brief' });
        setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'carrousel', images: d.slides_images || [], contenuId: d.contenu_id || null } : c)));
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
        ? await agentService.script(txt, meta, qualite, null, { brouillon: true })
        : await agentService.rediger(txt, meta, false, qualite, null, { brouillon: true, ...(fmt === 'story' ? { type: 'Story' } : {}) });
      if (d.credits != null) updateUser({ credits: d.credits });
      track('contenu_genere', { format: fmt, reseau: meta, qualite, source: 'brief' });
      const texte = fmt === 'script' ? (d.script || '') : (d.contenu || '');
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, texte, texteOriginal: texte, statut: 'pret', ...(d.contenu_id ? { contenuId: d.contenu_id, brouillon: true } : {}), accrocheAlerte: d.accroche_chiffres_non_sources || [] } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'erreur' } : c)));
      erreurGen(e);
    }
  };

  // Sujets envoyés par Rico Coach (« Générer ») : générés dès que le profil est chargé.
  const coachLance = useRef(false);
  useEffect(() => {
    const liste = location.state?.coach;
    if (!Array.isArray(liste) || !liste.length || coachLance.current || !user || !marqueOk) return;
    coachLance.current = true;
    navigate(location.pathname, { replace: true, state: null });
    (async () => {
      for (const b of liste) await genererBrief(b);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, user, marqueOk]);

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
    setSelId(cardId);
    setPhotoOpen(false);
    try {
      const d = await agentService.redigerPhoto(file, photoReseau, photoQualite);
      if (d.credits != null) updateUser({ credits: d.credits });
      setContenus((prev) => prev.map((c) => (c.id === cardId ? { ...c, statut: 'photo', texte: d.contenu || '', texteOriginal: d.contenu || '', image: d.lien_visuel } : c)));
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
        setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'carrousel', images: d.slides_images || [], contenuId: d.contenu_id || null } : c)));
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
        ? await agentService.script(prompt, card.meta, card.qualite, null, card.brouillon ? {} : { brouillon: true, ...(card.reseau ? { reseau: card.reseau } : {}) })
        : await agentService.rediger(prompt, card.meta, false, card.qualite, null,
          card.brouillon ? {} : { brouillon: true, ...(card.format === 'story' ? { type: 'Story' } : {}) });
      if (d.credits != null) updateUser({ credits: d.credits });
      const texte = card.format === 'script' ? (d.script || '') : (d.contenu || '');
      if (card.brouillon && card.contenuId) {
        (card.format === 'script'
          ? agentService.majBrouillonScript(card.contenuId, texte, true)
          : agentService.majBrouillon(card.contenuId, texte, texte,
            d.formule_accroche ? { formule_accroche: d.formule_accroche } : {})).catch(() => {});
      } else if (d.contenu_id) {
        setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, contenuId: d.contenu_id, brouillon: true } : c)));
      }
      // Une régénération est une nouvelle proposition de l'IA, pas une retouche du client :
      // texteOriginal repart de ce nouveau texte (même principe que carrousel() côté backend).
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, texte, texteOriginal: texte, statut: 'pret', accrocheAlerte: d.accroche_chiffres_non_sources || [] } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'erreur' } : c)));
      erreurGen(e);
    }
  };

  const majTimers = useRef({});
  const editer = (id, texte) => {
    setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, texte } : c)));
    const card = contenus.find((c) => c.id === id);
    if (card?.brouillon && card.contenuId) {
      clearTimeout(majTimers.current[id]);
      majTimers.current[id] = setTimeout(() => {
        (card.format === 'script' ? agentService.majBrouillonScript(card.contenuId, texte) : agentService.majBrouillon(card.contenuId, texte)).catch(() => {});
      }, 900);
    }
  };

  const valider = async (id) => {
    const card = contenus.find((c) => c.id === id);
    if (!card || !card.texte.trim()) return;
    setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, saving: true } : c)));
    try {
      if (card.format === 'script') {
        // Script vidéo → contenu « À tourner » (apparaît dans Contenus, prêt à monter)
        clearTimeout(majTimers.current[id]);
        const d = await videoService.createDraft({ script: card.texte, titre: card.sujet, ...(card.reseau ? { reseau: card.reseau } : {}),
          ...(card.brouillon && card.contenuId ? { contenu_id: card.contenuId } : {}) });
        setContenus((prev) => prev.filter((c) => c.id !== id));
        if (card.sujetId) supprimerSujet(card.sujetId); // le sujet est traité → sort de la réserve
        toast.success(t('studio.scriptReady'), {
          action: d?.contenu_id ? { label: t('studio.editVideoAction'), onClick: () => navigate(`/dashboard/video?contenu_id=${d.contenu_id}`) } : undefined,
        });
        return;
      }
      clearTimeout(majTimers.current[id]);
      const d = await agentService.enregistrer(card.texte, card.sujet, card.meta, card.format === 'story' ? 'Story' : null, card.texteOriginal || null,
        card.brouillon ? card.contenuId : null);
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

  // --- Affichage (maquette validée le 2026-10-20) ---
  const sel = contenus.find((c) => c.id === selId) || contenus[0] || null;
  useEffect(() => { setSlideIdx(0); }, [sel?.id]);
  const enCours = contenus.filter((c) => c.statut === 'redaction').length;
  const filtresActifs = Object.values(filtres).filter(Boolean).length;
  const reseauDe = (c) => (c.format === 'script' ? (c.reseau || '') : (c.meta || ''));
  const libelleFormat = (c) => (c.format === 'script' ? t('studio.formatScript') : c.format === 'carrousel' ? t('studio.formatCarousel')
    : c.format === 'story' ? t('studio.formatStory') : c.format === 'photo' ? t('studio.postFromPhoto') : t('studio.formatPost'));
  const nomReseau = (id) => RESEAUX.find((r) => r.id === id)?.label || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
  const etatContenu = (c) => (c.statut === 'redaction'
    ? (c.format === 'carrousel' ? t('studio.creatingCarousel') : c.format === 'photo' ? t('studio.analyzingPhoto') : c.format === 'script' ? t('studio.writingScript') : t('studio.writingPost'))
    : c.statut === 'erreur' ? t('studio.generationErrorShort')
    : c.format === 'carrousel' ? t('studio.statutEnregistre')
    : c.format === 'photo' ? t('studio.statutEnregistre') : t('studio.statutPret'));
  const LIMITE_CARACTERES = { linkedin: 3000, instagram: 2200, facebook: 5000, tiktok: 2200, googlebusiness: 1500, twitter: 280 };
  const verifications = (c) => {
    const texte = c.texte || '';
    const max = LIMITE_CARACTERES[c.meta] || 3000;
    const hashtags = (texte.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    const chiffres = c.accrocheAlerte || [];
    return [
      { ok: texte.length <= max, texte: t('studio.verifLongueur', { n: texte.length, max }) },
      { ok: !chiffres.length, texte: chiffres.length ? t('studio.verifChiffres', { liste: chiffres.join(', ') }) : t('studio.verifChiffresOk') },
      { ok: c.meta !== 'instagram' || (hashtags >= 3 && hashtags <= 8), texte: t('studio.verifHashtags', { n: hashtags }) },
    ];
  };
  const champ = 'w-full rounded-[10px] bg-[#111b33] border border-white/[0.09] text-slate-100 text-[13.5px] px-3 py-2.5 outline-none focus:border-[#6f5cff]/70 font-inter';
  const carte = 'bg-[#0b1326] border border-white/[0.08] rounded-2xl p-4 min-w-0';
  const btnViolet = 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-95 shadow-[0_6px_18px_rgba(111,92,255,0.28)] disabled:opacity-40';
  return (
    <div className="w-full space-y-4 pb-10">
      {/* ─── En-tête : titre, étapes, bannière, quota ─── */}
      <header className="relative overflow-hidden rounded-[18px] bg-[#0b1326] border border-white/[0.06] min-h-[170px]">
        <div aria-hidden="true" className="absolute inset-0 bg-cover bg-[position:70%_55%]" style={{ backgroundImage: "url('/images/studio-banniere.jpg')" }} />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,#050b1a_0%,rgba(5,11,26,0.92)_26%,rgba(5,11,26,0.35)_46%,rgba(5,11,26,0)_62%,rgba(5,11,26,0.15)_80%,rgba(5,11,26,0.75)_100%)]" />
        <div className="relative px-6 py-5 flex flex-col gap-1.5">
          <h1 className="flex items-center gap-3 font-sora font-extrabold text-[34px] sm:text-[38px] leading-tight text-white tracking-tight">
            <Sparkles className="w-7 h-7 text-[#a99cff]" />{t('studio.pageTitle')}
          </h1>
          <p className="text-[15px] text-slate-300 font-inter">{t('studio.pageSubtitle')}</p>
          <div className="flex flex-wrap items-center gap-2.5 mt-auto pt-4">
            {STEPS.map((s, i) => {
              const done = step > s.n;
              const active = step === s.n;
              return (
                <div key={s.n} className="flex items-center gap-2.5">
                  <div className={`flex items-center gap-2 text-[13.5px] font-inter ${done ? 'text-[#3AFFA3]' : active ? 'text-white' : 'text-slate-400'}`}>
                    <span className={`w-[30px] h-[30px] rounded-full grid place-items-center text-[13px] font-bold ${done ? 'bg-[#3AFFA3] text-[#03241a]' : active ? 'bg-[#6f5cff] text-white shadow-[0_0_0_4px_rgba(111,92,255,0.25)]' : 'border border-white/20 bg-[#0b1326]/80'}`}>
                      {done ? <Check className="w-4 h-4" strokeWidth={3} /> : s.n}
                    </span>
                    {t(`studio.${s.labelKey}`)}
                  </div>
                  {i < STEPS.length - 1 && <span className="w-10 sm:w-12 h-px bg-white/20" />}
                </div>
              );
            })}
          </div>
        </div>
        <div aria-hidden="true" className="hidden lg:block absolute right-16 bottom-10 font-['Caveat',cursive] font-bold text-[33px] leading-[1.05] text-white text-right -rotate-6 [text-shadow:0_2px_14px_rgba(0,0,0,0.45)]">
          {t('studio.slogan1')}<br />{t('studio.slogan2')}
        </div>
        <span className="absolute right-4 bottom-1.5 text-[9.5px] text-white/40 font-inter">Photo : Positano, Wikimedia Commons (CC BY-SA 4.0)</span>
      </header>

      {/* ─── Marque incomplète ─── */}
      {!marqueOk && (
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3.5 rounded-[14px] border border-orange-400/45 bg-gradient-to-r from-orange-400/15 to-orange-400/5 px-4 py-3 animate-fade-in">
          <span className="w-[38px] h-[38px] rounded-[10px] bg-orange-400 grid place-items-center text-[#2a1600] flex-none"><AlertTriangle className="w-5 h-5" /></span>
          <div className="min-w-0 font-inter">
            <p className="text-[14.5px] font-semibold text-orange-200">{t('studio.completeBrandFirst')}</p>
            <p className="text-[13px] text-slate-400" data-testid="studio-champs-manquants">
              {champsManquants.length > 0
                ? <>{t('studio.champsManquants')} <span className="text-orange-100">{champsManquants.map((c) => t(`demarrage.champs.${c}`)).join(', ')}.</span></>
                : <>{t('studio.guardIntro')} {t('studio.guardSector')}.</>}
            </p>
          </div>
          <Link to="/dashboard/parametres" className="sm:ml-auto text-[13px] font-semibold text-orange-100 border border-orange-400/40 rounded-[9px] px-3 py-2 whitespace-nowrap hover:bg-orange-400/10">{t('studio.allerParametres')} →</Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)_minmax(0,1.25fr)] gap-4 items-start">
        {/* ─── Colonne 1 : générer des sujets, brief, photo ─── */}
        <div className="flex flex-col gap-4 min-w-0">
          <section className={carte}>
            <TeteCarte icon={Lightbulb} titre={t('studio.genererSujetsTitre')} />
            <p className="text-[13px] text-slate-400 font-inter mb-3">{t('studio.genererSujetsAide')}</p>
            <div className="flex items-end gap-2.5">
              <label className="flex-1 min-w-0">
                <span className="block text-[12.5px] text-slate-400 font-inter mb-1.5">{t('studio.countLabel')}</span>
                <select id="studio-nb-sujets" value={nbSujets} onChange={(e) => setNbSujets(parseInt(e.target.value, 10))} className={champ}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <Button onClick={proposerSujets} disabled={!marqueOk || loadingSujets} data-testid="studio-generer-sujets" className={`${btnViolet} h-[42px]`}>
                {loadingSujets ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span className="ml-2">{t('studio.generateSubjects')}</span>
              </Button>
            </div>
            {dims && (
              <>
                <div className="h-px bg-white/[0.08] my-3.5" />
                <div className="flex items-center gap-2 text-[13.5px] font-semibold text-white font-inter mb-2.5">
                  <Target className="w-4 h-4 text-slate-300" />{t('studio.ciblage')}<span className="font-normal text-slate-500">{t('studio.optionnel')}</span>
                  <span className="ml-auto text-[12px] font-medium text-[#b6abff]">
                    {t('studio.filtresActifs', { count: filtresActifs })}
                    {filtresActifs > 0 && <button type="button" onClick={() => setFiltres({})} className="ml-2 underline hover:text-white">{t('studio.reinitialiser')}</button>}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[...DIM_META, ...(dims?.offre?.length ? [{ cle: 'offre', label: 'Offre' }] : [])].map(({ cle, label }) => (
                    <label key={cle} className="relative min-w-0 rounded-[10px] border border-white/[0.09] bg-[#111b33] px-2.5 py-2 hover:border-white/20 transition-colors">
                      <span className="flex items-center gap-1 text-[12.5px] font-semibold text-white font-inter">{label}{cle === 'offre' && <Crown className="w-3 h-3 text-amber-300 ml-auto" />}</span>
                      <select value={filtres[cle] || ''} onChange={(e) => setFiltres((f) => ({ ...f, [cle]: e.target.value }))}
                        data-testid={`studio-filtre-${cle}`}
                        className={`w-full appearance-none truncate bg-transparent pr-4 text-[12px] outline-none font-inter cursor-pointer ${filtres[cle] ? 'text-[#c9c1ff] font-medium' : 'text-slate-300'}`}>
                        <option value="" className="bg-[#0b1326]">{t('studio.filtreAuto')}</option>
                        {((cle === 'offre' ? dims.offre : dims[cle]) || []).map((v) => <option key={v} value={v} className="bg-[#0b1326]">{v}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 bottom-2.5 w-3.5 h-3.5 text-slate-400" />
                    </label>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className={carte}>
            <TeteCarte icon={PenLine} titre={t('studio.writeOwnBrief')} />
            <p className="text-[13px] text-slate-400 font-inter mb-3">{t('studio.briefAide')}</p>
            <Textarea value={briefText} onChange={(e) => setBriefText(e.target.value)} rows={3} data-testid="studio-brief-text"
              placeholder={t('studio.briefPlaceholder')} className={`${champ} resize-y min-h-[72px]`} />
            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
              <label className="min-w-0">
                <span className="block text-[12.5px] text-slate-400 font-inter mb-1.5">{t('studio.formatLabel')}</span>
                <select id="studio-brief-format" value={bFormat} className={champ} onChange={(e) => {
                  const f = e.target.value;
                  setBFormat(f);
                  if (f === 'story') setBReseaux((arr) => { const ok = arr.filter((x) => RESEAUX_STORY.includes(x)); return ok.length ? ok : [reseauxPour('story')[0]?.id].filter(Boolean); });
                }}>
                  {FORMATS.map((f) => <option key={f.id} value={f.id}>{t(`studio.${f.labelKey}`)}</option>)}
                </select>
              </label>
              {bFormat === 'script' ? (
                <label className="min-w-0">
                  <span className="block text-[12.5px] text-slate-400 font-inter mb-1.5">{t('studio.typeLabel')}</span>
                  <select id="studio-brief-type" value={bType} onChange={(e) => setBType(e.target.value)} className={champ}>
                    {TYPES_VIDEO.map((r) => <option key={r.id} value={r.id}>{t(`studio.${r.labelKey}`)}</option>)}
                  </select>
                </label>
              ) : bFormat === 'carrousel' ? (
                <label className="min-w-0">
                  <span className="block text-[12.5px] text-slate-400 font-inter mb-1.5">{t('studio.slidesLabel')}</span>
                  <select id="studio-brief-slides" value={nbSlides} onChange={(e) => setNbSlides(parseInt(e.target.value, 10))} className={champ}>
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              ) : <span />}
            </div>
            {bFormat !== 'script' && (
              <div className="mt-2.5">
                <span className="block text-[12.5px] text-slate-400 font-inter mb-1.5">{t('studio.networksLabel')}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {reseaux.length === 0
                    ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                    : reseauxPour(bFormat).map((r) => (
                      <Pill key={r.id} active={bReseaux.includes(r.id)} onClick={() => toggleReseau(setBReseaux)(r.id)}>
                        {bReseaux.includes(r.id) ? '✓ ' : ''}{r.label}
                      </Pill>
                    ))}
                  {bReseaux.length > 1 && <span className="text-[11px] text-[#3AFFA3] font-inter">{t('studio.onePostNNetworks', { n: bReseaux.length })}</span>}
                </div>
              </div>
            )}
            <div className="flex justify-end mt-3">
              <Button onClick={() => genererBrief()} disabled={!marqueOk || !briefText.trim()} data-testid="studio-brief-generer" className={btnViolet}>
                <Wand2 className="w-4 h-4" /><span className="ml-2">{t('studio.writeButton')}</span>
              </Button>
            </div>
          </section>

          <section className={carte}>
            <TeteCarte icon={ImageIcon} titre={t('studio.generateFromPhoto')} />
            <p className="text-[13px] text-slate-400 font-inter mb-3">{t('studio.photoHint')}</p>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" data-testid="studio-photo-input"
              onChange={(e) => genererPhoto(e.target.files?.[0])} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button type="button" onClick={() => photoRef.current?.click()} disabled={!marqueOk || photoLoading}
                onDragOver={(e) => { e.preventDefault(); setDepotActif(true); }} onDragLeave={() => setDepotActif(false)}
                onDrop={(e) => { e.preventDefault(); setDepotActif(false); genererPhoto(e.dataTransfer.files?.[0]); }}
                className={`rounded-xl border-[1.5px] border-dashed min-h-[118px] flex flex-col items-center justify-center gap-1 px-3 text-center text-[12px] font-inter transition-colors disabled:opacity-40 ${depotActif ? 'border-[#6f5cff] bg-[#6f5cff]/10 text-white' : 'border-white/20 text-slate-400 hover:border-white/35'}`}>
                {photoLoading ? <Loader2 className="w-5 h-5 animate-spin text-[#b6abff]" /> : <Upload className="w-5 h-5 text-[#b6abff]" />}
                {t('studio.deposerPhoto')}
                <span className="text-slate-500">{t('studio.formatsPhoto')}</span>
              </button>
              <div className="flex flex-col justify-end gap-2.5">
                <label>
                  <span className="block text-[12.5px] text-slate-400 font-inter mb-1.5">{t('studio.networkLabel')}</span>
                  {reseaux.length === 0
                    ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                    : (
                      <select id="studio-photo-reseau" value={photoReseau} onChange={(e) => setPhotoReseau(e.target.value)} className={champ}>
                        {reseaux.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    )}
                </label>
                {cameraAvailable() && (
                  <Button onClick={prendrePhoto} disabled={!marqueOk || photoLoading} className="bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 disabled:opacity-40">
                    <Camera className="w-4 h-4" /><span className="ml-2">{t('studio.takePhotoButton')}</span>
                  </Button>
                )}
                <Button onClick={() => photoRef.current?.click()} disabled={!marqueOk || photoLoading}
                  className="bg-[#6f5cff]/15 text-[#d8d2ff] border border-[#6f5cff]/35 hover:bg-[#6f5cff]/25 disabled:opacity-40">
                  {t('studio.analyserPhoto')}
                </Button>
              </div>
            </div>
          </section>
        </div>

        {/* ─── Colonne 2 : vos sujets + journal ─── */}
        <div className="flex flex-col gap-4 min-w-0">
          <section className={carte}>
            <TeteCarte icon={FileText} titre={t('studio.vosSujets')}>
              {sujets.length > 0 && <span className="ml-auto text-[12px] text-[#d8d2ff] bg-[#6f5cff]/20 border border-[#6f5cff]/35 rounded-full px-2.5 py-0.5 font-inter">{t('studio.nbSujets', { count: sujets.length })}</span>}
            </TeteCarte>
            {sujets.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-1.5 py-10 px-4 text-[13px] text-slate-400 font-inter">
                <span className="w-[52px] h-[52px] rounded-full grid place-items-center bg-[radial-gradient(circle,rgba(111,92,255,0.35),transparent_70%)] text-[#b6abff]"><Lightbulb className="w-6 h-6" /></span>
                <b className="font-sora text-[15px] text-white">{t('studio.videTitre')}</b>
                {t('studio.videAide')}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {sujets.map((s, i) => {
                  const open = openId === s.id;
                  const reco = s.dimensions_reco || s.dimensions || {}; // reco d'origine de l'IA (fige l'⭐)
                  const anyEdited = open && (DIM_META.some(({ cle }) => dimsEdit[cle] !== (reco[cle] || '')) || (dimsEdit.offre || '') !== (reco.offre || ''));
                  return (
                    <div key={s.id} data-testid={`studio-sujet-${s.id}`}
                      className={`rounded-xl border transition-colors ${open ? 'relative z-10 border-[#6f5cff]/45 bg-[#6f5cff]/[0.07]' : 'border-white/[0.08] bg-[#111b33] hover:border-white/20'}`}>
                      <div className="flex items-center">
                        <button type="button" onClick={() => (open ? setOpenId(null) : ouvrir(s))} aria-expanded={open}
                          className="flex-1 min-w-0 flex items-center gap-3 pl-3.5 pr-2 py-3 text-left">
                          <span className={`flex-none font-sora font-bold text-[15px] w-5 ${open ? 'text-[#b6abff]' : 'text-slate-400'}`}>{i + 1}</span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-semibold text-slate-100 font-inter leading-snug">{s.titre}</span>
                            {(s.dimensions?.format || s.dimensions?.offre) && (
                              <span className="block text-[12px] text-slate-500 font-inter mt-0.5 truncate">
                                {[s.dimensions?.format, s.dimensions?.offre].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                          <ChevronDown className={`ml-auto flex-none w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        <button type="button" onClick={() => supprimerSujet(s.id)} title={t('studio.deleteTitle')} aria-label={t('studio.deleteTitle')}
                          className="flex-none mr-2 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/5">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {open && (
                        <div className="px-3.5 pb-4 pt-1 space-y-3 animate-fade-in">
                          <div className="grid grid-cols-2 gap-2">
                            {DIM_META.map(({ cle, emoji, label }) => (
                              <DimSelect key={cle} emoji={emoji} label={label}
                                value={dimsEdit[cle]} reco={reco[cle]}
                                options={(dims && dims[cle] && dims[cle].length) ? dims[cle] : DIM_FALLBACK[cle]}
                                onChange={(v) => changeDim(cle, v)} />
                            ))}
                          </div>
                          {/* 5e dimension « Offre » (dynamique, optionnelle) — seulement si le compte a des offres */}
                          {dims?.offre?.length ? (
                            <DimSelect emoji="📦" label="Offre mise en avant"
                              value={dimsEdit.offre || 'Aucune'} reco={reco.offre || 'Aucune'}
                              options={['Aucune', ...dims.offre]}
                              onChange={(v) => changeDim('offre', v === 'Aucune' ? '' : v)} />
                          ) : null}

                          {/* Le format vient de la dimension. Script vidéo = Type + Réseau ; sinon = Réseaux */}
                          {cfgFormat === 'script' ? (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-slate-500 font-inter">{t('studio.typeLabel')}</span>
                                {TYPES_VIDEO.map((r) => (
                                  <Pill key={r.id} active={cfgType === r.id} onClick={() => setCfgType(r.id)}>{t(`studio.${r.labelKey}`)}</Pill>
                                ))}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-slate-500 font-inter">{t('studio.networkLabel')}</span>
                                {reseauxVideo(dimsEdit.format).length === 0
                                  ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                                  : reseauxVideo(dimsEdit.format).map((r) => (
                                    <Pill key={r.id} active={cfgReseaux[0] === r.id} onClick={() => setCfgReseaux([r.id])}>{r.label}</Pill>
                                  ))}
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-slate-500 font-inter">{t('studio.networksLabel')}</span>
                              {reseaux.length === 0
                                ? <Link to="/dashboard/parametres" className="text-xs text-amber-400 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                                : reseauxPour(cfgFormat).map((r) => (
                                  <Pill key={r.id} active={cfgReseaux.includes(r.id)} onClick={() => toggleReseau(setCfgReseaux)(r.id)}>
                                    {cfgReseaux.includes(r.id) ? '✓ ' : ''}{r.label}
                                  </Pill>
                                ))}
                              {cfgReseaux.length > 1 && <span className="text-[11px] text-[#3AFFA3] font-inter">{t('studio.onePostNNetworks', { n: cfgReseaux.length })}</span>}
                            </div>
                          )}
                          {cfgFormat === 'carrousel' && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 font-inter">{t('studio.slidesLabel')}</span>
                              <select id={`studio-slides-${s.id}`} value={nbSlides} onChange={(e) => setNbSlides(parseInt(e.target.value, 10))}
                                className="rounded-lg bg-[#0b1326] border border-white/10 text-slate-200 text-sm px-2.5 py-1 outline-none focus:border-[#6f5cff]/60">
                                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {anyEdited && (
                              <button type="button" onClick={() => revertDims(s)} className="text-[11px] text-slate-500 hover:text-[#3AFFA3] transition-colors inline-flex items-center gap-1">↺ {t('studio.resetReco')}</button>
                            )}
                            <button type="button" onClick={() => setOpenId(null)} className="ml-auto text-xs text-slate-400 hover:text-white font-inter px-2">{t('studio.cancel')}</button>
                            <Button onClick={() => genererContenu(s)} data-testid={`studio-generer-post-${s.id}`} className={btnViolet}>
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

          <section className={carte}>
            <TeteCarte icon={Sparkles} titre={t('studio.journalTitre')}>
              <span className={`ml-auto text-[12px] rounded-full px-2.5 py-0.5 font-inter border ${loadingSujets || enCours ? 'text-[#d8d2ff] bg-[#6f5cff]/20 border-[#6f5cff]/35' : 'text-slate-400 border-white/10'}`}>
                {loadingSujets || enCours ? t('studio.journalEnCours') : t('studio.journalAttente')}
              </span>
            </TeteCarte>
            {loadingSujets ? (
              <ol className="flex flex-col gap-2.5 text-[13px] font-inter" aria-live="polite">
                {LOGS_SUJETS.map((log, i) => (
                  <li key={log} className={`flex items-center gap-2.5 ${i < logIndex ? 'text-slate-100' : i === logIndex ? 'text-[#d8d2ff]' : 'text-slate-500'}`}>
                    {i < logIndex ? <span className="w-2 h-2 rounded-full bg-[#3AFFA3]" />
                      : i === logIndex ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#b6abff]" />
                      : <span className="w-2 h-2 rounded-full border border-slate-500" />}
                    {t(`studio.${log}`)}
                  </li>
                ))}
              </ol>
            ) : enCours ? (
              <ol className="flex flex-col gap-2.5 text-[13px] font-inter" aria-live="polite">
                {contenus.filter((c) => c.statut === 'redaction').map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5 text-[#d8d2ff]"><Loader2 className="w-3.5 h-3.5 animate-spin text-[#b6abff]" />{etatContenu(c)} <span className="text-slate-500 truncate">{c.sujet}</span></li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-slate-400 font-inter">{t('studio.journalVide')}</p>
            )}
          </section>
        </div>

        {/* ─── Colonne 3 : contenus générés + aperçu ─── */}
        <div className="flex flex-col gap-4 min-w-0 md:col-span-2 xl:col-span-1">
          <section className={carte}>
            <TeteCarte icon={LayoutGrid} titre={t('studio.contenusGeneres')}>
              {contenus.length > 0 && (
                <span className="text-[12px] text-[#d8d2ff] bg-[#6f5cff]/20 border border-[#6f5cff]/35 rounded-full px-2.5 py-0.5 font-inter whitespace-nowrap flex-none">
                  {enCours ? t('studio.nbEnCours', { count: enCours }) : t('studio.draftsCount', { count: contenus.length })}
                </span>
              )}
              <Link to="/dashboard/contenus" className="ml-auto text-[12.5px] font-semibold text-[#b6abff] hover:text-white font-inter whitespace-nowrap flex-none">{t('studio.voirTout')} →</Link>
            </TeteCarte>
            {contenus.length === 0 ? (
              <p className="text-[13px] text-slate-400 font-inter py-6 text-center">{t('studio.emptyContentsHint')}</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-0.5">
                {contenus.map((c) => (
                  <div key={c.id} data-testid={`studio-contenu-${c.id}`}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${sel?.id === c.id ? 'border-[#6f5cff]/55 bg-[#6f5cff]/[0.08]' : 'border-white/[0.08] bg-[#111b33] hover:border-white/20'}`}>
                    <button type="button" onClick={() => { setSelId(c.id); setOnglet('texte'); }} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                      <Plateforme id={reseauDe(c)} />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-white font-inter truncate">{libelleFormat(c)} {nomReseau(reseauDe(c)) || (c.format === 'script' ? typeVideoLabel(c.meta) : '')}</span>
                        <span className={`flex items-center gap-1.5 text-[12px] font-inter ${c.statut === 'erreur' ? 'text-red-400' : 'text-[#3AFFA3]'}`}>
                          {c.statut === 'redaction' && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span className="truncate">{etatContenu(c)}</span>
                        </span>
                      </span>
                    </button>
                    <button type="button" onClick={() => supprimerContenu(c.id)} title={t('studio.removeTitle')} aria-label={t('studio.removeTitle')}
                      className="flex-none p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {sel && (
            <section className={carte}>
              <TeteCarte icon={Eye} titre={t('studio.apercuTitre')} />
              <div className="flex items-center gap-2 text-[13px] text-slate-400 font-inter mb-2.5">
                <Plateforme id={reseauDe(sel)} petit />
                <b className="text-white">{libelleFormat(sel)}</b> {nomReseau(reseauDe(sel))}
                {sel.format === 'carrousel' && sel.images?.length > 0 && (
                  <span className="ml-auto flex items-center gap-2">
                    <span className="tabular-nums">{slideIdx + 1}/{sel.images.length}</span>
                    <button type="button" onClick={() => setSlideIdx((i) => (i - 1 + sel.images.length) % sel.images.length)} aria-label={t('studio.prevSlide', 'Précédent')} className="w-7 h-7 rounded-lg border border-white/10 grid place-items-center hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setSlideIdx((i) => (i + 1) % sel.images.length)} aria-label={t('studio.nextSlide', 'Suivant')} className="w-7 h-7 rounded-lg border border-white/10 grid place-items-center hover:text-white"><ChevronRight className="w-4 h-4" /></button>
                  </span>
                )}
              </div>

              {sel.statut === 'erreur' ? (
                <div className="flex flex-col items-center gap-2 text-center py-8">
                  <p className="text-xs text-red-400 font-inter">{sel.format === 'carrousel' ? t('studio.carouselGenerationErrorLong') : t('studio.generationErrorShort')}</p>
                  <Button size="sm" variant="ghost" onClick={() => regenerer(sel.id)} className="text-slate-300 hover:text-white">
                    <RefreshCw className="w-4 h-4" /><span className="ml-2">{t('studio.retry')}</span>
                  </Button>
                </div>
              ) : sel.statut === 'redaction' ? (
                <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-[#6f5cff]" />
                  <span className="font-inter text-sm">{etatContenu(sel)}</span>
                </div>
              ) : sel.format === 'photo' ? (
                <div className="space-y-3">
                  {sel.image && <img src={sel.image} alt="" className="w-full rounded-xl border border-white/10 max-h-72 object-cover" />}
                  <p className="text-sm text-slate-200 font-inter whitespace-pre-wrap">{sel.texte}</p>
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-inter"><Check className="w-3.5 h-3.5" /> {t('studio.photoSaved')}</div>
                </div>
              ) : sel.format === 'carrousel' ? (
                <div className="space-y-3">
                  {sel.images?.length ? (
                    <>
                      <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-2">
                        <button type="button" onClick={() => setLightbox({ images: sel.images, index: slideIdx })} title={t('studio.enlargeSlide', 'Agrandir')}
                          className="relative rounded-xl overflow-hidden bg-[#111b33] aspect-[4/5]">
                          <img src={sel.images[slideIdx]} alt={t('studio.slideAlt', { n: slideIdx + 1 })} className="w-full h-full object-cover" />
                          <span className="absolute right-2 top-2 text-[11px] bg-black/50 text-white rounded-md px-1.5">{slideIdx + 1}/{sel.images.length}</span>
                        </button>
                        {sel.images.length > 1 && (
                          <button type="button" onClick={() => setSlideIdx((i) => (i + 1) % sel.images.length)} className="relative rounded-xl overflow-hidden bg-[#111b33] border border-white/[0.08]" aria-label={t('studio.nextSlide', 'Suivant')}>
                            <img src={sel.images[(slideIdx + 1) % sel.images.length]} alt="" className="w-full h-full object-cover opacity-70" />
                            <span className="absolute right-1.5 top-1.5 text-[11px] text-white/80">{((slideIdx + 1) % sel.images.length) + 1}/{sel.images.length}</span>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {sel.images.map((u, i) => (
                          <button key={u} type="button" onClick={() => setSlideIdx(i)} aria-label={t('studio.slideAlt', { n: i + 1 })}
                            className={`w-11 h-11 rounded-lg overflow-hidden border-2 ${i === slideIdx ? 'border-[#3AFFA3]' : 'border-transparent opacity-80 hover:opacity-100'}`}>
                            <img src={u} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                        <Button size="sm" onClick={() => setLightbox({ images: sel.images, index: slideIdx })}
                          className="ml-auto bg-[#6f5cff]/15 text-[#d8d2ff] border border-[#6f5cff]/35 hover:bg-[#6f5cff]/25">
                          <Maximize2 className="w-3.5 h-3.5" /><span className="ml-1.5">{t('studio.pleinEcran')}</span>
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-amber-400 font-inter">{t('studio.noImagesGenerated')}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#6f5cff]/35 bg-[#6f5cff]/10 px-3 py-2.5 text-[13px] text-slate-200 font-inter">
                    <Sparkles className="w-4 h-4 text-[#b6abff]" />
                    <span className="flex-1 min-w-[10rem]">{t('studio.carouselSaved')}</span>
                    <Button size="sm" data-testid={`studio-carrousel-ouvrir-${sel.id}`}
                      onClick={() => { supprimerContenu(sel.id); navigate(sel.contenuId ? `/dashboard/contenus?ouvrir=${sel.contenuId}` : '/dashboard/contenus'); }}
                      className="bg-transparent border border-white/15 text-white hover:bg-white/5">
                      {t('studio.openInContents')}<ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => supprimerContenu(sel.id)} className="text-slate-400 hover:text-white">{t('studio.closeCard')}</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div role="tablist" aria-label={t('studio.apercuTitre')} className="flex gap-1 border-b border-white/[0.08] mb-2.5">
                    {[['texte', t('studio.ongletTexte')], ...(sel.format !== 'script' ? [['accroche', t('studio.ongletAccroche')], ['verif', t('studio.ongletVerif')]] : [])].map(([id, lib]) => (
                      <button key={id} type="button" role="tab" aria-selected={onglet === id} onClick={() => setOnglet(id)}
                        className={`px-3 py-2 text-[13px] font-inter -mb-px border-b-2 rounded-t-lg ${onglet === id ? 'text-white border-[#8A6CFF] bg-[#6f5cff]/10' : 'text-slate-400 border-transparent hover:text-white'}`}>{lib}</button>
                    ))}
                  </div>
                  {onglet === 'accroche' && sel.format !== 'script' ? (
                    <AideAccroche texte={sel.texte} reseau={sel.meta} chiffresNonSources={sel.accrocheAlerte} />
                  ) : onglet === 'verif' && sel.format !== 'script' ? (
                    <ul className="flex flex-col gap-2 text-[13px] font-inter py-1">
                      {verifications(sel).map((v) => (
                        <li key={v.texte} className="flex items-start gap-2 text-slate-200">
                          <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${v.ok ? 'bg-[#3AFFA3]' : 'bg-orange-400'}`} />{v.texte}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Textarea value={sel.texte} onChange={(e) => editer(sel.id, e.target.value)} rows={sel.format === 'script' ? 12 : 8}
                      aria-label={t('studio.ongletTexte')} className={`${champ} resize-y`} />
                  )}
                  <div className="flex items-center justify-between gap-2.5 mt-3">
                    <Button variant="ghost" onClick={() => regenerer(sel.id)} className="border border-white/15 text-slate-200 hover:text-white hover:bg-white/5 min-w-[140px]">
                      <RefreshCw className="w-4 h-4" /><span className="ml-2">{t('studio.regenerate')}</span>
                    </Button>
                    <Button data-testid={`studio-valider-${sel.id}`} onClick={() => valider(sel.id)} disabled={sel.saving || !sel.texte.trim()}
                      className="bg-[#3AFFA3] text-[#03241a] hover:bg-[#5effb6] min-w-[140px] disabled:opacity-50">
                      {sel.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={2.6} />}<span className="ml-2">{t('studio.validate')}</span>
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4 sm:p-8"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            title={t('studio.close', 'Fermer')}
          >
            <X className="w-5 h-5" />
          </button>

          {lightbox.images.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightbox((l) => ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length })); }}
              className="absolute left-2 sm:left-6 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"
              title={t('studio.prevSlide', 'Précédent')}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.images[lightbox.index]}
              alt={t('studio.slideAlt', { n: lightbox.index + 1 })}
              className="max-h-[82vh] max-w-full w-auto rounded-xl border border-white/10 shadow-2xl object-contain"
            />
            <span className="text-sm text-slate-300 font-inter">
              {lightbox.index + 1} / {lightbox.images.length}
            </span>
          </div>

          {lightbox.images.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightbox((l) => ({ ...l, index: (l.index + 1) % l.images.length })); }}
              className="absolute right-2 sm:right-6 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"
              title={t('studio.nextSlide', 'Suivant')}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
