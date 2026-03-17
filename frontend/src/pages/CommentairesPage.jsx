import { useState, useEffect } from 'react';
import { MessageCircle, Check, Reply, Loader2, Filter, User } from 'lucide-react';
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
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import api from '../lib/api';

const STATUT_COLORS = {
  'Nouveau': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Traité': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'En attente': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export default function CommentairesPage() {
  const [commentaires, setCommentaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState('all');
  const [selectedComment, setSelectedComment] = useState(null);
  const [reponse, setReponse] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchCommentaires();
  }, [filterStatut]);

  const fetchCommentaires = async () => {
    setLoading(true);
    try {
      const params = filterStatut !== 'all' ? `?statut=${filterStatut}` : '';
      const response = await api.get(`/commentaires${params}`);
      setCommentaires(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement des commentaires');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsTraite = async (id) => {
    setActionLoading(id);
    try {
      await api.patch(`/commentaires/${id}`, { statut: 'Traité' });
      toast.success('Commentaire marqué comme traité');
      fetchCommentaires();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRepondre = async () => {
    if (!selectedComment || !reponse.trim()) return;
    setActionLoading(selectedComment.id);
    try {
      await api.patch(`/commentaires/${selectedComment.id}`, {
        reponse_ia: reponse,
        statut: 'Traité'
      });
      toast.success('Réponse enregistrée');
      fetchCommentaires();
      setSelectedComment(null);
      setReponse('');
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setActionLoading(null);
    }
  };

  const openRepondre = (comment) => {
    setSelectedComment(comment);
    setReponse(comment.reponse_ia || '');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-sora text-white">Commentaires</h1>
          <p className="text-slate-400 font-inter text-sm mt-1">
            Consultez et gérez les commentaires reçus
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <Select value={filterStatut} onValueChange={setFilterStatut}>
            <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-800 text-slate-200">
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="all" className="text-slate-200">Tous</SelectItem>
              <SelectItem value="Nouveau" className="text-slate-200">Nouveaux</SelectItem>
              <SelectItem value="Traité" className="text-slate-200">Traités</SelectItem>
              <SelectItem value="En attente" className="text-slate-200">En attente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
        </div>
      ) : commentaires.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/40 border border-white/5 rounded-xl">
          <MessageCircle className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 font-inter">Aucun commentaire trouvé</p>
        </div>
      ) : (
        <div className="space-y-4">
          {commentaires.map((comment) => (
            <div
              key={comment.id}
              className="bg-slate-900/40 border border-white/5 rounded-xl p-5 hover:border-[#5B6CFF]/30 transition-all"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-white font-semibold font-sora">
                      {comment.nom_auteur || 'Utilisateur'}
                    </span>
                    <Badge className={STATUT_COLORS[comment.statut] || STATUT_COLORS['Nouveau']}>
                      {comment.statut}
                    </Badge>
                  </div>
                  
                  <p className="text-slate-300 font-inter mb-3">
                    {comment.contenu_commentaire}
                  </p>
                  
                  {comment.reponse_ia && (
                    <div className="bg-slate-800/50 rounded-lg p-3 mb-3">
                      <p className="text-xs text-slate-500 mb-1 font-inter">Réponse :</p>
                      <p className="text-slate-300 text-sm font-inter">{comment.reponse_ia}</p>
                    </div>
                  )}
                  
                  <p className="text-xs text-slate-500 font-inter">
                    {comment.date_heure
                      ? new Date(comment.date_heure).toLocaleString('fr-FR')
                      : new Date(comment.created_at).toLocaleString('fr-FR')}
                  </p>
                </div>
                
                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openRepondre(comment)}
                    className="text-slate-400 hover:text-white"
                  >
                    <Reply className="w-4 h-4" />
                  </Button>
                  
                  {comment.statut !== 'Traité' && (
                    <Button
                      size="sm"
                      onClick={() => handleMarkAsTraite(comment.id)}
                      disabled={actionLoading === comment.id}
                      className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                    >
                      {actionLoading === comment.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Répondre Dialog */}
      <Dialog open={!!selectedComment} onOpenChange={() => setSelectedComment(null)}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white font-sora">Répondre au commentaire</DialogTitle>
          </DialogHeader>
          
          {selectedComment && (
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-xs text-slate-500 mb-1 font-inter">
                  {selectedComment.nom_auteur || 'Utilisateur'} a écrit :
                </p>
                <p className="text-slate-300 font-inter">{selectedComment.contenu_commentaire}</p>
              </div>
              
              <Textarea
                placeholder="Votre réponse..."
                value={reponse}
                onChange={(e) => setReponse(e.target.value)}
                rows={4}
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          )}
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelectedComment(null)}>
              Annuler
            </Button>
            <Button
              onClick={handleRepondre}
              disabled={actionLoading === selectedComment?.id || !reponse.trim()}
            >
              {actionLoading === selectedComment?.id ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
