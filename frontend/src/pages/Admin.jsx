import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, Users, Loader2, UserCheck, UserX, Trash2, LogOut, Search } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
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
import { toast } from 'sonner';
import api from '../lib/api';
import { getAdminToken, removeAdminToken } from '../lib/auth';
import { cn } from '../lib/utils';

const filters = [
  { id: 'pending', label: 'En attente', icon: Clock },
  { id: 'active', label: 'Actifs', icon: CheckCircle },
  { id: 'all', label: 'Tous', icon: Users },
];

export default function Admin() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, [activeFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const adminToken = getAdminToken();
      const response = await api.get(`/admin/users?filter=${activeFilter}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      setUsers(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement des utilisateurs');
      if (error.response?.status === 401 || error.response?.status === 403) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (telegramId) => {
    setActionLoading(telegramId);
    try {
      const adminToken = getAdminToken();
      const response = await api.patch(`/admin/users/${telegramId}/activate`, {}, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (response.data.late_profile_created) {
        toast.success('Utilisateur activé et profil Late créé');
      } else {
        toast.warning(
          `Utilisateur activé mais le profil Late n'a pas pu être créé : ${response.data.late_error || 'Erreur inconnue'}`,
          { duration: 8000 }
        );
      }
      fetchUsers();
    } catch (error) {
      toast.error('Erreur lors de l\'activation');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (telegramId) => {
    setActionLoading(telegramId);
    try {
      const adminToken = getAdminToken();
      await api.patch(`/admin/users/${telegramId}/deactivate`, {}, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      toast.success('Utilisateur désactivé');
      fetchUsers();
    } catch (error) {
      toast.error('Erreur lors de la désactivation');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (telegramId) => {
    setActionLoading(telegramId);
    try {
      const adminToken = getAdminToken();
      await api.delete(`/admin/users/${telegramId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      toast.success('Utilisateur supprimé');
      setDeleteConfirm(null);
      fetchUsers();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => {
    removeAdminToken();
    navigate('/');
  };

  const filteredUsers = users.filter(user => 
    user.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.telegram_id?.toString().includes(searchTerm)
  );

  const getCounts = () => {
    const pending = users.filter(u => !u.actif).length;
    const active = users.filter(u => u.actif).length;
    return { pending, active, all: users.length };
  };

  const counts = getCounts();

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-[#020617]" data-testid="admin-panel">
      {/* Noise overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      
      {/* Header */}
      <header className="bg-slate-950/60 backdrop-blur-md border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
            Administration
          </h1>
          <Button
            onClick={handleLogout}
            variant="ghost"
            data-testid="admin-logout"
            className="text-slate-400 hover:text-white hover:bg-slate-800/50 font-inter"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Quitter
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          {filters.map((filter) => {
            const Icon = filter.icon;
            const count = filter.id === 'pending' ? counts.pending : filter.id === 'active' ? counts.active : counts.all;
            return (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                data-testid={`filter-${filter.id}`}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 font-inter",
                  activeFilter === filter.id
                    ? "bg-gradient-to-r from-[#5B6CFF]/20 to-[#8A6CFF]/20 text-white border border-[#5B6CFF]/30"
                    : "bg-slate-900/50 text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{filter.label}</span>
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "ml-1 text-xs",
                    activeFilter === filter.id 
                      ? "bg-[#5B6CFF]/30 text-white" 
                      : "bg-slate-800 text-slate-400"
                  )}
                >
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Rechercher par nom, email ou ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="admin-search"
            className="pl-10 bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] text-slate-200 placeholder:text-slate-500 font-inter"
          />
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-16 h-16 mx-auto text-slate-700 mb-4" />
            <p className="text-slate-500 font-inter">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((user) => (
              <div
                key={user.telegram_id}
                data-testid={`user-card-${user.telegram_id}`}
                className="bg-slate-900/40 border border-white/5 rounded-xl backdrop-blur-sm p-5 hover:border-[#5B6CFF]/30 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center text-white font-sora font-semibold text-sm flex-shrink-0">
                    {getInitials(user.nom)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-sora font-semibold truncate">
                        {user.nom || 'Sans nom'}
                      </h3>
                      <Badge 
                        variant={user.actif ? "default" : "secondary"}
                        className={cn(
                          "text-xs flex-shrink-0",
                          user.actif 
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        )}
                      >
                        {user.actif ? 'Actif' : 'En attente'}
                      </Badge>
                    </div>
                    <p className="text-slate-400 text-sm font-inter truncate mt-1">
                      {user.email}
                    </p>
                    <p className="text-slate-500 text-xs font-mono mt-1">
                      ID: {user.telegram_id}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                  {user.actif ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeactivate(user.telegram_id)}
                      disabled={actionLoading === user.telegram_id}
                      data-testid={`deactivate-${user.telegram_id}`}
                      className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 font-inter text-xs"
                    >
                      {actionLoading === user.telegram_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <UserX className="w-3 h-3 mr-1" />
                          Désactiver
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleActivate(user.telegram_id)}
                      disabled={actionLoading === user.telegram_id}
                      data-testid={`activate-${user.telegram_id}`}
                      className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-inter text-xs"
                    >
                      {actionLoading === user.telegram_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <UserCheck className="w-3 h-3 mr-1" />
                          Activer
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteConfirm(user)}
                    disabled={actionLoading === user.telegram_id}
                    data-testid={`delete-${user.telegram_id}`}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 font-inter text-xs"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-sora">Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 font-inter">
              Êtes-vous sûr de vouloir supprimer l'utilisateur <span className="text-white font-medium">{deleteConfirm?.nom}</span> ? 
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 font-inter">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteConfirm?.telegram_id)}
              data-testid="confirm-delete"
              className="bg-red-500 hover:bg-red-600 text-white font-inter"
            >
              {actionLoading === deleteConfirm?.telegram_id ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
