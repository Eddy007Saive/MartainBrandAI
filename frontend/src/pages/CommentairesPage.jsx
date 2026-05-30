import { useState, useEffect, useMemo } from 'react';
import { MessageCircle, Check, Reply, Loader2, Filter, User, FileText } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { commentaireService } from '../services/commentaireService';

const STATUT_COLORS = {
  Nouveau: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Traité': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Rèpondu': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'En attente': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'A escalader': 'bg-red-500/20 text-red-400 border-red-500/30',
  'À escalader': 'bg-red-500/20 text-red-400 border-red-500/30',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatut]);

  const fetchCommentaires = async () => {
    setLoading(true);
    try {
      const data = await commentaireService.getAll(filterStatut);
      setCommentaires(data);
    } catch (error) {
      toast.error('Erreur lors du chargement des commentaires');
    } finally {
      setLoading(false);
    }
  };

  // Regroupement des commentaires par contenu
  const groupes = useMemo(() => {
    const map = new Map();
    for (const c of commentaires) {
      const key = c.contenu_id || '__autres__';
      if (!map.has(key)) {
        map.set(key, { id: key, titre: c.contenu_titre, reseau: c.contenu_reseau, comments: [] });
      }
      map.get(key).comments.push(c);
    }
    return [...map.values()];
  }, [commentaires]);

  const handleMarkAsTraite = async (id) => {
    setActionLoading(id);
    try {
      await commentaireService.update(id, { statut: 'Traité' });
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
      await commentaireService.update(selectedComment.id, { reponse_ia: reponse, statut: 'Traité' });
      toast.success('Réponse enregistrée');
      fetchCommentaires();
      setSelectedComment(null);
      setReponse('');
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setActionLoading(null);
    }
  };

  const openRepondre = (comment) => {
    setSelectedComment(comment);
    setReponse(comment.reponse_ia || '');
  };

  return (
    <div className="w-full space-y-6">
      <PageHeader
        icon={MessageCircle}
        title="Commentaires"
        subtitle="Regroupés par contenu — consultez et répondez"
        actions={
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <Select value={filterStatut} onValueChange={setFilterStatut}>
              <SelectTrigger className="w-[170px] bg-slate-900/60 border-white/[0.06] text-slate-200 rounded-xl">
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
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
        </div>
      ) : commentaires.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/40 border border-white/[0.06] rounded-2xl">
          <MessageCircle className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 font-inter">Aucun commentaire trouvé</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupes.map((groupe) => (
            <section key={groupe.id} className="bg-slate-900/40 border border-white/[0.06] rounded-2xl overflow-hidden animate-fade-in">
              {/* En-tête du contenu */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#5B6CFF]/20 to-[#8A6CFF]/20 border border-[#5B6CFF]/20 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-[#8A6CFF]" />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-medium font-sora text-sm truncate">
                    {groupe.titre || (groupe.id === '__autres__' ? 'Commentaires sans contenu associé' : 'Contenu sans titre')}
                  </p>
                  {groupe.reseau && (
                    <span className="text-[11px] text-slate-500 font-inter">{groupe.reseau}</span>
                  )}
                </div>
                <span className="ml-auto text-xs text-slate-500 font-inter flex-shrink-0">
                  {groupe.comments.length} commentaire{groupe.comments.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Commentaires du groupe */}
              <div className="divide-y divide-white/[0.04]">
                {groupe.comments.map((comment) => (
                  <div key={comment.id} className="p-5 flex items-start gap-4 hover:bg-white/[0.015] transition-colors">
                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-white font-medium font-inter text-sm">{comment.nom_auteur || 'Utilisateur'}</span>
                        <Badge className={`text-[10px] ${STATUT_COLORS[comment.statut] || STATUT_COLORS['Nouveau']}`}>{comment.statut}</Badge>
                      </div>

                      <p className="text-slate-300 font-inter text-sm">{comment.contenu_commentaire}</p>

                      {comment.reponse_ia && (
                        <div className="bg-slate-800/40 rounded-lg p-3 mt-2.5 border-l-2 border-[#5B6CFF]/40">
                          <p className="text-[11px] text-slate-500 mb-1 font-inter inline-flex items-center gap-1">
                            <Reply className="w-3 h-3" /> Réponse
                          </p>
                          <p className="text-slate-300 text-sm font-inter">{comment.reponse_ia}</p>
                        </div>
                      )}

                      <p className="text-[11px] text-slate-600 font-inter mt-2">
                        {comment.date_heure
                          ? new Date(comment.date_heure).toLocaleString('fr-FR')
                          : new Date(comment.created_at).toLocaleString('fr-FR')}
                      </p>
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openRepondre(comment)} className="text-slate-400 hover:text-white" title="Répondre">
                        <Reply className="w-4 h-4" />
                      </Button>
                      {comment.statut !== 'Traité' && comment.statut !== 'Rèpondu' && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkAsTraite(comment.id)}
                          disabled={actionLoading === comment.id}
                          className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                          title="Marquer traité"
                        >
                          {actionLoading === comment.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
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
                <p className="text-xs text-slate-500 mb-1 font-inter">{selectedComment.nom_auteur || 'Utilisateur'} a écrit :</p>
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
            <Button variant="ghost" onClick={() => setSelectedComment(null)}>Annuler</Button>
            <Button onClick={handleRepondre} disabled={actionLoading === selectedComment?.id || !reponse.trim()}>
              {actionLoading === selectedComment?.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
