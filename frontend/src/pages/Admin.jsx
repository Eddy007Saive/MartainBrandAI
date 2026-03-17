import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, CheckCircle, Users, Loader2, UserCheck, UserX, Trash2,
  LogOut, Search, Eye, RefreshCw, Download, ChevronLeft, ChevronRight,
  ArrowUpDown, Calendar, Plug, TrendingUp,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { getAdminToken, removeAdminToken } from '../lib/auth';
import { cn } from '../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// API helper with admin token
const adminApi = async (endpoint, options = {}) => {
  const token = getAdminToken();
  const response = await fetch(`${API_URL}/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Utilisateurs', icon: Users },
  { id: 'activity', label: 'Activité', icon: Activity },
  { id: 'settings', label: 'Paramètres', icon: Settings },
];

const ITEMS_PER_PAGE = 12;

const SORT_OPTIONS = [
  { id: 'date_desc', label: 'Plus récents' },
  { id: 'date_asc', label: 'Plus anciens' },
  { id: 'name_asc', label: 'Nom A-Z' },
  { id: 'name_desc', label: 'Nom Z-A' },
];

const PROFILE_FIELDS = [
  'nom', 'username', 'user_name', 'photo_url', 'sexe', 'style_vestimentaire',
  'late_profile_id', 'late_account_linkedin', 'late_account_instagram',
  'late_account_facebook', 'late_account_tiktok', 'telegram_bot_token',
  'telegram_bot_username', 'gpt_url_linkedin', 'gpt_url_instagram',
  'gpt_url_sujets', 'gpt_url_default', 'api_key_gemini',
  'couleur_principale', 'couleur_secondaire', 'couleur_accent',
];

const InstagramIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
);

const FacebookIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const LinkedInIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const TikTokIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </svg>
);

const SOCIAL_PLATFORMS = [
  { field: 'late_account_instagram', label: 'Instagram', icon: InstagramIcon },
  { field: 'late_account_facebook', label: 'Facebook', icon: FacebookIcon },
  { field: 'late_account_linkedin', label: 'LinkedIn', icon: LinkedInIcon },
  { field: 'late_account_tiktok', label: 'TikTok', icon: TikTokIcon },
];

function getProfileCompletion(user) {
  if (!user) return 0;
  const filled = PROFILE_FIELDS.filter(f => !!user[f]).length;
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getRelativeDate(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} sem.`;
  return `Il y a ${Math.floor(diffDays / 30)} mois`;
}

export default function Admin() {
  const navigate = useNavigate();
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [userFilter, setUserFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userContenus, setUserContenus] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('date_desc');
  const [retryLateLoading, setRetryLateLoading] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchTerm, sortBy]);

  const loadData = async () => {
    setLoading(true);
    try {
      const adminToken = getAdminToken();
      const response = await api.get('/admin/users?filter=all', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      setAllUsers(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement');
      if (error.message.includes('401') || error.message.includes('403')) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const total = allUsers.length;
    const active = allUsers.filter(u => u.actif).length;
    const pending = allUsers.filter(u => !u.actif).length;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = allUsers.filter(u => u.created_at && new Date(u.created_at) >= weekAgo).length;
    return { total, active, pending, thisWeek };
  }, [allUsers]);

  // Filter + search + sort
  const processedUsers = useMemo(() => {
    let filtered = allUsers;

    if (activeFilter === 'pending') filtered = filtered.filter(u => !u.actif);
    else if (activeFilter === 'active') filtered = filtered.filter(u => u.actif);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(u =>
        u.nom?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.telegram_id?.toString().includes(term)
      );
    }

    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'date_asc': return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        case 'name_asc': return (a.nom || '').localeCompare(b.nom || '');
        case 'name_desc': return (b.nom || '').localeCompare(a.nom || '');
        default: return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    });

    return filtered;
  }, [allUsers, activeFilter, searchTerm, sortBy]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(processedUsers.length / ITEMS_PER_PAGE));
  const paginatedUsers = processedUsers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

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
      toast.error('Erreur');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (telegramId) => {
    setActionLoading(telegramId);
    try {
      await adminApi(`/admin/users/${telegramId}/deactivate`, { method: 'PATCH' });
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
      await adminApi(`/admin/users/${deleteConfirm.telegram_id}`, { method: 'DELETE' });
      toast.success('Utilisateur supprimé');
      setDeleteConfirm(null);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      toast.error('Erreur');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryLate = async (telegramId, nom) => {
    setRetryLateLoading(telegramId);
    try {
      const adminToken = getAdminToken();
      const response = await api.post(`/admin/users/${telegramId}/retry-late`, {}, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (response.data.late_profile_created) {
        toast.success('Profil Late créé avec succès');
      } else {
        toast.error(`Échec : ${response.data.late_error || 'Erreur inconnue'}`, { duration: 6000 });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la création du profil Late');
    } finally {
      setRetryLateLoading(null);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Nom', 'Email', 'Telegram ID', 'Statut', 'Inscrit le', 'Profil %', 'Instagram', 'Facebook', 'LinkedIn', 'TikTok'];
    const rows = processedUsers.map(u => [
      u.nom || '',
      u.email || '',
      u.telegram_id || '',
      u.actif ? 'Actif' : 'En attente',
      formatDate(u.created_at),
      `${getProfileCompletion(u)}%`,
      u.late_account_instagram || '',
      u.late_account_facebook || '',
      u.late_account_linkedin || '',
      u.late_account_tiktok || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utilisateurs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  };

  const handleLogout = () => {
    removeAdminToken();
    navigate('/');
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-[#020617]" data-testid="admin-panel">
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* Header */}
      <header className="bg-slate-950/60 backdrop-blur-md border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
            Administration
          </h1>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExportCSV}
              variant="ghost"
              size="sm"
              data-testid="export-csv"
              className="text-slate-400 hover:text-white hover:bg-slate-800/50 font-inter text-xs"
            >
              <Download className="w-4 h-4 mr-1" />
              Export CSV
            </Button>
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
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total, icon: Users, color: 'from-[#5B6CFF] to-[#8A6CFF]', textColor: 'text-[#8A6CFF]' },
            { label: 'Actifs', value: stats.active, icon: CheckCircle, color: 'from-emerald-500 to-emerald-600', textColor: 'text-emerald-400' },
            { label: 'En attente', value: stats.pending, icon: Clock, color: 'from-amber-500 to-amber-600', textColor: 'text-amber-400' },
            { label: 'Cette semaine', value: stats.thisWeek, icon: TrendingUp, color: 'from-cyan-500 to-cyan-600', textColor: 'text-cyan-400' },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-slate-900/40 border border-white/5 rounded-xl p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-inter">{stat.label}</span>
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center bg-opacity-20`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className={`text-2xl font-bold font-sora ${stat.textColor}`}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* Filters + Sort */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {filters.map((filter) => {
            const Icon = filter.icon;
            const count = filter.id === 'pending' ? stats.pending : filter.id === 'active' ? stats.active : stats.total;
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
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{filter.label}</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "ml-1 text-xs",
                    activeFilter === filter.id ? "bg-[#5B6CFF]/30 text-white" : "bg-slate-800 text-slate-400"
                  )}
                >
                  {count}
                </Badge>
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              data-testid="sort-select"
              className="bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-inter focus:border-[#5B6CFF] focus:outline-none"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

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

        {/* Users List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
          </div>
        ) : paginatedUsers.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-16 h-16 mx-auto text-slate-700 mb-4" />
            <p className="text-slate-500 font-inter">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedUsers.map((user) => {
                const completion = getProfileCompletion(user);
                return (
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

                        {/* Date + Profile completion */}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-slate-600 text-xs font-inter flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {getRelativeDate(user.created_at)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  completion === 100 ? "bg-emerald-500" : completion >= 50 ? "bg-amber-500" : "bg-red-500"
                                )}
                                style={{ width: `${completion}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">{completion}%</span>
                          </div>
                        </div>

                        {/* Social icons */}
                        <div className="flex items-center gap-1.5 mt-2">
                          {SOCIAL_PLATFORMS.map(p => (
                            <span
                              key={p.field}
                              title={p.label}
                              className={cn(
                                "text-xs",
                                user[p.field] ? "opacity-100" : "opacity-20"
                              )}
                            >
                              <p.icon className="w-4 h-4" />
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedUser(user)}
                        data-testid={`view-${user.telegram_id}`}
                        className="bg-slate-800/50 hover:bg-slate-800 text-slate-300 border-slate-700 font-inter text-xs"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Détails
                      </Button>
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
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8 px-1">
                <span className="text-xs text-slate-500 font-inter">
                  {processedUsers.length} utilisateur{processedUsers.length > 1 ? 's' : ''} — Page {currentPage}/{totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((page, idx, arr) => (
                      <span key={page}>
                        {idx > 0 && arr[idx - 1] !== page - 1 && (
                          <span className="text-slate-600 text-xs mx-1">...</span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCurrentPage(page)}
                          className={cn(
                            "w-8 h-8 p-0 text-xs",
                            page === currentPage
                              ? "bg-[#5B6CFF]/20 border-[#5B6CFF]/30 text-white"
                              : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white"
                          )}
                        >
                          {page}
                        </Button>
                      </span>
                    ))
                  }
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* User Detail Modal */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedUser && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center text-white font-sora font-bold text-lg flex-shrink-0">
                    {getInitials(selectedUser.nom)}
                  </div>
                  <div>
                    <DialogTitle className="text-white font-sora text-lg">
                      {selectedUser.nom || 'Sans nom'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 font-inter">
                      {selectedUser.email} — ID: {selectedUser.telegram_id}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Status + Profile completion */}
                <div className="flex items-center gap-4">
                  <Badge className={cn(
                    "text-xs",
                    selectedUser.actif
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  )}>
                    {selectedUser.actif ? 'Actif' : 'En attente'}
                  </Badge>
                  <span className="text-xs text-slate-500 font-inter">
                    Inscrit le {formatDate(selectedUser.created_at)}
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          getProfileCompletion(selectedUser) === 100 ? "bg-emerald-500" :
                          getProfileCompletion(selectedUser) >= 50 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${getProfileCompletion(selectedUser)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{getProfileCompletion(selectedUser)}%</span>
                  </div>
                </div>

                {/* Identity */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-inter">Identité</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Nom', value: selectedUser.nom },
                      { label: 'Username', value: selectedUser.username },
                      { label: 'Nom affiché', value: selectedUser.user_name },
                      { label: 'Sexe', value: selectedUser.sexe },
                      { label: 'Style', value: selectedUser.style_vestimentaire },
                      { label: 'Photo', value: selectedUser.photo_url ? 'Configurée' : null },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-950/50 rounded-lg px-3 py-2">
                        <span className="text-[10px] text-slate-600 font-inter">{item.label}</span>
                        <p className={cn("text-sm font-inter truncate", item.value ? "text-slate-200" : "text-slate-600 italic")}>
                          {item.value || 'Non renseigné'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Social accounts */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-inter">Réseaux Sociaux</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {SOCIAL_PLATFORMS.map(p => (
                      <div key={p.field} className="bg-slate-950/50 rounded-lg px-3 py-2 flex items-center gap-2">
                        <p.icon className="w-4 h-4" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-600 font-inter">{p.label}</span>
                          <p className={cn("text-sm font-inter truncate", selectedUser[p.field] ? "text-slate-200" : "text-slate-600 italic")}>
                            {selectedUser[p.field] || 'Non connecté'}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div className="bg-slate-950/50 rounded-lg px-3 py-2">
                      <span className="text-[10px] text-slate-600 font-inter">Late Profile ID</span>
                      <p className={cn("text-sm font-inter truncate", selectedUser.late_profile_id ? "text-slate-200" : "text-slate-600 italic")}>
                        {selectedUser.late_profile_id || 'Non créé'}
                      </p>
                    </div>
                    <div className="bg-slate-950/50 rounded-lg px-3 py-2">
                      <span className="text-[10px] text-slate-600 font-inter">Telegram Bot</span>
                      <p className={cn("text-sm font-inter truncate", selectedUser.telegram_bot_username ? "text-slate-200" : "text-slate-600 italic")}>
                        {selectedUser.telegram_bot_username ? `@${selectedUser.telegram_bot_username}` : 'Non configuré'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* GPT URLs */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-inter">GPT & API</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'GPT LinkedIn', value: selectedUser.gpt_url_linkedin },
                      { label: 'GPT Instagram', value: selectedUser.gpt_url_instagram },
                      { label: 'GPT Sujets', value: selectedUser.gpt_url_sujets },
                      { label: 'GPT Default', value: selectedUser.gpt_url_default },
                      { label: 'Gemini API Key', value: selectedUser.api_key_gemini ? '••••••••' : null },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-950/50 rounded-lg px-3 py-2">
                        <span className="text-[10px] text-slate-600 font-inter">{item.label}</span>
                        <p className={cn("text-sm font-inter truncate", item.value ? "text-slate-200" : "text-slate-600 italic")}>
                          {item.value || 'Non renseigné'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

                {/* Colors */}
                {(selectedUser.couleur_principale || selectedUser.couleur_secondaire || selectedUser.couleur_accent) && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-inter">Couleurs</h4>
                    <div className="flex gap-3">
                      {[
                        { label: 'Principale', color: selectedUser.couleur_principale },
                        { label: 'Secondaire', color: selectedUser.couleur_secondaire },
                        { label: 'Accent', color: selectedUser.couleur_accent },
                      ].map(c => c.color && (
                        <div key={c.label} className="flex items-center gap-2 bg-slate-950/50 rounded-lg px-3 py-2">
                          <div className="w-5 h-5 rounded-md border border-white/10" style={{ backgroundColor: c.color }} />
                          <div>
                            <span className="text-[10px] text-slate-600 font-inter">{c.label}</span>
                            <p className="text-xs text-slate-300 font-mono">{c.color}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-slate-800">
                  {selectedUser.actif && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetryLate(selectedUser.telegram_id, selectedUser.nom)}
                      disabled={retryLateLoading === selectedUser.telegram_id}
                      data-testid={`retry-late-${selectedUser.telegram_id}`}
                      className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/20 font-inter text-xs"
                    >
                      {retryLateLoading === selectedUser.telegram_id ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <RefreshCw className="w-3 h-3 mr-1" />
                      )}
                      Recréer profil Late
                    </Button>
                  )}
                  {selectedUser.actif ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { handleDeactivate(selectedUser.telegram_id); setSelectedUser(null); }}
                      className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 font-inter text-xs"
                    >
                      <UserX className="w-3 h-3 mr-1" />
                      Désactiver
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => { handleActivate(selectedUser.telegram_id); setSelectedUser(null); }}
                      className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-inter text-xs"
                    >
                      <UserCheck className="w-3 h-3 mr-1" />
                      Activer
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setDeleteConfirm(selectedUser); setSelectedUser(null); }}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 font-inter text-xs ml-auto"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Supprimer
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
            <AlertDialogTitle className="text-white font-sora">Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 font-inter">
              Êtes-vous sûr de vouloir supprimer l'utilisateur <span className="text-white font-medium">{deleteConfirm?.nom}</span> ?
              Cette action est irréversible.
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
