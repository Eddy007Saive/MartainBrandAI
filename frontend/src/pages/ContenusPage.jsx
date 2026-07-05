import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Check, X, Edit2, Trash2, Loader2, Filter, ExternalLink, Link2, FileText, Clock, ChevronRight, Search, RefreshCw, Calendar, Sparkles, ScrollText, Video, Image as ImageIcon, Wand2, LayoutGrid, Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { SocialIcon } from '../components/SocialIcon';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
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
import { contenuService } from '../services/contenuService';
import { agentService } from '../services/agentService';
import { userService } from '../services/userService';
import { templateService } from '../services/templateService';
import { useUser } from '../context/UserContext';
import { ColorField } from '../components/ColorField';
import { CAROUSEL_FONTS, renderSlides, SLIDE_CSS } from '../lib/carrouselPreview';
import { scheduleService } from '../services/scheduleService';

const IMAGE_MODELES = [
  { id: 'nano2', label: 'nano-banana 2.5', cout: 50 },
  { id: 'nano3', label: 'nano-banana 3 (Pro)', cout: 150 },
];

// Clés = valeurs réelles de l'enum statut_contenu en base ; label = affichage
const STATUT_CONFIG = {
  'A tourner': { label: 'À tourner', bg: 'bg-[#8A6CFF]/15', text: 'text-[#b9a6ff]', border: 'border-[#8A6CFF]/30', dot: 'bg-[#8A6CFF]', icon: Video },
  'A valider': { label: 'À valider', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25', dot: 'bg-amber-400', icon: Clock },
  'Valider': { label: 'Validé', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25', dot: 'bg-emerald-400', icon: Check },
  'Planifie': { label: 'Planifié', bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/25', dot: 'bg-purple-400', icon: Calendar },
  'Pret a publier': { label: 'Prêt à publier', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/25', dot: 'bg-cyan-400', icon: Check },
  'Publie': { label: 'Publié', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25', dot: 'bg-blue-400', icon: ExternalLink },
  'Refuse': { label: 'Refusé', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/25', dot: 'bg-red-400', icon: X },
};
const STATUT_DEFAUT = { label: '', bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/25', dot: 'bg-slate-400', icon: FileText };

// Statut de publication (Late)
const PUBLISH_BADGE = {
  envoi: { label: '⏳ Envoi…', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  'programmé': { label: '⏱ Programmé', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  'publié': { label: '✅ Publié', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  partiel: { label: '⚠️ Partiel', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  'échec': { label: '❌ Échec', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  'annulé': { label: 'Annulé', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
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
};

function StatusBadge({ statut }) {
  const config = STATUT_CONFIG[statut] || STATUT_DEFAUT;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium font-inter ${config.bg} ${config.text} border ${config.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label || statut}
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

function StatCard({ value, label, color, borderColor, icon: Icon }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border ${borderColor} ${color} p-5 transition-all duration-300 hover:scale-[1.02]`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold text-white font-sora">{value}</p>
          <p className="text-xs text-slate-400 font-inter mt-1">{label}</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
          <Icon className="w-5 h-5 text-slate-400" />
        </div>
      </div>
    </div>
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

function ContentCard({ contenu, onView, onImage, onRegenCarrousel, carrouselLoading, onEdit, onDelete, onValidate, onRefuse, actionLoading }) {
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
        ) : (
          <div className="absolute inset-0 grid place-items-center text-slate-700"><ImageIcon className="w-8 h-8" /></div>
        )}
        {contenu.reseau_cible && <span className="absolute top-2.5 left-2.5"><ReseauBadge reseau={contenu.reseau_cible} /></span>}
        <span className="absolute top-2.5 right-2.5"><StatusBadge statut={contenu.statut} /></span>
      </div>

      {/* Corps */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="text-left">
          {contenu.titre && <h3 className="text-white font-semibold font-sora text-[13.5px] mb-1 line-clamp-1">{contenu.titre}</h3>}
          <p className="text-slate-400 font-inter text-[12.5px] leading-relaxed line-clamp-3">{contenu.contenu}</p>
        </div>

        <div className="flex items-center gap-1 mt-auto pt-3 border-t border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] text-slate-500 font-inter mr-auto inline-flex items-center gap-1">
            {contenu.date_publication ? <Clock className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}{date}
          </span>
          {isCarrousel ? (
            <CardAction title="Régénérer le carrousel" onClick={() => onRegenCarrousel(contenu)}
              className={contenu.slides_images?.length ? 'text-emerald-400 hover:text-emerald-300' : 'hover:text-white'}>
              {regenLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LayoutGrid className="w-4 h-4" />}
            </CardAction>
          ) : isVideo ? null : (
            <CardAction title={contenu.lien_visuel ? 'Visuel — modifier' : 'Créer le visuel'} onClick={() => onImage(contenu)}
              className={contenu.lien_visuel ? 'text-emerald-400 hover:text-emerald-300' : 'hover:text-white'}>
              <ImageIcon className="w-4 h-4" />
            </CardAction>
          )}
          {contenu.statut === 'A valider' && (
            <>
              <CardAction title="Valider" onClick={() => onValidate(contenu.id)} className="hover:text-emerald-400">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </CardAction>
              <CardAction title="Refuser" onClick={() => onRefuse(contenu.id)} className="hover:text-red-400"><X className="w-4 h-4" /></CardAction>
            </>
          )}
          <CardAction title="Modifier" onClick={() => onEdit(contenu)} className="hover:text-white"><Edit2 className="w-3.5 h-3.5" /></CardAction>
          <CardAction title="Supprimer" onClick={() => onDelete(contenu)} className="hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></CardAction>
        </div>
      </div>
    </div>
  );
}

export default function ContenusPage() {
  const navigate = useNavigate();
  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [filterStatut, setFilterStatut] = useState('all');
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
    } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContenu]);
  // Charge la Google Font choisie pour la retouche
  useEffect(() => {
    const f = czR?.font;
    if (!f) return;
    const id = 'czfont-' + f.replace(/\s/g, '-');
    if (document.getElementById(id)) return;
    const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${f.replace(/\s/g, '+')}:wght@400;500;600;700;800;900&display=swap`;
    document.head.appendChild(l);
  }, [czR?.font]);
  const setCzRColor = (name, val) => setCzR((prev) => ({ ...prev, [name]: val }));
  const retoucherCarrousel = async () => {
    if (!selectedContenu || !czR || czRBusy) return;
    setCzRBusy(true);
    try {
      const d = await agentService.recolorCarrousel(selectedContenu.id, { p: czR.p, s: czR.s, a: czR.a }, czR.font || '');
      const imgs = d.images || [];
      if (imgs.length) {
        const patch = { slides_images: imgs, lien_visuel: imgs[0], carrousel_pdf: d.pdf };
        setContenus((prev) => prev.map((c) => (c.id === selectedContenu.id ? { ...c, ...patch } : c)));
        setSelectedContenu((prev) => (prev ? { ...prev, ...patch } : prev));
        toast.success('Carrousel retouché ✨');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Échec de la retouche');
    } finally { setCzRBusy(false); }
  };
  // Aperçu LIVE (client-side) du vrai carrousel avec la retouche — instantané, sans backend
  const czPreviewSlides = () => {
    if (!selectedContenu || !czR || !selectedContenu.carrousel_data) return null;
    const tpl = czTemplates[(selectedContenu.reseau_cible || '').toLowerCase()] || 'creme';
    return renderSlides(tpl, {
      p: czR.p, s: czR.s, a: czR.a, font: czR.font || '',
      logo: user?.logo_url, nom: user?.nom || user?.username,
      content: selectedContenu.carrousel_data,
    });
  };
  // Validation : rendu final des images avec la retouche, PUIS validation
  const validerContenu = async (id) => {
    if (czR && selectedContenu?.carrousel_data) {
      setCzRBusy(true);
      try { await agentService.recolorCarrousel(id, { p: czR.p, s: czR.s, a: czR.a }, czR.font || ''); }
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
  const [gabaritBusy, setGabaritBusy] = useState(null);
  // Refonte dialog : mode (gabarit | template | ia), gabarit sélectionné, usage pour la pastille de quota
  const [imgMode, setImgMode] = useState('gabarit');
  const [selectedGabarit, setSelectedGabarit] = useState(null);
  const [imgUsage, setImgUsage] = useState(null);
  const [templateBg, setTemplateBg] = useState(null); // photo optionnelle (zone photo du gabarit)
  const [photoDesc, setPhotoDesc] = useState('');     // description -> photo générée par l'IA
  const [photoGenBusy, setPhotoGenBusy] = useState(false);

  const genererPhoto = async () => {
    if (!photoDesc.trim() || photoGenBusy) return;
    setPhotoGenBusy(true);
    try {
      const d = await agentService.generatePhoto(photoDesc, 'nano2');
      setTemplateBg(d.url);
      toast.success('Photo générée ✨');
      refreshUsage();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Échec de la génération de la photo');
    } finally { setPhotoGenBusy(false); }
  };

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
      const bg = templateBg || (selectedRefs && selectedRefs.length ? selectedRefs[0] : null); // photo choisie -> zone photo du gabarit
      const d = await agentService.gabaritAuto(gab, imageContenu.contenu || imageContenu.titre || '', imageContenu.id, bg);
      setContenus((prev) => prev.map((c) => (c.id === imageContenu.id ? { ...c, lien_visuel: d.url } : c)));
      setImageContenu((prev) => (prev ? { ...prev, lien_visuel: d.url } : prev));
      toast.success('Visuel créé ✨');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Échec de la création du visuel');
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
    setSelectedRefs(Array.isArray(t.images) ? t.images : []);
  };

  const importerRef = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Choisissez une image.'); return; }
    setRefImporting(true);
    try {
      const list = await userService.addInspiration(file);
      const urls = list?.images || [];
      setInspirations(urls);
      const added = urls.find((u) => !inspirations.includes(u));
      if (added) setSelectedRefs((prev) => [...prev, added]);
      toast.success('Référence ajoutée');
    } catch (err) {
      toast.error("Échec de l'ajout");
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
      toast.error('Erreur lors de la préparation du prompt');
    } finally {
      setImgLoadingPrompt(false);
    }
  };

  const openImage = (contenu) => {
    setImageContenu(contenu);
    setImgAvecPhoto(!!user?.use_photo);
    setImgModele('nano2');
    setActiveTemplate(null); setStyleNote('');
    setImgMode('gabarit'); setSelectedGabarit(null); setTemplateBg(null); setPhotoDesc('');
    refreshUsage();
    // Charge la bibliothèque de références (inspirations) — tout sélectionné par défaut
    userService.listInspirations()
      .then((d) => {
        const arr = Array.isArray(d) ? d : (d?.images || []);
        setInspirations(arr);
        setSelectedRefs((user?.use_inspirations ?? true) ? arr : []);
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
      const data = await agentService.image(imageContenu.id, imgPrompt, imgAvecPhoto, imgModele, selectedRefs, styleNote || null, !!activeTemplate);
      if (data.credits != null) updateUser({ credits: data.credits });
      setContenus((prev) => prev.map((c) => (c.id === imageContenu.id ? { ...c, lien_visuel: data.lien_visuel, prompt_image: imgPrompt } : c)));
      setImageContenu((prev) => (prev ? { ...prev, lien_visuel: data.lien_visuel, prompt_image: imgPrompt } : prev));
      toast.success('Visuel généré ✨');
      refreshUsage();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Échec de la génération d'image");
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
    if (imgMode === 'gabarit' || !imgUsage?.gauges) return null;
    // Template = HD mais décompté sur le quota standard ; sinon nano3 -> HD (image_pro).
    const at = (imgMode !== 'template' && imgModele === 'nano3') ? 'image_pro' : 'image_standard';
    const g = imgUsage.gauges.find((x) => x.action_type === at);
    return g ? { label: g.label, remaining: Math.max(0, g.limit - g.used) } : null;
  };

  const importerImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !imageContenu) return;
    if (!file.type.startsWith('image/')) { toast.error('Choisissez une image (jpg, png, webp).'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image trop lourde (max 10 Mo).'); return; }
    setImgImporting(true);
    try {
      const data = await contenuService.uploadImage(imageContenu.id, file);
      setContenus((prev) => prev.map((c) => (c.id === imageContenu.id ? { ...c, lien_visuel: data.lien_visuel, statut: data.statut || c.statut, date_publication: data.date_publication || c.date_publication } : c)));
      setImageContenu((prev) => (prev ? { ...prev, lien_visuel: data.lien_visuel } : prev));
      toast.success('Image importée ✓');
    } catch (err) {
      toast.error(err.response?.data?.detail || "Échec de l'import de l'image");
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
      if (imgs.length) toast.success('Carrousel régénéré ✨');
      else toast.warning('Slides non rendues — réessaie');
    } catch (e) {
      if (e.response?.status === 402) toast.error('Crédits insuffisants');
      else toast.error(e.response?.data?.detail || 'Échec de la régénération');
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
      toast.success('Publication programmée ✓ — partira à la date prévue');
    } catch (e) {
      const msg = e.response?.data?.detail || 'Échec de la programmation';
      setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, publish_status: 'échec', publish_error: msg } : c)));
      setSelectedContenu((prev) => (prev && prev.id === contenu.id ? { ...prev, publish_status: 'échec', publish_error: msg } : prev));
      toast.error(msg);
    } finally {
      setPublishLoading(null);
    }
  };

  const annulerPublication = async (contenu) => {
    if (publishLoading) return;
    setPublishLoading(contenu.id);
    try {
      const d = await contenuService.annuler(contenu.id);
      const patch = { publish_status: d.publish_status, late_post_id: null };
      setContenus((prev) => prev.map((c) => (c.id === contenu.id ? { ...c, ...patch } : c)));
      setSelectedContenu((prev) => (prev && prev.id === contenu.id ? { ...prev, ...patch } : prev));
      toast.success('Envoi annulé');
    } catch (e) {
      toast.error(e.response?.data?.detail || "Échec de l'annulation");
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
  }, [filterStatut]);

  const fetchContenus = async () => {
    setLoading(true);
    try {
      const data = await contenuService.getAll(filterStatut);
      setContenus(data);
    } catch (error) {
      toast.error('Erreur lors du chargement des contenus');
    } finally {
      setLoading(false);
    }
  };

  const scripts = useMemo(() => contenus.filter(c => isVideoType(c) && !c.lien_video_dropbox), [contenus]);
  const videos = useMemo(() => contenus.filter(c => isVideoType(c) && !!c.lien_video_dropbox), [contenus]);
  const posts = useMemo(() => contenus.filter(c => !isVideoType(c)), [contenus]);

  const activeContenus = activeTab === 'scripts' ? scripts : activeTab === 'videos' ? videos : activeTab === 'posts' ? posts : contenus;

  const filteredContenus = useMemo(() => {
    if (!searchQuery.trim()) return activeContenus;
    const q = searchQuery.toLowerCase();
    return activeContenus.filter(c =>
      (c.titre && c.titre.toLowerCase().includes(q)) ||
      (c.contenu && c.contenu.toLowerCase().includes(q)) ||
      (c.reseau_cible && c.reseau_cible.toLowerCase().includes(q))
    );
  }, [activeContenus, searchQuery]);

  // Pagination
  const PAGE_SIZE = 6;
  const pageCount = Math.max(1, Math.ceil(filteredContenus.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pagedContenus = filteredContenus.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [searchQuery, activeTab, filterStatut]);

  const handleUpdateStatut = async (id, newStatut) => {
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
          toast.success(datePlanif ? `Validé et programmé pour le ${datePlanif} ✓` : 'Validé et programmé ✓');
        } catch (e) {
          const msg = e.response?.data?.detail || 'Validé, mais la programmation a échoué (réseau connecté ?).';
          setContenus((prev) => prev.map((c) => (c.id === id ? { ...c, statut: 'Valider', date_publication: data.date_publication, publish_status: 'échec', publish_error: msg } : c)));
          toast.error(msg, { duration: 7000 });
        }
        setSelectedContenu(null);
        fetchContenus();
        return;
      }

      if (newStatut === 'Refuse') toast.success('Contenu refusé');
      else toast.success('Contenu mis à jour');
      fetchContenus();
      setSelectedContenu(null);
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
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
      toast.success('Contenu modifié');
      fetchContenus();
      setEditContenu(null);
    } catch (error) {
      toast.error('Erreur lors de la modification');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteContenu) return;
    setActionLoading(deleteContenu.id);
    try {
      await contenuService.remove(deleteContenu.id);
      toast.success('Contenu supprimé');
      fetchContenus();
      setDeleteContenu(null);
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setActionLoading(null);
    }
  };

  const stats = {
    total: activeContenus.length,
    aValider: activeContenus.filter(c => c.statut === 'A valider').length,
    valides: activeContenus.filter(c => c.statut === 'Valider').length,
    publies: activeContenus.filter(c => c.statut === 'Publie').length,
  };

  return (
    <div>
      <div className="w-full space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-sora text-white">Contenus</h1>
            <p className="text-slate-400 font-inter text-sm mt-1">
              Gérez, validez et suivez vos publications
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchContenus}
            disabled={loading}
            className="text-slate-400 hover:text-white self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {/* Tabs: Scripts / Vidéos / Tous */}
        <div className="flex gap-1 p-1 bg-slate-950/60 rounded-xl border border-white/[0.04]">
          {[
            { id: 'scripts', label: 'Scripts', icon: ScrollText, count: scripts.length },
            { id: 'videos', label: 'Vidéos', icon: Video, count: videos.length },
            { id: 'posts', label: 'Posts', icon: FileText, count: posts.length },
            { id: 'all', label: 'Tous', icon: Sparkles, count: contenus.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); setFilterStatut('all'); }}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2.5 rounded-lg text-[13px] sm:text-sm font-inter font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[#5B6CFF]/20 text-white shadow-[0_0_10px_rgba(91,108,255,0.1)]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
              <span className={`hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-[#5B6CFF]/30 text-white' : 'bg-slate-800 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard value={stats.total} label="Total" color="bg-slate-900/60" borderColor="border-white/[0.06]" icon={FileText} />
          <StatCard value={stats.aValider} label="À valider" color="bg-amber-500/[0.06]" borderColor="border-amber-500/20" icon={Clock} />
          <StatCard value={stats.valides} label="Validés" color="bg-emerald-500/[0.06]" borderColor="border-emerald-500/20" icon={Check} />
          <StatCard value={stats.publies} label="Publiés" color="bg-blue-500/[0.06]" borderColor="border-blue-500/20" icon={ExternalLink} />
        </div>

        {/* Toolbar: search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher un contenu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border border-white/[0.06] text-slate-200 text-sm font-inter placeholder:text-slate-600 focus:outline-none focus:border-[#5B6CFF]/50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <Select value={filterStatut} onValueChange={setFilterStatut}>
              <SelectTrigger className="w-[180px] bg-slate-900/60 border-white/[0.06] text-slate-200 rounded-xl">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="all" className="text-slate-200">Tous ({stats.total})</SelectItem>
                <SelectItem value="A valider" className="text-slate-200">À valider ({stats.aValider})</SelectItem>
                <SelectItem value="Valider" className="text-slate-200">Validés ({stats.valides})</SelectItem>
                <SelectItem value="Publie" className="text-slate-200">Publiés ({stats.publies})</SelectItem>
                <SelectItem value="Refuse" className="text-slate-200">Refusés</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
            <p className="text-sm text-slate-500 font-inter">Chargement des contenus...</p>
          </div>
        ) : filteredContenus.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 bg-slate-900/30 border border-white/[0.04] rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/50 flex items-center justify-center">
              <FileText className="w-7 h-7 text-slate-600" />
            </div>
            <div className="text-center">
              <p className="text-slate-400 font-inter font-medium">
                {activeTab === 'scripts' ? 'Aucun script vidéo' : activeTab === 'videos' ? 'Aucune vidéo trouvée' : activeTab === 'posts' ? 'Aucun post trouvé' : 'Aucun contenu trouvé'}
              </p>
              <p className="text-slate-600 font-inter text-sm mt-1">
                {searchQuery ? 'Essayez avec d\'autres termes de recherche' : activeTab === 'scripts' ? 'Les scripts vidéo à valider ou tourner apparaîtront ici' : activeTab === 'videos' ? 'Les vidéos tournées avec lien Dropbox apparaîtront ici' : activeTab === 'posts' ? 'Vos posts générés apparaîtront ici' : 'Vos contenus générés apparaîtront ici'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-inter">{filteredContenus.length} contenu{filteredContenus.length > 1 ? 's' : ''}{pageCount > 1 ? ` · page ${pageSafe}/${pageCount}` : ''}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
                  actionLoading={actionLoading}
                />
              ))}
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-3">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe === 1}
                  className="h-9 px-3 rounded-lg border border-white/[0.08] bg-slate-900/60 text-slate-300 text-sm font-inter hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  ‹ Précédent
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`h-9 w-9 rounded-lg text-sm font-semibold font-inter transition-colors ${n === pageSafe ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'border border-white/[0.08] bg-slate-900/60 text-slate-400 hover:bg-white/[0.06]'}`}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={pageSafe === pageCount}
                  className="h-9 px-3 rounded-lg border border-white/[0.08] bg-slate-900/60 text-slate-300 text-sm font-inter hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Suivant ›
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
                      {selectedContenu.titre || 'Détail du contenu'}
                    </DialogTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <StatusBadge statut={selectedContenu.statut} />
                      {selectedContenu.reseau_cible && <ReseauBadge reseau={selectedContenu.reseau_cible} />}
                      {selectedContenu.type && (
                        <span className="text-[10px] text-slate-500 font-inter bg-slate-800/80 px-2 py-1 rounded-md border border-white/5">{selectedContenu.type}</span>
                      )}
                      {PUBLISH_BADGE[selectedContenu.publish_status] && (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium font-inter border ${PUBLISH_BADGE[selectedContenu.publish_status].cls}`}>
                          {PUBLISH_BADGE[selectedContenu.publish_status].label}
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
                        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-2 flex items-center gap-1.5"><ScrollText className="w-3.5 h-3.5" />Ton script</p>
                        <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300 font-inter max-h-[44vh] overflow-y-auto">{selectedContenu.script || '—'}</pre>
                      </div>
                      <button onClick={() => navigate(`/dashboard/video?contenu_id=${selectedContenu.id}`)}
                        className="w-full rounded-xl py-3 font-sora font-semibold text-white bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 flex items-center justify-center gap-2 transition-opacity">
                        <Video className="w-4 h-4" /> Monter la vidéo
                      </button>
                    </div>
                  ) : selectedContenu.video_url ? (
                    // Vidéo / Reel montée (Studio Vidéo)
                    <video src={selectedContenu.video_url} controls className="w-full max-h-[70vh] rounded-xl bg-black object-contain" poster={selectedContenu.lien_visuel || undefined} />
                  ) : selectedContenu.video_status === 'en_traitement' ? (
                    <div className="w-full aspect-[9/16] max-h-[70vh] rounded-xl bg-slate-800/40 border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-7 h-7 animate-spin text-[#8A6CFF]" />
                      <span className="text-xs font-inter">Montage vidéo en cours…</span>
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
                                <button key={i} onClick={() => setCzSlide(i)} title={`slide ${i + 1}`}
                                  className={`rounded-md overflow-hidden border transition-all ${i === idx ? 'border-[#3AFFA3] ring-1 ring-[#3AFFA3]/40' : 'border-white/10 opacity-60 hover:opacity-100'}`}
                                  style={{ width: 32, height: 40 }}>
                                  <div className="origin-top-left" style={{ transform: 'scale(0.16)', width: 200, height: 250 }} dangerouslySetInnerHTML={{ __html: slides[i] }} />
                                </button>
                              ))}
                            </div>
                            <p className="text-[11px] text-[#3AFFA3] text-center font-inter flex items-center justify-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] shadow-[0_0_8px_#3AFFA3]" />Aperçu live — reflète ta retouche
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
                          <img src={u} alt={`slide ${i + 1}`} className="w-full object-cover group-hover:scale-[1.03] transition-transform" />
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
                      <span className="text-xs font-inter">Aucun visuel</span>
                    </div>
                  )}

                  {/* Générer / changer le visuel — posts image (pas carrousel, pas vidéo) */}
                  {!(Array.isArray(selectedContenu.slides_images) && selectedContenu.slides_images.length)
                    && !selectedContenu.carrousel_pdf && !selectedContenu.video_url
                    && selectedContenu.type !== 'Reel' && selectedContenu.type !== 'Video' && (
                    <Button size="sm" onClick={() => { const c = selectedContenu; setSelectedContenu(null); openImage(c); }}
                      className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white font-sora font-semibold rounded-[11px] hover:-translate-y-px transition-all">
                      <Wand2 className="w-4 h-4 mr-1.5" />{selectedContenu.lien_visuel ? 'Changer / régénérer le visuel' : 'Générer une image'}
                    </Button>
                  )}

                  {/* Retouche couleurs/police du carrousel (re-render, texte inchangé) */}
                  {czR && (
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Retoucher</span>
                        <span className="text-[10.5px] text-[#3AFFA3] font-semibold">↑ aperçu instantané</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <ColorField label="Fond" name="p" value={czR.p} onChange={setCzRColor} />
                        <ColorField label="Secondaire" name="s" value={czR.s} onChange={setCzRColor} />
                        <ColorField label="Accent" name="a" value={czR.a} onChange={setCzRColor} />
                      </div>
                      <select value={czR.font || ''} onChange={(e) => setCzRColor('font', e.target.value)}
                        className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
                        {CAROUSEL_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                      <p className="text-[11px] text-slate-600 font-inter">Le texte ne change pas. Les images finales sont rendues à la <b className="text-slate-400">validation</b>.</p>
                    </div>
                  )}

                  {/* PDF carrousel (post document LinkedIn) */}
                  {selectedContenu.carrousel_pdf && (
                    <a href={selectedContenu.carrousel_pdf} target="_blank" rel="noopener noreferrer" download
                      className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-slate-200 text-sm font-inter py-2.5 transition-colors">
                      <FileText className="w-4 h-4 text-[#5B6CFF]" />
                      Télécharger le PDF <span className="text-slate-500">(document LinkedIn)</span>
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
                        <p className="font-semibold font-sora text-sm">Publication en ligne</p>
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
                        <p className="font-semibold font-sora text-sm">Vidéo Dropbox</p>
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
                        <p className="text-[10.5px] uppercase tracking-[0.16em] text-slate-500 font-semibold mb-2.5">Texte du post</p>
                        <p className="text-slate-200 font-inter text-[14px] leading-relaxed whitespace-pre-wrap">{selectedContenu.contenu}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-[#0a0f1c] rounded-lg p-3 border border-white/[0.08]">
                          <p className="text-[10px] uppercase tracking-wider text-slate-600 font-inter mb-1">Créé le</p>
                          <p className="text-slate-300 text-[13px] font-inter tabular-nums">{new Date(selectedContenu.created_at).toLocaleString('fr-FR')}</p>
                        </div>
                        {selectedContenu.date_publication && (
                          <div className="bg-[#0a0f1c] rounded-lg p-3 border border-white/[0.08]">
                            <p className="text-[10px] uppercase tracking-wider text-slate-600 font-inter mb-1">Publication</p>
                            <p className="text-[#3AFFA3] text-[13px] font-inter tabular-nums">{new Date(selectedContenu.date_publication).toLocaleString('fr-FR')}</p>
                          </div>
                        )}
                        {selectedContenu.callback_url && (
                          <div className="col-span-2 bg-[#0a0f1c] rounded-lg p-3 border border-white/[0.08]">
                            <p className="text-[10px] uppercase tracking-wider text-slate-600 font-inter mb-1">Webhook</p>
                            <p className="text-emerald-400 text-xs truncate font-inter">{selectedContenu.callback_url}</p>
                          </div>
                        )}
                      </div>
                      {selectedContenu.publish_status === 'échec' && selectedContenu.publish_error && (
                        <div className="flex gap-2.5 items-start p-3 rounded-lg bg-red-500/[0.07] border border-red-500/20">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                          <p className="text-[12px] text-red-300/90 leading-relaxed"><b className="text-red-200">Publication en échec.</b> {selectedContenu.publish_error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* FOOTER : actions */}
                <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between gap-3 bg-[#0a0f1c]">
                  <span className="text-[11.5px] text-slate-500 font-inter truncate">
                    {czR ? 'Images finales rendues à la validation' : ''}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button size="sm" onClick={() => { const c = selectedContenu; setSelectedContenu(null); setDeleteContenu(c); }}
                      className="bg-transparent text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent font-inter mr-auto">
                      <Trash2 className="w-4 h-4 mr-1.5" />Supprimer</Button>
                    {selectedContenu.video_url && selectedContenu.statut !== 'Publie' && (
                      <Button size="sm" onClick={() => navigate(`/dashboard/video?contenu_id=${selectedContenu.id}`)}
                        className="bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 font-sora font-semibold rounded-[11px]">
                        <Video className="w-4 h-4 mr-1.5" />Modifier la vidéo</Button>
                    )}
                    {selectedContenu.statut === 'A valider' && (
                      <>
                        <Button size="sm" onClick={() => handleUpdateStatut(selectedContenu.id, 'Refuse')} disabled={actionLoading === selectedContenu.id}
                          className="bg-transparent border border-white/[0.12] text-slate-400 hover:text-white hover:border-white/25 font-sora font-semibold rounded-[11px] px-4 transition-colors"><X className="w-4 h-4 mr-1.5" />Refuser</Button>
                        <Button size="sm" onClick={() => validerContenu(selectedContenu.id)}
                          disabled={actionLoading === selectedContenu.id || czRBusy || ((selectedContenu.type === 'Reel' || selectedContenu.video_status) && !selectedContenu.video_url)}
                          title={((selectedContenu.type === 'Reel' || selectedContenu.video_status) && !selectedContenu.video_url) ? 'Attends la fin du montage vidéo avant de publier' : undefined}
                          className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white font-sora font-semibold rounded-[11px] px-5 shadow-[0_8px_24px_rgba(91,108,255,0.35)] hover:-translate-y-px hover:shadow-[0_12px_30px_rgba(91,108,255,0.45)] transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none">
                          {((selectedContenu.type === 'Reel' || selectedContenu.video_status) && !selectedContenu.video_url)
                            ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Montage en cours…</>
                            : <>{(actionLoading === selectedContenu.id || czRBusy) ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}Valider &amp; programmer</>}</Button>
                      </>
                    )}
                    {selectedContenu.statut !== 'Publie' && selectedContenu.statut !== 'A valider' && selectedContenu.reseau_cible
                      && ['', null, undefined, 'échec', 'annulé'].includes(selectedContenu.publish_status) && (
                      <Button size="sm" onClick={() => programmerPublication(selectedContenu)} disabled={publishLoading === selectedContenu.id}
                        title={selectedContenu.publish_status === 'échec' ? selectedContenu.publish_error : 'Envoyer dans la file de publication'}
                        className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-500/30 font-inter">
                        {publishLoading === selectedContenu.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
                        {selectedContenu.publish_status === 'échec' ? 'Réessayer' : 'Programmer'}</Button>
                    )}
                    {['envoi', 'programmé'].includes(selectedContenu.publish_status) && (
                      <Button size="sm" onClick={() => annulerPublication(selectedContenu)} disabled={publishLoading === selectedContenu.id}
                        className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 font-inter">
                        {publishLoading === selectedContenu.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <X className="w-4 h-4 mr-1.5" />}Annuler l'envoi</Button>
                    )}
                    {selectedContenu.statut === 'Publie' && selectedContenu.lien_publication && (
                      <a href={selectedContenu.lien_publication} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 font-inter"><ExternalLink className="w-4 h-4 mr-1.5" />Voir</Button>
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
              <DialogTitle className="text-white font-sora">Modifier le contenu</DialogTitle>
            </DialogHeader>
            {editContenu && (
              <div className="space-y-4">
                <Textarea
                  value={editContenu.contenu || ''}
                  onChange={(e) => setEditContenu({ ...editContenu, contenu: e.target.value })}
                  rows={10}
                  className="bg-slate-900/80 border-slate-800 text-slate-200 font-inter text-sm rounded-xl focus:border-[#5B6CFF]/50"
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditContenu(null)} className="font-inter text-slate-400">
                Annuler
              </Button>
              <Button
                onClick={handleEdit}
                disabled={actionLoading === editContenu?.id}
                className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white font-inter"
              >
                {actionLoading === editContenu?.id && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteContenu} onOpenChange={() => setDeleteContenu(null)}>
          <AlertDialogContent className="bg-[#0f172a] border-slate-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white font-sora">Supprimer ce contenu ?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400 font-inter">
                Cette action est irréversible. Le contenu sera définitivement supprimé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 font-inter">
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 font-inter">
                Supprimer
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
                    <span className="text-[10.5px] tracking-[0.18em] uppercase text-slate-500 font-semibold">Aperçu</span>
                    {imageContenu.lien_visuel && (
                      <a href={imageContenu.lien_visuel} target="_blank" rel="noreferrer"
                        className="w-8 h-8 rounded-lg border border-white/10 grid place-items-center text-slate-400 hover:text-white hover:border-white/20" title="Ouvrir / télécharger">
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
                          Choisis un gabarit, un template,<br />ou décris ton image.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ---- CONTRÔLES ---- */}
                <div className="flex-1 md:w-[56%] flex flex-col min-h-0">
                  <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10 space-y-0 text-left">
                    <DialogTitle className="text-white font-sora text-[17px]">Créer le visuel</DialogTitle>
                    <p className="text-[12px] text-slate-500 font-inter">{user?.nom || 'Ta marque'} · feed cohérent</p>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {/* Toggle de mode */}
                    <div className="grid grid-cols-3 gap-1 p-1 bg-[#0a0f1c] border border-white/10 rounded-xl">
                      {[['gabarit', 'Gabarit', LayoutGrid], ['template', 'Template', ScrollText], ['ia', 'Image IA', Wand2]].map(([m, lbl, Icon]) => (
                        <button key={m} onClick={() => setMode(m)}
                          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium font-inter transition-all ${imgMode === m ? 'bg-[#5B6CFF]/15 text-white border border-[#5B6CFF]/40' : 'text-slate-400 border border-transparent hover:text-white'}`}>
                          <Icon className="w-3.5 h-3.5" />{lbl}
                        </button>
                      ))}
                    </div>

                    {/* MODE GABARIT */}
                    {imgMode === 'gabarit' && (
                      <div className="space-y-2.5">
                        <p className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">Mise en page</p>
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
                        <p className="text-[11.5px] text-slate-500 font-inter flex items-center gap-1.5"><Wand2 className="w-3 h-3 text-[#3AFFA3] shrink-0" />L'IA écrit le texte depuis ton post et le pose sur le gabarit.</p>

                        {/* Photo (pour les gabarits avec zone photo : Texte+photo, Citation, Humain, Mission…) */}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">Photo <span className="normal-case tracking-normal text-slate-600">· optionnel</span></label>
                            <input ref={refInputRef} type="file" accept="image/*" onChange={importerRef} className="hidden" />
                            <button onClick={() => refInputRef.current?.click()} disabled={refImporting}
                              className="text-xs text-[#3AFFA3] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50">
                              {refImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />} Importer
                            </button>
                          </div>
                          {inspirations.length === 0 ? (
                            <p className="text-xs text-slate-600 font-inter">Importe une photo : elle ira dans la zone photo du gabarit.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => setTemplateBg(null)} title="Pas de photo"
                                className={`w-12 h-12 rounded-lg border-2 grid place-items-center text-[10px] font-medium transition-all ${!templateBg ? 'border-[#3AFFA3] text-[#3AFFA3]' : 'border-white/10 text-slate-500 hover:text-white'}`}>
                                Aucune
                              </button>
                              {inspirations.map((url) => {
                                const on = templateBg === url;
                                return (
                                  <button key={url} onClick={() => setTemplateBg(on ? null : url)} title={on ? 'Photo sélectionnée' : 'Utiliser cette photo'}
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
                              <span className="text-[11.5px] text-[#3AFFA3]">Photo générée sélectionnée</span>
                            </div>
                          )}
                          {/* Décris la photo -> génération IA (Nano Banana) */}
                          <div className="flex items-center gap-2 pt-0.5">
                            <input value={photoDesc} onChange={(e) => setPhotoDesc(e.target.value)}
                              placeholder="Ou décris la photo à générer…"
                              className="flex-1 bg-[#0a0f1c] border border-white/10 rounded-lg text-slate-200 text-[13px] px-3 py-2 outline-none focus:border-[#5B6CFF]/50 placeholder:text-slate-600" />
                            <button onClick={genererPhoto} disabled={photoGenBusy || !photoDesc.trim()}
                              className="shrink-0 inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-2 rounded-lg border border-[#3AFFA3]/40 text-[#3AFFA3] hover:bg-[#3AFFA3]/10 disabled:opacity-50">
                              {photoGenBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Générer
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-600 font-inter">La description est envoyée à l'IA (Nano Banana) — consomme 1 image standard.</p>
                        </div>
                      </div>
                    )}

                    {/* MODE TEMPLATE */}
                    {imgMode === 'template' && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">Tes templates de marque</p>
                          <a href="/dashboard/parametres" className="text-[11.5px] text-[#3AFFA3] hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" />Nouveau</a>
                        </div>
                        {templates.length === 0 ? (
                          <p className="text-xs text-slate-600 font-inter">Aucun template. Crée-en un dans Paramètres → Style &amp; Couleurs.</p>
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
                            <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">Instructions (optionnel)</label>
                            <Textarea value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} rows={2}
                              placeholder="Ex : mets la photo de référence dans le cercle, garde le fond bleu…"
                              className="bg-[#0a0f1c] border-white/10 text-slate-200 text-sm rounded-xl focus:border-[#5B6CFF]/50 placeholder:text-slate-600" />
                            <p className="text-[11px] text-slate-600 font-inter">Laisse vide pour un rendu standard (l'IA reprend le texte du post).</p>
                          </div>
                        )}
                        {activeTemplate && (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">
                                Images de référence <span className="text-slate-600 normal-case tracking-normal">· {selectedRefs.filter((u) => inspirations.includes(u)).length} choisie{selectedRefs.filter((u) => inspirations.includes(u)).length > 1 ? 's' : ''}</span>
                              </label>
                              <input ref={refInputRef} type="file" accept="image/*" onChange={importerRef} className="hidden" />
                              <button onClick={() => refInputRef.current?.click()} disabled={refImporting}
                                className="text-xs text-[#3AFFA3] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50">
                                {refImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />} Ajouter
                              </button>
                            </div>
                            {inspirations.length === 0 ? (
                              <p className="text-xs text-slate-600 font-inter">Aucune image. Ajoute-en une à intégrer via tes instructions.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {inspirations.map((url) => {
                                  const on = selectedRefs.includes(url);
                                  return (
                                    <button key={url} onClick={() => toggleRef(url, true)} title={on ? 'Utilisée' : 'Non utilisée'}
                                      className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${on ? 'border-[#3AFFA3]' : 'border-white/10 opacity-50 hover:opacity-80'}`}>
                                      <img src={url} alt="" className="w-full h-full object-cover" />
                                      {on && <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#3AFFA3] text-[#0b1322] grid place-items-center text-[10px] font-bold">✓</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            <p className="text-[11px] text-slate-600 font-inter">Sélectionne une image, puis dis à l'IA quoi en faire dans « Instructions » (ex. « mets-la dans le cercle »).</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MODE IMAGE IA */}
                    {imgMode === 'ia' && (
                      <>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">Description de l'image</label>
                            <button onClick={() => chargerPrompt(imageContenu)} disabled={imgLoadingPrompt}
                              className="text-xs text-[#8A6CFF] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50">
                              <Wand2 className="w-3 h-3" /> Proposer une description
                            </button>
                          </div>
                          {imgLoadingPrompt ? (
                            <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin text-[#5B6CFF]" /> L'IA prépare la description…</div>
                          ) : (
                            <Textarea value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} rows={3}
                              className="bg-[#0a0f1c] border-white/10 text-slate-200 text-sm rounded-xl focus:border-[#5B6CFF]/50" />
                          )}
                        </div>
                        {user?.use_photo && (
                          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a0f1c] border border-white/10">
                            <span className="text-sm text-slate-300 font-inter">Inclure ma photo</span>
                            <Switch checked={imgAvecPhoto} onCheckedChange={setImgAvecPhoto} />
                          </div>
                        )}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">Images de référence <span className="text-slate-600 normal-case tracking-normal">· {selectedRefs.length} choisie{selectedRefs.length > 1 ? 's' : ''}</span></label>
                            <input ref={refInputRef} type="file" accept="image/*" onChange={importerRef} className="hidden" />
                            <button onClick={() => refInputRef.current?.click()} disabled={refImporting}
                              className="text-xs text-[#3AFFA3] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50">
                              {refImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />} Ajouter
                            </button>
                          </div>
                          {inspirations.length === 0 ? (
                            <p className="text-xs text-slate-600 font-inter">Aucune image. Ajoute-en une pour guider le style.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {inspirations.map((url) => {
                                const on = selectedRefs.includes(url);
                                return (
                                  <button key={url} onClick={() => toggleRef(url)} title={on ? 'Utilisée' : 'Non utilisée'}
                                    className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${on ? 'border-[#3AFFA3]' : 'border-white/10 opacity-50 hover:opacity-80'}`}>
                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                    {on && <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#3AFFA3] text-[#0b1322] grid place-items-center text-[10px] font-bold">✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Qualité (modèle) — Image IA : choix libre */}
                    {imgMode === 'ia' && (
                      <div className="space-y-2">
                        <p className="text-[11px] tracking-[0.14em] uppercase text-slate-500 font-semibold">Qualité</p>
                        <div className="grid grid-cols-2 gap-2">
                          {IMAGE_MODELES.map((m) => (
                            <button key={m.id} onClick={() => setImgModele(m.id)}
                              className={`px-3 py-2 rounded-lg text-[13px] font-medium font-inter border transition-all ${imgModele === m.id ? 'bg-gradient-to-r from-[#5B6CFF]/20 to-[#8A6CFF]/20 text-white border-[#5B6CFF]/50' : 'text-slate-400 border-white/10 hover:text-white hover:border-white/20'}`}>
                              {m.id === 'nano3' ? 'Image HD' : 'Image standard'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Template -> HD imposé (le standard fait des fautes d'orthographe sur le texte du gabarit) */}
                    {imgMode === 'template' && (
                      <div className="flex items-start gap-2 text-[12px] text-slate-400 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] shadow-[0_0_8px_#3AFFA3] shrink-0 mt-1.5" />
                        <span>Génération en <b className="text-slate-200">Image HD</b> — imposée pour les templates (évite les fautes d'orthographe sur le texte).</span>
                      </div>
                    )}
                  </div>

                  {/* ---- FOOTER ---- */}
                  <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[12px] text-slate-400 min-w-0">
                      {imgMode === 'gabarit' ? (
                        <span className="text-slate-500 truncate">Inclus dans ton offre</span>
                      ) : quotaInfo() ? (
                        <><span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] shadow-[0_0_8px_#3AFFA3] shrink-0" /><span className="truncate"><b className="text-slate-200 font-semibold">{quotaInfo().remaining}</b> {quotaInfo().label} restantes</span></>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input ref={imgImportRef} type="file" accept="image/*" onChange={importerImage} className="hidden" data-testid="input-import-image" />
                      {imgMode === 'ia' && (
                        <Button variant="ghost" size="sm" onClick={() => imgImportRef.current?.click()} disabled={imgImporting} className="text-slate-400 hover:text-white font-inter">
                          {imgImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => setImageContenu(null)} className="text-slate-400 font-inter">Fermer</Button>
                      <Button onClick={onGenerate} disabled={genDisabled}
                        className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 font-inter shadow-lg shadow-[#5B6CFF]/30">
                        {genBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                        {imageContenu.lien_visuel ? 'Régénérer' : 'Générer le visuel'}
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
            <button onClick={() => setLightbox(null)} title="Fermer"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
              <X className="w-5 h-5" />
            </button>
            {lightbox.images.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); setLightbox((lb) => ({ ...lb, index: (lb.index - 1 + lb.images.length) % lb.images.length })); }}
                title="Précédent"
                className="absolute left-3 md:left-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                <ChevronRight className="w-6 h-6 rotate-180" />
              </button>
            )}
            <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <img src={lightbox.images[lightbox.index]} alt={`slide ${lightbox.index + 1}`}
                className="max-h-[82vh] max-w-[88vw] rounded-xl ring-1 ring-white/15 shadow-2xl" />
              <span className="text-sm text-white/70 font-inter">{lightbox.index + 1} / {lightbox.images.length}</span>
            </div>
            {lightbox.images.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); setLightbox((lb) => ({ ...lb, index: (lb.index + 1) % lb.images.length })); }}
                title="Suivant"
                className="absolute right-3 md:right-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        ), document.body)}
      </div>
    </div>
  );
}
