import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Activity, Settings, LogOut, Search, Download,
  UserCheck, UserX, Trash2, Eye, FileText, MessageCircle, TrendingUp,
  Loader2, ChevronRight, Clock, CheckCircle, XCircle, RefreshCw,
  Video, ExternalLink, Save, AlertCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { toast } from 'sonner';
import { removeAdminToken } from '../lib/auth';
import { cn } from '../lib/utils';
import { adminService } from '../services/adminService';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Utilisateurs', icon: Users },
  { id: 'avatars', label: 'Avatars', icon: Video },
  { id: 'activity', label: 'Activité', icon: Activity },
  { id: 'settings', label: 'Paramètres', icon: Settings },
];

const AVATAR_STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  in_progress: { label: 'En cours', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  complete: { label: 'Prêt', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  failed: { label: 'Échec', color: 'text-red-400', bg: 'bg-red-500/20' },
};

export default function Admin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [userFilter, setUserFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userContenus, setUserContenus] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  // Avatar management
  const [avatars, setAvatars] = useState([]);
  const [editingAvatar, setEditingAvatar] = useState(null);
  const [avatarForm, setAvatarForm] = useState({});
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'dashboard') {
        const statsData = await adminService.getStats();
        setStats(statsData);
      } else if (activeTab === 'users') {
        const usersData = await adminService.getUsers(userFilter);
        setUsers(usersData);
      } else if (activeTab === 'avatars') {
        const avatarData = await adminService.getAvatars();
        setAvatars(avatarData);
      } else if (activeTab === 'activity') {
        const activityData = await adminService.getActivity(50);
        setActivities(activityData);
      }
    } catch (error) {
      toast.error('Erreur lors du chargement');
      if (error.message.includes('401') || error.message.includes('403')) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewUser = async (telegramId) => {
    try {
      const userData = await adminService.getUser(telegramId);
      const contenusData = await adminService.getUserContenus(telegramId);
      setSelectedUser(userData);
      setUserContenus(contenusData);
    } catch (error) {
      toast.error('Erreur lors du chargement du profil');
    }
  };

  const handleActivate = async (telegramId) => {
    setActionLoading(telegramId);
    try {
      await adminService.activateUser(telegramId);
      toast.success('Utilisateur activé');
      loadData();
    } catch (error) {
      toast.error('Erreur');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (telegramId) => {
    setActionLoading(telegramId);
    try {
      await adminService.deactivateUser(telegramId);
      toast.success('Utilisateur désactivé');
      loadData();
    } catch (error) {
      toast.error('Erreur');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setActionLoading(deleteConfirm.telegram_id);
    try {
      await adminService.deleteUser(deleteConfirm.telegram_id);
      toast.success('Utilisateur supprimé');
      setDeleteConfirm(null);
      loadData();
    } catch (error) {
      toast.error('Erreur');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportCSV = async () => {
    try {
      const blob = await adminService.exportCSV();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users_export.csv';
      a.click();
      toast.success('Export téléchargé');
    } catch (error) {
      toast.error('Erreur lors de l\'export');
    }
  };

  const handleEditAvatar = (avatar) => {
    setEditingAvatar(avatar);
    setAvatarForm({
      avatar_id: avatar.avatar_id || '',
      status: avatar.status || 'pending',
      consent_url: avatar.consent_url || '',
      error_message: avatar.error_message || '',
    });
  };

  const handleSaveAvatar = async () => {
    if (!editingAvatar) return;
    setSavingAvatar(true);
    try {
      const data = {};
      if (avatarForm.avatar_id) data.avatar_id = avatarForm.avatar_id;
      if (avatarForm.status) data.status = avatarForm.status;
      if (avatarForm.consent_url) data.consent_url = avatarForm.consent_url;
      if (avatarForm.error_message) data.error_message = avatarForm.error_message;

      await adminService.updateAvatar(editingAvatar.telegram_id, data);
      toast.success('Avatar mis à jour');
      setEditingAvatar(null);
      loadData();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleDeleteAvatar = async (telegramId) => {
    if (!window.confirm('Supprimer cette demande d\'avatar ?')) return;
    try {
      await adminService.deleteAvatar(telegramId);
      toast.success('Avatar supprimé');
      loadData();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
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

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="flex h-screen bg-[#020617] overflow-hidden">
      {/* Noise overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* Sidebar */}
      <aside className="w-64 hidden md:flex flex-col border-r border-white/5 bg-slate-950/50 backdrop-blur-xl relative z-10">
        <div className="p-6 border-b border-white/5">
          <h1 className="text-xl font-bold font-sora bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
            Admin Panel
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-inter">Gestion de la plateforme</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 font-inter",
                  activeTab === item.id
                    ? "bg-gradient-to-r from-red-500/20 to-orange-500/20 text-white border-l-2 border-red-500"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 font-inter"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Quitter</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold font-sora text-white">Dashboard</h2>
                <Button
                  variant="ghost"
                  onClick={loadData}
                  className="text-slate-400 hover:text-white"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Actualiser
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                </div>
              ) : stats && (
                <>
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-2">
                        <Users className="w-5 h-5 text-blue-400" />
                        <span className="text-xs text-emerald-400 font-inter">+{stats.users.nouveaux_semaine} cette semaine</span>
                      </div>
                      <p className="text-3xl font-bold text-white font-sora">{stats.users.total}</p>
                      <p className="text-sm text-slate-400 font-inter">Utilisateurs</p>
                    </div>

                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-2">
                        <Clock className="w-5 h-5 text-amber-400" />
                      </div>
                      <p className="text-3xl font-bold text-amber-400 font-sora">{stats.users.en_attente}</p>
                      <p className="text-sm text-slate-400 font-inter">En attente</p>
                    </div>

                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-2">
                        <FileText className="w-5 h-5 text-purple-400" />
                      </div>
                      <p className="text-3xl font-bold text-white font-sora">{stats.contenus.total}</p>
                      <p className="text-sm text-slate-400 font-inter">Contenus</p>
                    </div>

                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-2">
                        <MessageCircle className="w-5 h-5 text-green-400" />
                      </div>
                      <p className="text-3xl font-bold text-white font-sora">{stats.commentaires.total}</p>
                      <p className="text-sm text-slate-400 font-inter">Commentaires</p>
                    </div>
                  </div>

                  {/* Engagement Stats */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-white font-sora mb-4">Engagement global</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-400 font-sora">{stats.engagement.vues.toLocaleString()}</p>
                          <p className="text-xs text-slate-400 font-inter">Vues</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-pink-400 font-sora">{stats.engagement.likes.toLocaleString()}</p>
                          <p className="text-xs text-slate-400 font-inter">Likes</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-green-400 font-sora">{stats.engagement.partages.toLocaleString()}</p>
                          <p className="text-xs text-slate-400 font-inter">Partages</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-white font-sora mb-4">Contenus par statut</h3>
                      <div className="space-y-2">
                        {Object.entries(stats.contenus.par_statut).map(([statut, count]) => (
                          <div key={statut} className="flex items-center justify-between">
                            <span className="text-slate-300 font-inter text-sm">{statut}</span>
                            <span className="text-white font-semibold">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Contenus par réseau */}
                  {stats.contenus.par_reseau && Object.keys(stats.contenus.par_reseau).length > 0 && (
                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-white font-sora mb-4">Contenus par réseau</h3>
                      <div className="flex flex-wrap gap-4">
                        {Object.entries(stats.contenus.par_reseau).map(([reseau, count]) => (
                          <div key={reseau} className="bg-slate-800/50 rounded-lg px-4 py-2 flex items-center gap-2">
                            <span className="text-slate-300 font-inter">{reseau}</span>
                            <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-sm font-semibold">
                              {count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 className="text-2xl font-bold font-sora text-white">Utilisateurs</h2>
                <Button onClick={handleExportCSV} variant="outline" className="border-slate-700 text-slate-300">
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'all', label: 'Tous' },
                  { id: 'pending', label: 'En attente' },
                  { id: 'active', label: 'Actifs' },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setUserFilter(filter.id)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-inter transition-all",
                      userFilter === filter.id
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "bg-slate-900/50 text-slate-400 hover:text-white border border-transparent"
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-900/50 border-slate-800 text-slate-200"
                />
              </div>

              {/* Users List */}
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.telegram_id}
                      className="bg-slate-900/40 border border-white/5 rounded-xl p-5 hover:border-red-500/30 transition-all"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-sora font-semibold">
                          {getInitials(user.nom)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-white font-sora font-semibold truncate">{user.nom || 'Sans nom'}</h3>
                            <Badge className={user.actif ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}>
                              {user.actif ? 'Actif' : 'En attente'}
                            </Badge>
                          </div>
                          <p className="text-slate-400 text-sm truncate">{user.email}</p>
                          <p className="text-slate-500 text-xs font-mono">ID: {user.telegram_id}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                        <Button size="sm" variant="ghost" onClick={() => handleViewUser(user.telegram_id)} className="text-slate-400 hover:text-white">
                          <Eye className="w-4 h-4" />
                        </Button>
                        {user.actif ? (
                          <Button size="sm" variant="ghost" onClick={() => handleDeactivate(user.telegram_id)} disabled={actionLoading === user.telegram_id} className="text-amber-400 hover:bg-amber-500/20">
                            {actionLoading === user.telegram_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => handleActivate(user.telegram_id)} disabled={actionLoading === user.telegram_id} className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">
                            {actionLoading === user.telegram_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(user)} className="text-red-400 hover:bg-red-500/20">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Avatars Tab */}
          {activeTab === 'avatars' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold font-sora text-white">Gestion des Avatars</h2>
                <Button variant="ghost" onClick={loadData} className="text-slate-400 hover:text-white">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Actualiser
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                </div>
              ) : avatars.length === 0 ? (
                <div className="text-center py-20">
                  <Video className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  <p className="text-slate-400 font-inter">Aucune demande d'avatar</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {avatars.map((av) => {
                    const statusCfg = AVATAR_STATUS_CONFIG[av.status] || AVATAR_STATUS_CONFIG.pending;
                    const userName = av.users?.nom || av.users?.username || `ID ${av.telegram_id}`;
                    const isEditing = editingAvatar?.telegram_id === av.telegram_id;

                    return (
                      <div key={av.telegram_id} className="bg-slate-900/40 border border-white/5 rounded-xl overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-sora font-semibold text-sm">
                              {userName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="text-white font-sora font-semibold">{userName}</h3>
                              <p className="text-xs text-slate-500 font-mono">ID: {av.telegram_id}</p>
                              {av.users?.email && <p className="text-xs text-slate-400">{av.users.email}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={`${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</Badge>
                            {av.created_at && (
                              <span className="text-xs text-slate-500 font-inter">
                                {new Date(av.created_at).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Description */}
                        {av.description && (
                          <div className="px-5 pb-3">
                            <p className="text-xs text-slate-500 font-inter mb-1">Description du client</p>
                            <p className="text-sm text-slate-300 font-inter bg-slate-800/30 rounded-lg p-3">{av.description}</p>
                          </div>
                        )}

                        {/* Video link */}
                        <div className="px-5 pb-3 flex flex-wrap gap-3">
                          {av.training_video_url && (
                            <a href={av.training_video_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-inter hover:bg-blue-500/20 transition-colors">
                              <ExternalLink className="w-3.5 h-3.5" />Vidéo entraînement
                            </a>
                          )}
                          {av.consent_url && (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-inter">
                              <CheckCircle className="w-3.5 h-3.5" />Lien consentement envoyé
                            </span>
                          )}
                        </div>

                        {/* Edit form (expandable) */}
                        {isEditing ? (
                          <div className="px-5 pb-5 pt-3 border-t border-white/5 space-y-4">
                            <h4 className="text-sm font-semibold text-white font-sora">Remplir les infos avatar</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-inter">Avatar ID (HeyGen)</label>
                                <Input
                                  value={avatarForm.avatar_id}
                                  onChange={(e) => setAvatarForm(p => ({ ...p, avatar_id: e.target.value }))}
                                  placeholder="avatar_xxxxxxxx"
                                  className="bg-slate-950/50 border-slate-800 text-slate-200 text-sm"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-inter">Statut</label>
                                <select
                                  value={avatarForm.status}
                                  onChange={(e) => setAvatarForm(p => ({ ...p, status: e.target.value }))}
                                  className="w-full rounded-md bg-slate-950/50 border border-slate-800 text-slate-200 text-sm px-3 py-2 outline-none"
                                  data-testid="avatar-status-select"
                                >
                                  <option value="pending">En attente</option>
                                  <option value="in_progress">En cours</option>
                                  <option value="complete">Prêt</option>
                                  <option value="failed">Échec</option>
                                </select>
                              </div>
                              <div className="space-y-1.5 md:col-span-2">
                                <label className="text-xs text-slate-400 font-inter">Lien de consentement HeyGen</label>
                                <Input
                                  value={avatarForm.consent_url}
                                  onChange={(e) => setAvatarForm(p => ({ ...p, consent_url: e.target.value }))}
                                  placeholder="https://app.heygen.com/consent/..."
                                  className="bg-slate-950/50 border-slate-800 text-slate-200 text-sm"
                                />
                                <p className="text-[10px] text-slate-500 font-inter">Ce lien sera visible par l'utilisateur pour qu'il donne son consentement.</p>
                              </div>
                              {avatarForm.status === 'failed' && (
                                <div className="space-y-1.5 md:col-span-2">
                                  <label className="text-xs text-slate-400 font-inter">Message d'erreur</label>
                                  <Input
                                    value={avatarForm.error_message}
                                    onChange={(e) => setAvatarForm(p => ({ ...p, error_message: e.target.value }))}
                                    placeholder="Raison de l'échec..."
                                    className="bg-slate-950/50 border-slate-800 text-slate-200 text-sm"
                                  />
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button onClick={handleSaveAvatar} disabled={savingAvatar} size="sm"
                                className="bg-gradient-to-r from-red-500 to-orange-500 hover:opacity-90 text-white font-inter text-xs">
                                {savingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                                Sauvegarder
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingAvatar(null)}
                                className="text-slate-400 hover:text-white font-inter text-xs">
                                Annuler
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="px-5 pb-4 pt-2 border-t border-white/5 flex gap-2">
                            <Button size="sm" onClick={() => handleEditAvatar(av)}
                              className="bg-red-500/20 text-red-400 hover:bg-red-500/30 font-inter text-xs">
                              <Settings className="w-3.5 h-3.5 mr-1" />
                              Gérer l'avatar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteAvatar(av.telegram_id)}
                              className="text-red-400 hover:bg-red-500/20 font-inter text-xs">
                              <Trash2 className="w-3.5 h-3.5 mr-1" />Supprimer
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold font-sora text-white">Activité récente</h2>
                <Button variant="ghost" onClick={loadData} className="text-slate-400 hover:text-white">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Actualiser
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity, index) => (
                    <div key={index} className="flex items-center gap-4 p-4 bg-slate-900/40 border border-white/5 rounded-lg">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        activity.type === 'user' ? "bg-blue-500/20" : "bg-purple-500/20"
                      )}>
                        {activity.type === 'user' ? (
                          <Users className="w-5 h-5 text-blue-400" />
                        ) : (
                          <FileText className="w-5 h-5 text-purple-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-inter truncate">{activity.title}</p>
                        <p className="text-sm text-slate-400">{activity.action}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-inter">
                          {activity.date ? new Date(activity.date).toLocaleDateString('fr-FR') : ''}
                        </p>
                        <p className="text-xs text-slate-600 font-mono">ID: {activity.user_id}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold font-sora text-white">Paramètres</h2>
              <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                <p className="text-slate-400 font-inter">Les paramètres globaux de la plateforme seront disponibles prochainement.</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white font-sora">Profil utilisateur</DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6">
              {/* User Info */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-sora font-bold text-xl">
                  {getInitials(selectedUser.nom)}
                </div>
                <div>
                  <h3 className="text-xl text-white font-sora font-semibold">{selectedUser.nom}</h3>
                  <p className="text-slate-400">{selectedUser.email}</p>
                  <Badge className={selectedUser.actif ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}>
                    {selectedUser.actif ? 'Actif' : 'En attente'}
                  </Badge>
                </div>
              </div>

              {/* User Stats */}
              {selectedUser.stats && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white font-sora">{selectedUser.stats.total_contenus}</p>
                    <p className="text-xs text-slate-400">Contenus</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white font-sora">{selectedUser.stats.total_commentaires}</p>
                    <p className="text-xs text-slate-400">Commentaires</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white font-sora">
                      {selectedUser.stats.contenus_par_statut?.['Publié'] || 0}
                    </p>
                    <p className="text-xs text-slate-400">Publiés</p>
                  </div>
                </div>
              )}

              {/* User Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Telegram ID</p>
                  <p className="text-white font-mono">{selectedUser.telegram_id}</p>
                </div>
                <div>
                  <p className="text-slate-500">Username</p>
                  <p className="text-white">{selectedUser.username || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Sexe</p>
                  <p className="text-white">{selectedUser.sexe || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Inscrit le</p>
                  <p className="text-white">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString('fr-FR') : '-'}</p>
                </div>
              </div>

              {/* User Contenus */}
              {userContenus.length > 0 && (
                <div>
                  <h4 className="text-white font-sora font-semibold mb-3">Derniers contenus</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {userContenus.slice(0, 10).map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg">
                        <Badge className={
                          c.statut === 'Publié' ? 'bg-blue-500/20 text-blue-400' :
                          c.statut === 'Validé' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-amber-500/20 text-amber-400'
                        }>
                          {c.statut}
                        </Badge>
                        <p className="text-slate-300 text-sm truncate flex-1">{c.titre || c.contenu?.substring(0, 50)}</p>
                        <p className="text-xs text-slate-500">{new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Supprimer cet utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action supprimera définitivement <span className="text-white font-medium">{deleteConfirm?.nom}</span> et toutes ses données.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-200">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
