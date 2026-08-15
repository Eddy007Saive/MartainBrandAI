import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Check, X, Edit2, Trash2, Loader2, ExternalLink, Link2, FileText, Clock, ChevronRight, Search, RefreshCw, Calendar, Sparkles, ScrollText, Video, Image as ImageIcon, Wand2, LayoutGrid, Plus, Repeat2, Clapperboard, MoreHorizontal, PenLine, Maximize2, ChevronLeft, Play, Pause } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { SocialIcon } from '../components/SocialIcon';
import PostManuelDialog from '../components/PostManuelDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { contenuService } from '../services/contenuService';
import { PillFabrication } from '../components/Fabrication';
import DecoupeMusique from '../components/DecoupeMusique';
import { agentService } from '../services/agentService';
import { userService } from '../services/userService';
import { templateService } from '../services/templateService';
import { useUser } from '../context/UserContext';
import { SOCIAL_PLATFORMS } from '../constants/platforms';
import { ColorField } from '../components/ColorField';
import { CAROUSEL_FONTS, CAROUSEL_BODY_FONTS, renderSlides, SLIDE_CSS } from '../lib/carrouselPreview';
import { scheduleService } from '../services/scheduleService';
import { track } from '../lib/analytics';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu';

const IMAGE_MODELES = [
  { id: 'nano2', label: 'nano-banana 2.5', cout: 50 },
  { id: 'nano3', label: 'nano-banana 3 (Pro)', cout: 150 },
];

// Clés = valeurs réelles de l'enum statut_contenu en base ; labelKey = clé i18n d'affichage
const STATUT_CONFIG = {
  'A tourner': { labelKey: 'contenus.statut.aTourner', bg: 'bg-[#8A6CFF]/15', text: 'text-[#b9a6ff]', border: 'border-[#8A6CFF]/30', dot: 'bg-[#8A6CFF]', icon: Video },
  'A valider': { labelKey: 'contenus.statut.aValider', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25', dot: 'bg-amber-400', icon: Clock },
  'Valider': { labelKey: 'contenus.statut.valide', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25', dot: 'bg-emerald-400', icon: Check },
  'Planifie': { labelKey: 'contenus.statut.planifie', bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/25', dot: 'bg-purple-400', icon: Calendar },
  'Pret a publier': { labelKey: 'contenus.statut.pretAPublier', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/25', dot: 'bg-cyan-400', icon: Check },
  'Publie': { labelKey: 'contenus.statut.publie', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25', dot: 'bg-blue-400', icon: ExternalLink },
  'Refuse': { labelKey: 'contenus.statut.refuse', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/25', dot: 'bg-red-400', icon: X },
};
const STATUT_DEFAUT = { labelKey: null, bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/25', dot: 'bg-slate-400', icon: FileText };

// Statut de publication (Late)
const PUBLISH_BADGE = {
  envoi: { labelKey: 'contenus.publishBadge.envoi', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  'programmé': { labelKey: 'contenus.publishBadge.programme', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  'publié': { labelKey: 'contenus.publishBadge.publie', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  partiel: { labelKey: 'contenus.publishBadge.partiel', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  'échec': { labelKey: 'contenus.publishBadge.echec', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  'annulé': { labelKey: 'contenus.publishBadge.annule', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
};

// Video types = scripts vidéo, le reste = posts
const VIDEO_TYPES = ['Video', 'Reel', 'Short'];
const isVideoType = (c) => VIDEO_TYPES.includes(c.type);

const RESEAU_CONFIG = {
  'linkedin': { label: 'LinkedIn', color: 'from-blue-500 to-cyan-600', short: 'LI' },
  'instagram': { label: 'Instagram', color: 'from-pink-500 to-purple-600', short: 'IG' },
  'facebook': { label: 'Facebook', color: 'from-blue-600 to-blue-700', short: 'FB' },
  'tiktok': { label: 'TikTok', color: 'from-gray-800 to-gray-900', short: 'TK' },
  'LinkedIn': { label: 'LinkedIn', color: 'from-blue-500 to-cyan-600', short: 'LI' },
  'Instagram': { label: 'Instagram', color: 'from-pink-500 to-purple-600', short: 'IG' },
  'Facebook': { label: 'Facebook', color: 'from-blue-600 to-blue-700', short: 'FB' },
  'TikTok': { label: 'TikTok', color: 'from-gray-800 to-gray-900', short: 'TK' },
  'twitter': { label: 'Twitter/X', color: 'from-gray-800 to-black', short: 'X' },
  'googlebusiness': { label: 'Google Business', color: 'from-blue-500 to-emerald-500', short: 'GB' },
  'GoogleBusiness': { label: 'Google Business', color: 'from-blue-500 to-emerald-500', short: 'GB' },
  'youtube': { label: 'YouTube', color: 'from-red-600 to-red-700', short: 'YT' },
  'YouTube': { label: 'YouTube', color: 'from-red-600 to-red-700', short: 'YT' },
  'Twitter': { label: 'Twitter/X', color: 'from-gray-800 to-black', short: 'X' },
};

function StatusBadge({ statut }) {
  const { t } = useTranslation();
  const config = STATUT_CONFIG[statut] || STATUT_DEFAUT;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium font-inter ${config.bg} ${config.text} border ${config.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.labelKey ? t(config.labelKey) : statut}
    </span>
  );
}

function ReseauBadge({ reseau }) {
  const config = RESEAU_CONFIG[reseau];
  if (!config) return <span className="text-xs text-slate-500">{reseau}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold font-inter text-white bg-gradient-to-r ${config.color}`}>
      <SocialIcon network={config.label} className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function CardAction({ title, onClick, children, className = '' }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-white/[0.06] transition-all cursor-pointer ${className}`}>
      {children}
    </button>
  );
}

function ContentCard({ contenu, onView, onImage, onRegenCarrousel, carrouselLoading, onEdit, onDelete, onValidate, onRefuse, onRecycle, onStory, onReel, reelLoading, actionLoading, onRenderSlides, renderLoading }) {
  const { t } = useTranslation();
  const isLoading = actionLoading === contenu.id;
  const isCarrousel = contenu.type === 'Carrousel' || (Array.isArray(contenu.slides_images) && contenu.slides_images.length > 0);
  const isVideo = contenu.type === 'Reel' || !!contenu.video_url || !!contenu.video_status;
  const regenLoading = carrouselLoading === contenu.id;
  const date = contenu.date_publication
    ? new Date(contenu.date_publication).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : new Date(contenu.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  return (
    <div onClick={() => onView(contenu)}
      className="group flex flex-col rounded-2xl border border-white/[0.06] bg-[#0f172a] overflow-hidden hover:border-white/[0.12] hover:bg-[#111c33] transition-all cursor-pointer">
      {/* Visuel */}
      <div className="relative aspect-[16/10] bg-[#0a1120] overflow-hidden">
        {contenu.lien_visuel ? (
          <img src={contenu.lien_visuel} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
        ) : isVideo ? (
          <div className="absolute inset-0 grid place-items-center text-slate-700"><Video className="w-8 h-8" /></div>
        ) : (
          /* V3 : pas de visuel = appel à l'action directement sur la carte */
          <div className="absolute inset-0 grid place-items-center border-b border-dashed border-[#5B6CFF]/25"
            style={{ background: 'repeating-linear-gradient(45deg, rgba(91,108,255,0.045) 0 10px, transparent 10px 20px)' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isCarrousel) return onImage(contenu);
                // Slides déjà conçues mais pas encore rendues -> simple rendu en images (gratuit),
                // sinon vraie génération (LLM + rendu).
                if (contenu.carrousel_data) onRenderSlides(contenu); else onRegenCarrousel(contenu);
              }}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold font-inter text-[#a5b0ff] border border-[#5B6CFF]/40 bg-[#5B6CFF]/10 hover:bg-[#5B6CFF]/25 hover:text-white px-3.5 py-2 rounded-[10px] transition-colors active:scale-[0.97]">
              {renderLoading === contenu.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isCarrousel ? (contenu.carrousel_data ? t('contenus.carte.creerImagesSlides') : t('contenus.carte.genererSlides')) : t('contenus.carte.genererVisuel')}
            </button>
          </div>
        )}
        {contenu.reseau_cible && <span className="absolute top-2.5 left-2.5"><ReseauBadge reseau={contenu.reseau_cible} /></span>}
        <span className="absolute top-2.5 right-2.5">
          {contenu.publish_status === 'échec' ? (
            <span title={contenu.publish_error || t('contenus.carte.publicationEchec')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium font-inter bg-red-500/15 text-red-400 border border-red-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              {t('contenus.carte.echecPublication')}
            </span>
          ) : <StatusBadge statut={contenu.statut} />}
        </span>
        {contenu.type === 'Story' && (
          <span className="absolute bottom-2.5 left-2.5 text-[10px] font-semibold font-inter px-2 py-0.5 rounded-full bg-gradient-to-r from-[#5B6CFF]/80 to-[#8A6CFF]/80 text-white">
            {t('contenus.carte.story24h')}
          </span>
        )}
      </div>

      {/* Corps */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="text-left">
          {contenu.titre && <h3 className="text-white font-semibold font-sora text-[13.5px] mb-1 line-clamp-1">{contenu.titre}</h3>}
          <p className="text-slate-400 font-inter text-[12.5px] leading-relaxed line-clamp-3">{contenu.contenu}</p>
        </div>

        {/* Contrôle segmenté : max 3 cibles (✓ valider · action du format · ⋯ menu) */}
        <div className="flex items-center gap-1 mt-auto pt-3 border-t border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] text-slate-500 font-inter mr-auto inline-flex items-center gap-1">
            {contenu.date_publication ? <Clock className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}{date}
          </span>
          <div className="inline-flex items-stretch rounded-[10px] border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            {contenu.statut === 'A valider' && (
              <button title={t('contenus.actions.validerProgrammer')} onClick={() => onValidate(contenu.id)} disabled={isLoading}
                className="w-9 h-8 grid place-items-center text-[#a5b0ff] bg-gradient-to-r from-[#5B6CFF]/[0.18] to-[#8A6CFF]/[0.18] hover:from-[#5B6CFF]/[0.35] hover:to-[#8A6CFF]/[0.35] hover:text-white transition-colors">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
            )}
            {isCarrousel ? (
              <button title={t('contenus.carte.regenererCarrousel')} onClick={() => onRegenCarrousel(contenu)}
                className="w-9 h-8 grid place-items-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors border-l border-white/[0.08] first:border-l-0">
                {regenLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LayoutGrid className="w-4 h-4" />}
              </button>
            ) : isVideo ? (
              <button title={t('contenus.carte.modifierTexte')} onClick={() => onEdit(contenu)}
                className="w-9 h-8 grid place-items-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors border-l border-white/[0.08] first:border-l-0">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button title={contenu.lien_visuel ? t('contenus.carte.visuelModifier') : t('contenus.carte.creerVisuel')} onClick={() => onImage(contenu)}
                className="w-9 h-8 grid place-items-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors border-l border-white/[0.08] first:border-l-0">
                <ImageIcon className="w-4 h-4" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button title={t('contenus.carte.plusActions')}
                  className="w-9 h-8 grid place-items-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors border-l border-white/[0.08]">
                  {reelLoading === contenu.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[210px] bg-[#111c33]/95 backdrop-blur-xl border-white/10 text-slate-200 font-inter">
                {contenu.statut === 'A valider' && (
                  <DropdownMenuItem onClick={() => onRefuse(contenu.id)} className="gap-2.5 focus:bg-white/[0.07]">
                    <X className="w-4 h-4 opacity-70" />{t('contenus.actions.refuser')}
                  </DropdownMenuItem>
                )}
                {!isVideo && (
                  <DropdownMenuItem onClick={() => onEdit(contenu)} className="gap-2.5 focus:bg-white/[0.07]">
                    <Edit2 className="w-4 h-4 opacity-70" />{t('contenus.carte.modifierTexte')}
                  </DropdownMenuItem>
                )}
                {!isCarrousel && !isVideo && (
                  <DropdownMenuItem onClick={() => onReel(contenu)} className="gap-2.5 focus:bg-white/[0.07]">
                    <Clapperboard className="w-4 h-4 opacity-70" />{t('contenus.reel.generer')}
                  </DropdownMenuItem>
                )}
                {!isCarrousel && !isVideo && contenu.type !== 'Story' && contenu.lien_visuel
                  && ['instagram', 'facebook'].includes(String(contenu.reseau_cible || '').toLowerCase()) && (
                  <DropdownMenuItem onClick={() => onStory(contenu)} className="gap-2.5 focus:bg-white/[0.07]">
                    <Sparkles className="w-4 h-4 opacity-70" />{t('contenus.carte.declinerStory')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onRecycle(contenu)} className="gap-2.5 focus:bg-white/[0.07]">
                  <Repeat2 className="w-4 h-4 opacity-70" />{t('contenus.carte.recycler')}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/[0.07]" />
                <DropdownMenuItem onClick={() => onDelete(contenu)} className="gap-2.5 text-red-400/90 focus:bg-red-500/10 focus:text-red-300">
                  <Trash2 className="w-4 h-4 opacity-70" />{t('contenus.actions.supprimer')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContenusPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  // Par défaut on montre ce qui ATTEND le client : les contenus à valider.
  // Les autres statuts (planifiés, publiés…) sont à un clic via les pastilles.
  const [filterStatut, setFilterStatut] = useState('A valider');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedContenu, setSelectedContenu] = useState(null);
  const [czR, setCzR] = useState(null);     // retouche couleurs/police d'un carrousel (aperçu live)
  const [czRBusy, setCzRBusy] = useState(false);
  const [czSlide, setCzSlide] = useState(0); // slide affichée dans l'aperçu
  const [czTemplates, setCzTemplates] = useState({}); // template de carrousel par réseau
  useEffect(() => {
    scheduleService.getAll().then((rows) => {
      const m = {}; (rows || []).forEach((r) => { m[(r.platform || '').toLowerCase()] = r.carrousel_template || 'creme'; });
      setCzTemplates(m);
    }).catch(() => {});
  }, []);
  const [editContenu, setEditContenu] = useState(null);
  const [deleteContenu, setDeleteContenu] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [carrouselLoading, setCarrouselLoading] = useState(null);
  const [publishLoading, setPublishLoading] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { images:[], index:0 }

  const { user, updateUser } = useUser();
  const [imageContenu, setImageContenu] = useState(null);
  const [postManuelOpen, setPostManuelOpen] = useState(false);  // post écrit à la main (sans IA)

  // Recyclage : republier un post sur d'autres réseaux (une copie par réseau)
  const [recycleFor, setRecycleFor] = useState(null);   // contenu source
  const [recycleNets, setRecycleNets] = useState([]);   // réseaux cochés
  const [recycling, setRecycling] = useState(false);
  const connectedNets = SOCIAL_PLATFORMS.filter((p) => user?.[p.field]);

  // Reel animé (Remotion) : post -> script IA -> MP4 à la charte, en « À valider »
  const [reelLoading, setReelLoading] = useState(null);
  const [reelFor, setReelFor] = useState(null); // contenu en attente du choix de template
  const [reelReco, setReelReco] = useState(null);   // recommandation IA {template, raison}
  // Bibliothèque de templates (registre backend) — repli local si l'appel échoue
  const [reelTemplates, setReelTemplates] = useState(() => ([
    { id: 'affiche', label: t('contenus.reelTpl.afficheLabel'), duree: 11, desc: t('contenus.reelTpl.afficheDesc') },
    { id: 'impact', label: t('contenus.reelTpl.impactLabel'), duree: 8, desc: t('contenus.reelTpl.impactDesc') },
    { id: 'stats', label: t('contenus.reelTpl.statsLabel'), duree: 10, desc: t('contenus.reelTpl.statsDesc') },
    { id: 'long', label: t('contenus.reelTpl.longLabel'), duree: 22, desc: t('contenus.reelTpl.longDesc') },
  ]));
  const [reelMusiques, setReelMusiques] = useState([]);      // bibliothèque partagée avec le Studio Vidéo
  const [reelMusicCats, setReelMusicCats] = useState([]);
  useEffect(() => {
    contenuService.reelTemplates().then((d) => {
      const tpls = Array.isArray(d) ? d : d?.templates;       // rétro-compat ancienne réponse (liste nue)
      if (tpls?.length) setReelTemplates(tpls);
      if (d?.musiques?.length) setReelMusiques(d.musiques);
      if (d?.categories?.length) setReelMusicCats(d.categories);
    }).catch(() => {});
  }, []);
  // Séquence : le CLIENT fournit les visuels (upload / banque) + un brief — l'IA monte
  const [seqFor, setSeqFor] = useState(null);
  const [seqImages, setSeqImages] = useState([]);      // {url, desc, src}
  const [seqBrief, setSeqBrief] = useState('');
  const [seqBanque, setSeqBanque] = useState(null);    // null = chargement
  const [seqUploading, setSeqUploading] = useState(false);
  const seqCache = useRef({});   // mémorise images + brief par contenu (fermer ≠ perdre)
  const [seqRegen, setSeqRegen] = useState(false);   // true = modification d'un reel existant
  const [seqLibre, setSeqLibre] = useState(false);   // true = reel créé de zéro (le brief est le sujet)
  const [seqReseau, setSeqReseau] = useState('Instagram');
  const [seqStyle, setSeqStyle] = useState('signature');
  const [seqZoom, setSeqZoom] = useState(null);      // index du template agrandi (lightbox), null = fermé
  const [seqMusique, setSeqMusique] = useState('none');  // piste de fond du reel (bibliothèque partagée)
  const [seqMp3, setSeqMp3] = useState(false);           // import d'un MP3 perso en cours
  // Import d'une musique du client : elle rejoint sa bibliothèque et devient la piste choisie.
  const importerMp3 = async (file) => {
    if (!file) return;
    setSeqMp3(true);
    try {
      const m = await contenuService.reelMusiqueImporter(file);
      setReelMusiques((prev) => [m, ...prev]);
      setReelMusicCats((prev) => (prev.some((c) => c.id === 'perso')
        ? prev : [{ id: 'perso', label: t('contenus.reel.seq.mesMusiques') }, ...prev]));
      setSeqMusique(m.id);
      toast.success(t('contenus.reel.seq.mp3Ajoute', { nom: m.label }));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.reel.seq.mp3Echec'));
    } finally { setSeqMp3(false); }
  };
  const [seqPlaying, setSeqPlaying] = useState(false);   // pré-écoute de la piste choisie
  const seqAudioRef = useRef(null);
  const seqStopPreview = () => { if (seqAudioRef.current) seqAudioRef.current.pause(); setSeqPlaying(false); };
  const seqTogglePreview = () => {
    const m = reelMusiques.find((x) => x.id === seqMusique);
    const a = seqAudioRef.current;
    if (!a || !m?.url) return;
    if (seqPlaying) { a.pause(); setSeqPlaying(false); return; }
    a.src = m.url; a.currentTime = 0;
    a.play().then(() => setSeqPlaying(true)).catch(() => setSeqPlaying(false));
  };
  // La création LIBRE d'un reel vit désormais en pleine page : /dashboard/reel (StudioReel).
  // Modifier un reel existant : dialogue pré-rempli depuis son scénario, re-rendu SUR PLACE
  const openSequenceRegen = (reel) => {
    setSelectedContenu(null);
    setSeqLibre(false);
    setSeqRegen(true);
    setSeqStyle(reel.reel_data?.style || 'signature');
    setSeqMusique(reel.reel_data?.musique || 'none');
    setSeqFor(reel);
    const sc = reel.reel_data || {};
    const imgs = [];
    (sc.segments || []).forEach((s) => {
      if (s.image && !imgs.some((i) => i.url === s.image)) imgs.push({ url: s.image, desc: null, src: 'reel' });
    });
    setSeqImages(imgs);
    setSeqBrief(sc.brief || '');
    setSeqBanque(null);
    contenuService.reelBanque().then(setSeqBanque).catch(() => setSeqBanque([]));
  };
  const openSequence = (contenu, style = 'signature') => {
    setReelFor(null);
    setSeqLibre(false);
    setSeqRegen(false);
    setSeqStyle(style);
    setSeqFor(contenu);
    const cached = seqCache.current[contenu.id];
    setSeqMusique(cached?.musique || 'none');
    if (cached) {
      setSeqImages(cached.images);
      setSeqBrief(cached.brief);
    } else {
      // Les visuels du post sont proposés d'office (le principal présélectionné)
      const init = [];
      if (contenu.lien_visuel && !contenu.lien_visuel.endsWith('.mp4') && !contenu.lien_visuel.includes('/video/upload/')) {
        init.push({ url: contenu.lien_visuel, desc: '', src: 'post' });
      }
      setSeqImages(init);
      setSeqBrief('');
    }
    setSeqBanque(null);
    contenuService.reelBanque().then(setSeqBanque).catch(() => setSeqBanque([]));
  };
  useEffect(() => {
    if (seqFor) seqCache.current[seqFor.id] = { images: seqImages, brief: seqBrief, musique: seqMusique };
  }, [seqFor, seqImages, seqBrief, seqMusique]);
  const seqToggleBanque = (img) => {
    setSeqImages((prev) => prev.some((i) => i.url === img.url)
      ? prev.filter((i) => i.url !== img.url)
      : (prev.length >= 6 ? prev : [...prev, { url: img.url, desc: img.description || '', src: 'banque' }]));
  };
  const seqUpload = async (files) => {
    const list = Array.from(files || []).slice(0, 6 - seqImages.length);
    if (!list.length) return;
    setSeqUploading(true);
    try {
      for (const f of list) {
        // L'image entre dans la BANQUE de la marque (conservée), puis est sélectionnée
        const a = await contenuService.reelBanqueAjouter(f);
        setSeqBanque((prev) => [a, ...(prev || [])]);
        setSeqImages((prev) => prev.length >= 6 ? prev : [...prev, { url: a.url, desc: a.description || '', src: 'banque' }]);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.reel.seq.uploadEchec'));
    } finally { setSeqUploading(false); }
  };
  const doSeqReel = async () => {
    if (!seqFor) return;
    const contenu = seqFor;
    if (seqLibre && !seqBrief.trim()) { toast.error(t('contenus.reel.seq.briefRequis')); return; }
    setSeqFor(null);
    setReelLoading(contenu.id);
    toast.info(t('contenus.toast.reelEnCours', { label: 'Séquence', min: 2 }));
    seqStopPreview();
    const payload = {
      images: seqImages.map((i) => ({ url: i.url, desc: i.desc || null })),
      brief: seqBrief.trim() || null,
      musique: seqMusique,
    };
    try {
      if (seqLibre) {
        await contenuService.creerReel({ ...payload, reseau: seqReseau, style: seqStyle });
      } else if (seqRegen) {
        const d = await contenuService.regenererReel(contenu.id, { ...payload, style: seqStyle });
        const patch = { video_url: d.video_url, video_preview_url: d.video_preview_url, lien_visuel: d.video_preview_url };
        setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, ...patch } : c)));
        delete seqCache.current[contenu.id];
      } else {
        await contenuService.genererReel(contenu.id, 'sequence', { ...payload, style: seqStyle });
      }
      toast.success(t('contenus.toast.reelGenere'));
      fetchContenus();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.reelEchec'));
    } finally { setReelLoading(null); }
  };

  const doReel = async (contenu, duree = 'affiche') => {
    if (duree.startsWith('sequence')) { openSequence(contenu, duree.split('-')[1] || 'signature'); return; }
    if (reelLoading) return;
    setReelFor(null);
    setReelLoading(contenu.id);
    const tpl = reelTemplates.find((x) => x.id === duree);
    toast.info(t('contenus.toast.reelEnCours', { label: tpl?.label || t('contenus.reelTpl.afficheLabel'), min: (tpl?.duree || 11) > 15 ? 2 : 1 }));
    try {
      await contenuService.genererReel(contenu.id, duree);
      toast.success(t('contenus.toast.reelGenere'));
      fetchContenus();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.reelEchec'));
    } finally {
      setReelLoading(null);
    }
  };

  const openRecycle = (contenu) => { setRecycleFor(contenu); setRecycleNets([]); };
  const doRecycle = async () => {
    if (!recycleFor || !recycleNets.length) return;
    setRecycling(true);
    try {
      const res = await contenuService.recycler(recycleFor.id, recycleNets);
      const n = res.created?.length || 0;
      toast.success(n > 1 ? t('contenus.toast.recycleOkPluriel', { n }) : t('contenus.toast.recycleOk', { n }));
      setRecycleFor(null);
      fetchContenus();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.recycleEchec'));
    } finally {
      setRecycling(false);
    }
  };

  // Retouche carrousel : init des couleurs/police depuis la marque quand on ouvre un carrousel
  useEffect(() => {
    // Retouche/aperçu live seulement AVANT validation ; une fois validé, l'image finale est figée
    const editable = selectedContenu && selectedContenu.statut === 'A valider' && selectedContenu.carrousel_data;
    setCzSlide(0);
    setCzR(editable ? {
      p: user?.carrousel_couleur_principale || user?.couleur_principale || '#003D2E',
      s: user?.carrousel_couleur_secondaire || user?.couleur_secondaire || '#0077FF',
      a: user?.carrousel_couleur_accent || user?.couleur_accent || '#3AFFA3',
      font: user?.carrousel_font || '',
      fontBody: user?.carrousel_font_corps || '',
    } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContenu]);
  // Charge les Google Fonts choisies pour la retouche
  useEffect(() => {
    [czR?.font, czR?.fontBody].filter(Boolean).forEach((f) => {
      const id = 'czfont-' + f.replace(/\s/g, '-');
      if (document.getElementById(id)) return;
      const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
      l.href = `https://fonts.googleapis.com/css2?family=${f.replace(/\s/g, '+')}:wght@400;500;600;700;800;900&display=swap`;
      document.head.appendChild(l);
    });
  }, [czR?.font, czR?.fontBody]);
  const setCzRColor = (name, val) => setCzR((prev) => ({ ...prev, [name]: val }));
  const retoucherCarrousel = async () => {
    if (!selectedContenu || !czR || czRBusy) return;
    setCzRBusy(true);
    try {
      const d = await agentService.recolorCarrousel(selectedContenu.id, { p: czR.p, s: czR.s, a: czR.a }, czR.font || '', czR.fontBody || '');
      const imgs = d.images || [];
      if (imgs.length) {
        const patch = { slides_images: imgs, lien_visuel: imgs[0], carrousel_pdf: d.pdf };
        setContenus((prev) => prev.map((c) => (c.id === selectedContenu.id ? { ...c, ...patch } : c)));
        setSelectedContenu((prev) => (prev ? { ...prev, ...patch } : prev));
        toast.success(t('contenus.toast.carrouselRetouche'));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.retoucheEchec'));
    } finally { setCzRBusy(false); }
  };
  // Aperçu LIVE (client-side) du vrai carrousel avec la retouche — instantané, sans backend
  const czPreviewSlides = () => {
    if (!selectedContenu || !czR || !selectedContenu.carrousel_data) return null;
    const tpl = czTemplates[(selectedContenu.reseau_cible || '').toLowerCase()] || 'creme';
    return renderSlides(tpl, {
      p: czR.p, s: czR.s, a: czR.a, font: czR.font || '', fontBody: czR.fontBody || '',
      logo: user?.logo_url, nom: user?.nom || user?.username,
      content: selectedContenu.carrousel_data,
    });
  };
  // Validation : rendu final des images avec la retouche, PUIS validation
  const validerContenu = async (id) => {
    if (czR && selectedContenu?.carrousel_data) {
      setCzRBusy(true);
      try { await agentService.recolorCarrousel(id, { p: czR.p, s: czR.s, a: czR.a }, czR.font || '', czR.fontBody || ''); }
      catch (e) { /* on valide quand même avec les images existantes */ }
      finally { setCzRBusy(false); }
    }
    handleUpdateStatut(id, 'Valider');
  };
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgAvecPhoto, setImgAvecPhoto] = useState(false);
  const [imgModele, setImgModele] = useState('nano2');
  const [imgLoadingPrompt, setImgLoadingPrompt] = useState(false);
  const [imgGenerating, setImgGenerating] = useState(false);
  const [imgImporting, setImgImporting] = useState(false);
  const imgImportRef = useRef(null);
  // Images de référence (style) choisies à la génération
  const [inspirations, setInspirations] = useState([]);
  const [selectedRefs, setSelectedRefs] = useState([]);
  const [refImporting, setRefImporting] = useState(false);
  const refInputRef = useRef(null);
  // Templates de marque
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [styleNote, setStyleNote] = useState('');
  // Gabarits de post (feed cohérent)
  const [gabarits, setGabarits] = useState([]);
  const [gabPreviews, setGabPreviews] = useState({});
  const [gabLabels, setGabLabels] = useState({});
  const [gabPhoto, setGabPhoto] = useState([]); // gabarits qui ont une zone photo
  const [gabaritBusy, setGabaritBusy] = useState(null);
  // Refonte dialog : mode (gabarit | template | ia), gabarit sélectionné, usage pour la pastille de quota
  const [imgMode, setImgMode] = useState('gabarit');
  const [selectedGabarit, setSelectedGabarit] = useState(null);
  const [imgUsage, setImgUsage] = useState(null);
  const [templateBg, setTemplateBg] = useState(null); // photo optionnelle (zone photo du gabarit)
  const [photoDesc, setPhotoDesc] = useState('');     // description -> photo générée par l'IA au moment de créer le visuel


  const setMode = (m) => {
    setImgMode(m);
    if (m === 'template') setImgModele('nano3'); // template -> HD obligatoire (le standard fait des fautes d'orthographe)
    else { setActiveTemplate(null); setStyleNote(''); }
  };
  const refreshUsage = () => agentService.usage().then(setImgUsage).catch(() => {});

  useEffect(() => {
    refreshUsage();
    agentService.gabaritPreviews()
      .then((d) => {
        const labels = d.labels || {};
        setGabLabels(labels);
        setGabPreviews(d.previews || {});
        setGabPhoto(d.photo || ['statement', 'split', 'citation', 'mission', 'testimonial', 'people']);
        setGabarits(Object.keys(labels).length ? Object.keys(labels) : Object.keys(d.previews || {}));
      })
      .catch(() => {});
  }, []);
  const gabAccent = user?.couleur_accent || '#7c5cff';
  const gabAccent2 = user?.couleur_secondaire || '#ff2d2d';
  const bar = (w, color, h = '6%') => (
    <div style={{ width: w, height: h, background: color, borderRadius: 3 }} />
  );
  const gabSkeleton = (k) => {
    if (k === 'citation') {
      return (
        <>
          <div className="absolute" style={{ left: '10%', top: '11%', width: '30%', height: '8%', background: `${gabAccent}66`, borderRadius: 999 }} />
          <div className="absolute flex flex-col gap-[6px]" style={{ left: '10%', top: '40%', width: '78%' }}>
            {bar('70%', 'rgba(255,255,255,.85)', '7%')}
            {bar('80%', 'rgba(255,255,255,.85)', '7%')}
            {bar('52%', gabAccent, '7%')}
          </div>
          <div className="absolute flex items-center gap-[6px]" style={{ left: '10%', bottom: '11%' }}>
            <div style={{ width: 16, height: 16, borderRadius: 999, background: 'rgba(255,255,255,.3)' }} />
            <div className="flex flex-col gap-[4px]">{bar('38px', 'rgba(255,255,255,.7)', '5px')}{bar('26px', 'rgba(255,255,255,.4)', '4px')}</div>
          </div>
        </>
      );
    }
    if (k === 'stat') {
      return (
        <>
          <div className="absolute flex flex-col gap-[6px]" style={{ left: '10%', top: '16%', width: '74%' }}>
            {bar('62%', 'rgba(255,255,255,.85)', '8%')}
            {bar('44%', gabAccent, '8%')}
          </div>
          <div className="absolute flex gap-[5px]" style={{ left: '8%', right: '8%', bottom: '12%' }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex-1 grid place-items-center" style={{ aspectRatio: '1', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6 }}>
                <div style={{ width: '52%', height: '20%', background: gabAccent, borderRadius: 2 }} />
              </div>
            ))}
          </div>
        </>
      );
    }
    // statement (défaut)
    return (
      <>
        <div className="absolute" style={{ width: '34%', height: '34%', right: '-6%', top: '12%', borderRadius: 999, background: `radial-gradient(circle at 38% 32%, #fff, ${gabAccent} 60%, #1c1340 86%)`, boxShadow: `0 0 18px ${gabAccent}99` }} />
        <div className="absolute flex flex-col gap-[6px]" style={{ left: '10%', bottom: '14%', width: '70%' }}>
          {bar('54%', 'rgba(255,255,255,.9)')}
          {bar('40%', gabAccent2)}
          {bar('62%', 'rgba(255,255,255,.9)')}
        </div>
      </>
    );
  };
  const genererGabarit = async (gab) => {
    if (!imageContenu || gabaritBusy) return;
    setGabaritBusy(gab);
    try {
      let bg = templateBg || (selectedRefs && selectedRefs.length ? selectedRefs[0] : null); // photo choisie -> zone photo du gabarit
      // Pas de photo choisie mais une description saisie -> l'IA génère la photo à la volée
      if (!bg && photoDesc.trim()) {
        const p = await agentService.generatePhoto(photoDesc.trim(), 'nano2');
        bg = p.url;
        setTemplateBg(p.url);
        refreshUsage();
      }
      const d = await agentService.gabaritAuto(gab, imageContenu.contenu || imageContenu.titre || '', imageContenu.id, bg);
      setContenus((prev) => prev.map((c) => (c.id === imageContenu.id ? { ...c, lien_visuel: d.url } : c)));
      setImageContenu((prev) => (prev ? { ...prev, lien_visuel: d.url } : prev));
      refreshUsage();
      track('image_generee', { mode: 'gabarit', gabarit: gab });
      toast.success(t('contenus.toast.visuelCree'));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.visuelCreationEchec'));
    } finally {
      setGabaritBusy(null);
    }
  };

  const toggleRef = (url, keepTemplate = false) => {
    if (!keepTemplate) setActiveTemplate(null); // sélection manuelle en mode IA → on n'est plus sur un template
    setSelectedRefs((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  };

  const appliquerTemplate = (t) => {
    if (activeTemplate === t.id) { // re-clic → on retire le template
      setActiveTemplate(null); setStyleNote('');
      return;
    }
    setActiveTemplate(t.id);
    setStyleNote(t.note || '');
    setSelectedRefs([]); // refs user vides ; l'image du template est ajoutée à la génération (voir genererImage)
  };

  const importerRef = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(t('contenus.toast.choisissezImage')); return; }
    setRefImporting(true);
    try {
      const list = await userService.addInspiration(file);
      const urls = list?.images || [];
      setInspirations(urls);
      const added = urls.find((u) => !inspirations.includes(u));
      if (added) setSelectedRefs((prev) => [...prev, added]);
      toast.success(t('contenus.toast.refAjoutee'));
    } catch (err) {
      toast.error(t('contenus.toast.ajoutEchec'));
    } finally {
      setRefImporting(false);
      if (refInputRef.current) refInputRef.current.value = '';
    }
  };

  const chargerPrompt = async (contenu) => {
    setImgLoadingPrompt(true);
    try {
      const data = await agentService.imagePrompt(
        contenu.contenu || contenu.titre || '',
        String(contenu.reseau_cible || 'linkedin').toLowerCase(),
        contenu.id,
      );
      setImgPrompt(data.prompt || '');
      // mémorise le prompt (sauvegardé en base) pour ne pas le régénérer à la réouverture
      setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, prompt_image: data.prompt } : c)));
      setImageContenu((prev) => (prev && prev.id === contenu.id ? { ...prev, prompt_image: data.prompt } : prev));
    } catch (e) {
      toast.error(t('contenus.toast.promptErreur'));
    } finally {
      setImgLoadingPrompt(false);
    }
  };

  const openImage = (contenu) => {
    setImageContenu(contenu);
    setImgAvecPhoto(false); // opt-in par génération : ta photo n'est incluse QUE si tu coches le toggle
    setImgModele('nano2');
    setActiveTemplate(null); setStyleNote('');
    setImgMode('gabarit'); setSelectedGabarit(null); setTemplateBg(null); setPhotoDesc('');
    refreshUsage();
    // Charge la bibliothèque de références (inspirations) — rien sélectionné par défaut (opt-in)
    userService.listInspirations()
      .then((d) => {
        const arr = Array.isArray(d) ? d : (d?.images || []);
        setInspirations(arr);
        setSelectedRefs([]);
      })
      .catch(() => { setInspirations([]); setSelectedRefs([]); });
    templateService.list().then((d) => setTemplates(d || [])).catch(() => {});
    if (contenu.prompt_image) {
      setImgPrompt(contenu.prompt_image);           // déjà généré → on réutilise (zéro régénération)
    } else {
      setImgPrompt('');
      if (!contenu.lien_visuel) chargerPrompt(contenu); // 1ʳᵉ fois seulement → on prépare la description
    }
  };

  const genererImage = async () => {
    if (!imageContenu) return;
    if (!imgPrompt.trim() && !activeTemplate) return; // template = l'IA écrit le texte côté serveur
    setImgGenerating(true);
    try {
      // En template : l'image du GABARIT part TOUJOURS en 1re position, suivie des refs choisies.
      const tplImgs = activeTemplate ? ((templates.find((t) => t.id === activeTemplate)?.images) || []) : [];
      const refsToSend = activeTemplate ? [...tplImgs, ...selectedRefs.filter((u) => !tplImgs.includes(u))] : selectedRefs;
      const data = await agentService.image(imageContenu.id, imgPrompt, imgAvecPhoto, imgModele, refsToSend, styleNote || null, !!activeTemplate);
      if (data.credits != null) updateUser({ credits: data.credits });
      setContenus((prev) => prev.map((c) => (c.id === imageContenu.id ? { ...c, lien_visuel: data.lien_visuel, prompt_image: imgPrompt } : c)));
      setImageContenu((prev) => (prev ? { ...prev, lien_visuel: data.lien_visuel, prompt_image: imgPrompt } : prev));
      track('image_generee', { mode: activeTemplate ? 'template' : 'ia', modele: imgModele });
      toast.success(t('contenus.toast.visuelGenere'));
      refreshUsage();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.imageEchec'));
    } finally {
      setImgGenerating(false);
    }
  };

  // Action unifiée du footer + pastille de quota (selon le mode)
  const onGenerate = () => {
    if (imgMode === 'gabarit') { if (selectedGabarit) genererGabarit(selectedGabarit); }
    else genererImage();
  };
  const genBusy = imgMode === 'gabarit' ? !!gabaritBusy : imgGenerating;
  const genDisabled = imgLoadingPrompt || genBusy ||
    (imgMode === 'gabarit' ? !selectedGabarit : imgMode === 'template' ? !activeTemplate : !imgPrompt.trim());
  const quotaInfo = () => {
    if (!imgUsage?.gauges) return null;
    // Gabarit = 1 image standard ; Template/IA en HD (nano3) = image_pro ; sinon image standard.
    const at = imgMode === 'gabarit' ? 'image_standard' : (imgModele === 'nano3' ? 'image_pro' : 'image_standard');
    const g = imgUsage.gauges.find((x) => x.action_type === at);
    return g ? { label: g.label, remaining: Math.max(0, g.limit - g.used) } : null;
  };

  const importerImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !imageContenu) return;
    if (!file.type.startsWith('image/')) { toast.error(t('contenus.toast.choisissezImageFormats')); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('contenus.toast.imageTropLourde')); return; }
    setImgImporting(true);
    try {
      const data = await contenuService.uploadImage(imageContenu.id, file);
      setContenus((prev) => prev.map((c) => (c.id === imageContenu.id ? { ...c, lien_visuel: data.lien_visuel, statut: data.statut || c.statut, date_publication: data.date_publication || c.date_publication } : c)));
      setImageContenu((prev) => (prev ? { ...prev, lien_visuel: data.lien_visuel } : prev));
      toast.success(t('contenus.toast.imageImportee'));
    } catch (err) {
      toast.error(err.response?.data?.detail || t('contenus.toast.importEchec'));
    } finally {
      setImgImporting(false);
      if (imgImportRef.current) imgImportRef.current.value = '';
    }
  };

  // Régénère le carrousel (nouvelles slides + images) d'un contenu existant
  const regenererCarrousel = async (contenu) => {
    if (carrouselLoading) return;
    setCarrouselLoading(contenu.id);
    try {
      const nb = Array.isArray(contenu.slides_images) && contenu.slides_images.length ? contenu.slides_images.length : 5;
      const d = await agentService.carrousel(
        contenu.titre || contenu.contenu?.slice(0, 80) || 'Carrousel',
        String(contenu.reseau_cible || 'linkedin').toLowerCase(),
        nb, 'equilibre', contenu.id,
      );
      if (d.credits != null) updateUser({ credits: d.credits });
      const imgs = d.slides_images || [];
      setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, slides_images: imgs, lien_visuel: imgs[0] || c.lien_visuel } : c)));
      if (imgs.length) toast.success(t('contenus.toast.carrouselRegenere'));
      else toast.warning(t('contenus.toast.slidesNonRendues'));
    } catch (e) {
      if (e.response?.status === 402) toast.error(t('contenus.toast.creditsInsuffisants'));
      else toast.error(e.response?.data?.detail || t('contenus.toast.regenerationEchec'));
    } finally {
      setCarrouselLoading(null);
    }
  };

  const programmerPublication = async (contenu) => {
    if (publishLoading) return;
    setPublishLoading(contenu.id);
    try {
      const d = await contenuService.publier(contenu.id);
      const patch = { publish_status: d.publish_status, late_post_id: d.late_post_id, publish_error: null };
      setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, ...patch } : c)));
      setSelectedContenu((prev) => (prev && prev.id === contenu.id ? { ...prev, ...patch } : prev));
      toast.success(t('contenus.toast.publicationProgrammee'));
    } catch (e) {
      const msg = e.response?.data?.detail || t('contenus.toast.programmationEchec');
      setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, publish_status: 'échec', publish_error: msg } : c)));
      setSelectedContenu((prev) => (prev && prev.id === contenu.id ? { ...prev, publish_status: 'échec', publish_error: msg } : prev));
      toast.error(msg);
    } finally {
      setPublishLoading(null);
    }
  };

  // Replanifier : le backend trouve le PROCHAIN créneau libre (planification du réseau
  // + dates déjà occupées) puis reprogramme sur Zernio — un clic, zéro saisie.
  const replanifierPublication = async (contenu) => {
    if (publishLoading) return;
    setPublishLoading(contenu.id);
    try {
      const d = await contenuService.replanifier(contenu.id);
      const patch = { date_publication: d.date_publication, publish_status: d.publish_status, publish_error: d.error || null };
      setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, ...patch } : c)));
      setSelectedContenu((prev) => (prev && prev.id === contenu.id ? { ...prev, ...patch } : prev));
      const dt = d.date_publication ? new Date(d.date_publication).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      if (d.publish_status === 'envoi') toast.success(t('contenus.toast.replanifie', { date: dt }));
      else toast.error(d.error || t('contenus.toast.replanifieEchecEnvoi'));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.replanificationEchec'));
    } finally {
      setPublishLoading(null);
    }
  };

  const annulerPublication = async (contenu) => {
    if (publishLoading) return;
    setPublishLoading(contenu.id);
    try {
      const d = await contenuService.annuler(contenu.id);
      const patch = { publish_status: d.publish_status, late_post_id: null, statut: d.statut || 'Valider' };
      setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, ...patch } : c)));
      setSelectedContenu((prev) => (prev && prev.id === contenu.id ? { ...prev, ...patch } : prev));
      toast.success(t('contenus.toast.envoiAnnule'));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.annulationEchec'));
    } finally {
      setPublishLoading(null);
    }
  };

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') setLightbox((lb) => lb && { ...lb, index: (lb.index + 1) % lb.images.length });
      else if (e.key === 'ArrowLeft') setLightbox((lb) => lb && { ...lb, index: (lb.index - 1 + lb.images.length) % lb.images.length });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  useEffect(() => {
    fetchContenus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchContenus = async () => {
    setLoading(true);
    try {
      const data = await contenuService.getAll();
      setContenus(data);
    } catch (error) {
      toast.error(t('contenus.toast.chargementErreur'));
    } finally {
      setLoading(false);
    }
  };

  const scripts = useMemo(() => contenus.filter(c => isVideoType(c) && !c.lien_video_dropbox), [contenus]);
  const videos = useMemo(() => contenus.filter(c => isVideoType(c) && !!c.lien_video_dropbox), [contenus]);
  const posts = useMemo(() => contenus.filter(c => !isVideoType(c)), [contenus]);

  const activeContenus = activeTab === 'scripts' ? scripts : activeTab === 'videos' ? videos : activeTab === 'posts' ? posts : contenus;

  const filteredContenus = useMemo(() => {
    let list = activeContenus;
    if (filterStatut !== 'all') list = list.filter((c) => c.statut === filterStatut);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(c =>
      (c.titre && c.titre.toLowerCase().includes(q)) ||
      (c.contenu && c.contenu.toLowerCase().includes(q)) ||
      (c.reseau_cible && c.reseau_cible.toLowerCase().includes(q))
    );
  }, [activeContenus, searchQuery, filterStatut]);

  // Pagination
  const PAGE_SIZE = 12;
  const pageCount = Math.max(1, Math.ceil(filteredContenus.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pagedContenus = filteredContenus.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [searchQuery, activeTab, filterStatut]);

  const [renderSlidesLoading, setRenderSlidesLoading] = useState(null);
  // Slides conçues (carrousel_data) mais images jamais rendues : simple rendu Playwright
  // depuis les slides stockées — GRATUIT, ne régénère pas le texte.
  const rendreSlidesEnImages = async (contenu) => {
    if (renderSlidesLoading) return;
    setRenderSlidesLoading(contenu.id);
    try {
      await agentService.recolorCarrousel(contenu.id);
      toast.success(t('contenus.toast.slidesRendues'));
      fetchContenus();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.renduSlidesEchec'));
    } finally {
      setRenderSlidesLoading(null);
    }
  };

  const declinerEnStory = async (contenu) => {
    try {
      const d = await contenuService.declinerStory(contenu.id);
      const dt = d.date_publication ? new Date(d.date_publication).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;
      toast.success(dt ? t('contenus.toast.storyCreeeDate', { date: dt }) : t('contenus.toast.storyCreee'));
      fetchContenus();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('contenus.toast.storyEchec'));
    }
  };

  const handleUpdateStatut = async (id, newStatut) => {
    if (newStatut === 'Valider') {
      const cible = contenus.find((c) => c.id === id);
      const reseau = (cible?.reseau_cible || '').toLowerCase();
      const plateforme = SOCIAL_PLATFORMS.find((p) => p.id === reseau);
      if (plateforme && !user?.[plateforme.field]) {
        toast.error(t('contenus.toast.reseauNonConnecte', { reseau: plateforme.name }), { duration: 7000 });
        return;
      }
    }
    setActionLoading(id);
    try {
      const data = await contenuService.update(id, { statut: newStatut });

      // Validation -> programmation automatique (push vers Late dans la foulée)
      if (newStatut === 'Valider') {
        const datePlanif = data?.date_publication
          ? new Date(data.date_publication).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
          : null;
        try {
          const pub = await contenuService.publier(id);
          const patch = { statut: 'Valider', date_publication: data.date_publication, publish_status: pub.publish_status, late_post_id: pub.late_post_id, publish_error: null };
          setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
          track('post_valide', { reseau: (contenus.find((c) => c.id === id)?.reseau_cible || '').toLowerCase() });
          toast.success(datePlanif ? t('contenus.toast.valideProgrammeDate', { date: datePlanif }) : t('contenus.toast.valideProgramme'));
        } catch (e) {
          const msg = e.response?.data?.detail || t('contenus.toast.valideProgrammationEchec');
          setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'Valider', date_publication: data.date_publication, publish_status: 'échec', publish_error: msg } : c)));
          toast.error(msg, { duration: 7000 });
        }
        setSelectedContenu(null);
        fetchContenus();
        return;
      }

      if (newStatut === 'Refuse') toast.success(t('contenus.toast.contenuRefuse'));
      else toast.success(t('contenus.toast.contenuMisAJour'));
      fetchContenus();
      setSelectedContenu(null);
    } catch (error) {
      toast.error(t('contenus.toast.majErreur'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = async () => {
    if (!editContenu) return;
    setActionLoading(editContenu.id);
    try {
      await contenuService.update(editContenu.id, {
        contenu: editContenu.contenu,
        titre: editContenu.titre,
      });
      toast.success(t('contenus.toast.contenuModifie'));
      fetchContenus();
      setEditContenu(null);
    } catch (error) {
      toast.error(t('contenus.toast.modificationErreur'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteContenu) return;
    setActionLoading(deleteContenu.id);
    try {
      await contenuService.remove(deleteContenu.id);
      toast.success(t('contenus.toast.contenuSupprime'));
      fetchContenus();
      setDeleteContenu(null);
    } catch (error) {
      toast.error(t('contenus.toast.suppressionErreur'));
    } finally {
      setActionLoading(null);
    }
  };

  const stats = {
    total: activeContenus.length,
    aValider: activeContenus.filter(c => c.statut === 'A valider').length,
    valides: activeContenus.filter(c => c.statut === 'Valider').length,
    planifies: activeContenus.filter(c => c.statut === 'Planifie').length,
    publies: activeContenus.filter(c => c.statut === 'Publie').length,
  };

  // Pastilles de filtre : le chiffre EST le filtre (remplace stats + menu deroulant)
  const FILTRES = [
    { id: 'all', label: t('contenus.filtres.tous'), n: stats.total, dot: null },
    { id: 'A valider', label: t('contenus.filtres.aValider'), n: stats.aValider, dot: '#fbbf24' },
    { id: 'Valider', label: t('contenus.filtres.valides'), n: stats.valides, dot: '#a5b0ff' },
    { id: 'Planifie', label: t('contenus.filtres.planifies'), n: stats.planifies, dot: '#c084fc' },
    { id: 'Publie', label: t('contenus.filtres.publies'), n: stats.publies, dot: '#60a5fa' },
    { id: 'Refuse', label: t('contenus.filtres.refuses'), n: null, dot: '#f87171' },
  ];

  return (
    <div>
      <div className="w-full space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-sora text-white">{t('contenus.titre')}</h1>
            <p className="text-slate-400 font-inter text-sm mt-1">
              {t('contenus.sousTitre')}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              size="sm"
              onClick={() => setPostManuelOpen(true)}
              data-testid="btn-post-manuel"
              className="bg-white/[0.06] border border-white/[0.10] text-slate-200 hover:bg-white/[0.10] hover:text-white"
            >
              <PenLine className="w-4 h-4 mr-2" />
              {t('contenus.actions.postManuel')}
            </Button>
            <Button
              onClick={() => navigate('/dashboard/reel')}
              data-testid="btn-creer-reel"
              className="bg-white/[0.06] border border-white/[0.10] text-slate-200 hover:bg-white/[0.10] hover:text-white"
            >
              <Clapperboard className="w-4 h-4 mr-2" />
              {t('contenus.reel.seq.creerTitre')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchContenus}
              disabled={loading}
              className="text-slate-400 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t('contenus.actions.actualiser')}
            </Button>
          </div>
        </div>

        {/* Tabs: Scripts / Vidéos / Tous */}
        <div className="flex gap-1 p-1 bg-slate-950/60 rounded-xl border border-white/[0.04] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'all', label: t('contenus.onglets.tous'), icon: Sparkles, count: contenus.length },
            { id: 'posts', label: t('contenus.onglets.posts'), icon: FileText, count: posts.length },
            { id: 'scripts', label: t('contenus.onglets.scripts'), icon: ScrollText, count: scripts.length },
            { id: 'videos', label: t('contenus.onglets.videos'), icon: Video, count: videos.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); setFilterStatut('all'); }}
              className={`flex-none sm:flex-1 sm:min-w-0 flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-lg text-[13px] sm:text-sm font-inter font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-[#5B6CFF]/20 text-white shadow-[0_0_10px_rgba(91,108,255,0.1)]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              <span className={`hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-[#5B6CFF]/30 text-white' : 'bg-slate-800 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Filtres par statut (le chiffre EST le filtre) + recherche */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTRES.map((f) => (
              <button key={f.id} onClick={() => setFilterStatut(f.id)}
                className={`inline-flex shrink-0 items-center gap-2 px-3.5 py-2 rounded-full text-[12.5px] font-semibold font-inter border whitespace-nowrap transition-all active:scale-[0.97] ${
                  filterStatut === f.id
                    ? 'bg-gradient-to-r from-[#5B6CFF]/20 to-[#8A6CFF]/20 text-white border-[#5B6CFF]/45'
                    : 'bg-white/[0.02] text-slate-400 border-white/[0.07] hover:text-white hover:border-white/[0.18]'
                }`}>
                {f.dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: f.dot }} />}
                {f.label}
                {f.n !== null && (
                  <span className={`text-[10.5px] px-1.5 py-px rounded-full ${
                    filterStatut === f.id ? 'bg-[#5B6CFF]/35 text-white' : 'bg-white/[0.07] text-slate-500'
                  }`}>{f.n}</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative lg:ml-auto lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder={t('contenus.recherche.placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-slate-900/60 border border-white/[0.06] text-slate-200 text-sm font-inter placeholder:text-slate-600 focus:outline-none focus:border-[#5B6CFF]/50 transition-colors"
            />
          </div>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
            <p className="text-sm text-slate-500 font-inter">{t('contenus.etat.chargement')}</p>
          </div>
        ) : filteredContenus.length === 0 && filterStatut === 'A valider' && !searchQuery && stats.total > 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 bg-slate-900/30 border border-white/[0.04] rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-[#3AFFA3]/10 flex items-center justify-center">
              <Check className="w-7 h-7 text-[#3AFFA3]" />
            </div>
            <div className="text-center">
              <p className="text-slate-200 font-inter font-medium">{t('contenus.etat.rienAValider')}</p>
              <p className="text-slate-500 font-inter text-sm mt-1">{t('contenus.etat.rienAValiderSous')}</p>
            </div>
            <button onClick={() => setFilterStatut('all')}
              className="text-[13px] font-semibold font-inter text-[#a5b0ff] border border-[#5B6CFF]/40 bg-[#5B6CFF]/10 hover:bg-[#5B6CFF]/25 hover:text-white px-4 py-2 rounded-full transition-colors active:scale-[0.97]">
              {t('contenus.etat.voirTous', { n: stats.total })}
            </button>
          </div>
        ) : filteredContenus.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 bg-slate-900/30 border border-white/[0.04] rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/50 flex items-center justify-center">
              <FileText className="w-7 h-7 text-slate-600" />
            </div>
            <div className="text-center">
              <p className="text-slate-400 font-inter font-medium">
                {activeTab === 'scripts' ? t('contenus.etat.aucunScript') : activeTab === 'videos' ? t('contenus.etat.aucuneVideo') : activeTab === 'posts' ? t('contenus.etat.aucunPost') : t('contenus.etat.aucunContenu')}
              </p>
              <p className="text-slate-600 font-inter text-sm mt-1">
                {searchQuery ? t('contenus.etat.essayezAutresTermes') : activeTab === 'scripts' ? t('contenus.etat.scriptsIci') : activeTab === 'videos' ? t('contenus.etat.videosIci') : activeTab === 'posts' ? t('contenus.etat.postsIci') : t('contenus.etat.contenusIci')}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-inter">{filteredContenus.length > 1 ? t('contenus.compteur.contenusPluriel', { n: filteredContenus.length }) : t('contenus.compteur.contenus', { n: filteredContenus.length })}{pageCount > 1 ? t('contenus.compteur.page', { page: pageSafe, total: pageCount }) : ''}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {pagedContenus.map((contenu) => (
                <ContentCard
                  key={contenu.id}
                  contenu={contenu}
                  onView={setSelectedContenu}
                  onImage={openImage}
                  onRegenCarrousel={regenererCarrousel}
                  carrouselLoading={carrouselLoading}
                  onEdit={setEditContenu}
                  onDelete={setDeleteContenu}
                  onValidate={(id) => handleUpdateStatut(id, 'Valider')}
                  onRefuse={(id) => handleUpdateStatut(id, 'Refuse')}
                  onRecycle={openRecycle}
                  onStory={declinerEnStory}
                  onRenderSlides={rendreSlidesEnImages}
                  renderLoading={renderSlidesLoading}
                  onReel={(c) => { setReelFor(c); setReelReco(null); contenuService.reelRecommander(c.id).then(setReelReco).catch(() => {}); }}
                  reelLoading={reelLoading}
                  actionLoading={actionLoading}
                />
              ))}
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-3">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe === 1}
                  className="h-9 px-3 rounded-lg border border-white/[0.08] bg-slate-900/60 text-slate-300 text-sm font-inter hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {t('contenus.pagination.precedent')}
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`h-9 w-9 rounded-lg text-sm font-semibold font-inter transition-colors ${n === pageSafe ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'border border-white/[0.08] bg-slate-900/60 text-slate-400 hover:bg-white/[0.06]'}`}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={pageSafe === pageCount}
                  className="h-9 px-3 rounded-lg border border-white/[0.08] bg-slate-900/60 text-slate-300 text-sm font-inter hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {t('contenus.pagination.suivant')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* View Dialog — refonte 2 panneaux */}
        <Dialog open={!!selectedContenu} onOpenChange={() => setSelectedContenu(null)}>
          <DialogContent className="bg-[#0b1120] border-white/10 p-0 gap-0 w-[95vw] max-w-[1000px] max-h-[90vh] overflow-hidden">
            {selectedContenu && (
              <div className="flex flex-col max-h-[90vh]">
                {/* HEADER */}
                <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <DialogTitle className="text-white font-sora text-[17px] leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {selectedContenu.titre || t('contenus.detail.titre')}
                    </DialogTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <StatusBadge statut={selectedContenu.statut} />
                      {selectedContenu.reseau_cible && <ReseauBadge reseau={selectedContenu.reseau_cible} />}
                      {selectedContenu.type && (
                        <span className="text-[10px] text-slate-500 font-inter bg-slate-800/80 px-2 py-1 rounded-md border border-white/5">{selectedContenu.type}</span>
                      )}
                      {PUBLISH_BADGE[selectedContenu.publish_status] && (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium font-inter border ${PUBLISH_BADGE[selectedContenu.publish_status].cls}`}>
                          {t(PUBLISH_BADGE[selectedContenu.publish_status].labelKey)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* BODY 2 panneaux */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0 overflow-hidden">
                  {/* GAUCHE : aperçu + retouche */}
                  <div className="p-4 border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto space-y-3"
                    style={{ background: 'radial-gradient(120% 70% at 20% 0%, rgba(91,108,255,.05), transparent 55%)' }}>
                  {selectedContenu.statut === 'A tourner' ? (
                    // Script prêt : à filmer + monter → Studio Vidéo
                    <div className="flex flex-col gap-4 py-1">
                      <div className="rounded-xl bg-[#0c111f] border border-white/5 p-4">
                        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-2 flex items-center gap-1.5"><ScrollText className="w-3.5 h-3.5" />{t('contenus.detail.tonScript')}</p>
                        <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300 font-inter max-h-[44vh] overflow-y-auto">{selectedContenu.script || '—'}</pre>
                      </div>
                      <button onClick={() => navigate(`/dashboard/video?contenu_id=${selectedContenu.id}`)}
                        className="w-full rounded-xl py-3 font-sora font-semibold text-white bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 flex items-center justify-center gap-2 transition-opacity">
                        <Video className="w-4 h-4" /> {t('contenus.detail.monterVideo')}
                      </button>
                    </div>
                  ) : selectedContenu.video_url ? (
                    // Vidéo / Reel montée (Studio Vidéo)
                    <div className="space-y-2.5">
                      <video src={selectedContenu.video_url} controls className="w-full max-h-[70vh] rounded-xl bg-black object-contain" poster={selectedContenu.lien_visuel || undefined} />
                      {selectedContenu.type === 'Reel' && selectedContenu.reel_data && selectedContenu.statut === 'A valider' && (
                        <button type="button" onClick={() => openSequenceRegen(selectedContenu)} data-testid="reel-modifier"
                          disabled={reelLoading === selectedContenu.id}
                          className="w-full inline-flex items-center justify-center gap-2 text-[13px] font-semibold font-inter text-[#a5b0ff] border border-[#5B6CFF]/40 bg-[#5B6CFF]/10 hover:bg-[#5B6CFF]/25 hover:text-white px-3.5 py-2.5 rounded-[10px] transition-colors active:scale-[0.98] disabled:opacity-50">
                          {reelLoading === selectedContenu.id ? t('contenus.reel.seq.envoi') : t('contenus.reel.seq.modifier')}
                        </button>
                      )}
                    </div>
                  ) : selectedContenu.video_status === 'en_traitement' ? (
                    <div className="w-full aspect-[9/16] max-h-[70vh] rounded-xl bg-slate-800/40 border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-7 h-7 animate-spin text-[#8A6CFF]" />
                      <span className="text-xs font-inter">{t('contenus.detail.montageVideoEnCours')}</span>
                    </div>
                  ) : czR && selectedContenu.carrousel_data ? (
                    // Aperçu LIVE éditable — seulement AVANT validation (reflète la retouche)
                    <>
                      <style dangerouslySetInnerHTML={{ __html: SLIDE_CSS }} />
                      {(() => {
                        const slides = czPreviewSlides() || [];
                        const idx = Math.min(czSlide, Math.max(0, slides.length - 1));
                        return (
                          <div className="space-y-2.5">
                            <div className="relative mx-auto rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl" style={{ width: 220, height: 275 }}>
                              <div className="origin-top-left" style={{ transform: 'scale(1.1)', width: 200, height: 250 }} dangerouslySetInnerHTML={{ __html: slides[idx] || '' }} />
                            </div>
                            <div className="flex gap-1.5 justify-center flex-wrap">
                              {slides.map((_, i) => (
                                <button key={i} onClick={() => setCzSlide(i)} title={t('contenus.detail.slide', { n: i + 1 })}
                                  className={`rounded-md overflow-hidden border transition-all ${i === idx ? 'border-[#3AFFA3] ring-1 ring-[#3AFFA3]/40' : 'border-white/10 opacity-60 hover:opacity-100'}`}
                                  style={{ width: 32, height: 40 }}>
                                  <div className="origin-top-left" style={{ transform: 'scale(0.16)', width: 200, height: 250 }} dangerouslySetInnerHTML={{ __html: slides[i] }} />
                                </button>
                              ))}
                            </div>
                            <p className="text-[11px] text-[#3AFFA3] text-center font-inter flex items-center justify-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] shadow-[0_0_8px_#3AFFA3]" />{t('contenus.detail.apercuLive')}
                            </p>
                          </div>
                        );
                      })()}
                    </>
                  ) : Array.isArray(selectedContenu.slides_images) && selectedContenu.slides_images.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedContenu.slides_images.map((u, i) => (
                        <button key={i} type="button" onClick={() => setLightbox({ images: selectedContenu.slides_images, index: i })}
                          className="group relative block w-full overflow-hidden rounded-lg ring-1 ring-white/10 hover:ring-[#5B6CFF]/50 transition-all">
                          <img src={u} alt={t('contenus.detail.slide', { n: i + 1 })} className="w-full object-cover group-hover:scale-[1.03] transition-transform" />
                          <span className="absolute bottom-1 right-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white/90">{i + 1}/{selectedContenu.slides_images.length}</span>
                        </button>
                      ))}
                    </div>
                  ) : selectedContenu.lien_visuel ? (
                    <img
                      src={selectedContenu.lien_visuel}
                      alt=""
                      className="w-full rounded-xl object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded-xl bg-slate-800/40 border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-slate-600">
                      <ImageIcon className="w-10 h-10" />
                      <span className="text-xs font-inter">{t('contenus.detail.aucunVisuel')}</span>
                    </div>
                  )}

                  {/* Générer / changer le visuel — posts image (pas carrousel, pas vidéo) */}
                  {!(Array.isArray(selectedContenu.slides_images) && selectedContenu.slides_images.length)
                    && !selectedContenu.carrousel_pdf && !selectedContenu.video_url
                    && selectedContenu.type !== 'Reel' && selectedContenu.type !== 'Video' && (
                    <Button size="sm" onClick={() => { const c = selectedContenu; setSelectedContenu(null); openImage(c); }}
                      className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white font-sora font-semibold rounded-[11px] hover:-translate-y-px transition-all">
                      <Wand2 className="w-4 h-4 mr-1.5" />{selectedContenu.lien_visuel ? t('contenus.detail.changerVisuel') : t('contenus.detail.genererImage')}
                    </Button>
                  )}

                  {/* Retouche couleurs/police du carrousel (re-render, texte inchangé) */}
                  {czR && (
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('contenus.retouche.titre')}</span>
                        <span className="text-[10.5px] text-[#3AFFA3] font-semibold">{t('contenus.retouche.apercuInstantane')}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <ColorField label={t('contenus.retouche.fond')} name="p" value={czR.p} onChange={setCzRColor} />
                        <ColorField label={t('contenus.retouche.secondaire')} name="s" value={czR.s} onChange={setCzRColor} />
                        <ColorField label={t('contenus.retouche.accent')} name="a" value={czR.a} onChange={setCzRColor} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10.5px] text-slate-500 mb-1">{t('carrousels.policeDesTitres')}</label>
                          <select value={czR.font || ''} onChange={(e) => setCzRColor('font', e.target.value)}
                            className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                            {CAROUSEL_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10.5px] text-slate-500 mb-1">{t('carrousels.policeDuTexte')}</label>
                          <select value={czR.fontBody || ''} onChange={(e) => setCzRColor('fontBody', e.target.value)}
                            className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                            {CAROUSEL_BODY_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 font-inter">{t('contenus.retouche.noteAvant')}<b className="text-slate-400">{t('contenus.retouche.noteValidation')}</b>{t('contenus.retouche.noteApres')}</p>
                    </div>
                  )}

                  {/* PDF carrousel (post document LinkedIn) */}
                  {selectedContenu.carrousel_pdf && (
                    <a href={selectedContenu.carrousel_pdf} target="_blank" rel="noopener noreferrer" download
                      className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-slate-200 text-sm font-inter py-2.5 transition-colors">
                      <FileText className="w-4 h-4 text-[#5B6CFF]" />
                      {t('contenus.detail.telechargerPdf')} <span className="text-slate-500">{t('contenus.detail.documentLinkedin')}</span>
                    </a>
                  )}

                  {/* Published link */}
                  {selectedContenu.statut === 'Publie' && selectedContenu.lien_publication && (
                    <a
                      href={selectedContenu.lien_publication}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-blue-500/[0.08] border border-blue-500/20 rounded-xl text-blue-400 hover:bg-blue-500/[0.12] transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                        <ExternalLink className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold font-sora text-sm">{t('contenus.detail.publicationEnLigne')}</p>
                        <p className="text-xs text-blue-400/60 truncate">{selectedContenu.lien_publication}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-blue-400/40 shrink-0" />
                    </a>
                  )}

                  {/* Dropbox video link */}
                  {selectedContenu.lien_video_dropbox && (
                    <a
                      href={selectedContenu.lien_video_dropbox}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-purple-500/[0.08] border border-purple-500/20 rounded-xl text-purple-400 hover:bg-purple-500/[0.12] transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                        <Video className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold font-sora text-sm">{t('contenus.detail.videoDropbox')}</p>
                        <p className="text-xs text-purple-400/60 truncate">{selectedContenu.lien_video_dropbox}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-purple-400/40 shrink-0" />
                    </a>
                  )}
                </div>

                  {/* DROITE : texte + méta + erreur discrète */}
                  <div className="flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                      <div>
                        <p className="text-[10.5px] uppercase tracking-[0.16em] text-slate-500 font-semibold mb-2.5">{t('contenus.detail.textePost')}</p>
                        <p className="text-slate-200 font-inter text-[14px] leading-relaxed whitespace-pre-wrap">{selectedContenu.contenu}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-[#0a0f1c] rounded-lg p-3 border border-white/[0.08]">
                          <p className="text-[10px] uppercase tracking-wider text-slate-600 font-inter mb-1">{t('contenus.detail.creeLe')}</p>
                          <p className="text-slate-300 text-[13px] font-inter tabular-nums">{new Date(selectedContenu.created_at).toLocaleString('fr-FR')}</p>
                        </div>
                        {selectedContenu.date_publication && (
                          <div className="bg-[#0a0f1c] rounded-lg p-3 border border-white/[0.08]">
                            <p className="text-[10px] uppercase tracking-wider text-slate-600 font-inter mb-1">{t('contenus.detail.publication')}</p>
                            <p className="text-[#3AFFA3] text-[13px] font-inter tabular-nums">{new Date(selectedContenu.date_publication).toLocaleString('fr-FR')}</p>
                          </div>
                        )}
                      </div>
                      {selectedContenu.publish_status === 'échec' && selectedContenu.publish_error && (
                        <div className="flex gap-2.5 items-start p-3 rounded-lg bg-red-500/[0.07] border border-red-500/20">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                          <p className="text-[12px] text-red-300/90 leading-relaxed"><b className="text-red-200">{t('contenus.detail.publicationEchecLabel')}</b> {selectedContenu.publish_error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* FOOTER : Supprimer discret à GAUCHE, actions d'état à droite (CTA dégradé unique) */}
                <div className="px-5 py-3 border-t border-white/10 flex items-center gap-3 bg-[#0a0f1c]">
                  <Button size="sm" onClick={() => { const c = selectedContenu; setSelectedContenu(null); setDeleteContenu(c); }}
                    className="bg-transparent text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent font-inter shrink-0 px-2.5">
                    <Trash2 className="w-4 h-4 mr-1.5" />{t('contenus.actions.supprimer')}</Button>
                  <span className="hidden sm:block text-[11.5px] text-slate-600 font-inter truncate">
                    {czR ? t('contenus.detail.imagesFinalesValidation') : ''}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap justify-end ml-auto">
                    {selectedContenu.video_url && selectedContenu.statut !== 'Publie' && (
                      <Button size="sm" onClick={() => navigate(`/dashboard/video?contenu_id=${selectedContenu.id}`)}
                        className="bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 font-sora font-semibold rounded-[11px]">
                        <Video className="w-4 h-4 mr-1.5" />{t('contenus.detail.modifierVideo')}</Button>
                    )}
                    {selectedContenu.statut === 'A valider' && (
                      <>
                        <Button size="sm" onClick={() => handleUpdateStatut(selectedContenu.id, 'Refuse')} disabled={actionLoading === selectedContenu.id}
                          className="bg-transparent border border-white/[0.12] text-slate-400 hover:text-white hover:border-white/25 font-sora font-semibold rounded-[11px] px-4 transition-colors"><X className="w-4 h-4 mr-1.5" />{t('contenus.actions.refuser')}</Button>
                        <Button size="sm" onClick={() => validerContenu(selectedContenu.id)}
                          disabled={actionLoading === selectedContenu.id || czRBusy || ((selectedContenu.type === 'Reel' || selectedContenu.video_status) && !selectedContenu.video_url)}
                          title={((selectedContenu.type === 'Reel' || selectedContenu.video_status) && !selectedContenu.video_url) ? t('contenus.detail.attendsMontage') : undefined}
                          className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white font-sora font-semibold rounded-[11px] px-5 shadow-[0_8px_24px_rgba(91,108,255,0.35)] hover:-translate-y-px hover:shadow-[0_12px_30px_rgba(91,108,255,0.45)] transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none">
                          {((selectedContenu.type === 'Reel' || selectedContenu.video_status) && !selectedContenu.video_url)
                            ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />{t('contenus.detail.montageEnCours')}</>
                            : <>{(actionLoading === selectedContenu.id || czRBusy) ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}{t('contenus.actions.validerProgrammer')}</>}</Button>
                      </>
                    )}
                    {selectedContenu.statut !== 'Publie' && selectedContenu.statut !== 'A valider' && selectedContenu.reseau_cible
                      && ['', null, undefined, 'échec', 'annulé'].includes(selectedContenu.publish_status) && (
                      <Button size="sm" onClick={() => programmerPublication(selectedContenu)} disabled={publishLoading === selectedContenu.id}
                        title={selectedContenu.publish_status === 'échec' ? selectedContenu.publish_error : t('contenus.detail.envoyerFile')}
                        className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white font-sora font-semibold rounded-[11px] px-4 shadow-[0_8px_24px_rgba(91,108,255,0.35)] hover:-translate-y-px hover:shadow-[0_12px_30px_rgba(91,108,255,0.45)] transition-all">
                        {publishLoading === selectedContenu.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
                        {selectedContenu.publish_status === 'échec' ? t('contenus.actions.reessayer') : t('contenus.actions.programmer')}</Button>
                    )}
                    {selectedContenu.statut !== 'Publie' && selectedContenu.statut !== 'A valider' && selectedContenu.reseau_cible
                      && selectedContenu.publish_status !== 'publié' && (
                      <Button size="sm" onClick={() => replanifierPublication(selectedContenu)} disabled={publishLoading === selectedContenu.id}
                        title={t('contenus.detail.replanifierTitle')}
                        data-testid="replanifier-btn"
                        className="bg-transparent border border-white/[0.12] text-slate-300 hover:text-white hover:border-white/25 font-sora font-semibold rounded-[11px] transition-colors">
                        {publishLoading === selectedContenu.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                        {t('contenus.actions.replanifier')}</Button>
                    )}
                    {['envoi', 'programmé'].includes(selectedContenu.publish_status) && (
                      <Button size="sm" onClick={() => annulerPublication(selectedContenu)} disabled={publishLoading === selectedContenu.id}
                        className="bg-transparent border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50 font-sora font-semibold rounded-[11px] transition-colors">
                        {publishLoading === selectedContenu.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <X className="w-4 h-4 mr-1.5" />}{t('contenus.actions.annulerEnvoi')}</Button>
                    )}
                    {selectedContenu.statut === 'Publie' && selectedContenu.lien_publication && (
                      <a href={selectedContenu.lien_publication} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="bg-transparent border border-white/[0.12] text-slate-300 hover:text-white hover:border-white/25 font-sora font-semibold rounded-[11px] transition-colors"><ExternalLink className="w-4 h-4 mr-1.5" />{t('contenus.actions.voirPublication')}</Button>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editContenu} onOpenChange={() => setEditContenu(null)}>
          <DialogContent className="bg-[#0f172a] border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white font-sora">{t('contenus.edition.titre')}</DialogTitle>
            </DialogHeader>
            {editContenu && (
              <div className="space-y-4">
                <Textarea
                  value={editContenu.contenu || ''}
                  onChange={(e) => setEditContenu({ ...editContenu, contenu: e.target.value })}
                  rows={10}
                  className="bg-slate-900/80 border-slate-800 text-slate-200 font-inter text-sm rounded-xl focus:border-[#5B6CFF]/50"
                />
                {(() => {
                  // Compteur de caractères vs limite du réseau cible (évite le refus à la programmation)
                  const LIMITES = { instagram: 2200, tiktok: 2200, googlebusiness: 1500, twitter: 280, linkedin: 3000, facebook: 63000, youtube: 5000 };
                  const lim = LIMITES[(editContenu.reseau_cible || '').toLowerCase()];
                  if (!lim) return null;
                  const n = (editContenu.contenu || '').length;
                  const over = n > lim;
                  return (
                    <p className={`text-[11.5px] font-inter text-right ${over ? 'text-red-400 font-semibold' : n > lim * 0.9 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {t('contenus.edition.compteur', { n: n.toLocaleString('fr-FR'), lim: lim.toLocaleString('fr-FR') })}{over ? t('contenus.edition.tropLong') : ''}
                    </p>
                  );
                })()}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditContenu(null)} className="font-inter text-slate-400">
                {t('contenus.actions.annuler')}
              </Button>
              <Button
                onClick={handleEdit}
                disabled={actionLoading === editContenu?.id}
                className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white font-inter"
              >
                {actionLoading === editContenu?.id && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {t('contenus.actions.enregistrer')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Recyclage — republier sur d'autres réseaux */}
        <Dialog open={!!recycleFor} onOpenChange={() => setRecycleFor(null)}>
          <DialogContent className="bg-[#0f172a] border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white font-sora flex items-center gap-2">
                <Repeat2 className="w-4 h-4 text-[#3AFFA3]" />{t('contenus.recyclage.titre')}
              </DialogTitle>
            </DialogHeader>
            {recycleFor && (
              <div className="space-y-4">
                <p className="text-sm text-slate-400 font-inter">
                  {t('contenus.recyclage.descAvant')}<span className="text-amber-400">{t('contenus.recyclage.descBadge')}</span>{t('contenus.recyclage.descApres')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {connectedNets
                    .filter((p) => p.id !== (recycleFor.reseau_cible || '').toLowerCase())
                    .map((p) => {
                      const on = recycleNets.includes(p.id);
                      return (
                        <button key={p.id} type="button" data-testid={`recycle-net-${p.id}`}
                          onClick={() => setRecycleNets((prev) => on ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-[13px] font-inter font-medium transition-all active:scale-[0.97] ${
                            on ? 'border-[#3AFFA3]/50 bg-[#3AFFA3]/10 text-white' : 'border-white/[0.08] bg-slate-950/50 text-slate-400 hover:text-white hover:border-white/20'}`}>
                          <span style={{ color: p.brand }}><p.icon className="w-4 h-4" /></span>
                          {p.name}
                          {on && <Check className="w-3.5 h-3.5 text-[#3AFFA3]" />}
                        </button>
                      );
                    })}
                </div>
                {!connectedNets.filter((p) => p.id !== (recycleFor.reseau_cible || '').toLowerCase()).length && (
                  <p className="text-xs text-slate-500 font-inter">{t('contenus.recyclage.aucunReseau')}</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRecycleFor(null)} className="font-inter text-slate-400">{t('contenus.actions.annuler')}</Button>
              <Button onClick={doRecycle} disabled={recycling || !recycleNets.length} data-testid="recycle-submit"
                className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white font-inter">
                {recycling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Repeat2 className="w-4 h-4 mr-2" />}
                {t('contenus.recyclage.bouton', { n: recycleNets.length })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reel — galerie de templates (registre backend /reels/templates) */}
        <Dialog open={!!reelFor} onOpenChange={() => setReelFor(null)}>
          <DialogContent className="bg-[#0f172a] border-slate-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white font-sora flex items-center gap-2">
                <Clapperboard className="w-4 h-4 text-[#8A6CFF]" />{t('contenus.reel.generer')}
              </DialogTitle>
            </DialogHeader>
            {reelFor && (
              <div className="space-y-3">
                <p className="text-sm text-slate-400 font-inter">
                  {t('contenus.reel.description')}
                </p>
                <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1">
                  {(() => {
                    // Les variantes "sequence-*" sont regroupées en UNE carte Séquence :
                    // le style se choisit ensuite dans le studio (templates côte à côte).
                    const seqMain = reelTemplates.find((x) => x.id === 'sequence') || reelTemplates.find((x) => x.id.startsWith('sequence'));
                    const nbStyles = reelTemplates.filter((x) => x.id.startsWith('sequence')).length;
                    const recoSeq = !!reelReco?.template?.startsWith('sequence');
                    const liste = [
                      ...(seqMain ? [{ ...seqMain, groupe: true }] : []),
                      ...reelTemplates.filter((x) => !x.id.startsWith('sequence')),
                    ];
                    return liste.sort((a, b) => (b.groupe ? recoSeq : b.id === reelReco?.template) - (a.groupe ? recoSeq : a.id === reelReco?.template)).map((tpl) => {
                    const reco = tpl.groupe ? recoSeq : reelReco?.template === tpl.id;
                    return (
                      <button key={tpl.id} type="button" data-testid={`reel-${tpl.id}`}
                        onClick={() => doReel(reelFor, tpl.groupe ? (recoSeq ? reelReco.template : 'sequence') : tpl.id)}
                        className={`w-full text-left rounded-xl border transition-all active:scale-[0.98] p-3.5 flex gap-3.5 items-stretch ${reco ? 'border-[#3AFFA3]/60 bg-[#3AFFA3]/[0.05]' : 'border-white/[0.08] bg-slate-950/50 hover:border-[#8A6CFF]/50 hover:bg-[#8A6CFF]/5'}`}>
                        {tpl.apercu && (
                          <video src={tpl.apercu} autoPlay muted loop playsInline
                            className="w-[74px] h-[128px] object-cover rounded-lg border border-white/10 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-sora font-bold text-white flex items-center gap-2 min-w-0">
                              <span className="truncate">{tpl.label}</span>
                              {reco && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#3AFFA3]/15 text-[#3AFFA3] border border-[#3AFFA3]/40 shrink-0">★ {t('contenus.reel.recommande')}</span>}
                            </span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#3AFFA3]/10 text-[#3AFFA3] border border-[#3AFFA3]/25 shrink-0">{tpl.groupe && nbStyles > 1 ? t('contenus.reel.seq.nbStyles', { n: nbStyles }) : `${tpl.duree} s`}</span>
                          </div>
                          <p className="text-xs text-slate-400 font-inter mt-1">{tpl.desc}</p>
                          {reco && reelReco?.raison && <p className="text-[11px] text-[#3AFFA3]/80 font-inter mt-1.5">→ {reelReco.raison}</p>}
                          {(tpl.tags || []).length > 0 && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {tpl.tags.map((tag) => <span key={tag} className="text-[10px] font-inter text-slate-500 border border-white/10 rounded-full px-2 py-0.5">{tag}</span>)}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  }); })()}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Séquence : le client fournit les visuels + un brief, l'IA monte */}
        <Dialog open={!!seqFor} onOpenChange={() => { setSeqFor(null); setSeqZoom(null); seqStopPreview(); }}>
          <DialogContent className="bg-[#0f172a] border-slate-800 w-[96vw] sm:max-w-[1180px] max-h-[92vh] overflow-y-auto"
            onEscapeKeyDown={(e) => { if (seqZoom !== null) { e.preventDefault(); setSeqZoom(null); } }}>
            <DialogHeader>
              <DialogTitle className="text-white font-sora">{t('contenus.reel.seq.titre')}</DialogTitle>
            </DialogHeader>
            {seqFor && (
              <div className="space-y-4">
                <p className="text-sm text-slate-400 font-inter">{t('contenus.reel.seq.description')}</p>

                <div className="grid md:grid-cols-[minmax(0,1fr)_340px] gap-6">
                {/* ---- COLONNE GAUCHE : vignettes compactes (loupe = aperçu grand) ---- */}
                <div>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('contenus.reel.seq.tplTitre')}</span>
                    {(() => {
                      const cur = reelTemplates.find((x) => (x.id === 'sequence' ? 'signature' : x.id.split('-')[1]) === seqStyle && x.id.startsWith('sequence'));
                      const nomSel = cur ? (cur.id === 'sequence' ? 'Signature' : cur.label.replace(/^Séquence\s*—\s*/, '')) : '';
                      return nomSel ? <span className="ml-auto text-[12px] font-semibold text-[#3AFFA3]">✓ {nomSel}</span> : null;
                    })()}
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
                    {reelTemplates.filter((x) => x.id.startsWith('sequence')).map((tpl, idx) => {
                      const st = tpl.id === 'sequence' ? 'signature' : tpl.id.split('-')[1];
                      const on = seqStyle === st;
                      const reco = reelReco?.template === tpl.id;
                      const nom = tpl.id === 'sequence' ? 'Signature' : tpl.label.replace(/^Séquence\s*—\s*/, '');
                      return (
                        <div key={tpl.id} role="button" tabIndex={0} onClick={() => setSeqStyle(st)} data-testid={`seq-style-${st}`}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSeqStyle(st); } }}
                          className="group relative cursor-pointer transition-transform hover:-translate-y-0.5 active:scale-95">
                          <div className={`relative aspect-[9/16] rounded-xl overflow-hidden bg-[#060b18] border-[1.5px] transition-all ${on ? 'border-[#3AFFA3] shadow-[0_0_0_1.5px_#3AFFA3,0_8px_30px_rgba(58,255,163,0.14)]' : 'border-white/[0.09] group-hover:border-[#8A6CFF]/60'}`}>
                            {tpl.apercu && <video src={tpl.apercu} autoPlay muted loop playsInline className="w-full h-full object-cover" />}
                            {on && <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#020617]/60 pointer-events-none" />}
                            {reco && <span className="absolute top-1.5 left-1.5 z-[2] text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-[#3AFFA3] text-[#05261a]">★</span>}
                            <button type="button" title={t('contenus.reel.seq.agrandir')} aria-label={t('contenus.reel.seq.agrandir')}
                              onClick={(e) => { e.stopPropagation(); setSeqZoom(idx); }}
                              className="absolute top-1.5 right-1.5 z-[3] w-[26px] h-[26px] rounded-lg border border-white/25 bg-[#020617]/75 text-white grid place-items-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity backdrop-blur-sm cursor-zoom-in active:scale-90">
                              <Maximize2 className="w-3 h-3" />
                            </button>
                            {on && <span className="absolute right-1.5 bottom-1.5 z-[2] w-[22px] h-[22px] rounded-full bg-[#3AFFA3] text-[#05261a] grid place-items-center text-[11px] font-extrabold">✓</span>}
                          </div>
                          <div className={`mt-1.5 text-center text-[11.5px] font-sora font-bold truncate ${on ? 'text-[#3AFFA3]' : 'text-slate-300'}`}>{nom}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ---- COLONNE DROITE : visuels, import, banque, brief ---- */}
                <div className="space-y-4">
                {/* Visuels choisis (dans l'ordre du montage) */}
                {seqImages.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.choisis')}</div>
                    <div className="flex flex-wrap gap-2">
                      {seqImages.map((img, idx) => (
                        <div key={img.url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#3AFFA3]/40">
                          <img src={img.url} alt="" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0.5 left-0.5 text-[10px] font-bold text-white bg-black/60 rounded px-1">{idx + 1}</span>
                          <button type="button" onClick={() => setSeqImages((p) => p.filter((i) => i.url !== img.url))}
                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-[12px] leading-none">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visuels du post (sélectionnables) */}
                {(() => {
                  const postImgs = [seqFor.lien_visuel, ...(seqFor.slides_images || [])]
                    .filter((u) => u && !u.endsWith('.mp4') && !u.includes('/video/upload/'))
                    .filter((u, i, arr) => arr.indexOf(u) === i).slice(0, 6);
                  if (!postImgs.length) return null;
                  return (
                    <div>
                      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.duPost')}</div>
                      <div className="flex flex-wrap gap-2">
                        {postImgs.map((u) => {
                          const on = seqImages.some((i) => i.url === u);
                          return (
                            <button key={u} type="button" onClick={() => seqToggleBanque({ url: u, description: '' })}
                              className={`relative w-16 h-16 rounded-lg overflow-hidden border transition-all ${on ? 'border-[#3AFFA3] ring-2 ring-[#3AFFA3]/40' : 'border-white/10 hover:border-white/30'}`}>
                              <img src={u} alt="" className="w-full h-full object-cover" />
                              {on && <span className="absolute inset-0 bg-[#3AFFA3]/20 grid place-items-center text-[#3AFFA3] font-bold">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Import direct */}
                <label className={`inline-flex items-center gap-2 text-[13px] font-inter font-semibold px-3.5 py-2 rounded-[10px] border border-dashed cursor-pointer transition-colors ${seqUploading || seqImages.length >= 6 ? 'border-white/10 text-slate-600 cursor-not-allowed' : 'border-[#5B6CFF]/50 text-[#a5b0ff] hover:bg-[#5B6CFF]/10'}`}>
                  <input type="file" accept="image/*" multiple className="hidden" disabled={seqUploading || seqImages.length >= 6}
                    onChange={(e) => { seqUpload(e.target.files); e.target.value = ''; }} />
                  {seqUploading ? t('contenus.reel.seq.envoi') : t('contenus.reel.seq.importer')}
                </label>
                <span className="ml-2 text-[11px] text-slate-500 font-inter">{seqImages.length}/6</span>

                {/* Banque d'images de la marque */}
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.banque')}</div>
                  {seqBanque === null ? (
                    <div className="text-xs text-slate-500 font-inter">…</div>
                  ) : seqBanque.length === 0 ? (
                    <div className="text-xs text-slate-500 font-inter">{t('contenus.reel.seq.banqueVide')}</div>
                  ) : (
                    <div className="grid grid-cols-6 gap-2 max-h-[140px] overflow-y-auto pr-1">
                      {seqBanque.map((img) => {
                        const on = seqImages.some((i) => i.url === img.url);
                        return (
                          <button key={img.id} type="button" onClick={() => seqToggleBanque(img)} title={img.description || ''}
                            className={`relative aspect-square rounded-lg overflow-hidden border transition-all ${on ? 'border-[#3AFFA3] ring-2 ring-[#3AFFA3]/40' : 'border-white/10 hover:border-white/30'}`}>
                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                            {on && <span className="absolute inset-0 bg-[#3AFFA3]/20 grid place-items-center text-[#3AFFA3] font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Musique de fond (bibliothèque partagée avec le Studio Vidéo) */}
                {reelMusiques.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.musique')}</div>
                    <div className="flex items-center gap-2">
                      <select value={seqMusique} onChange={(e) => { setSeqMusique(e.target.value); seqStopPreview(); }}
                        data-testid="seq-musique"
                        className="flex-1 bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] font-inter rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                        <option value="none">{t('contenus.reel.seq.sansMusique')}</option>
                        {reelMusicCats.map((c) => (
                          <optgroup key={c.id} label={c.label}>
                            {reelMusiques.filter((m) => m.category === c.id).map((m) => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <button type="button" onClick={seqTogglePreview} disabled={seqMusique === 'none'}
                        title={t('contenus.reel.seq.ecouter')} aria-label={t('contenus.reel.seq.ecouter')}
                        className={`w-9 h-9 rounded-lg border grid place-items-center transition-all active:scale-95 ${seqMusique === 'none' ? 'border-white/[0.06] text-slate-700' : seqPlaying ? 'border-[#3AFFA3]/60 text-[#3AFFA3] bg-[#3AFFA3]/10' : 'border-white/10 text-slate-300 hover:border-white/25'}`}>
                        {seqPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <label title={t('contenus.reel.seq.importerMp3')} aria-label={t('contenus.reel.seq.importerMp3')}
                        className={`w-9 h-9 shrink-0 rounded-lg border grid place-items-center transition-all active:scale-95 cursor-pointer ${seqMp3 ? 'border-white/[0.06] text-slate-700' : 'border-[#5B6CFF]/40 text-[#a5b0ff] hover:bg-[#5B6CFF]/10'}`}>
                        <input type="file" accept="audio/*,.mp3,.m4a,.wav" className="hidden" disabled={seqMp3}
                          onChange={(e) => { importerMp3(e.target.files?.[0]); e.target.value = ''; }} />
                        {seqMp3 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-600 font-inter mt-1.5">{t('contenus.reel.seq.mp3Aide')}</p>
                    {/* Découpe : seulement sur les musiques du client (les pistes partagées sont calibrées) */}
                    {(() => {
                      const p = reelMusiques.find((m) => m.id === seqMusique && m.category === 'perso');
                      return p ? <DecoupeMusique piste={p} onChange={(m) => setReelMusiques((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)))} /> : null;
                    })()}
                    <audio ref={seqAudioRef} onEnded={() => setSeqPlaying(false)} className="hidden" />
                  </div>
                )}

                {/* Réseau cible (mode création libre) */}
                {seqLibre && (
                  <div>
                    <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.reel.seq.reseau')}</div>
                    <select value={seqReseau} onChange={(e) => setSeqReseau(e.target.value)}
                      className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] font-inter rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                      {['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube'].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}

                {/* Brief libre */}
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{seqLibre ? t('contenus.reel.seq.briefSujet') : t('contenus.reel.seq.brief')}</div>
                  <textarea value={seqBrief} onChange={(e) => setSeqBrief(e.target.value)} rows={3} maxLength={500}
                    placeholder={t('contenus.reel.seq.briefPh')}
                    className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] font-inter rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50 resize-none" />
                </div>
                </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-white/[0.06] mt-1 pt-3">
                  <button type="button" onClick={() => setSeqFor(null)}
                    className="text-[13px] font-inter text-slate-400 hover:text-white px-4 py-2 rounded-lg border border-white/10">{t('contenus.actions.annuler')}</button>
                  <button type="button" onClick={doSeqReel} disabled={seqUploading} data-testid="seq-generer"
                    className="text-[13px] font-semibold font-inter text-white px-5 py-2 rounded-lg bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 active:scale-[0.97] disabled:opacity-50">
                    {t('contenus.reel.seq.monter')}
                  </button>
                </div>

                {/* ---- LIGHTBOX : aperçu agrandi du template ---- */}
                {seqZoom !== null && (() => {
                  const seqTpls = reelTemplates.filter((x) => x.id.startsWith('sequence'));
                  const tpl = seqTpls[seqZoom];
                  if (!tpl) return null;
                  const st = tpl.id === 'sequence' ? 'signature' : tpl.id.split('-')[1];
                  const nom = tpl.id === 'sequence' ? 'Signature' : tpl.label.replace(/^Séquence\s*—\s*/, '');
                  const prev = () => setSeqZoom((seqZoom - 1 + seqTpls.length) % seqTpls.length);
                  const next = () => setSeqZoom((seqZoom + 1) % seqTpls.length);
                  return (
                    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#020617]/85 backdrop-blur-md" onClick={() => setSeqZoom(null)}>
                      <button type="button" aria-label={t('contenus.actions.annuler')} onClick={(e) => { e.stopPropagation(); setSeqZoom(null); }}
                        className="absolute top-5 right-6 w-10 h-10 rounded-xl border border-white/15 bg-[#0f172a]/85 text-white grid place-items-center hover:bg-[#5B6CFF]/30 active:scale-95 transition-all"><X className="w-[18px] h-[18px]" /></button>
                      {seqTpls.length > 1 && (<>
                        <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }}
                          className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full border border-white/15 bg-[#0f172a]/85 text-white grid place-items-center hover:bg-[#5B6CFF]/30 active:scale-95 transition-all"><ChevronLeft className="w-5 h-5" /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); next(); }}
                          className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full border border-white/15 bg-[#0f172a]/85 text-white grid place-items-center hover:bg-[#5B6CFF]/30 active:scale-95 transition-all"><ChevronRight className="w-5 h-5" /></button>
                      </>)}
                      <div className="flex flex-col md:flex-row items-center gap-5 md:gap-9 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="h-[52vh] md:h-[74vh] aspect-[9/16] rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-[#060b18] shrink-0">
                          {tpl.apercu && <video key={tpl.id} src={tpl.apercu} autoPlay muted loop playsInline className="w-full h-full object-cover" />}
                        </div>
                        <div className="max-w-[330px] text-center md:text-left">
                          <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#3AFFA3]">{t('contenus.reel.seq.apercuTpl')}</div>
                          <h2 className="font-sora font-extrabold text-white text-2xl md:text-3xl mt-2 tracking-tight">{nom}</h2>
                          <p className="text-sm text-slate-400 font-inter leading-relaxed mt-3">{tpl.desc}</p>
                          {(tpl.tags || []).length > 0 && (
                            <div className="flex gap-2 flex-wrap justify-center md:justify-start mt-4">
                              {tpl.tags.map((x) => <span key={x} className="text-[11px] text-slate-500 border border-white/10 rounded-full px-2.5 py-0.5">{x}</span>)}
                            </div>
                          )}
                          <div className="flex gap-2.5 justify-center md:justify-start mt-6">
                            <button type="button" onClick={() => setSeqZoom(null)}
                              className="text-[13px] font-inter text-slate-400 hover:text-white px-4 py-2 rounded-lg border border-white/10">{t('contenus.actions.annuler')}</button>
                            <button type="button" onClick={() => { setSeqStyle(st); setSeqZoom(null); }} data-testid="seq-zoom-choisir"
                              className="text-[13px] font-semibold font-inter text-white px-5 py-2 rounded-lg bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 active:scale-[0.97]">
                              {t('contenus.reel.seq.choisirTpl')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Fabrications longues : pastille flottante (reel > carrousel > slides) */}
        <PillFabrication
          actif={!!(reelLoading || carrouselLoading || renderSlidesLoading)}
          label={reelLoading ? t('contenus.reel.fab.pillReel')
            : carrouselLoading ? t('contenus.reel.fab.pillCarrousel')
            : t('contenus.reel.fab.pillSlides')}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteContenu} onOpenChange={() => setDeleteContenu(null)}>
          <AlertDialogContent className="bg-[#0f172a] border-slate-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white font-sora">{t('contenus.suppression.titre')}</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400 font-inter">
                {t('contenus.suppression.description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 font-inter">
                {t('contenus.actions.annuler')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 font-inter">
                {t('contenus.actions.supprimer')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Image Dialog */}
        <Dialog open={!!imageContenu} onOpenChange={() => setImageContenu(null)}>
          <DialogContent className="bg-[#0b1120] border-white/10 p-0 gap-0 w-[95vw] max-w-[920px] max-h-[90vh] overflow-hidden">
            {imageContenu && (
              <div className="flex flex-col md:flex-row max-h-[90vh] md:max-h-[620px]">
                {/* ---- APERÇU ---- */}
                <div className="md:w-[44%] p-5 flex flex-col gap-3 border-b md:border-b-0 md:border-r border-white/10"
                  style={{ background: 'radial-gradient(120% 90% at 30% 0%, rgba(91,108,255,.08), transparent 55%), #0b1120' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] tracking-[0.18em] uppercase text-slate-500 font-semibold">{t('contenus.image.apercu')}</span>
                    {imageContenu.lien_visuel && (
                      <a href={imageContenu.lien_visuel} target="_blank" rel="noreferrer"
                        className="w-8 h-8 rounded-lg border border-white/10 grid place-items-center text-slate-400 hover:text-white hover:border-white/20" title={t('contenus.image.ouvrirTelecharger')}>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  <div className="flex-1 grid place-items-center min-h-[230px]">
                    {imageContenu.lien_visuel ? (
                      <img src={imageContenu.lien_visuel} alt="" className="w-full max-w-[320px] aspect-square object-cover rounded-2xl ring-1 ring-white/10 shadow-2xl" />
                    ) : (
                      <div className="w-full max-w-[300px] aspect-square rounded-2xl border border-dashed border-white/15 grid place-items-center text-center px-8">
                        <p className="text-slate-500 text-sm font-inter leading-relaxed">
                          <ImageIcon className="w-7 h-7 mx-auto mb-2.5 opacity-40" />
                          {t('contenus.image.placeholderLigne1')}<br />{t('contenus.image.placeholderLigne2')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ---- CONTRÔLES ---- */}
                <div className="flex-1 md:w-[56%] flex flex-col min-h-0">
                  <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10 space-y-0 text-left">
                    <DialogTitle className="text-white font-sora text-[17px]">{t('contenus.carte.creerVisuel')}</DialogTitle>
                    <p className="text-[12px] text-slate-500 font-inter">{user?.nom || t('contenus.image.taMarque')} · {t('contenus.image.feedCoherent')}</p>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {/* Toggle de mode */}
                    <div className="grid grid-cols-3 gap-1 p-1 bg-[#0a0f1c] border border-white/10 rounded-xl">
                      {[['gabarit', t('contenus.image.modeGabarit'), LayoutGrid], ['template', t('contenus.image.modeTemplate'), ScrollText], ['ia', t('contenus.image.modeIa'), Wand2]].map(([m, lbl, Icon]) => (
                        <button key={m} onClick={() => setMode(m)}
                          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium font-inter transition-all ${imgMode === m ? 'bg-[#5B6CFF]/15 text-white border border-[#5B6CFF]/40' : 'text-slate-400 border border-transparent hover:text-white'}`}>
                          <Icon className="w-3.5 h-3.5" />{lbl}
                        </button>
                      ))}
                    </div>

                    {/* MODE GABARIT */}
                    {imgMode === 'gabarit' && (
                      <div className="space-y-2.5">
                        <p className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">{t('contenus.image.miseEnPage')}</p>
                        <div className="grid grid-cols-3 gap-2">
                          {gabarits.map((g) => (
                            <button key={g} onClick={() => setSelectedGabarit(g)} title={gabLabels[g] || g}
                              className={`group relative rounded-lg overflow-hidden border transition-all ${selectedGabarit === g ? 'border-[#3AFFA3] ring-2 ring-[#3AFFA3]/30' : 'border-white/10 hover:border-white/25'}`}>
                              <div className="relative aspect-square" style={{ background: `radial-gradient(120% 90% at 80% 0%, ${gabAccent}40, transparent 55%), #07070e` }}>
                                {gabPreviews[g]
                                  ? <img src={gabPreviews[g]} alt={gabLabels[g] || g} className="absolute inset-0 w-full h-full object-cover" />
                                  : gabSkeleton(g)}
                                {gabaritBusy === g && <div className="absolute inset-0 grid place-items-center bg-black/55"><Loader2 className="w-5 h-5 animate-spin text-[#3AFFA3]" /></div>}
                                {selectedGabarit === g && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#3AFFA3] grid place-items-center"><Check className="w-3 h-3 text-[#04130c]" strokeWidth={3} /></span>}
                              </div>
                              <div className="px-1.5 py-1 text-[10.5px] font-medium text-white bg-black/40 truncate">{gabLabels[g] || g}</div>
                            </button>
                          ))}
                        </div>
                        <p className="text-[11.5px] text-slate-500 font-inter flex items-center gap-1.5"><Wand2 className="w-3 h-3 text-[#3AFFA3] shrink-0" />{t('contenus.image.iaEcritTexte')}</p>

                        {/* Photo — uniquement pour les gabarits qui ont une zone photo */}
                        {selectedGabarit && gabPhoto.includes(selectedGabarit) && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">{t('contenus.image.photo')} <span className="normal-case tracking-normal text-slate-600">{t('contenus.image.optionnel')}</span></label>
                            <input ref={refInputRef} type="file" accept="image/*" onChange={importerRef} className="hidden" />
                            <button onClick={() => refInputRef.current?.click()} disabled={refImporting}
                              className="text-xs text-[#3AFFA3] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50">
                              {refImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />} {t('contenus.image.importer')}
                            </button>
                          </div>
                          {inspirations.length === 0 ? (
                            <p className="text-xs text-slate-600 font-inter">{t('contenus.image.importePhotoZone')}</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => setTemplateBg(null)} title={t('contenus.image.pasDePhoto')}
                                className={`w-12 h-12 rounded-lg border-2 grid place-items-center text-[10px] font-medium transition-all ${!templateBg ? 'border-[#3AFFA3] text-[#3AFFA3]' : 'border-white/10 text-slate-500 hover:text-white'}`}>
                                {t('contenus.image.aucune')}
                              </button>
                              {inspirations.map((url) => {
                                const on = templateBg === url;
                                return (
                                  <button key={url} onClick={() => setTemplateBg(on ? null : url)} title={on ? t('contenus.image.photoSelectionnee') : t('contenus.image.utiliserPhoto')}
                                    className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${on ? 'border-[#3AFFA3]' : 'border-white/10 opacity-60 hover:opacity-90'}`}>
                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                    {on && <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#3AFFA3] text-[#0b1322] grid place-items-center text-[10px] font-bold">✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {/* Photo générée par l'IA (si pas dans les références) */}
                          {templateBg && !inspirations.includes(templateBg) && (
                            <div className="flex items-center gap-2">
                              <img src={templateBg} alt="" className="w-12 h-12 rounded-lg object-cover ring-2 ring-[#3AFFA3]" />
                              <span className="text-[11.5px] text-[#3AFFA3]">{t('contenus.image.photoGenereeSelectionnee')}</span>
                            </div>
                          )}
                          {/* Décris la photo -> générée automatiquement au clic sur le bouton principal en bas */}
                          <input value={photoDesc} onChange={(e) => setPhotoDesc(e.target.value)}
                            placeholder={t('contenus.image.decrisPhotoPlaceholder')}
                            className="w-full bg-[#0a0f1c] border border-white/10 rounded-lg text-slate-200 text-[13px] px-3 py-2 outline-none focus:border-[#5B6CFF]/50 placeholder:text-slate-600" />
                          <p className="text-[11px] text-slate-600 font-inter">{t('contenus.image.photoAutoNote')}</p>
                        </div>
                        )}
                      </div>
                    )}

                    {/* MODE TEMPLATE */}
                    {imgMode === 'template' && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">{t('contenus.image.tesTemplates')}</p>
                          <a href="/dashboard/parametres" className="text-[11.5px] text-[#3AFFA3] hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" />{t('contenus.image.nouveau')}</a>
                        </div>
                        {templates.length === 0 ? (
                          <p className="text-xs text-slate-600 font-inter">{t('contenus.image.aucunTemplate')}</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {templates.map((t) => {
                              const sel = activeTemplate === t.id;
                              return (
                                <button key={t.id} onClick={() => appliquerTemplate(t)} title={t.nom}
                                  className={`group relative rounded-lg overflow-hidden border transition-all ${sel ? 'border-[#3AFFA3] ring-2 ring-[#3AFFA3]/30' : 'border-white/10 hover:border-white/25'}`}>
                                  <div className="relative aspect-square bg-[#07070e]">
                                    {t.images?.[0]
                                      ? <img src={t.images[0]} alt={t.nom} className="absolute inset-0 w-full h-full object-cover" />
                                      : <div className="absolute inset-0 grid place-items-center text-slate-600"><ImageIcon className="w-5 h-5" /></div>}
                                    {sel && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#3AFFA3] grid place-items-center"><Check className="w-3 h-3 text-[#04130c]" strokeWidth={3} /></span>}
                                  </div>
                                  <div className="px-1.5 py-1 text-[10.5px] font-medium text-white bg-black/40 truncate">{t.nom}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {activeTemplate && (
                          <div className="space-y-1.5 pt-1">
                            <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">{t('contenus.image.instructionsOptionnel')}</label>
                            <Textarea value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} rows={2}
                              placeholder={t('contenus.image.instructionsPlaceholder')}
                              className="bg-[#0a0f1c] border-white/10 text-slate-200 text-sm rounded-xl focus:border-[#5B6CFF]/50 placeholder:text-slate-600" />
                            <p className="text-[11px] text-slate-600 font-inter">{t('contenus.image.laisseVide')}</p>
                          </div>
                        )}
                        {activeTemplate && (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">
                                {t('contenus.image.imagesReference')} <span className="text-slate-600 normal-case tracking-normal">{selectedRefs.filter((u) => inspirations.includes(u)).length > 1 ? t('contenus.image.choisies', { n: selectedRefs.filter((u) => inspirations.includes(u)).length }) : t('contenus.image.choisie', { n: selectedRefs.filter((u) => inspirations.includes(u)).length })}</span>
                              </label>
                              <input ref={refInputRef} type="file" accept="image/*" onChange={importerRef} className="hidden" />
                              <button onClick={() => refInputRef.current?.click()} disabled={refImporting}
                                className="text-xs text-[#3AFFA3] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50">
                                {refImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />} {t('contenus.image.ajouter')}
                              </button>
                            </div>
                            {inspirations.length === 0 ? (
                              <p className="text-xs text-slate-600 font-inter">{t('contenus.image.aucuneImageInstructions')}</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {inspirations.map((url) => {
                                  const on = selectedRefs.includes(url);
                                  return (
                                    <div key={url} onClick={() => toggleRef(url, true)} title={on ? t('contenus.image.utilisee') : t('contenus.image.nonUtilisee')}
                                      className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 cursor-pointer group transition-all ${on ? 'border-[#3AFFA3]' : 'border-white/10 opacity-50 hover:opacity-80'}`}>
                                      <img src={url} alt="" className="w-full h-full object-cover" />
                                      {on && <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#3AFFA3] text-[#0b1322] grid place-items-center text-[10px] font-bold">✓</span>}
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox({ images: [url], index: 0 }); }} title={t('contenus.image.agrandir')}
                                        className="absolute bottom-0.5 left-0.5 w-4 h-4 rounded bg-black/70 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Search className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <p className="text-[11px] text-slate-600 font-inter">{t('contenus.image.selectionneImageNote')}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MODE IMAGE IA */}
                    {imgMode === 'ia' && (
                      <>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">{t('contenus.image.descriptionImage')}</label>
                            <button onClick={() => chargerPrompt(imageContenu)} disabled={imgLoadingPrompt}
                              className="text-xs text-[#8A6CFF] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50">
                              <Wand2 className="w-3 h-3" /> {t('contenus.image.proposerDescription')}
                            </button>
                          </div>
                          {imgLoadingPrompt ? (
                            <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin text-[#5B6CFF]" /> {t('contenus.image.iaPrepareDescription')}</div>
                          ) : (
                            <Textarea value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} rows={3}
                              className="bg-[#0a0f1c] border-white/10 text-slate-200 text-sm rounded-xl focus:border-[#5B6CFF]/50" />
                          )}
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a0f1c] border border-white/10">
                          <div>
                            <span className="text-sm text-slate-300 font-inter">{t('contenus.image.inclureMaPhoto')}</span>
                            <p className="text-[11px] text-slate-500 font-inter mt-0.5">
                              {user?.photo_url
                                ? t('contenus.image.decocheNote')
                                : t('contenus.image.ajoutePhotoProfil')}
                            </p>
                          </div>
                          <Switch
                            checked={imgAvecPhoto}
                            onCheckedChange={(v) => {
                              if (v && !user?.photo_url) {
                                toast.error(t('contenus.toast.photoProfilRequise'));
                                return;
                              }
                              setImgAvecPhoto(v);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">{t('contenus.image.imagesReference')} <span className="text-slate-600 normal-case tracking-normal">{selectedRefs.length > 1 ? t('contenus.image.choisies', { n: selectedRefs.length }) : t('contenus.image.choisie', { n: selectedRefs.length })}</span></label>
                            <input ref={refInputRef} type="file" accept="image/*" onChange={importerRef} className="hidden" />
                            <button onClick={() => refInputRef.current?.click()} disabled={refImporting}
                              className="text-xs text-[#3AFFA3] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50">
                              {refImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />} {t('contenus.image.ajouter')}
                            </button>
                          </div>
                          {inspirations.length === 0 ? (
                            <p className="text-xs text-slate-600 font-inter">{t('contenus.image.aucuneImageStyle')}</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {inspirations.map((url) => {
                                const on = selectedRefs.includes(url);
                                return (
                                  <div key={url} onClick={() => toggleRef(url)} title={on ? t('contenus.image.utilisee') : t('contenus.image.nonUtilisee')}
                                    className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 cursor-pointer group transition-all ${on ? 'border-[#3AFFA3]' : 'border-white/10 opacity-50 hover:opacity-80'}`}>
                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                    {on && <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#3AFFA3] text-[#0b1322] grid place-items-center text-[10px] font-bold">✓</span>}
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox({ images: [url], index: 0 }); }} title={t('contenus.image.agrandir')}
                                      className="absolute bottom-0.5 left-0.5 w-4 h-4 rounded bg-black/70 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Search className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Qualité (modèle) — Image IA : choix libre */}
                    {/* Qualité (modèle) — Image IA ET Template : choix HD / standard */}
                    {imgMode !== 'gabarit' && (
                      <div className="space-y-2">
                        <p className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">{t('contenus.image.qualite')}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {IMAGE_MODELES.map((m) => (
                            <button key={m.id} onClick={() => setImgModele(m.id)}
                              className={`px-3 py-2 rounded-lg text-[13px] font-medium font-inter border transition-all ${imgModele === m.id ? 'bg-gradient-to-r from-[#5B6CFF]/20 to-[#8A6CFF]/20 text-white border-[#5B6CFF]/50' : 'text-slate-400 border-white/10 hover:text-white hover:border-white/20'}`}>
                              {m.id === 'nano3' ? t('contenus.image.imageHd') : t('contenus.image.imageStandard')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Avertissement : le standard peut faire des fautes d'orthographe sur le texte du gabarit */}
                    {imgMode === 'template' && imgModele === 'nano2' && (
                      <div className="flex items-start gap-2 text-[12px] text-amber-300/90 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-3 py-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                        <span>{t('contenus.image.warnStdA')}<b>{t('contenus.image.warnStdB')}</b>{t('contenus.image.warnStdC')}<b>{t('contenus.image.warnStdD')}</b>{t('contenus.image.warnStdE')}<b>{t('contenus.image.warnStdF')}</b>{t('contenus.image.warnStdG')}</span>
                      </div>
                    )}
                  </div>

                  {/* ---- FOOTER ---- */}
                  <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[12px] text-slate-400 min-w-0">
                      {quotaInfo() ? (
                        <><span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] shadow-[0_0_8px_#3AFFA3] shrink-0" /><span className="truncate"><b className="text-slate-200 font-semibold">{quotaInfo().remaining}</b> {quotaInfo().label} {t('contenus.image.restantes')}</span></>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input ref={imgImportRef} type="file" accept="image/*" onChange={importerImage} className="hidden" data-testid="input-import-image" />
                      {imgMode === 'ia' && (
                        <Button variant="ghost" size="sm" onClick={() => imgImportRef.current?.click()} disabled={imgImporting} className="text-slate-400 hover:text-white font-inter">
                          {imgImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => setImageContenu(null)} className="text-slate-400 font-inter">{t('contenus.actions.fermer')}</Button>
                      <Button onClick={onGenerate} disabled={genDisabled}
                        className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 font-inter shadow-lg shadow-[#5B6CFF]/30">
                        {genBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                        {imageContenu.lien_visuel ? t('contenus.actions.regenerer') : t('contenus.carte.genererVisuel')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Lightbox : agrandir une slide de carrousel (portal sur body pour passer AU-DESSUS du Dialog) */}
        {lightbox && createPortal((
          <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setLightbox(null)}>
            <button onClick={() => setLightbox(null)} title={t('contenus.actions.fermer')}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
              <X className="w-5 h-5" />
            </button>
            {lightbox.images.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); setLightbox((lb) => ({ ...lb, index: (lb.index - 1 + lb.images.length) % lb.images.length })); }}
                title={t('contenus.lightbox.precedent')}
                className="absolute left-3 md:left-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                <ChevronRight className="w-6 h-6 rotate-180" />
              </button>
            )}
            <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <img src={lightbox.images[lightbox.index]} alt={t('contenus.detail.slide', { n: lightbox.index + 1 })}
                className="max-h-[82vh] max-w-[88vw] rounded-xl ring-1 ring-white/15 shadow-2xl" />
              <span className="text-sm text-white/70 font-inter">{lightbox.index + 1} / {lightbox.images.length}</span>
            </div>
            {lightbox.images.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); setLightbox((lb) => ({ ...lb, index: (lb.index + 1) % lb.images.length })); }}
                title={t('contenus.lightbox.suivant')}
                className="absolute right-3 md:right-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        ), document.body)}
      </div>

      <PostManuelDialog open={postManuelOpen} onOpenChange={setPostManuelOpen} onCreated={fetchContenus} />
    </div>
  );
}
