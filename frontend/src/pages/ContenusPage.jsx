import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Edit2, Trash2, Loader2, Filter, ExternalLink, Link2, FileText, Clock, ChevronRight, Search, RefreshCw, Calendar, Sparkles, ScrollText, Video, Image as ImageIcon, Wand2, LayoutGrid } from 'lucide-react';
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
import { useUser } from '../context/UserContext';

const IMAGE_MODELES = [
  { id: 'nano2', label: 'nano-banana 2.5', cout: 50 },
  { id: 'nano3', label: 'nano-banana 3 (Pro)', cout: 150 },
];

// Clés = valeurs réelles de l'enum statut_contenu en base ; label = affichage
const STATUT_CONFIG = {
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
          ) : (
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
  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [filterStatut, setFilterStatut] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContenu, setSelectedContenu] = useState(null);
  const [editContenu, setEditContenu] = useState(null);
  const [deleteContenu, setDeleteContenu] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [carrouselLoading, setCarrouselLoading] = useState(null);
  const [publishLoading, setPublishLoading] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { images:[], index:0 }

  const { user, updateUser } = useUser();
  const [imageContenu, setImageContenu] = useState(null);
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgAvecPhoto, setImgAvecPhoto] = useState(false);
  const [imgModele, setImgModele] = useState('nano2');
  const [imgLoadingPrompt, setImgLoadingPrompt] = useState(false);
  const [imgGenerating, setImgGenerating] = useState(false);
  const [imgImporting, setImgImporting] = useState(false);
  const imgImportRef = useRef(null);

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
    if (contenu.prompt_image) {
      setImgPrompt(contenu.prompt_image);           // déjà généré → on réutilise (zéro régénération)
    } else {
      setImgPrompt('');
      if (!contenu.lien_visuel) chargerPrompt(contenu); // 1ʳᵉ fois seulement → on prépare la description
    }
  };

  const genererImage = async () => {
    if (!imageContenu || !imgPrompt.trim()) return;
    setImgGenerating(true);
    try {
      const data = await agentService.image(imageContenu.id, imgPrompt, imgAvecPhoto, imgModele);
      if (data.credits != null) updateUser({ credits: data.credits });
      setContenus((prev) => prev.map((c) => (c.id === imageContenu.id ? { ...c, lien_visuel: data.lien_visuel, prompt_image: imgPrompt } : c)));
      setImageContenu((prev) => (prev ? { ...prev, lien_visuel: data.lien_visuel, prompt_image: imgPrompt } : prev));
      toast.success('Visuel généré ✨');
    } catch (e) {
      if (e.response?.status === 402) toast.error('Crédits insuffisants');
      else toast.error(e.response?.data?.detail || "Échec de la génération d'image");
    } finally {
      setImgGenerating(false);
    }
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

  const handleUpdateStatut = async (id, newStatut) => {
    setActionLoading(id);
    try {
      const data = await contenuService.update(id, { statut: newStatut });
      const datePlanif = data?.date_publication
        ? new Date(data.date_publication).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
        : null;
      if (data.webhook_result) {
        if (data.webhook_result.success) {
          toast.success('Contenu validé et webhook déclenché avec succès');
        } else {
          toast.warning('Contenu validé mais le webhook a échoué');
        }
      } else if (newStatut === 'Valider' && datePlanif) {
        toast.success(`Contenu validé — planifié le ${datePlanif}`);
      } else if (newStatut === 'Refuse') {
        toast.success('Contenu refusé');
      } else {
        toast.success('Contenu validé');
      }
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
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-inter font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[#5B6CFF]/20 text-white shadow-[0_0_10px_rgba(91,108,255,0.1)]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
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
            <p className="text-xs text-slate-500 font-inter">{filteredContenus.length} contenu{filteredContenus.length > 1 ? 's' : ''}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredContenus.map((contenu) => (
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
          </div>
        )}

        {/* View Dialog */}
        <Dialog open={!!selectedContenu} onOpenChange={() => setSelectedContenu(null)}>
          <DialogContent className="bg-[#0f172a] border-slate-800 max-w-4xl max-h-[88vh] overflow-y-auto">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-white font-sora text-lg pr-8 leading-snug">
                {selectedContenu?.titre || 'Détail du contenu'}
              </DialogTitle>
              {/* Barre du haut : badges + actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge statut={selectedContenu?.statut} />
                  {selectedContenu?.reseau_cible && <ReseauBadge reseau={selectedContenu.reseau_cible} />}
                  {selectedContenu?.type && (
                    <span className="text-[10px] text-slate-500 font-inter bg-slate-800/80 px-2 py-1 rounded-md border border-white/5">
                      {selectedContenu.type}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedContenu?.statut === 'A valider' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleUpdateStatut(selectedContenu.id, 'Valider')}
                        disabled={actionLoading === selectedContenu?.id}
                        className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 font-inter"
                      >
                        {actionLoading === selectedContenu?.id ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        ) : (
                          <Check className="w-4 h-4 mr-1.5" />
                        )}
                        Valider
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleUpdateStatut(selectedContenu.id, 'Refuse')}
                        disabled={actionLoading === selectedContenu?.id}
                        className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 font-inter"
                      >
                        <X className="w-4 h-4 mr-1.5" />
                        Refuser
                      </Button>
                    </>
                  )}
                  {/* Statut de publication (Late) */}
                  {PUBLISH_BADGE[selectedContenu?.publish_status] && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium font-inter border ${PUBLISH_BADGE[selectedContenu.publish_status].cls}`}>
                      {PUBLISH_BADGE[selectedContenu.publish_status].label}
                    </span>
                  )}
                  {/* Programmer / Réessayer (états non actifs) */}
                  {selectedContenu?.statut !== 'Publie' && selectedContenu?.reseau_cible
                    && ['', null, undefined, 'échec', 'annulé'].includes(selectedContenu?.publish_status) && (
                    <Button size="sm" onClick={() => programmerPublication(selectedContenu)}
                      disabled={publishLoading === selectedContenu?.id}
                      title={selectedContenu?.publish_status === 'échec' ? selectedContenu?.publish_error : 'Envoyer dans la file de publication (part à la date prévue)'}
                      className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-500/30 font-inter">
                      {publishLoading === selectedContenu?.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
                      {selectedContenu?.publish_status === 'échec' ? 'Réessayer' : 'Programmer'}
                    </Button>
                  )}
                  {/* Annuler l'envoi (en file) */}
                  {['envoi', 'programmé'].includes(selectedContenu?.publish_status) && (
                    <Button size="sm" onClick={() => annulerPublication(selectedContenu)}
                      disabled={publishLoading === selectedContenu?.id}
                      className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 font-inter">
                      {publishLoading === selectedContenu?.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <X className="w-4 h-4 mr-1.5" />}
                      Annuler l'envoi
                    </Button>
                  )}
                  {selectedContenu?.statut === 'Publie' && selectedContenu?.lien_publication && (
                    <a href={selectedContenu.lien_publication} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" className="bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 font-inter">
                        <ExternalLink className="w-4 h-4 mr-1.5" />
                        Voir
                      </Button>
                    </a>
                  )}
                </div>
                {selectedContenu?.publish_status === 'échec' && selectedContenu?.publish_error && (
                  <p className="text-[12px] text-red-400 font-inter mt-2">⚠ Échec : {selectedContenu.publish_error}</p>
                )}
              </div>
            </DialogHeader>

            {selectedContenu && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-1">
                {/* Colonne gauche : visuel + liens */}
                <div className="space-y-3">
                  {Array.isArray(selectedContenu.slides_images) && selectedContenu.slides_images.length > 0 ? (
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

                {/* Colonne droite : texte + méta */}
                <div className="space-y-4">
                  <div className="bg-slate-800/30 rounded-xl p-5 border border-white/[0.04] max-h-[48vh] overflow-y-auto">
                    <p className="text-slate-200 font-inter text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedContenu.contenu}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/20 rounded-lg p-3 border border-white/[0.03]">
                      <p className="text-[10px] uppercase tracking-wider text-slate-600 font-inter mb-1">Créé le</p>
                      <p className="text-slate-300 text-sm font-inter">{new Date(selectedContenu.created_at).toLocaleString('fr-FR')}</p>
                    </div>
                    {selectedContenu.date_publication && (
                      <div className="bg-slate-800/20 rounded-lg p-3 border border-white/[0.03]">
                        <p className="text-[10px] uppercase tracking-wider text-slate-600 font-inter mb-1">Publication</p>
                        <p className="text-slate-300 text-sm font-inter">{new Date(selectedContenu.date_publication).toLocaleString('fr-FR')}</p>
                      </div>
                    )}
                    {selectedContenu.callback_url && (
                      <div className="col-span-2 bg-slate-800/20 rounded-lg p-3 border border-white/[0.03]">
                        <p className="text-[10px] uppercase tracking-wider text-slate-600 font-inter mb-1">Webhook</p>
                        <p className="text-emerald-400 text-xs truncate font-inter">{selectedContenu.callback_url}</p>
                      </div>
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
          <DialogContent className="bg-[#0f172a] border-slate-800 max-w-xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white font-sora">Créer le visuel</DialogTitle>
            </DialogHeader>
            {imageContenu && (
              <div className="space-y-4">
                {imageContenu.lien_visuel && (
                  <img src={imageContenu.lien_visuel} alt="" className="w-full rounded-xl max-h-72 object-cover ring-1 ring-white/10" />
                )}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-slate-300 font-inter">Description de l'image (modifiable)</label>
                    <button onClick={() => chargerPrompt(imageContenu)} disabled={imgLoadingPrompt}
                      className="text-xs text-[#8A6CFF] hover:text-white font-inter inline-flex items-center gap-1 disabled:opacity-50 flex-shrink-0">
                      <Wand2 className="w-3 h-3" /> Proposer une description
                    </button>
                  </div>
                  {imgLoadingPrompt ? (
                    <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin text-[#5B6CFF]" /> L'IA prépare la description…</div>
                  ) : (
                    <Textarea value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} rows={4}
                      className="bg-slate-900/80 border-slate-800 text-slate-200 text-sm rounded-xl focus:border-[#5B6CFF]/50" />
                  )}
                </div>
                {user?.use_photo && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-white/5">
                    <span className="text-sm text-slate-300 font-inter">Inclure ma photo dans le visuel</span>
                    <Switch checked={imgAvecPhoto} onCheckedChange={setImgAvecPhoto} />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-inter">Modèle</span>
                  {IMAGE_MODELES.map((m) => (
                    <button key={m.id} onClick={() => setImgModele(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium font-inter border transition-all ${imgModele === m.id ? 'bg-gradient-to-r from-[#5B6CFF]/20 to-[#8A6CFF]/20 text-white border-[#5B6CFF]/50' : 'text-slate-400 border-white/10 hover:text-white hover:border-white/20'}`}>
                      {m.label} · {m.cout} cr.
                    </button>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              <div>
                <input ref={imgImportRef} type="file" accept="image/*" onChange={importerImage} className="hidden" data-testid="input-import-image" />
                <Button variant="outline" onClick={() => imgImportRef.current?.click()} disabled={imgImporting}
                  className="border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] font-inter">
                  {imgImporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ImageIcon className="w-4 h-4 mr-2" />}
                  Importer une image
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setImageContenu(null)} className="text-slate-400 font-inter">Fermer</Button>
                <Button onClick={genererImage} disabled={imgGenerating || imgLoadingPrompt || !imgPrompt.trim()}
                  className="bg-[#e7ecf5] text-[#0b1322] hover:bg-white font-inter">
                  {imgGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                  {imageContenu?.lien_visuel ? 'Régénérer' : 'Générer'} · {IMAGE_MODELES.find((m) => m.id === imgModele)?.cout} cr.
                </Button>
              </div>
            </DialogFooter>
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
