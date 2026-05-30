import { useState, useEffect, useMemo } from 'react';
import { Check, X, Eye, Edit2, Trash2, Loader2, Filter, ExternalLink, Link2, FileText, Clock, ChevronRight, Search, RefreshCw, Calendar, Sparkles, ScrollText, Video, Image as ImageIcon, Wand2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-inter text-white bg-gradient-to-r ${config.color}`}>
      {config.short}
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

function ContentCard({ contenu, onView, onEdit, onDelete, onValidate, onRefuse, actionLoading }) {
  const statutConfig = STATUT_CONFIG[contenu.statut] || STATUT_CONFIG['Brouillon'];
  const isLoading = actionLoading === contenu.id;
  const createdDate = new Date(contenu.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="group relative bg-slate-900/60 border border-white/[0.06] rounded-xl overflow-hidden hover:border-[#5B6CFF]/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(91,108,255,0.06)]">
      {/* Top accent line */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${statutConfig.bg === 'bg-amber-500/15' ? 'from-amber-500 to-orange-500' : statutConfig.bg === 'bg-emerald-500/15' ? 'from-emerald-500 to-green-500' : statutConfig.bg === 'bg-blue-500/15' ? 'from-blue-500 to-cyan-500' : statutConfig.bg === 'bg-red-500/15' ? 'from-red-500 to-pink-500' : statutConfig.bg === 'bg-purple-500/15' ? 'from-purple-500 to-violet-500' : 'from-slate-500 to-slate-600'} opacity-60`} />

      <div className="p-5">
        <div className="flex gap-4">
          {/* Image */}
          {contenu.lien_visuel && (
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0 ring-1 ring-white/5">
              <img
                src={contenu.lien_visuel}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => e.target.style.display = 'none'}
              />
            </div>
          )}

          {/* Content body */}
          <div className="flex-1 min-w-0">
            {/* Top row: badges */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <StatusBadge statut={contenu.statut} />
              {contenu.reseau_cible && <ReseauBadge reseau={contenu.reseau_cible} />}
              {contenu.type && (
                <span className="text-[10px] text-slate-500 font-inter bg-slate-800/80 px-2 py-0.5 rounded-md border border-white/5">
                  {contenu.type}
                </span>
              )}
            </div>

            {/* Title */}
            {contenu.titre && (
              <h3 className="text-white font-semibold font-sora text-sm mb-1.5 truncate">{contenu.titre}</h3>
            )}

            {/* Preview text */}
            <p className="text-slate-400 font-inter text-xs leading-relaxed line-clamp-2 mb-3">
              {contenu.contenu}
            </p>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-inter">
                <Calendar className="w-3 h-3" />
                {createdDate}
              </span>
              {contenu.date_publication && (
                <span className="inline-flex items-center gap-1 text-[11px] text-blue-400/70 font-inter">
                  <Clock className="w-3 h-3" />
                  Planifié: {new Date(contenu.date_publication).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              )}
              {contenu.callback_url && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/60 font-inter">
                  <Sparkles className="w-3 h-3" />
                  Webhook
                </span>
              )}
              {contenu.lien_video_dropbox && (
                <a
                  href={contenu.lien_video_dropbox}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <Video className="w-3 h-3" />
                  Vidéo Dropbox
                </a>
              )}
              {contenu.statut === 'Publie' && contenu.lien_publication && (
                <a
                  href={contenu.lien_publication}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Link2 className="w-3 h-3" />
                  Voir en ligne
                </a>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onView(contenu)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              title="Voir détails"
            >
              <Eye className="w-4 h-4" />
            </button>

            {contenu.statut === 'A valider' && (
              <>
                <button
                  onClick={() => onValidate(contenu.id)}
                  disabled={isLoading}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-all"
                  title="Valider"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => onRefuse(contenu.id)}
                  disabled={isLoading}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
                  title="Refuser"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}

            {contenu.statut === 'Publie' && contenu.lien_publication && (
              <a
                href={contenu.lien_publication}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-all"
                title="Voir la publication"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}

            <button
              onClick={() => onEdit(contenu)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              title="Modifier"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(contenu)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Supprimer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentRow({ contenu, onView, onImage, onEdit, onDelete, onValidate, onRefuse, actionLoading }) {
  const isLoading = actionLoading === contenu.id;
  const createdDate = new Date(contenu.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <tr className="group border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] transition-colors">
      <td className="px-4 py-3 align-middle"><StatusBadge statut={contenu.statut} /></td>
      <td className="px-4 py-3 align-middle">
        {contenu.reseau_cible ? <ReseauBadge reseau={contenu.reseau_cible} /> : <span className="text-slate-600 text-xs">—</span>}
      </td>
      <td className="px-4 py-3 align-middle max-w-0 w-full">
        <div className="flex items-center gap-3 min-w-0">
          {contenu.lien_visuel && (
            <img src={contenu.lien_visuel} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 ring-1 ring-white/10" />
          )}
          <button onClick={() => onView(contenu)} className="text-left block flex-1 min-w-0">
            <div className="text-white font-medium text-sm truncate hover:text-[#8A6CFF] transition-colors">{contenu.titre || 'Sans titre'}</div>
            {contenu.contenu && <div className="text-slate-500 text-xs truncate mt-0.5">{contenu.contenu}</div>}
          </button>
        </div>
      </td>
      <td className="px-4 py-3 align-middle whitespace-nowrap text-xs text-slate-400">{createdDate}</td>
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onView(contenu)} title="Voir" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <Eye className="w-4 h-4" />
          </button>
          <button onClick={() => onImage(contenu)} title={contenu.lien_visuel ? 'Visuel — modifier' : 'Créer le visuel'} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${contenu.lien_visuel ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            <ImageIcon className="w-4 h-4" />
          </button>
          {contenu.statut === 'A valider' && (
            <>
              <button onClick={() => onValidate(contenu.id)} disabled={isLoading} title="Valider" className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-all">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => onRefuse(contenu.id)} disabled={isLoading} title="Refuser" className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={() => onEdit(contenu)} title="Modifier" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(contenu)} title="Supprimer" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ContenusPage() {
  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('scripts');
  const [filterStatut, setFilterStatut] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContenu, setSelectedContenu] = useState(null);
  const [editContenu, setEditContenu] = useState(null);
  const [deleteContenu, setDeleteContenu] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const { user, updateUser } = useUser();
  const [imageContenu, setImageContenu] = useState(null);
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgAvecPhoto, setImgAvecPhoto] = useState(false);
  const [imgModele, setImgModele] = useState('nano2');
  const [imgLoadingPrompt, setImgLoadingPrompt] = useState(false);
  const [imgGenerating, setImgGenerating] = useState(false);

  const chargerPrompt = async (contenu) => {
    setImgLoadingPrompt(true);
    try {
      const data = await agentService.imagePrompt(contenu.contenu || contenu.titre || '', String(contenu.reseau_cible || 'linkedin').toLowerCase());
      setImgPrompt(data.prompt || '');
    } catch (e) {
      toast.error('Erreur lors de la préparation du prompt');
    } finally {
      setImgLoadingPrompt(false);
    }
  };

  const openImage = (contenu) => {
    setImageContenu(contenu);
    setImgPrompt('');
    setImgAvecPhoto(!!user?.use_photo);
    setImgModele('nano2');
    if (!contenu.lien_visuel) chargerPrompt(contenu); // pas d'image → on prépare une description (sinon on ne dépense rien)
  };

  const genererImage = async () => {
    if (!imageContenu || !imgPrompt.trim()) return;
    setImgGenerating(true);
    try {
      const data = await agentService.image(imageContenu.id, imgPrompt, imgAvecPhoto, imgModele);
      if (data.credits != null) updateUser({ credits: data.credits });
      setContenus((prev) => prev.map((c) => (c.id === imageContenu.id ? { ...c, lien_visuel: data.lien_visuel } : c)));
      setImageContenu((prev) => (prev ? { ...prev, lien_visuel: data.lien_visuel } : prev));
      toast.success('Visuel généré ✨');
    } catch (e) {
      if (e.response?.status === 402) toast.error('Crédits insuffisants');
      else toast.error(e.response?.data?.detail || "Échec de la génération d'image");
    } finally {
      setImgGenerating(false);
    }
  };

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
            <div className="rounded-2xl border border-white/[0.06] bg-slate-900/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-slate-500 font-inter font-medium">Statut</th>
                      <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-slate-500 font-inter font-medium">Réseau</th>
                      <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-slate-500 font-inter font-medium">Contenu</th>
                      <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-slate-500 font-inter font-medium">Date</th>
                      <th className="px-4 py-3 text-right text-[11px] uppercase tracking-wider text-slate-500 font-inter font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContenus.map((contenu) => (
                      <ContentRow
                        key={contenu.id}
                        contenu={contenu}
                        onView={setSelectedContenu}
                        onImage={openImage}
                        onEdit={setEditContenu}
                        onDelete={setDeleteContenu}
                        onValidate={(id) => handleUpdateStatut(id, 'Valider')}
                        onRefuse={(id) => handleUpdateStatut(id, 'Refuse')}
                        actionLoading={actionLoading}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
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
                  {selectedContenu?.statut === 'Publie' && selectedContenu?.lien_publication && (
                    <a href={selectedContenu.lien_publication} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" className="bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 font-inter">
                        <ExternalLink className="w-4 h-4 mr-1.5" />
                        Voir
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </DialogHeader>

            {selectedContenu && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-1">
                {/* Colonne gauche : visuel + liens */}
                <div className="space-y-3">
                  {selectedContenu.lien_visuel ? (
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
                className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 font-inter"
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
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setImageContenu(null)} className="text-slate-400 font-inter">Fermer</Button>
              <Button onClick={genererImage} disabled={imgGenerating || imgLoadingPrompt || !imgPrompt.trim()}
                className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 text-white font-inter">
                {imgGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                {imageContenu?.lien_visuel ? 'Régénérer' : 'Générer'} · {IMAGE_MODELES.find((m) => m.id === imgModele)?.cout} cr.
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
