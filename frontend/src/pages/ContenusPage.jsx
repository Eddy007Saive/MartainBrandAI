import { useState, useEffect } from 'react';
import { Check, X, Eye, Edit2, Trash2, Loader2, Filter, ExternalLink, Link2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
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
import api from '../lib/api';

const STATUT_COLORS = {
  'A valider': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Validé': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Publié': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Refusé': 'bg-red-500/20 text-red-400 border-red-500/30',
  'Brouillon': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  'En cours': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const RESEAU_ICONS = {
  'linkedin': '💼',
  'instagram': '📸',
  'facebook': '👥',
  'tiktok': '🎵',
  'LinkedIn': '💼',
  'Instagram': '📸',
  'Facebook': '👥',
  'TikTok': '🎵',
};

export default function ContenusPage() {
  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState('all');
  const [selectedContenu, setSelectedContenu] = useState(null);
  const [editContenu, setEditContenu] = useState(null);
  const [deleteContenu, setDeleteContenu] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchContenus();
  }, [filterStatut]);

  const fetchContenus = async () => {
    setLoading(true);
    try {
      const params = filterStatut !== 'all' ? `?statut=${filterStatut}` : '';
      const response = await api.get(`/contenus${params}`);
      setContenus(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement des contenus');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatut = async (id, newStatut) => {
    setActionLoading(id);
    try {
      const response = await api.patch(`/contenus/${id}`, { statut: newStatut });
      
      // Check webhook result
      if (response.data.webhook_result) {
        if (response.data.webhook_result.success) {
          toast.success('Contenu validé et webhook déclenché avec succès');
        } else {
          toast.warning('Contenu validé mais le webhook a échoué');
        }
      } else {
        toast.success(`Contenu ${newStatut.toLowerCase()}`);
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
      await api.patch(`/contenus/${editContenu.id}`, {
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
      await api.delete(`/contenus/${deleteContenu.id}`);
      toast.success('Contenu supprimé');
      fetchContenus();
      setDeleteContenu(null);
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setActionLoading(null);
    }
  };

  // Get stats
  const stats = {
    total: contenus.length,
    aValider: contenus.filter(c => c.statut === 'A valider').length,
    valides: contenus.filter(c => c.statut === 'Validé').length,
    publies: contenus.filter(c => c.statut === 'Publié').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-sora text-white">Contenus</h1>
          <p className="text-slate-400 font-inter text-sm mt-1">
            Gérez et validez vos publications
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <Select value={filterStatut} onValueChange={setFilterStatut}>
            <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-800 text-slate-200">
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="all" className="text-slate-200">Tous ({stats.total})</SelectItem>
              <SelectItem value="A valider" className="text-slate-200">À valider ({stats.aValider})</SelectItem>
              <SelectItem value="Validé" className="text-slate-200">Validés ({stats.valides})</SelectItem>
              <SelectItem value="Publié" className="text-slate-200">Publiés ({stats.publies})</SelectItem>
              <SelectItem value="Refusé" className="text-slate-200">Refusés</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/40 border border-white/5 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-white font-sora">{stats.total}</p>
          <p className="text-xs text-slate-400 font-inter">Total</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-amber-400 font-sora">{stats.aValider}</p>
          <p className="text-xs text-amber-400/70 font-inter">À valider</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400 font-sora">{stats.valides}</p>
          <p className="text-xs text-emerald-400/70 font-inter">Validés</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-400 font-sora">{stats.publies}</p>
          <p className="text-xs text-blue-400/70 font-inter">Publiés</p>
        </div>
      </div>

      {/* Liste des contenus */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
        </div>
      ) : contenus.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/40 border border-white/5 rounded-xl">
          <p className="text-slate-400 font-inter">Aucun contenu trouvé</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {contenus.map((contenu) => (
            <div
              key={contenu.id}
              className="bg-slate-900/40 border border-white/5 rounded-xl p-5 hover:border-[#5B6CFF]/30 transition-all"
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                {/* Image preview */}
                {contenu.lien_visuel && (
                  <div className="w-full lg:w-32 h-32 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0">
                    <img
                      src={contenu.lien_visuel}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  </div>
                )}
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Status and platform row */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge className={STATUT_COLORS[contenu.statut] || STATUT_COLORS['Brouillon']}>
                      {contenu.statut}
                    </Badge>
                    {contenu.reseau_cible && (
                      <span className="text-lg" title={contenu.reseau_cible}>
                        {RESEAU_ICONS[contenu.reseau_cible] || '📱'}
                      </span>
                    )}
                    {contenu.type && (
                      <span className="text-xs text-slate-500 font-inter bg-slate-800/50 px-2 py-0.5 rounded">
                        {contenu.type}
                      </span>
                    )}
                    
                    {/* Published link indicator */}
                    {contenu.statut === 'Publié' && contenu.lien_publication && (
                      <a
                        href={contenu.lien_publication}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded-full transition-colors"
                      >
                        <Link2 className="w-3 h-3" />
                        Voir publication
                      </a>
                    )}
                  </div>
                  
                  {contenu.titre && (
                    <h3 className="text-white font-semibold font-sora mb-2">{contenu.titre}</h3>
                  )}
                  
                  <p className="text-slate-300 font-inter text-sm line-clamp-3 mb-3">
                    {contenu.contenu}
                  </p>
                  
                  {/* Meta info */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-inter">
                    <span>Créé le {new Date(contenu.created_at).toLocaleDateString('fr-FR')}</span>
                    {contenu.date_publication && (
                      <span className="text-blue-400">
                        Planifié: {new Date(contenu.date_publication).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                    {contenu.callback_url && (
                      <span className="text-emerald-400/70" title="Webhook configuré">
                        ⚡ Webhook
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex lg:flex-col gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedContenu(contenu)}
                    className="text-slate-400 hover:text-white"
                    title="Voir détails"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  
                  {contenu.statut === 'A valider' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleUpdateStatut(contenu.id, 'Validé')}
                        disabled={actionLoading === contenu.id}
                        className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                        title="Valider"
                      >
                        {actionLoading === contenu.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUpdateStatut(contenu.id, 'Refusé')}
                        disabled={actionLoading === contenu.id}
                        className="text-red-400 hover:bg-red-500/20"
                        title="Refuser"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  
                  {/* Link to published content */}
                  {contenu.statut === 'Publié' && contenu.lien_publication && (
                    <a
                      href={contenu.lien_publication}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-blue-400 hover:bg-blue-500/20 transition-colors"
                      title="Voir la publication"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditContenu(contenu)}
                    className="text-slate-400 hover:text-white"
                    title="Modifier"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteContenu(contenu)}
                    className="text-red-400 hover:bg-red-500/20"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={!!selectedContenu} onOpenChange={() => setSelectedContenu(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white font-sora">
              {selectedContenu?.titre || 'Détail du contenu'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedContenu && (
            <div className="space-y-4">
              {/* Status badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className={STATUT_COLORS[selectedContenu.statut]}>
                  {selectedContenu.statut}
                </Badge>
                {selectedContenu.reseau_cible && (
                  <Badge variant="outline" className="border-slate-700 text-slate-300">
                    {RESEAU_ICONS[selectedContenu.reseau_cible]} {selectedContenu.reseau_cible}
                  </Badge>
                )}
                {selectedContenu.type && (
                  <Badge variant="outline" className="border-slate-700 text-slate-300">
                    {selectedContenu.type}
                  </Badge>
                )}
              </div>
              
              {/* Published link banner */}
              {selectedContenu.statut === 'Publié' && selectedContenu.lien_publication && (
                <a
                  href={selectedContenu.lien_publication}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/20 transition-colors"
                >
                  <ExternalLink className="w-5 h-5" />
                  <div>
                    <p className="font-semibold font-sora">Publication en ligne</p>
                    <p className="text-sm text-blue-400/70 truncate">{selectedContenu.lien_publication}</p>
                  </div>
                </a>
              )}
              
              {/* Image */}
              {selectedContenu.lien_visuel && (
                <img
                  src={selectedContenu.lien_visuel}
                  alt=""
                  className="w-full rounded-lg max-h-64 object-cover"
                />
              )}
              
              {/* Content */}
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-200 font-inter whitespace-pre-wrap">
                  {selectedContenu.contenu}
                </p>
              </div>
              
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 font-inter">Créé le</p>
                  <p className="text-slate-300">{new Date(selectedContenu.created_at).toLocaleString('fr-FR')}</p>
                </div>
                {selectedContenu.date_publication && (
                  <div>
                    <p className="text-slate-500 font-inter">Date de publication</p>
                    <p className="text-slate-300">{new Date(selectedContenu.date_publication).toLocaleString('fr-FR')}</p>
                  </div>
                )}
                {selectedContenu.callback_url && (
                  <div className="col-span-2">
                    <p className="text-slate-500 font-inter">Webhook de validation</p>
                    <p className="text-emerald-400 text-xs truncate">{selectedContenu.callback_url}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            {selectedContenu?.statut === 'A valider' && (
              <div className="flex gap-2">
                <Button
                  onClick={() => handleUpdateStatut(selectedContenu.id, 'Validé')}
                  disabled={actionLoading === selectedContenu?.id}
                  className="bg-emerald-500 hover:bg-emerald-600"
                >
                  {actionLoading === selectedContenu?.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Valider
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleUpdateStatut(selectedContenu.id, 'Refusé')}
                  disabled={actionLoading === selectedContenu?.id}
                >
                  <X className="w-4 h-4 mr-2" />
                  Refuser
                </Button>
              </div>
            )}
            {selectedContenu?.statut === 'Publié' && selectedContenu?.lien_publication && (
              <a
                href={selectedContenu.lien_publication}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="bg-blue-500 hover:bg-blue-600">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Voir la publication
                </Button>
              </a>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editContenu} onOpenChange={() => setEditContenu(null)}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white font-sora">Modifier le contenu</DialogTitle>
          </DialogHeader>
          
          {editContenu && (
            <div className="space-y-4">
              <Textarea
                value={editContenu.contenu || ''}
                onChange={(e) => setEditContenu({ ...editContenu, contenu: e.target.value })}
                rows={8}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          )}
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditContenu(null)}>
              Annuler
            </Button>
            <Button onClick={handleEdit} disabled={actionLoading === editContenu?.id}>
              {actionLoading === editContenu?.id ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteContenu} onOpenChange={() => setDeleteContenu(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Supprimer ce contenu ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-200">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
