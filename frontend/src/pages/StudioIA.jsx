import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Loader2, Lightbulb, PenLine, Check, CheckCircle2, Clock, CircleDot,
  RefreshCw, Image as ImageIcon, AlertTriangle, Wand2, Clapperboard, Trash2, LayoutGrid, Camera,
  ChevronLeft, ChevronRight, ChevronDown, X, ArrowRight, Upload, Eye, Maximize2, Target, Activity, Copy,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import AideAccroche from '../components/AideAccroche';
import { remplacerPremiereLigne } from '../lib/accroche';

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
  { cle: 'objectif', labelKey: 'dimObjectif' },
  { cle: 'angle', labelKey: 'dimAngle' },
  { cle: 'cible', labelKey: 'dimCible' },
  { cle: 'format', labelKey: 'dimFormat' },
];
// Valeur interne « pas d'offre » (une liste accessible n'accepte pas de valeur vide)
const AUCUNE = '__aucune__';
// Anneau de focus clavier commun à tous les contrôles de la page
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70';

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

// Pastille à cocher (réseaux, type vidéo) : état annoncé (aria-pressed) et coche visible, pas seulement la couleur.
const Pill = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium font-inter transition-colors border ${FOCUS} ${
      active
        ? 'bg-[#6f5cff]/20 text-white border-[#8A6CFF]/70'
        : 'text-slate-300 border-white/15 hover:text-white hover:border-white/30'
    }`}
  >
    {active && <Check className="w-3.5 h-3.5 text-[#c9c1ff]" strokeWidth={2.6} aria-hidden="true" />}
    {children}
  </button>
);

// Onglets accessibles (flèches gauche/droite, Début, Fin), partagés par « Créer » et l'aperçu.
const Onglets = ({ id, label, valeur, onChange, items }) => {
  const refs = useRef([]);
  const clavier = (e, i) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const n = items.length;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    onChange(items[j][0]);
    refs.current[j]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-white/[0.08] overflow-x-auto">
      {items.map(([v, lib, Icon], i) => {
        const actif = v === valeur;
        return (
          <button key={v} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${id}-tab-${v}`}
            aria-selected={actif} aria-controls={`${id}-panel`} tabIndex={actif ? 0 : -1}
            onClick={() => onChange(v)} onKeyDown={(e) => clavier(e, i)}
            className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[13px] font-inter rounded-t-md transition-colors ${FOCUS} ${actif ? 'text-white font-semibold' : 'text-slate-300 hover:text-white'}`}>
            {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}{lib}
            {actif && <span aria-hidden="true" className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-[#8A6CFF]" />}
          </button>
        );
      })}
    </div>
  );
};

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

// Sélecteur d'une dimension du brief : liste accessible au clavier (Radix). La valeur proposée par l'IA
// est marquée « recommandé » dans la liste ; une valeur changée affiche l'étiquette « Modifié ».
const DimSelect = ({ id, label, value, reco, options, onChange, t, libelle = (v) => v }) => {
  const edited = (value || '') !== (reco || '');
  // Garde la valeur courante sélectionnable même si elle sort de la liste filtrée (réseaux).
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <label htmlFor={id} className="text-[12.5px] text-slate-300 font-inter">{label}</label>
        {edited && <span className="ml-auto text-[11px] font-inter text-[#7ff5c4] bg-[#3AFFA3]/10 rounded px-1.5">{t('studio.dimModifie')}</span>}
      </div>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className={`[&_.reco]:hidden h-9 w-full rounded-lg border-white/15 bg-[#0e1830] px-2.5 text-[13px] text-slate-100 font-inter focus:ring-2 focus:ring-[#8A6CFF]/60 focus:ring-offset-0 ${FOCUS}`}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {opts.map((v) => (
            <SelectItem key={v} value={v} className="text-[13px]">
              {libelle(v)}{v === reco && <span className="reco text-slate-400"> · {t('studio.dimRecommande')}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

// Structures de post au choix (AIDA, PAS…) : « auto » laisse l'IA choisir la forme la plus naturelle.
const STRUCTURES = ['auto', 'aida', 'pas', 'bab', 'star', 'slay'];
const avecStructure = (dims, structure) => (structure && structure !== 'auto' ? { ...(dims || {}), structure } : dims);

// Réseaux où Zernio publie le premier commentaire juste après le post, et leur limite de caractères.
const LIMITE_COMMENTAIRE = { linkedin: 1250, instagram: 2200, facebook: 8000, youtube: 10000 };

// Premier commentaire (« commentaire épinglé ») : proposé par l'IA à la première ouverture de l'onglet,
// modifiable, publié automatiquement juste après le post si la case est cochée.
const CommentaireEpingle = ({ carte, onChange, t, champ, btnSecondaire, nomReseau }) => {
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const texte = carte.premierCommentaire || '';
  const limite = LIMITE_COMMENTAIRE[carte.meta] || 1250;
  const autoPossible = carte.meta in LIMITE_COMMENTAIRE;
  const proposer = async () => {
    if (!(carte.texte || '').trim()) return;
    setChargement(true);
    setErreur('');
    try {
      const d = await agentService.premierCommentaire(carte.texte, carte.meta);
      onChange({ premierCommentaire: d.commentaire || '' });
    } catch (e) {
      setErreur(e?.response?.data?.detail || t('studio.commentaireErreur'));
    } finally {
      setChargement(false);
    }
  };
  useEffect(() => {
    if (!texte.trim()) proposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      toast.success(t('studio.commentaireCopie'));
    } catch (e) {
      toast.error(t('studio.copieEchec'));
    }
  };
  return (
    <div className="space-y-3 py-1 font-inter" data-testid="studio-commentaire">
      <p className="text-[13px] text-slate-300 max-w-[62ch]">{t('studio.commentaireAide')}</p>
      {chargement ? (
        <div className="space-y-2 py-1" aria-busy="true">
          <div className="flex items-center gap-2 text-[13px] text-[#d8d2ff]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{t('studio.commentaireEnCours')}</div>
          {[96, 78].map((w) => <div key={w} className="h-3 rounded bg-white/[0.06] animate-pulse" style={{ width: `${w}%` }} />)}
        </div>
      ) : (
        <Textarea value={texte} onChange={(e) => onChange({ premierCommentaire: e.target.value.slice(0, limite) })} rows={4}
          data-testid="studio-commentaire-texte" aria-label={t('studio.ongletCommentaire')} className={`${champ} resize-y text-[14px] leading-relaxed`} />
      )}
      {erreur && <p role="alert" className="text-[12.5px] text-red-300">{erreur}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={proposer} disabled={chargement || !(carte.texte || '').trim()} className={btnSecondaire} data-testid="studio-commentaire-regenerer">
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /><span className="ml-1.5">{t('studio.regenerate')}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={copier} disabled={chargement || !texte.trim()} className={btnSecondaire}>
          <Copy className="w-3.5 h-3.5" aria-hidden="true" /><span className="ml-1.5">{t('studio.copier')}</span>
        </Button>
        <span className={`ml-auto text-[12px] tabular-nums ${texte.length >= limite ? 'text-orange-300' : 'text-slate-400'}`}>{t('studio.caracteres', { n: texte.length, max: limite })}</span>
      </div>
      <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
        <Checkbox id={`studio-commentaire-auto-${carte.id}`} data-testid="studio-commentaire-auto"
          checked={autoPossible && !!carte.premierCommentaireAuto} disabled={!autoPossible || !texte.trim()}
          onCheckedChange={(v) => onChange({ premierCommentaireAuto: v === true })}
          className="mt-0.5 border-white/30 data-[state=checked]:bg-[#5a4ae8] data-[state=checked]:border-[#5a4ae8] data-[state=checked]:text-white" />
        <label htmlFor={`studio-commentaire-auto-${carte.id}`} className={`text-[13px] leading-snug ${autoPossible ? 'text-slate-100 cursor-pointer' : 'text-slate-400'}`}>
          {t('studio.commentaireAuto')}
          <span className="block text-[12px] text-slate-400 mt-0.5">
            {autoPossible ? t('studio.commentaireAutoAide') : t('studio.commentaireAutoIndispo', { reseau: nomReseau(carte.meta) })}
          </span>
        </label>
      </div>
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
  const [modeCreation, setModeCreation] = useState('sujets'); // sujets | brief | photo
  const [structure, setStructure] = useState('auto'); // structure imposée aux posts (AIDA, PAS…)
  const lightboxRef = useRef(null);
  // Garde le focus clavier dans la visionneuse plein écran
  const pieger = (e) => {
    if (e.key !== 'Tab' || !lightboxRef.current) return;
    const f = [...lightboxRef.current.querySelectorAll('button')];
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  };
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
            premierCommentaire: b.premier_commentaire || '', premierCommentaireAuto: !!b.premier_commentaire_auto,
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
      agentService.saveDrafts(contenus.filter((c) => c.statut !== 'redaction' && c.statut !== 'valide' && !c.brouillon)).catch(() => {});
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenus, user?.telegram_id]);

  // Suppression avec « Annuler » : la carte disparaît tout de suite, la suppression côté serveur
  // n'a lieu qu'après 5 s (ou en quittant la page) si l'utilisateur n'a pas annulé.
  const suppressions = useRef({});
  useEffect(() => () => {
    Object.values(suppressions.current).forEach(({ timer, definitif }) => { clearTimeout(timer); definitif(); });
  }, []);
  const retirerAvecAnnuler = ({ cle, retirer, restaurer, definitif, message }) => {
    retirer();
    const timer = setTimeout(() => { delete suppressions.current[cle]; definitif(); }, 5000);
    suppressions.current[cle] = { timer, definitif };
    toast(message, {
      duration: 5000,
      action: { label: t('studio.annulerSuppression'), onClick: () => { clearTimeout(timer); delete suppressions.current[cle]; restaurer(); } },
    });
  };
  // Retire une carte du Studio sans rien supprimer en base (carrousel ouvert, contenu déjà validé)
  const retirerCarte = (id) => setContenus((prev) => prev.filter((c) => c.id !== id));
  const supprimerContenu = (id) => {
    const idx = contenus.findIndex((c) => c.id === id);
    const card = contenus[idx];
    if (!card) return;
    if (card.statut === 'valide') { retirerCarte(id); return; } // déjà enregistré dans Contenus : on ne le supprime pas
    retirerAvecAnnuler({
      cle: `c-${id}`,
      retirer: () => retirerCarte(id),
      restaurer: () => setContenus((prev) => { const n = [...prev]; n.splice(Math.min(idx, n.length), 0, card); return n; }),
      definitif: () => { if (card.brouillon && card.contenuId) agentService.supprimerBrouillon(card.contenuId).catch(() => {}); },
      message: t('studio.contenuRetire'),
    });
  };

  // Affichage traduit d'un type vidéo (la valeur stockée/envoyée à l'API reste l'id, ex. 'Video')
  const typeVideoLabel = (id) => {
    const v = TYPES_VIDEO.find((x) => x.id === id);
    return v ? t(`studio.${v.labelKey}`) : id;
  };

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

  // Retrait automatique d'un sujet traité (après validation) : immédiat, sans « Annuler ».
  const supprimerSujet = async (id) => {
    setSujets((prev) => prev.filter((s) => s.id !== id));
    if (openId === id) setOpenId(null);
    if (id) { try { await agentService.supprimerSujet(id); } catch (e) { /* ignore */ } }
  };
  // Suppression demandée par l'utilisateur (corbeille) : avec « Annuler ».
  const supprimerSujetManuel = (id) => {
    const idx = sujets.findIndex((x) => x.id === id);
    const sujet = sujets[idx];
    if (!sujet) return;
    if (openId === id) setOpenId(null);
    retirerAvecAnnuler({
      cle: `s-${id}`,
      retirer: () => setSujets((prev) => prev.filter((x) => x.id !== id)),
      restaurer: () => setSujets((prev) => { const n = [...prev]; n.splice(Math.min(idx, n.length), 0, sujet); return n; }),
      definitif: () => { agentService.supprimerSujet(id).catch(() => {}); },
      message: t('studio.sujetSupprime'),
    });
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
    setContenus((prev) => [{ id: cardId, sujet: s.titre, sujetId: s.id, texte: '', statut: 'redaction', format: fmt, meta, reseau, extras, qualite, structure }, ...prev]);
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
        : await agentService.rediger(s.titre, meta, false, qualite, avecStructure(dimsEdit, structure), { brouillon: true, ...(fmt === 'story' ? { type: 'Story' } : {}) });
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
    setContenus((prev) => [{ id: cardId, sujet: titre, promptFull: txt, texte: '', statut: 'redaction', format: fmt, meta, extras, qualite, structure }, ...prev]);
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
        : await agentService.rediger(txt, meta, false, qualite, avecStructure(null, structure), { brouillon: true, ...(fmt === 'story' ? { type: 'Story' } : {}) });
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
      const d = await agentService.redigerPhoto(file, photoReseau, photoQualite, structure);
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

  // `structureVoulue` : « Réécrire en… » (AIDA, PAS…) ; sinon la structure d'origine de la carte.
  const regenerer = async (id, structureVoulue = null) => {
    const card = contenus.find((c) => c.id === id);
    if (!card) return;
    const structureCarte = structureVoulue || card.structure || 'auto';
    const prompt = card.promptFull || card.sujet;
    // La version actuelle (retouchée ou non) reste récupérable après la régénération
    const precedent = card.texte || null;
    setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'redaction', precedent } : c)));
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
        : await agentService.rediger(prompt, card.meta, false, card.qualite, avecStructure(null, structureCarte),
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
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, texte, texteOriginal: texte, statut: 'pret', structure: structureCarte, accrocheAlerte: d.accroche_chiffres_non_sources || [] } : c)));
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'erreur' } : c)));
      erreurGen(e);
    }
  };

  const majTimers = useRef({});
  const restaurerVersion = (id) => {
    const card = contenus.find((c) => c.id === id);
    if (!card?.precedent) return;
    const actuel = card.texte;
    editer(id, card.precedent);
    setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, precedent: actuel } : c)));
  };
  // Retouche du texte : enregistrée en base après 0,9 s ; l'état (en cours / enregistré) est affiché
  const editer = (id, texte) => {
    const card = contenus.find((c) => c.id === id);
    const enBase = !!(card?.brouillon && card.contenuId);
    setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, texte, ...(enBase ? { sauvegarde: 'encours' } : {}) } : c)));
    if (enBase) {
      clearTimeout(majTimers.current[id]);
      majTimers.current[id] = setTimeout(() => {
        (card.format === 'script' ? agentService.majBrouillonScript(card.contenuId, texte) : agentService.majBrouillon(card.contenuId, texte))
          .then(() => setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, sauvegarde: 'ok' } : c))))
          .catch(() => setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, sauvegarde: 'echec' } : c))));
      }, 900);
    }
  };
  // Premier commentaire : enregistré sur le brouillon après 0,9 s (tout de suite pour la case à cocher).
  // `comDerniers` garde la dernière valeur par carte, pour ne jamais renvoyer un état périmé.
  const comTimers = useRef({});
  const comDerniers = useRef({});
  const sauverCommentaire = (id, contenuId) => {
    clearTimeout(comTimers.current[id]);
    delete comTimers.current[id];
    const d = comDerniers.current[id];
    if (!d || !contenuId) return Promise.resolve();
    return agentService.majCommentaireBrouillon(contenuId, { premier_commentaire: d.premierCommentaire, premier_commentaire_auto: d.premierCommentaireAuto })
      .catch(() => toast.error(t('studio.commentaireSauvegardeEchec')));
  };
  const majCommentaire = (id, champs) => {
    const card = contenus.find((c) => c.id === id);
    if (!card) return;
    comDerniers.current[id] = {
      premierCommentaire: card.premierCommentaire || '', premierCommentaireAuto: !!card.premierCommentaireAuto,
      ...comDerniers.current[id], ...champs,
    };
    setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, ...champs } : c)));
    if (!(card.brouillon && card.contenuId)) return;
    clearTimeout(comTimers.current[id]);
    comTimers.current[id] = setTimeout(() => sauverCommentaire(id, card.contenuId), 'premierCommentaireAuto' in champs ? 0 : 900);
  };
  // Après une validation : on ouvre le contenu suivant encore à relire et on y place le focus
  const titreApercuRef = useRef(null);
  const [focusApercu, setFocusApercu] = useState(0);
  useEffect(() => { if (focusApercu) titreApercuRef.current?.focus(); }, [focusApercu]);
  const passerAuSuivant = (id) => {
    const suivant = contenus.find((c) => c.id !== id && c.statut === 'pret');
    if (!suivant) return;
    setSelId(suivant.id);
    setOnglet('texte');
    setFocusApercu((n) => n + 1);
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
        setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, saving: false, statut: 'valide', valideId: d?.contenu_id || card.contenuId || null } : c)));
        if (card.sujetId) supprimerSujet(card.sujetId); // le sujet est traité → sort de la réserve
        passerAuSuivant(id);
        toast.success(t('studio.scriptReady'), {
          action: d?.contenu_id ? { label: t('studio.editVideoAction'), onClick: () => navigate(`/dashboard/video?contenu_id=${d.contenu_id}`) } : undefined,
        });
        return;
      }
      clearTimeout(majTimers.current[id]);
      if (comTimers.current[id]) await sauverCommentaire(id, card.contenuId);
      const d = await agentService.enregistrer(card.texte, card.sujet, card.meta, card.format === 'story' ? 'Story' : null, card.texteOriginal || null,
        card.brouillon ? card.contenuId : null);
      const com = comDerniers.current[id];
      if (!card.brouillon && d?.contenu_id && com?.premierCommentaire?.trim()) {
        contenuService.update(d.contenu_id, { premier_commentaire: com.premierCommentaire, premier_commentaire_auto: !!com.premierCommentaireAuto }).catch(() => {});
      }
      // Réseaux additionnels cochés : on NE duplique PLUS tout de suite (le post n'a pas encore
      // d'image → ça obligeait à régénérer une image par copie). On duplique seulement une fois
      // qu'une image existe sur cette fiche, via le bouton ♻️ Recycler dans Contenus — la même
      // image est alors reprise pour toutes les copies, zéro régénération.
      // Validé : la carte reste affichée (« Validé ») avec le lien vers la fiche et l'état par réseau
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, saving: false, statut: 'valide', valideId: d?.contenu_id || card.contenuId || null } : c)));
      if (card.sujetId) supprimerSujet(card.sujetId); // le sujet est traité → sort de la réserve
      passerAuSuivant(id);
      toast.success(card.format === 'story' ? t('studio.storyValidated') : t('studio.postValidated'), {
        action: { label: t('studio.openInContents'), onClick: () => navigate(d?.contenu_id || card.contenuId ? `/dashboard/contenus?ouvrir=${d?.contenu_id || card.contenuId}` : '/dashboard/contenus') },
      });
    } catch (e) {
      setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, saving: false } : c)));
      toast.error(e.response?.data?.detail || t('studio.validationError'));
    }
  };

  // --- Affichage (maquette validée le 2026-10-20, revue critique du 2026-10-20) ---
  const aRelire = contenus.filter((c) => c.statut !== 'valide');
  const valides = contenus.filter((c) => c.statut === 'valide');
  const sel = contenus.find((c) => c.id === selId) || aRelire[0] || contenus[0] || null;
  useEffect(() => { setSlideIdx(0); }, [sel?.id]);
  const enCours = contenus.filter((c) => c.statut === 'redaction').length;
  const nbARelire = contenus.filter((c) => c.statut === 'pret').length;
  const filtresActifs = Object.values(filtres).filter(Boolean).length;
  const reseauDe = (c) => (c.format === 'script' ? (c.reseau || '') : (c.meta || ''));
  const libelleFormat = (c) => (c.format === 'script' ? t('studio.formatScript') : c.format === 'carrousel' ? t('studio.formatCarousel')
    : c.format === 'story' ? t('studio.formatStory') : c.format === 'photo' ? t('studio.postFromPhoto') : t('studio.formatPost'));
  const nomReseau = (id) => RESEAUX.find((r) => r.id === id)?.label || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
  const etatContenu = (c) => (c.statut === 'redaction'
    ? (c.format === 'carrousel' ? t('studio.creatingCarousel') : c.format === 'photo' ? t('studio.analyzingPhoto') : c.format === 'script' ? t('studio.writingScript') : t('studio.writingPost'))
    : c.statut === 'erreur' ? t('studio.generationErrorShort')
    : c.statut === 'valide' ? t('studio.statutValide')
    : c.format === 'carrousel' ? t('studio.statutEnregistre')
    : c.format === 'photo' ? t('studio.statutEnregistre') : t('studio.statutPret'));
  // Un état = une couleur + une icône + un texte (jamais la couleur seule)
  //   à relire (violet) · à finaliser dans Contenus (ambre : carrousel, photo) · validé (vert)
  const tonEtat = (c) => (c.statut === 'erreur' ? 'text-red-300' : c.statut === 'valide' ? 'text-[#7ff5c4]'
    : c.statut === 'carrousel' || c.statut === 'photo' ? 'text-amber-200' : 'text-[#c9c1ff]');
  const IconeEtat = ({ c }) => (c.statut === 'redaction' ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
    : c.statut === 'erreur' ? <AlertTriangle className="w-3 h-3" aria-hidden="true" />
    : c.statut === 'valide' ? <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
    : c.statut === 'carrousel' || c.statut === 'photo' ? <Clock className="w-3 h-3" aria-hidden="true" />
    : <CircleDot className="w-3 h-3" aria-hidden="true" />);
  const LIMITE_CARACTERES = { linkedin: 3000, instagram: 2200, facebook: 5000, tiktok: 2200, googlebusiness: 1500, twitter: 280 };
  const verifications = (c) => {
    const texte = c.texte || '';
    const max = LIMITE_CARACTERES[c.meta] || 3000;
    const hashtags = (texte.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    const chiffres = c.accrocheAlerte || [];
    return [
      { ok: texte.length <= max, texte: t('studio.verifLongueur', { n: texte.length, max }) },
      { ok: !chiffres.length, texte: chiffres.length ? t('studio.verifChiffres', { liste: chiffres.join(', ') }) : t('studio.verifChiffresOk') },
      c.meta === 'linkedin'
        ? { ok: hashtags <= 5, texte: t('studio.verifHashtagsLinkedin', { n: hashtags }) }
        : { ok: c.meta !== 'instagram' || (hashtags >= 3 && hashtags <= 8), texte: t('studio.verifHashtags', { n: hashtags }) },
    ];
  };
  // Étapes pilotées par la progression réelle : 3 = il y a des contenus à relire, 4 = tout est validé
  const step = !contenus.length ? 1
    : contenus.every((c) => c.statut === 'valide') ? 4
      : contenus.some((c) => ['pret', 'photo', 'carrousel'].includes(c.statut)) ? 3 : 2;
  // En-tête compact dès qu'il y a quelque chose à relire : l'atelier passe avant le décor
  const enteteCompact = aRelire.length > 0;
  const [validesOuverts, setValidesOuverts] = useState(false);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  useEffect(() => { setReglagesOuverts(false); }, [openId]);
  const champ = `w-full rounded-[10px] bg-[#111b33] border border-white/[0.09] text-slate-100 text-[13.5px] px-3 py-2.5 outline-none focus:border-[#8A6CFF]/70 font-inter ${FOCUS}`;
  const carte = 'bg-[#0b1326] border border-white/[0.08] rounded-2xl p-4 min-w-0';
  // Bouton principal : violet uni (contraste du texte blanc ≥ 5:1), sans halo
  const btnViolet = `bg-[#5a4ae8] text-white hover:bg-[#6757f0] disabled:opacity-40 ${FOCUS}`;
  const btnSecondaire = `bg-transparent border border-white/15 text-slate-100 hover:bg-white/5 ${FOCUS}`;
  const extrasDe = (c) => (c.extras || []).map(nomReseau).filter(Boolean);

  const ciblage = dims && (
    <div className="mt-3.5 border-t border-white/[0.08] pt-3">
      <button type="button" onClick={() => setFiltresOpen((o) => !o)} aria-expanded={filtresOpen} aria-controls="studio-ciblage"
        className={`w-full flex items-center gap-2 text-[13.5px] font-semibold text-white font-inter rounded-md py-1 ${FOCUS}`}>
        <Target className="w-4 h-4 text-slate-300" aria-hidden="true" />{t('studio.affinerCiblage')}
        <span className="font-normal text-slate-400">{t('studio.optionnel')}</span>
        {filtresActifs > 0 && <span className="text-[12px] font-medium text-[#c9c1ff]">· {t('studio.filtresActifs', { count: filtresActifs })}</span>}
        <ChevronDown className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${filtresOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {filtresOpen && (
        <div id="studio-ciblage" className="mt-2.5">
          <div className="grid grid-cols-2 gap-2">
            {[...DIM_META, ...(dims?.offre?.length ? [{ cle: 'offre', labelKey: 'dimOffre' }] : [])].map(({ cle, labelKey }) => (
              <label key={cle} className="relative min-w-0 rounded-[10px] border border-white/[0.09] bg-[#111b33] px-2.5 py-2 hover:border-white/20 transition-colors focus-within:ring-2 focus-within:ring-[#8A6CFF]/60">
                <span className="block text-[12.5px] font-semibold text-white font-inter">{t(`studio.${labelKey}`)}</span>
                <select value={filtres[cle] || ''} onChange={(e) => setFiltres((f) => ({ ...f, [cle]: e.target.value }))}
                  data-testid={`studio-filtre-${cle}`}
                  className={`w-full appearance-none truncate bg-transparent pr-4 text-[12.5px] outline-none font-inter cursor-pointer ${filtres[cle] ? 'text-[#c9c1ff] font-medium' : 'text-slate-300'}`}>
                  <option value="" className="bg-[#0b1326]">{t('studio.filtreAuto')}</option>
                  {((cle === 'offre' ? dims.offre : dims[cle]) || []).map((v) => <option key={v} value={v} className="bg-[#0b1326]">{v}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 bottom-2.5 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </label>
            ))}
          </div>
          {filtresActifs > 0 && (
            <button type="button" onClick={() => setFiltres({})} className={`mt-2 text-[12.5px] text-[#c9c1ff] underline hover:text-white rounded ${FOCUS}`}>{t('studio.reinitialiser')}</button>
          )}
        </div>
      )}
    </div>
  );

  const indicationReseaux = (fmt, n) => (n > 1 ? (
    <span className="text-[12px] text-[#7ff5c4] font-inter">
      {fmt === 'carrousel' ? t('studio.onePostNNetworks', { n }) : t('studio.onePostNNetworksPlusTard', { n })}
    </span>
  ) : null);

  return (
    <div className="w-full space-y-4 pb-28 md:pb-10 xl:pb-0">
      {/* ─── En-tête : titre et étapes (photo de bannière sur grand écran seulement) ─── */}
      <header className={`relative overflow-hidden rounded-[18px] bg-[#0b1326] border border-white/[0.06] ${enteteCompact ? '' : 'lg:min-h-[150px]'}`}>
        <div aria-hidden="true" className={`${enteteCompact ? 'hidden' : 'hidden lg:block'} absolute inset-0 bg-cover bg-[position:70%_55%]`} style={{ backgroundImage: "url('/images/studio-banniere.jpg')" }} />
        <div aria-hidden="true" className={`${enteteCompact ? 'hidden' : 'hidden lg:block'} absolute inset-0 bg-[linear-gradient(90deg,#050b1a_0%,rgba(5,11,26,0.92)_30%,rgba(5,11,26,0.4)_50%,rgba(5,11,26,0.05)_64%,rgba(5,11,26,0.2)_80%,rgba(5,11,26,0.75)_100%)]`} />
        <div className={`relative px-5 sm:px-6 flex ${enteteCompact ? 'py-3 flex-row flex-wrap items-center gap-x-6 gap-y-2' : 'py-4 sm:py-5 flex-col gap-1'}`}>
          <div className="min-w-0">
            <h1 className={`font-sora font-extrabold leading-tight text-white tracking-tight ${enteteCompact ? 'text-[22px] sm:text-[24px]' : 'text-[26px] sm:text-[32px]'}`}>{t('studio.pageTitle')}</h1>
            {!enteteCompact && <p className="text-[14.5px] text-slate-300 font-inter">{t('studio.pageSubtitle')}</p>}
          </div>
          <ol className={`flex flex-wrap items-center gap-x-2.5 gap-y-2 ${enteteCompact ? 'md:ml-auto' : 'pt-3'}`} aria-label={t('studio.etapesLabel')}>
            {STEPS.map((s, i) => {
              const done = step > s.n;
              const active = step === s.n;
              return (
                <li key={s.n} className="flex items-center gap-2.5" aria-current={active ? 'step' : undefined}>
                  <span className={`flex items-center gap-2 text-[13.5px] font-inter ${done ? 'text-[#7ff5c4]' : active ? 'text-white font-semibold' : 'text-slate-300'}`}>
                    <span className={`w-[28px] h-[28px] rounded-full grid place-items-center text-[13px] font-bold ${done ? 'bg-[#3AFFA3] text-[#03241a]' : active ? 'bg-[#5a4ae8] text-white' : 'border border-white/25 bg-[#0b1326]/80'}`}>
                      {done ? <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" /> : s.n}
                    </span>
                    {t(`studio.${s.labelKey}`)}
                  </span>
                  {i < STEPS.length - 1 && <span aria-hidden="true" className="hidden sm:block w-10 h-px bg-white/25" />}
                </li>
              );
            })}
          </ol>
        </div>
        <div aria-hidden="true" className={`${enteteCompact ? 'hidden' : 'hidden lg:block'} absolute right-16 bottom-12 font-['Caveat',cursive] font-bold text-[31px] leading-[1.05] text-white text-right -rotate-6 [text-shadow:0_2px_14px_rgba(0,0,0,0.45)]`}>
          {t('studio.slogan1')}<br />{t('studio.slogan2')}
        </div>
        {!enteteCompact && <span className="hidden lg:block absolute right-3 bottom-1.5 text-[12px] text-white/80 font-inter bg-black/45 rounded px-1.5">{t('studio.creditPhoto')}</span>}
      </header>

      {/* ─── Marque incomplète ─── */}
      {!marqueOk && (
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3.5 rounded-[14px] border border-orange-400/45 bg-orange-400/10 px-4 py-3 animate-fade-in" role="status">
          <span className="w-[38px] h-[38px] rounded-[10px] bg-orange-400 grid place-items-center text-[#2a1600] flex-none"><AlertTriangle className="w-5 h-5" aria-hidden="true" /></span>
          <div className="min-w-0 font-inter">
            <p className="text-[14.5px] font-semibold text-orange-200">{t('studio.completeBrandFirst')}</p>
            <p id="studio-raison-blocage" className="text-[13px] text-slate-300" data-testid="studio-champs-manquants">
              {champsManquants.length > 0
                ? <>{t('studio.champsManquants')} <span className="text-orange-100">{champsManquants.map((c) => t(`demarrage.champs.${c}`)).join(', ')}.</span></>
                : <>{t('studio.guardIntro')} {t('studio.guardSector')}.</>}
            </p>
          </div>
          <Link to="/dashboard/parametres" className={`sm:ml-auto text-[13px] font-semibold text-orange-100 border border-orange-400/40 rounded-[9px] px-3 py-2 whitespace-nowrap hover:bg-orange-400/10 ${FOCUS}`}>{t('studio.allerParametres')} →</Link>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-4 items-start">
        {/* ─── Zone gauche : créer + réserve de sujets ─── */}
        <div className={`flex flex-col gap-4 min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-4rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-1 [scrollbar-width:thin] ${contenus.length ? 'order-2 xl:order-none' : ''}`}>
          <section className={`${carte} flex-none`} aria-labelledby="studio-creer-titre">
            <h2 id="studio-creer-titre" className="font-sora font-bold text-[15.5px] text-white mb-2">{t('studio.creerTitre')}</h2>
            <Onglets id="studio-creer" label={t('studio.creerTitre')} valeur={modeCreation} onChange={setModeCreation}
              items={[['sujets', t('studio.ongletSujetsIA'), Lightbulb], ['brief', t('studio.ongletBrief'), PenLine], ['photo', t('studio.ongletPhoto'), ImageIcon]]} />
            <div role="tabpanel" id="studio-creer-panel" aria-labelledby={`studio-creer-tab-${modeCreation}`} className="pt-3.5">
              {modeCreation === 'sujets' && (
                <>
                  <p className="text-[13px] text-slate-300 font-inter mb-3">{t('studio.genererSujetsAide')}</p>
                  <div className="flex items-end gap-2.5">
                    <label className="w-[78px] flex-none">
                      <span className="block text-[12.5px] text-slate-300 font-inter mb-1.5">{t('studio.countLabel')}</span>
                      <select id="studio-nb-sujets" value={nbSujets} onChange={(e) => setNbSujets(parseInt(e.target.value, 10))} className={champ}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <Button onClick={proposerSujets} disabled={!marqueOk || loadingSujets} aria-describedby={!marqueOk ? 'studio-raison-blocage' : undefined} data-testid="studio-generer-sujets" className={`${btnViolet} h-[42px] flex-1 min-w-0`}>
                      {loadingSujets ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                      <span className="ml-2">{t('studio.generateSubjects')}</span>
                    </Button>
                  </div>
                  {ciblage}
                </>
              )}

              {modeCreation === 'brief' && (
                <>
                  <p className="text-[13px] text-slate-300 font-inter mb-3">{t('studio.briefAide')}</p>
                  <Textarea value={briefText} onChange={(e) => setBriefText(e.target.value)} rows={3} data-testid="studio-brief-text"
                    aria-label={t('studio.writeOwnBrief')} placeholder={t('studio.briefPlaceholder')} className={`${champ} resize-y min-h-[72px] placeholder:text-slate-400`} />
                  <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                    <label className="min-w-0">
                      <span className="block text-[12.5px] text-slate-300 font-inter mb-1.5">{t('studio.formatLabel')}</span>
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
                        <span className="block text-[12.5px] text-slate-300 font-inter mb-1.5">{t('studio.typeLabel')}</span>
                        <select id="studio-brief-type" value={bType} onChange={(e) => setBType(e.target.value)} className={champ}>
                          {TYPES_VIDEO.map((r) => <option key={r.id} value={r.id}>{t(`studio.${r.labelKey}`)}</option>)}
                        </select>
                      </label>
                    ) : bFormat === 'carrousel' ? (
                      <label className="min-w-0">
                        <span className="block text-[12.5px] text-slate-300 font-inter mb-1.5">{t('studio.slidesLabel')}</span>
                        <select id="studio-brief-slides" value={nbSlides} onChange={(e) => setNbSlides(parseInt(e.target.value, 10))} className={champ}>
                          {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    ) : <span />}
                  </div>
                  {bFormat !== 'script' && (
                    <div className="mt-2.5">
                      <span className="block text-[12.5px] text-slate-300 font-inter mb-1.5">{t('studio.networksLabel')}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {reseaux.length === 0
                          ? <Link to="/dashboard/parametres" className="text-[12.5px] text-amber-300 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                          : reseauxPour(bFormat).map((r) => (
                            <Pill key={r.id} active={bReseaux.includes(r.id)} onClick={() => toggleReseau(setBReseaux)(r.id)}>{r.label}</Pill>
                          ))}
                      </div>
                      <div className="mt-1.5">{indicationReseaux(bFormat, bReseaux.length)}</div>
                    </div>
                  )}
                  <div className="flex justify-end mt-3">
                    <Button onClick={() => genererBrief()} disabled={!marqueOk || !briefText.trim()} data-testid="studio-brief-generer" className={btnViolet}>
                      <Wand2 className="w-4 h-4" /><span className="ml-2">{t('studio.writeButton')}</span>
                    </Button>
                  </div>
                </>
              )}

              {modeCreation === 'photo' && (
                <>
                  <p className="text-[13px] text-slate-300 font-inter mb-3">{t('studio.photoHint')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button type="button" onClick={() => photoRef.current?.click()} disabled={!marqueOk || photoLoading}
                      onDragOver={(e) => { e.preventDefault(); setDepotActif(true); }} onDragLeave={() => setDepotActif(false)}
                      onDrop={(e) => { e.preventDefault(); setDepotActif(false); genererPhoto(e.dataTransfer.files?.[0]); }}
                      className={`rounded-xl border-[1.5px] border-dashed min-h-[118px] flex flex-col items-center justify-center gap-1 px-3 text-center text-[12.5px] font-inter transition-colors disabled:opacity-40 ${FOCUS} ${depotActif ? 'border-[#8A6CFF] bg-[#6f5cff]/10 text-white' : 'border-white/25 text-slate-300 hover:border-white/40'}`}>
                      {photoLoading ? <Loader2 className="w-5 h-5 animate-spin text-[#c9c1ff]" /> : <Upload className="w-5 h-5 text-[#c9c1ff]" aria-hidden="true" />}
                      {t('studio.deposerPhoto')}
                      <span className="text-slate-400">{t('studio.formatsPhoto')}</span>
                    </button>
                    <div className="flex flex-col justify-end gap-2.5">
                      <label>
                        <span className="block text-[12.5px] text-slate-300 font-inter mb-1.5">{t('studio.networkLabel')}</span>
                        {reseaux.length === 0
                          ? <Link to="/dashboard/parametres" className="text-[12.5px] text-amber-300 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                          : (
                            <select id="studio-photo-reseau" value={photoReseau} onChange={(e) => setPhotoReseau(e.target.value)} className={champ}>
                              {reseaux.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                            </select>
                          )}
                      </label>
                      {cameraAvailable() && (
                        <Button onClick={prendrePhoto} disabled={!marqueOk || photoLoading} className={`${btnSecondaire} disabled:opacity-40`}>
                          <Camera className="w-4 h-4" /><span className="ml-2">{t('studio.takePhotoButton')}</span>
                        </Button>
                      )}
                      <Button onClick={() => photoRef.current?.click()} disabled={!marqueOk || photoLoading} className={btnViolet}>
                        {t('studio.analyserPhoto')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 pt-3.5 border-t border-white/[0.07]">
              <label htmlFor="studio-structure" className="block text-[12.5px] font-semibold text-slate-100 font-inter mb-1.5">{t('studio.structureTitre')}</label>
              <Select value={structure} onValueChange={setStructure}>
                <SelectTrigger id="studio-structure" data-testid="studio-structure" aria-describedby="studio-structure-aide"
                  className={`h-10 w-full rounded-[10px] border-white/15 bg-[#111b33] px-3 text-[13.5px] text-slate-100 font-inter focus:ring-2 focus:ring-[#8A6CFF]/60 focus:ring-offset-0 ${FOCUS}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRUCTURES.map((k) => <SelectItem key={k} value={k} className="text-[13px]">{t(`studio.structures.${k}.nom`)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p id="studio-structure-aide" className="mt-1.5 text-[12.5px] text-slate-400 font-inter leading-snug">
                {t(`studio.structures.${structure}.aide`)} {t('studio.structurePortee')}
              </p>
            </div>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" data-testid="studio-photo-input"
              onChange={(e) => genererPhoto(e.target.files?.[0])} />
          </section>

          <section className={`${carte} xl:flex xl:flex-col xl:flex-1 xl:min-h-[260px]`} aria-labelledby="studio-sujets-titre">
            <div className="flex items-center gap-2.5 mb-2.5">
              <h2 id="studio-sujets-titre" className="font-sora font-bold text-[15.5px] text-white">{t('studio.vosSujets')}</h2>
              {sujets.length > 0 && <span className="ml-auto text-[12px] text-[#d8d2ff] bg-[#6f5cff]/20 rounded-full px-2.5 py-0.5 font-inter">{t('studio.nbSujets', { count: sujets.length })}</span>}
            </div>
            {sujets.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-1.5 py-8 px-4 text-[13px] text-slate-300 font-inter">
                <Lightbulb className="w-6 h-6 text-[#c9c1ff] mb-1" aria-hidden="true" />
                <b className="font-sora text-[15px] text-white">{t('studio.videTitre')}</b>
                {t('studio.videAide')}
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-white/[0.07] xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:-mr-2 xl:pr-2 [scrollbar-width:thin]">
                {sujets.map((s, i) => {
                  const open = openId === s.id;
                  const reco = s.dimensions_reco || s.dimensions || {}; // reco d'origine de l'IA
                  const anyEdited = open && (DIM_META.some(({ cle }) => dimsEdit[cle] !== (reco[cle] || '')) || (dimsEdit.offre || '') !== (reco.offre || ''));
                  return (
                    <li key={s.id} data-testid={`studio-sujet-${s.id}`}
                      className={`group -mx-2 px-2 rounded-xl transition-colors ${open ? 'bg-[#6f5cff]/[0.08] my-1' : 'hover:bg-white/[0.03]'}`}>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => (open ? setOpenId(null) : ouvrir(s))} aria-expanded={open}
                          className={`flex-1 min-w-0 flex items-center gap-3 pr-2 py-3 text-left rounded-lg ${FOCUS}`}>
                          <span className={`flex-none font-sora font-bold text-[14px] w-5 tabular-nums ${open ? 'text-[#c9c1ff]' : 'text-slate-400'}`}>{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold text-slate-100 font-inter leading-snug">{s.titre}</span>
                            {(s.dimensions?.format || s.dimensions?.offre) && (
                              <span className="block text-[12px] text-slate-400 font-inter mt-0.5 truncate">
                                {[s.dimensions?.format, s.dimensions?.offre].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                          <ChevronDown className={`flex-none w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => supprimerSujetManuel(s.id)} title={t('studio.deleteTitle')} aria-label={`${t('studio.deleteTitle')} : ${s.titre}`}
                          className={`flex-none ml-1 p-2 rounded-lg text-slate-400 hover:text-red-300 hover:bg-white/5 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 ${open ? 'md:opacity-100' : ''} ${FOCUS}`}>
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>

                      {open && (
                        <div className="pl-8 pr-1 pb-4 pt-0.5 space-y-3 animate-fade-in">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-inter">
                            <span className="text-slate-100">{[dimsEdit.objectif, dimsEdit.angle, dimsEdit.cible, dimsEdit.format, dimsEdit.offre].filter(Boolean).join(' · ') || t('studio.dimAide')}</span>
                            <button type="button" onClick={() => setReglagesOuverts((o) => !o)} aria-expanded={reglagesOuverts} aria-controls={`studio-reglages-${s.id}`}
                              className={`text-[#c9c1ff] hover:text-white underline underline-offset-2 rounded ${FOCUS}`}>
                              {reglagesOuverts ? t('studio.reglagesMasquer') : t('studio.reglagesModifier')}
                            </button>
                          </div>
                          {reglagesOuverts && (
                          <div id={`studio-reglages-${s.id}`} className="space-y-3">
                          <p className="text-[12.5px] text-slate-300 font-inter">{t('studio.dimAide')}</p>
                          <div className="grid grid-cols-2 gap-2.5">
                            {DIM_META.map(({ cle, labelKey }) => (
                              <DimSelect key={cle} id={`studio-dim-${s.id}-${cle}`} label={t(`studio.${labelKey}`)}
                                value={dimsEdit[cle]} reco={reco[cle]} t={t}
                                options={(dims && dims[cle] && dims[cle].length) ? dims[cle] : DIM_FALLBACK[cle]}
                                onChange={(v) => changeDim(cle, v)} />
                            ))}
                          </div>
                          {/* 5e dimension « Offre » (optionnelle) : seulement si le compte a des offres */}
                          {dims?.offre?.length ? (
                            <DimSelect id={`studio-dim-${s.id}-offre`} label={t('studio.dimOffreMiseEnAvant')} t={t}
                              value={dimsEdit.offre || AUCUNE} reco={reco.offre || AUCUNE}
                              options={[AUCUNE, ...dims.offre]} libelle={(v) => (v === AUCUNE ? t('studio.aucuneOffre') : v)}
                              onChange={(v) => changeDim('offre', v === AUCUNE ? '' : v)} />
                          ) : null}
                          </div>
                          )}

                          {/* Le format vient de la dimension. Script vidéo = Type + Réseau ; sinon = Réseaux */}
                          {cfgFormat === 'script' ? (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[12.5px] text-slate-300 font-inter">{t('studio.typeLabel')}</span>
                                {TYPES_VIDEO.map((r) => (
                                  <Pill key={r.id} active={cfgType === r.id} onClick={() => setCfgType(r.id)}>{t(`studio.${r.labelKey}`)}</Pill>
                                ))}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[12.5px] text-slate-300 font-inter">{t('studio.networkLabel')}</span>
                                {reseauxVideo(dimsEdit.format).length === 0
                                  ? <Link to="/dashboard/parametres" className="text-[12.5px] text-amber-300 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                                  : reseauxVideo(dimsEdit.format).map((r) => (
                                    <Pill key={r.id} active={cfgReseaux[0] === r.id} onClick={() => setCfgReseaux([r.id])}>{r.label}</Pill>
                                  ))}
                              </div>
                            </>
                          ) : (
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[12.5px] text-slate-300 font-inter">{t('studio.networksLabel')}</span>
                                {reseaux.length === 0
                                  ? <Link to="/dashboard/parametres" className="text-[12.5px] text-amber-300 hover:underline">{t('studio.connectNetworkFirst')}</Link>
                                  : reseauxPour(cfgFormat).map((r) => (
                                    <Pill key={r.id} active={cfgReseaux.includes(r.id)} onClick={() => toggleReseau(setCfgReseaux)(r.id)}>{r.label}</Pill>
                                  ))}
                              </div>
                              <div className="mt-1.5">{indicationReseaux(cfgFormat, cfgReseaux.length)}</div>
                            </div>
                          )}
                          {cfgFormat === 'carrousel' && (
                            <label className="flex items-center gap-2">
                              <span className="text-[12.5px] text-slate-300 font-inter">{t('studio.slidesLabel')}</span>
                              <select id={`studio-slides-${s.id}`} value={nbSlides} onChange={(e) => setNbSlides(parseInt(e.target.value, 10))}
                                className={`rounded-lg bg-[#0b1326] border border-white/10 text-slate-100 text-sm px-2.5 py-1 outline-none focus:border-[#8A6CFF]/60 ${FOCUS}`}>
                                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </label>
                          )}
                          <div className="flex items-center gap-2">
                            {anyEdited && (
                              <button type="button" onClick={() => revertDims(s)} className={`text-[12.5px] text-slate-300 hover:text-[#7ff5c4] transition-colors inline-flex items-center gap-1 rounded ${FOCUS}`}>
                                <RefreshCw className="w-3 h-3" aria-hidden="true" />{t('studio.retablirReco')}
                              </button>
                            )}
                            <button type="button" onClick={() => setOpenId(null)} className={`ml-auto text-[13px] text-slate-300 hover:text-white font-inter px-2 py-1 rounded ${FOCUS}`}>{t('studio.fermer')}</button>
                            <Button onClick={() => genererContenu(s)} data-testid={`studio-generer-post-${s.id}`} className={btnViolet}>
                              <Wand2 className="w-4 h-4" /><span className="ml-2">{t('studio.generateButton')}</span>
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ─── Zone droite : activité de l'IA + atelier « À valider » ─── */}
        <div className={`flex flex-col gap-4 min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-4rem)] ${contenus.length ? 'order-1 xl:order-none' : ''}`}>
          {(loadingSujets || enCours > 0) && (
          <section aria-labelledby="studio-journal-titre" className="flex-none rounded-2xl border border-white/[0.08] bg-[#0b1326] px-4 py-3 xl:max-h-[180px] xl:overflow-y-auto">
            <div className="flex items-center gap-2.5">
              {loadingSujets || enCours ? <Loader2 className="w-4 h-4 animate-spin text-[#c9c1ff]" aria-hidden="true" /> : <Activity className="w-4 h-4 text-slate-400" aria-hidden="true" />}
              <h2 id="studio-journal-titre" className="font-sora font-semibold text-[14px] text-white">{t('studio.journalTitre')}</h2>
              <span className={`ml-auto xl:mr-12 text-[12px] rounded-full px-2.5 py-0.5 font-inter ${loadingSujets || enCours ? 'text-[#d8d2ff] bg-[#6f5cff]/20' : 'text-slate-300 bg-white/5'}`}>
                {loadingSujets || enCours ? t('studio.journalEnCours') : t('studio.journalAttente')}
              </span>
            </div>
            <div aria-live="polite">
              {loadingSujets ? (
                <ol className="flex flex-col gap-2 text-[13px] font-inter mt-2.5">
                  {LOGS_SUJETS.map((log, i) => (
                    <li key={log} className={`flex items-center gap-2.5 ${i < logIndex ? 'text-slate-100' : i === logIndex ? 'text-[#d8d2ff]' : 'text-slate-400'}`}>
                      {i < logIndex ? <Check className="w-3.5 h-3.5 text-[#3AFFA3]" aria-hidden="true" />
                        : i === logIndex ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#c9c1ff]" aria-hidden="true" />
                        : <span className="w-3.5 h-3.5 grid place-items-center" aria-hidden="true"><span className="w-2 h-2 rounded-full border border-slate-400" /></span>}
                      {t(`studio.${log}`)}
                    </li>
                  ))}
                </ol>
              ) : enCours ? (
                <ol className="flex flex-col gap-2 text-[13px] font-inter mt-2.5">
                  {contenus.filter((c) => c.statut === 'redaction').map((c) => (
                    <li key={c.id} className="flex items-center gap-2.5 text-[#d8d2ff] min-w-0"><Loader2 className="w-3.5 h-3.5 animate-spin text-[#c9c1ff] flex-none" aria-hidden="true" /><span className="flex-none">{etatContenu(c)}</span> <span className="text-slate-300 truncate">{c.sujet}</span></li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] text-slate-300 font-inter mt-1">{t('studio.journalVide')}</p>
              )}
            </div>
          </section>
          )}

          <section className="bg-[#0b1326] border border-white/[0.08] rounded-2xl min-w-0 xl:flex xl:flex-col xl:min-h-0 xl:flex-1" aria-labelledby="studio-atelier-titre">
            <div className="flex-none flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-white/[0.08]">
              <h2 id="studio-atelier-titre" className="font-sora font-bold text-[15.5px] text-white">{t('studio.atelierTitre')}</h2>
              {(nbARelire > 0 || enCours > 0) && <span className="text-[12px] text-[#d8d2ff] bg-[#6f5cff]/20 rounded-full px-2.5 py-0.5 font-inter whitespace-nowrap">{enCours ? t('studio.nbEnCours', { count: enCours }) : t('studio.nbARelire', { count: nbARelire })}</span>}
              <Link to="/dashboard/contenus" className={`ml-auto text-[13px] font-semibold text-[#c9c1ff] hover:text-white font-inter whitespace-nowrap rounded ${FOCUS}`}>{t('studio.tousContenus')} →</Link>
            </div>

            {contenus.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-1.5 py-14 px-6 text-[13.5px] text-slate-300 font-inter">
                <Eye className="w-6 h-6 text-[#c9c1ff] mb-1" aria-hidden="true" />
                <b className="font-sora text-[15px] text-white">{t('studio.atelierVideTitre')}</b>
                <span className="max-w-[46ch]">{t('studio.emptyContentsHint')}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,250px)_minmax(0,1fr)] xl:flex-1 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)]">
                <ul className="flex flex-col p-2 gap-0.5 max-h-[260px] md:max-h-[640px] xl:max-h-none xl:min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin] border-b md:border-b-0 md:border-r border-white/[0.08]" aria-label={t('studio.contenusGeneres')}>
                  {[...aRelire, ...(validesOuverts ? valides : [])].map((c, i) => (
                    <li key={c.id} data-testid={`studio-contenu-${c.id}`}
                      style={i === aRelire.length && i > 0 ? { marginTop: 6 } : undefined}
                      className={`group flex items-center gap-1 rounded-xl transition-colors ${sel?.id === c.id ? 'bg-[#6f5cff]/[0.14]' : 'hover:bg-white/[0.04]'}`}>
                      <button type="button" onClick={() => { setSelId(c.id); setOnglet('texte'); }} aria-current={sel?.id === c.id ? 'true' : undefined}
                        className={`flex-1 min-w-0 flex items-center gap-2.5 text-left px-2 py-2 rounded-xl ${FOCUS}`}>
                        <Plateforme id={reseauDe(c)} petit />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-white font-inter line-clamp-2 leading-snug">{c.sujet || libelleFormat(c)}</span>
                          <span className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-inter min-w-0">
                            <span className="text-slate-300">{libelleFormat(c)}</span>
                            <span className={`flex items-center gap-1 flex-none ${tonEtat(c)}`}><IconeEtat c={c} />{etatContenu(c)}</span>
                          </span>
                        </span>
                      </button>
                      <button type="button" onClick={() => supprimerContenu(c.id)} title={t('studio.removeTitle')} aria-label={`${t('studio.removeTitle')} : ${c.sujet || libelleFormat(c)}`}
                        className={`flex-none p-2 mr-0.5 rounded-lg text-slate-400 hover:text-red-300 hover:bg-white/5 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS}`}>
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                  {valides.length > 0 && (
                    <li>
                      <button type="button" onClick={() => setValidesOuverts((o) => !o)} aria-expanded={validesOuverts}
                        className={`w-full flex items-center gap-2 px-2 py-2 mt-1 rounded-xl text-[12.5px] text-[#7ff5c4] font-inter hover:bg-white/[0.04] ${FOCUS}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />{t('studio.validesTitre', { count: valides.length })}
                        <ChevronDown className={`ml-auto w-3.5 h-3.5 transition-transform ${validesOuverts ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                    </li>
                  )}
                </ul>

                {sel && (
                  <div className="p-4 min-w-0 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain [scrollbar-width:thin]">
                    <h3 ref={titreApercuRef} tabIndex={-1} className="font-sora font-bold text-[15.5px] text-white leading-snug [text-wrap:balance] outline-none">{sel.sujet || libelleFormat(sel)}</h3>
                    <div className="flex items-center gap-2 text-[13px] text-slate-300 font-inter mt-1 mb-3">
                      <Plateforme id={reseauDe(sel)} petit />
                      <span>{libelleFormat(sel)}{nomReseau(reseauDe(sel)) ? ` · ${nomReseau(reseauDe(sel))}` : ''}</span>
                      {sel.format === 'carrousel' && sel.images?.length > 0 && (
                        <span className="ml-auto flex items-center gap-2">
                          <span className="tabular-nums">{slideIdx + 1}/{sel.images.length}</span>
                          <button type="button" onClick={() => setSlideIdx((i) => (i - 1 + sel.images.length) % sel.images.length)} aria-label={t('studio.prevSlide', 'Précédent')} className={`w-8 h-8 rounded-lg border border-white/15 grid place-items-center hover:text-white ${FOCUS}`}><ChevronLeft className="w-4 h-4" /></button>
                          <button type="button" onClick={() => setSlideIdx((i) => (i + 1) % sel.images.length)} aria-label={t('studio.nextSlide', 'Suivant')} className={`w-8 h-8 rounded-lg border border-white/15 grid place-items-center hover:text-white ${FOCUS}`}><ChevronRight className="w-4 h-4" /></button>
                        </span>
                      )}
                    </div>

                    {sel.statut === 'valide' ? (
                      <div className="rounded-xl border border-[#3AFFA3]/30 bg-[#3AFFA3]/[0.06] p-4 font-inter" role="status">
                        <p className="flex items-center gap-2 text-[14.5px] font-semibold text-[#7ff5c4]"><CheckCircle2 className="w-5 h-5" aria-hidden="true" />{t('studio.valideTitre')}</p>
                        <p className="text-[13px] text-slate-200 mt-1.5">{t('studio.rienPublie')}</p>
                        {extrasDe(sel).length > 0 && (
                          <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
                            <li className="flex items-center gap-2 text-slate-100"><Check className="w-4 h-4 text-[#3AFFA3]" aria-hidden="true" />{t('studio.reseauValide', { reseau: nomReseau(reseauDe(sel)) })}</li>
                            <li className="flex items-start gap-2 text-amber-100"><AlertTriangle className="w-4 h-4 text-amber-300 flex-none mt-0.5" aria-hidden="true" />{t('studio.extrasApresImage', { liste: extrasDe(sel).join(', ') })}</li>
                          </ul>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-4">
                          <Button size="sm" className={btnViolet}
                            onClick={() => navigate(sel.format === 'script'
                              ? (sel.valideId ? `/dashboard/video?contenu_id=${sel.valideId}` : '/dashboard/contenus')
                              : (sel.valideId ? `/dashboard/contenus?ouvrir=${sel.valideId}` : '/dashboard/contenus'))}>
                            {sel.format === 'script' ? t('studio.monterVideo') : t('studio.openInContents')}<ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => retirerCarte(sel.id)} className={`text-slate-300 hover:text-white ${FOCUS}`}>{t('studio.closeCard')}</Button>
                        </div>
                      </div>
                    ) : sel.statut === 'erreur' ? (
                      <div className="flex flex-col items-center gap-3 text-center py-10 rounded-xl border border-red-400/25 bg-red-400/[0.05]" role="alert">
                        <AlertTriangle className="w-5 h-5 text-red-300" aria-hidden="true" />
                        <p className="text-[13.5px] text-red-200 font-inter max-w-[40ch]">{sel.format === 'carrousel' ? t('studio.carouselGenerationErrorLong') : t('studio.generationErrorShort')}</p>
                        <Button size="sm" onClick={() => regenerer(sel.id)} className={btnSecondaire}>
                          <RefreshCw className="w-4 h-4" /><span className="ml-2">{t('studio.retry')}</span>
                        </Button>
                      </div>
                    ) : sel.statut === 'redaction' ? (
                      <div className="space-y-2.5 py-2" aria-busy="true">
                        <div className="flex items-center gap-2 text-[13px] text-[#d8d2ff] font-inter"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{etatContenu(sel)}</div>
                        {[92, 100, 84, 96, 60].map((w, i) => <div key={i} className="h-3 rounded bg-white/[0.06] animate-pulse" style={{ width: `${w}%` }} />)}
                      </div>
                    ) : sel.format === 'photo' ? (
                      <div className="space-y-3">
                        {sel.image && <img src={sel.image} alt="" className="w-full rounded-xl border border-white/10 max-h-80 object-cover" />}
                        <p className="text-[14px] text-slate-100 font-inter whitespace-pre-wrap leading-relaxed">{sel.texte}</p>
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2.5 text-[13px] text-slate-100 font-inter">
                          <Clock className="w-4 h-4 text-amber-200" aria-hidden="true" />
                          <span className="flex-1 min-w-[10rem]">{t('studio.photoSaved')}</span>
                          <Button size="sm" variant="ghost" onClick={() => retirerCarte(sel.id)} className={`text-slate-300 hover:text-white ${FOCUS}`}>{t('studio.closeCard')}</Button>
                        </div>
                      </div>
                    ) : sel.format === 'carrousel' ? (
                      <div className="space-y-3">
                        {sel.images?.length ? (
                          <>
                            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2 max-w-[560px]">
                              <button type="button" onClick={() => setLightbox({ images: sel.images, index: slideIdx })} aria-label={t('studio.enlargeSlide', 'Agrandir')}
                                className={`relative rounded-xl overflow-hidden bg-[#111b33] aspect-[4/5] ${FOCUS}`}>
                                <img src={sel.images[slideIdx]} alt={t('studio.slideAlt', { n: slideIdx + 1 })} className="w-full h-full object-cover" />
                                <span className="absolute right-2 top-2 text-[12px] bg-black/60 text-white rounded-md px-1.5">{slideIdx + 1}/{sel.images.length}</span>
                              </button>
                              {sel.images.length > 1 && (
                                <button type="button" onClick={() => setSlideIdx((i) => (i + 1) % sel.images.length)} className={`relative rounded-xl overflow-hidden bg-[#111b33] border border-white/[0.08] ${FOCUS}`} aria-label={t('studio.nextSlide', 'Suivant')}>
                                  <img src={sel.images[(slideIdx + 1) % sel.images.length]} alt="" className="w-full h-full object-cover opacity-70" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {sel.images.map((u, i) => (
                                <button key={u + i} type="button" onClick={() => setSlideIdx(i)} aria-label={t('studio.slideAlt', { n: i + 1 })} aria-current={i === slideIdx ? 'true' : undefined}
                                  className={`w-11 h-11 rounded-lg overflow-hidden border-2 ${FOCUS} ${i === slideIdx ? 'border-[#3AFFA3]' : 'border-transparent opacity-80 hover:opacity-100'}`}>
                                  <img src={u} alt="" className="w-full h-full object-cover" />
                                </button>
                              ))}
                              <Button size="sm" onClick={() => setLightbox({ images: sel.images, index: slideIdx })} className={`ml-auto ${btnSecondaire}`}>
                                <Maximize2 className="w-3.5 h-3.5" /><span className="ml-1.5">{t('studio.pleinEcran')}</span>
                              </Button>
                            </div>
                          </>
                        ) : (
                          <p className="text-[13px] text-amber-300 font-inter">{t('studio.noImagesGenerated')}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2.5 text-[13px] text-slate-100 font-inter">
                          <Clock className="w-4 h-4 text-amber-200" aria-hidden="true" />
                          <span className="flex-1 min-w-[10rem]">{t('studio.carouselSaved')}</span>
                          <Button size="sm" data-testid={`studio-carrousel-ouvrir-${sel.id}`}
                            onClick={() => { retirerCarte(sel.id); navigate(sel.contenuId ? `/dashboard/contenus?ouvrir=${sel.contenuId}` : '/dashboard/contenus'); }}
                            className={btnViolet}>
                            {t('studio.openInContents')}<ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => retirerCarte(sel.id)} className={`text-slate-300 hover:text-white ${FOCUS}`}>{t('studio.closeCard')}</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {sel.format !== 'script' && (
                          <Onglets id="studio-apercu" label={t('studio.apercuTitre')} valeur={onglet} onChange={setOnglet}
                            items={[['texte', t('studio.ongletTexte')], ['accroche', t('studio.ongletAccroche')], ['verif', t('studio.ongletVerif')],
                              ...(sel.format === 'post' ? [['commentaire', t('studio.ongletCommentaire')]] : [])]} />
                        )}
                        <div role={sel.format !== 'script' ? 'tabpanel' : undefined} id="studio-apercu-panel" aria-labelledby={sel.format !== 'script' ? `studio-apercu-tab-${onglet}` : undefined} className="pt-2.5">
                          {onglet === 'commentaire' && sel.format === 'post' ? (
                            <CommentaireEpingle key={sel.id} carte={sel} onChange={(champs) => majCommentaire(sel.id, champs)}
                              t={t} champ={champ} btnSecondaire={btnSecondaire} nomReseau={nomReseau} />
                          ) : onglet === 'accroche' && sel.format !== 'script' ? (
                            <AideAccroche texte={sel.texte} reseau={sel.meta} chiffresNonSources={sel.accrocheAlerte}
                              propositions={sel.accroches || null}
                              onPropositions={(liste) => setContenus((prev) => prev.map((c) => (c.id === sel.id ? { ...c, accroches: liste } : c)))}
                              onUtiliser={(ligne) => { editer(sel.id, remplacerPremiereLigne(sel.texte, ligne)); toast.success(t('accroche.remplacee')); }} />
                          ) : onglet === 'verif' && sel.format !== 'script' ? (
                            <ul className="flex flex-col gap-2 text-[13.5px] font-inter py-1">
                              {verifications(sel).map((v) => (
                                <li key={v.texte} className="flex items-start gap-2 text-slate-100">
                                  {v.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-[#3AFFA3] flex-none" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 mt-0.5 text-orange-300 flex-none" aria-hidden="true" />}
                                  <span><span className="sr-only">{v.ok ? t('studio.verifConforme') : t('studio.verifARevoir')} </span>{v.texte}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <>
                              <Textarea value={sel.texte} onChange={(e) => editer(sel.id, e.target.value)} rows={sel.format === 'script' ? 14 : 11}
                                aria-label={t('studio.ongletTexte')} className={`${champ} resize-y text-[14px] leading-relaxed`} />
                              <p className="mt-1 flex items-center gap-3 text-[12px] font-inter tabular-nums">
                                <span aria-live="polite" className={sel.sauvegarde === 'echec' ? 'text-red-300' : 'text-slate-400'}>
                                  {sel.sauvegarde === 'encours' ? t('studio.sauvegardeEnCours') : sel.sauvegarde === 'ok' ? t('studio.sauvegardeOk') : sel.sauvegarde === 'echec' ? t('studio.sauvegardeEchec') : ''}
                                </span>
                                {sel.format !== 'script' && (
                                  <span className={`ml-auto ${(sel.texte || '').length > (LIMITE_CARACTERES[sel.meta] || 3000) ? 'text-orange-300' : 'text-slate-400'}`}>
                                    {t('studio.caracteres', { n: (sel.texte || '').length, max: LIMITE_CARACTERES[sel.meta] || 3000 })}
                                  </span>
                                )}
                              </p>
                            </>
                          )}
                        </div>
                        {sel.precedent != null && sel.precedent !== sel.texte && (
                          <button type="button" onClick={() => restaurerVersion(sel.id)} className={`mt-1 text-[12.5px] text-[#c9c1ff] hover:text-white inline-flex items-center gap-1 rounded ${FOCUS}`}>
                            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />{t('studio.versionPrecedente')}
                          </button>
                        )}
                        {sel.format !== 'script' && verifications(sel).some((v) => !v.ok) && (
                          <button type="button" onClick={() => setOnglet('verif')} className={`mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-amber-100 hover:text-white rounded ${FOCUS}`}>
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />{t('studio.pointsARevoir', { count: verifications(sel).filter((v) => !v.ok).length })}
                          </button>
                        )}
                        {/* Actions du contenu : groupées à droite, l'action principale au bout. Le violet est
                            le bouton principal du Studio ; le vert y marque seulement une étape terminée. */}
                        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#090d18]/95 px-4 py-3 flex items-center gap-2.5 md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:mt-4 md:justify-end md:flex-wrap">
                          {['post', 'story'].includes(sel.format) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" disabled={sel.saving} data-testid="studio-reecrire" aria-label={t('studio.reecrireEn')}
                                  className={`${btnSecondaire} h-11 md:h-10 px-3 sm:px-4 rounded-[10px] font-medium flex-none`}>
                                  <Wand2 className="w-4 h-4" aria-hidden="true" /><span className="ml-2 hidden sm:inline">{t('studio.reecrireEn')}</span>
                                  <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70 hidden sm:block" aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-72 bg-[#111c33]/95 border-white/10 text-slate-200 font-inter">
                                <DropdownMenuLabel className="text-[12px] text-slate-400 font-normal">{t('studio.reecrireAide')}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {STRUCTURES.filter((k) => k !== 'auto').map((k) => (
                                  <DropdownMenuItem key={k} data-testid={`studio-reecrire-${k}`} onSelect={() => regenerer(sel.id, k)} className="flex flex-col items-start gap-0.5 py-2">
                                    <span className="text-[13px] font-semibold">{t(`studio.structures.${k}.nom`)}{(sel.structure || 'auto') === k && <span className="font-normal text-slate-400"> · {t('studio.structureActuelle')}</span>}</span>
                                    <span className="text-[12px] text-slate-400 leading-snug">{t(`studio.structures.${k}.aide`)}</span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <Button variant="ghost" onClick={() => regenerer(sel.id)} disabled={sel.saving}
                            className={`${btnSecondaire} h-11 md:h-10 px-3 sm:px-4 rounded-[10px] font-medium flex-none`}>
                            <RefreshCw className="w-4 h-4" aria-hidden="true" /><span className="ml-2">{t('studio.regenerate')}</span>
                          </Button>
                          <Button data-testid={`studio-valider-${sel.id}`} onClick={() => valider(sel.id)} disabled={sel.saving || !sel.texte.trim()}
                            aria-describedby={`studio-valider-aide-${sel.id}`}
                            className={`${btnViolet} flex-1 min-w-0 md:flex-none h-11 md:h-10 px-4 sm:px-5 rounded-[10px] font-semibold active:scale-[0.98] transition-[transform,background-color] duration-150`}>
                            {sel.saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" strokeWidth={2.6} aria-hidden="true" />}
                            <span className="ml-2">{t(sel.format === 'script' ? 'studio.validerScript' : 'studio.validerPost')}</span>
                          </Button>
                        </div>
                        <p id={`studio-valider-aide-${sel.id}`} className="mt-2 text-[12.5px] text-slate-300 font-inter md:text-right md:ml-auto md:max-w-[52ch] [text-wrap:balance]">{t('studio.rienPublie')}</p>
                        {extrasDe(sel).length > 0 && (
                          <p className="mt-1 text-[12.5px] text-amber-100 font-inter text-right">{t('studio.extrasApresImage', { liste: extrasDe(sel).join(', ') })}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {lightbox && (
        <div
          role="dialog" aria-modal="true" aria-label={t('studio.lightboxLabel')} ref={lightboxRef} onKeyDown={pieger}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 sm:p-8"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button" autoFocus
            onClick={() => setLightbox(null)}
            className={`absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white ${FOCUS}`}
            aria-label={t('studio.close', 'Fermer')}
          >
            <X className="w-5 h-5" />
          </button>

          {lightbox.images.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightbox((l) => ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length })); }}
              className={`absolute left-2 sm:left-6 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white ${FOCUS}`}
              aria-label={t('studio.prevSlide', 'Précédent')}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.images[lightbox.index]}
              alt={t('studio.slideAlt', { n: lightbox.index + 1 })}
              className="max-h-[82vh] max-w-full w-auto rounded-xl border border-white/10 object-contain"
            />
            <span className="text-sm text-slate-200 font-inter tabular-nums">
              {lightbox.index + 1} / {lightbox.images.length}
            </span>
          </div>

          {lightbox.images.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightbox((l) => ({ ...l, index: (l.index + 1) % l.images.length })); }}
              className={`absolute right-2 sm:right-6 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white ${FOCUS}`}
              aria-label={t('studio.nextSlide', 'Suivant')}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
