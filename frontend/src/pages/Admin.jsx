import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Activity, Settings, LogOut, Search, Download,
  UserCheck, UserX, Trash2, Eye, FileText, MessageCircle, TrendingUp,
  Loader2, ChevronRight, Clock, CheckCircle, XCircle, RefreshCw,
  Video, ExternalLink, Save, AlertCircle, Bell, Send, Coins, Crown,
  Plus, Minus, DollarSign, Wifi, Inbox
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import QuotaConfigTab from '../components/admin/QuotaConfigTab';
import AuditsTab from '../components/admin/AuditsTab';
import BillingTab from '../components/admin/BillingTab';
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
import { enterVision } from '../lib/vision';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Utilisateurs', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'avatars', label: 'Avatars', icon: Video },
  { id: 'audits', label: 'Audits', icon: Inbox },
  { id: 'quotas', label: 'Offres & quotas', icon: Coins },
  { id: 'facturation', label: 'Facturation', icon: FileText },
  { id: 'activity', label: 'Activité', icon: Activity },
  { id: 'settings', label: 'Paramètres', icon: Settings },
];

const PLAN_CFG = {
  gratuit: { label: 'Gratuit', color: 'text-slate-300', bg: 'bg-slate-500/20' },
  pro: { label: 'Pro', color: 'text-indigo-300', bg: 'bg-indigo-500/20' },
  business: { label: 'Business', color: 'text-amber-300', bg: 'bg-amber-500/20' },
};
const PLAN_OPTIONS = ['gratuit', 'pro', 'business'];

const NET_DOT = { linkedin: '#0a66c2', instagram: '#d62976', facebook: '#1877f2', tiktok: '#e5e7eb', youtube: '#ff0000' };

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

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

  // Crédits / plan (dans la fiche user)
  const [creditInput, setCreditInput] = useState('');
  const [themeForm, setThemeForm] = useState({ id: '', label: '' });
  const [userActionLoading, setUserActionLoading] = useState(false);

  // Quotas du client (jauges période courante + bonus individuels)
  const [userUsage, setUserUsage] = useState(null);
  const [bonusInputs, setBonusInputs] = useState({});

  // Paramètres (système)
  const [system, setSystem] = useState(null);
  const [sysAction, setSysAction] = useState(null);

  // Notifications push
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushTarget, setPushTarget] = useState(null); // null = tous
  const [sendingPush, setSendingPush] = useState(false);

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
      } else if (activeTab === 'settings') {
        const sys = await adminService.getSystem();
        setSystem(sys);
      }
    } catch (error) {
      toast.error('Erreur lors du chargement');
      if (error.message.includes('401') || error.message.includes('403')) {
        navigate('/login');
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
      setThemeForm({ id: userData.submagic_theme_id || '', label: userData.submagic_theme_label || '' });
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

  const refreshSelected = async (telegramId) => {
    try {
      const u = await adminService.getUser(telegramId);
      setSelectedUser(u);
      setUsers((prev) => prev.map((x) => x.telegram_id === telegramId ? { ...x, ...u } : x));
    } catch (_) { /* noop */ }
  };

  const loadUserUsage = async (telegramId) => {
    setUserUsage(null);
    try {
      const u = await adminService.getUserUsage(telegramId);
      setUserUsage(u);
      const inputs = {};
      for (const g of u.gauges || []) inputs[g.action_type] = String(g.extra ?? 0);
      setBonusInputs(inputs);
    } catch (_) { setUserUsage({ gauges: [] }); }
  };

  const handleStartVision = async () => {
    if (!selectedUser) return;
    setUserActionLoading(true);
    try {
      const d = await adminService.startVision(selectedUser.telegram_id);
      enterVision(d.token, { nom: d.user?.nom || selectedUser.nom, email: d.user?.email, expires_at: d.expires_at });
      // enterVision redirige vers /dashboard — pas de suite ici
    } catch (e) {
      toast.error('Impossible de démarrer le Mode Vision');
      setUserActionLoading(false);
    }
  };

  const handleSetBonus = async (actionType) => {
    if (!selectedUser) return;
    const val = parseInt(bonusInputs[actionType], 10);
    if (Number.isNaN(val) || val < 0) { toast.error('Bonus invalide'); return; }
    setUserActionLoading(true);
    try {
      const u = await adminService.setQuotaBonus(selectedUser.telegram_id, actionType, val);
      setUserUsage((prev) => ({ ...(prev || {}), ...u }));
      toast.success(val > 0 ? `Bonus ${val} appliqué ✓` : 'Bonus retiré');
    } catch (e) { toast.error('Erreur bonus quota'); }
    finally { setUserActionLoading(false); }
  };

  // Charge les jauges de quotas à l'ouverture de la fiche client
  useEffect(() => {
    if (selectedUser?.telegram_id) loadUserUsage(selectedUser.telegram_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser?.telegram_id]);

  const handleSetCredits = async (mode) => {
    if (!selectedUser) return;
    const amount = parseInt(creditInput, 10);
    if (Number.isNaN(amount)) { toast.error('Montant invalide'); return; }
    setUserActionLoading(true);
    try {
      await adminService.setCredits(selectedUser.telegram_id, amount, mode);
      toast.success(mode === 'add' ? `${amount > 0 ? '+' : ''}${amount} crédits` : `Solde fixé à ${amount}`);
      setCreditInput('');
      await refreshSelected(selectedUser.telegram_id);
    } catch (e) { toast.error('Erreur crédits'); }
    finally { setUserActionLoading(false); }
  };

  const handleSetPlan = async (plan) => {
    if (!selectedUser || plan === selectedUser.plan) return;
    setUserActionLoading(true);
    try {
      await adminService.setPlan(selectedUser.telegram_id, plan, true);
      toast.success(`Forfait → ${PLAN_CFG[plan]?.label || plan}`);
      await refreshSelected(selectedUser.telegram_id);
    } catch (e) { toast.error('Erreur forfait'); }
    finally { setUserActionLoading(false); }
  };

  const handleSaveTheme = async () => {
    if (!selectedUser) return;
    setUserActionLoading(true);
    try {
      await adminService.setSubmagicTheme(selectedUser.telegram_id, themeForm.id.trim(), themeForm.label.trim());
      setSelectedUser((u) => (u ? { ...u, submagic_theme_id: themeForm.id.trim() || null, submagic_theme_label: themeForm.label.trim() || null } : u));
      toast.success(themeForm.id.trim() ? 'Thème vidéo assigné ✓' : 'Thème vidéo retiré');
    } catch (e) { toast.error('Erreur thème vidéo'); }
    finally { setUserActionLoading(false); }
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) { toast.error('Titre et message requis'); return; }
    setSendingPush(true);
    try {
      const r = await adminService.sendPush(pushTitle.trim(), pushBody.trim(), pushTarget?.telegram_id || null);
      toast.success(`Envoyé à ${r.sent}/${r.targets} appareil(s)`);
      setPushTitle(''); setPushBody('');
    } catch (e) { toast.error('Échec de l\'envoi'); }
    finally { setSendingPush(false); }
  };

  const handleRefreshAnalytics = async () => {
    setSysAction('analytics');
    try {
      const r = await adminService.refreshAnalytics();
      toast.success(`Analytics : ${r.refreshed ?? 0} user(s) synchronisé(s)`);
    } catch (e) { toast.error('Erreur synchro analytics'); }
    finally { setSysAction(null); }
  };

  const handleResetCredits = async () => {
    if (!window.confirm('Réinitialiser les crédits de TOUS les utilisateurs au quota de leur forfait ?')) return;
    setSysAction('credits');
    try {
      const r = await adminService.resetMonthlyCredits();
      const n = Object.values(r.reset || {}).reduce((a, b) => a + b, 0);
      toast.success(`Crédits réinitialisés pour ${n} utilisateur(s)`);
    } catch (e) { toast.error('Erreur reset crédits'); }
    finally { setSysAction(null); }
  };

  const pushToUser = (user) => {
    setPushTarget(user);
    setActiveTab('notifications');
  };

  const handleLogout = () => {
    removeAdminToken();
    navigate('/login');
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

                  {/* Revenus & forfaits */}
                  {stats.revenus && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-indigo-500/15 to-purple-500/10 border border-indigo-500/20 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-2">
                          <DollarSign className="w-5 h-5 text-indigo-300" />
                          <span className="text-xs text-slate-400 font-inter">MRR estimé</span>
                        </div>
                        <p className="text-3xl font-bold text-white font-sora">{stats.revenus.mrr}€<span className="text-base text-slate-400 font-inter"> /mois</span></p>
                        <p className="text-sm text-slate-400 font-inter mt-1">{stats.revenus.abonnes_payants} abonné(s) payant(s)</p>
                      </div>

                      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6 lg:col-span-2">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-white font-sora flex items-center gap-2"><Crown className="w-4 h-4 text-amber-300" />Répartition des forfaits</h3>
                          <span className="text-xs text-slate-400 font-inter flex items-center gap-1"><Coins className="w-3.5 h-3.5" />{stats.revenus.credits_total?.toLocaleString()} crédits en circulation</span>
                        </div>
                        <div className="space-y-2.5">
                          {PLAN_OPTIONS.map((p) => {
                            const count = stats.revenus.par_plan?.[p] || 0;
                            const pct = stats.users.total ? Math.round(count / stats.users.total * 100) : 0;
                            return (
                              <div key={p} className="flex items-center gap-3">
                                <span className={cn('text-xs font-inter w-20', PLAN_CFG[p].color)}>{PLAN_CFG[p].label}</span>
                                <div className="flex-1 h-2.5 rounded-full bg-slate-800 overflow-hidden">
                                  <div className={cn('h-full rounded-full', p === 'pro' ? 'bg-indigo-500' : p === 'business' ? 'bg-amber-500' : 'bg-slate-500')} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-sm text-white font-semibold w-10 text-right">{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

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
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold font-sora text-white">Utilisateurs</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{filteredUsers.length} compte{filteredUsers.length > 1 ? 's' : ''}{userFilter !== 'all' || searchTerm ? ' (filtré)' : ''}</p>
                </div>
                <Button onClick={handleExportCSV} variant="outline" className="border-slate-700 text-slate-300 shrink-0">
                  <Download className="w-4 h-4 mr-2" />Export CSV
                </Button>
              </div>

              {/* Recherche */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Rechercher un nom, un email…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11 bg-slate-900/50 border-slate-800 text-slate-200"
                />
              </div>

              {/* Filtres : statut + forfait */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-600 mr-1">Statut</span>
                {[['all', 'Tous'], ['active', 'Actifs'], ['pending', 'Bloqués']].map(([id, label]) => (
                  <button key={id} onClick={() => setUserFilter(id)}
                    className={cn('px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all',
                      userFilter === id ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-900/50 text-slate-400 hover:text-white border border-transparent')}>
                    {label}
                  </button>
                ))}
                <span className="w-px h-5 bg-white/10 mx-1.5" />
                <span className="text-[11px] uppercase tracking-wider text-slate-600 mr-1">Forfait</span>
                {PLAN_OPTIONS.map((p) => (
                  <button key={p} onClick={() => setUserFilter(p)}
                    className={cn('px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all capitalize',
                      userFilter === p ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-900/50 text-slate-400 hover:text-white border border-transparent')}>
                    {PLAN_CFG[p].label}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/30 border border-white/5 rounded-xl">
                  <Users className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                  <p className="text-slate-400 font-inter">Aucun utilisateur pour ce filtre.</p>
                </div>
              ) : (
                <div className="bg-slate-900/40 border border-white/5 rounded-xl overflow-hidden">
                  {/* === Tableau (desktop) === */}
                  <table className="hidden lg:table w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                        <th className="font-medium px-5 py-3">Utilisateur</th>
                        <th className="font-medium px-3 py-3">Forfait</th>
                        <th className="font-medium px-3 py-3 text-right">Crédits</th>
                        <th className="font-medium px-3 py-3">Réseaux</th>
                        <th className="font-medium px-3 py-3">Statut</th>
                        <th className="font-medium px-3 py-3">Inscrit</th>
                        <th className="font-medium px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.telegram_id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-sora font-semibold text-xs shrink-0">{getInitials(user.nom)}</div>
                              <div className="min-w-0">
                                <div className="text-slate-100 font-medium truncate max-w-[180px]">{user.nom || 'Sans nom'}</div>
                                <div className="text-slate-500 text-xs truncate max-w-[180px]">{user.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge className={cn('text-[10.5px] py-0', PLAN_CFG[user.plan || 'gratuit'].bg, PLAN_CFG[user.plan || 'gratuit'].color)}>{PLAN_CFG[user.plan || 'gratuit'].label}</Badge>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="inline-flex items-center gap-1 text-slate-300 font-medium"><Coins className="w-3.5 h-3.5 text-slate-500" />{user.credits ?? 0}</span>
                          </td>
                          <td className="px-3 py-3">
                            {user.reseaux_connectes?.length ? (
                              <span className="flex items-center gap-1" title={user.reseaux_connectes.join(', ')}>
                                {user.reseaux_connectes.map((n) => <span key={n} className="w-2 h-2 rounded-full" style={{ background: NET_DOT[n] || '#64748b' }} />)}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', user.actif ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', user.actif ? 'bg-emerald-400' : 'bg-red-400')} />{user.actif ? 'Actif' : 'Bloqué'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(user.created_at)}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleViewUser(user.telegram_id)} title="Voir" className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5"><Eye className="w-4 h-4" /></button>
                              <button onClick={() => pushToUser(user)} title="Notifier" className="w-8 h-8 grid place-items-center rounded-lg text-blue-400 hover:bg-blue-500/15"><Bell className="w-4 h-4" /></button>
                              {user.actif ? (
                                <button onClick={() => handleDeactivate(user.telegram_id)} disabled={actionLoading === user.telegram_id} title="Bloquer" className="w-8 h-8 grid place-items-center rounded-lg text-amber-400 hover:bg-amber-500/15 disabled:opacity-50">
                                  {actionLoading === user.telegram_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                                </button>
                              ) : (
                                <button onClick={() => handleActivate(user.telegram_id)} disabled={actionLoading === user.telegram_id} title="Activer" className="w-8 h-8 grid place-items-center rounded-lg text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50">
                                  {actionLoading === user.telegram_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                                </button>
                              )}
                              <button onClick={() => setDeleteConfirm(user)} title="Supprimer" className="w-8 h-8 grid place-items-center rounded-lg text-red-400 hover:bg-red-500/15"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* === Cartes (mobile) === */}
                  <div className="lg:hidden divide-y divide-white/[0.05]">
                    {filteredUsers.map((user) => (
                      <div key={user.telegram_id} className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-sora font-semibold text-sm shrink-0">{getInitials(user.nom)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-slate-100 font-medium truncate">{user.nom || 'Sans nom'}</div>
                            <div className="text-slate-500 text-xs truncate">{user.email}</div>
                          </div>
                          <span className={cn('shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full', user.actif ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', user.actif ? 'bg-emerald-400' : 'bg-red-400')} />{user.actif ? 'Actif' : 'Bloqué'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-3 text-[12px] text-slate-400">
                          <Badge className={cn('text-[10px] py-0', PLAN_CFG[user.plan || 'gratuit'].bg, PLAN_CFG[user.plan || 'gratuit'].color)}>{PLAN_CFG[user.plan || 'gratuit'].label}</Badge>
                          <span className="inline-flex items-center gap-1"><Coins className="w-3 h-3" />{user.credits ?? 0}</span>
                          {user.reseaux_connectes?.length > 0 && (
                            <span className="inline-flex items-center gap-1">{user.reseaux_connectes.map((n) => <span key={n} className="w-2 h-2 rounded-full" style={{ background: NET_DOT[n] || '#64748b' }} />)}</span>
                          )}
                          <span className="ml-auto text-slate-500">{fmtDate(user.created_at)}</span>
                        </div>
                        <div className="flex gap-1.5 mt-3 pt-3 border-t border-white/5">
                          <button onClick={() => handleViewUser(user.telegram_id)} className="flex-1 h-9 grid place-items-center rounded-lg text-slate-300 bg-white/5 hover:bg-white/10"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => pushToUser(user)} className="flex-1 h-9 grid place-items-center rounded-lg text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"><Bell className="w-4 h-4" /></button>
                          {user.actif ? (
                            <button onClick={() => handleDeactivate(user.telegram_id)} disabled={actionLoading === user.telegram_id} className="flex-1 h-9 grid place-items-center rounded-lg text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50">
                              {actionLoading === user.telegram_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                            </button>
                          ) : (
                            <button onClick={() => handleActivate(user.telegram_id)} disabled={actionLoading === user.telegram_id} className="flex-1 h-9 grid place-items-center rounded-lg text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
                              {actionLoading === user.telegram_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                            </button>
                          )}
                          <button onClick={() => setDeleteConfirm(user)} className="flex-1 h-9 grid place-items-center rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="text-2xl font-bold font-sora text-white">Notifications push</h2>
                <p className="text-sm text-slate-400 font-inter mt-1">Envoie une notification aux utilisateurs ayant l'application mobile installée.</p>
              </div>

              <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6 space-y-5">
                {/* Cible */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-inter">Destinataire</label>
                  {pushTarget ? (
                    <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-semibold">{getInitials(pushTarget.nom)}</div>
                        <div>
                          <p className="text-sm text-white">{pushTarget.nom || 'Sans nom'}</p>
                          <p className="text-xs text-slate-500">{pushTarget.email}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setPushTarget(null)} className="text-slate-400 hover:text-white text-xs">Tous les users</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 text-blue-300 text-sm">
                      <Users className="w-4 h-4" /> Tous les utilisateurs (broadcast)
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-inter">Titre</label>
                  <Input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} maxLength={60}
                    placeholder="Ex : Nouvelle fonctionnalité 🚀" className="bg-slate-950/50 border-slate-800 text-slate-200" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-inter">Message</label>
                  <Textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)} maxLength={180} rows={3}
                    placeholder="Ton message…" className="bg-slate-950/50 border-slate-800 text-slate-200 resize-none" />
                </div>

                {/* Aperçu */}
                {(pushTitle || pushBody) && (
                  <div className="bg-slate-950/60 border border-white/10 rounded-xl p-4 flex gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center text-white shrink-0"><Bell className="w-4 h-4" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{pushTitle || 'Titre'}</p>
                      <p className="text-xs text-slate-400 line-clamp-2">{pushBody || 'Message…'}</p>
                    </div>
                  </div>
                )}

                <Button onClick={handleSendPush} disabled={sendingPush || !pushTitle.trim() || !pushBody.trim()}
                  className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 text-white">
                  {sendingPush ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  {pushTarget ? 'Envoyer la notification' : 'Envoyer à tous'}
                </Button>
              </div>
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

          {/* Offres & quotas Tab */}
          {activeTab === 'audits' && <AuditsTab />}
          {activeTab === 'quotas' && <QuotaConfigTab />}
          {activeTab === 'facturation' && <BillingTab />}

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
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold font-sora text-white">Paramètres</h2>
                <Button variant="ghost" onClick={loadData} className="text-slate-400 hover:text-white">
                  <RefreshCw className="w-4 h-4 mr-2" />Actualiser
                </Button>
              </div>

              {loading || !system ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>
              ) : (
                <>
                  {/* Coûts & marges */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white font-sora mb-1">Coûts & marges</h3>
                    <p className="text-xs text-slate-500 mb-4">Crédits facturés vs coût réel de l'IA (tokens + images). Marge basée sur {system.usage.total.eur_par_credit}€/crédit (tarif Pro).</p>
                    <div className="grid grid-cols-3 gap-4 mb-5">
                      <div className="bg-slate-800/40 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-white font-sora">{system.usage.total.credits.toLocaleString()}</p>
                        <p className="text-xs text-slate-400">Crédits dépensés</p>
                      </div>
                      <div className="bg-slate-800/40 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-amber-400 font-sora">${system.usage.total.cost_usd}</p>
                        <p className="text-xs text-slate-400">Coût réel (IA)</p>
                      </div>
                      <div className="bg-slate-800/40 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-emerald-400 font-sora">{system.usage.total.marge}%</p>
                        <p className="text-xs text-slate-400">Marge brute</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-xs text-slate-500 border-b border-white/5">
                          <th className="py-2">Action</th><th className="py-2 text-right">Qté</th><th className="py-2 text-right">Crédits</th><th className="py-2 text-right">Coût $</th><th className="py-2 text-right">Marge</th>
                        </tr></thead>
                        <tbody>
                          {system.usage.par_action.map((r) => (
                            <tr key={r.action} className="border-b border-white/[0.03]">
                              <td className="py-2 text-slate-200 capitalize">{r.action}</td>
                              <td className="py-2 text-right text-slate-400">{r.n}</td>
                              <td className="py-2 text-right text-slate-300">{r.credits}</td>
                              <td className="py-2 text-right text-amber-400">${r.cost_usd}</td>
                              <td className="py-2 text-right text-emerald-400">{r.marge}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Intégrations */}
                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-white font-sora mb-4">Intégrations</h3>
                      <div className="space-y-2.5">
                        {Object.entries(system.integrations).map(([k, ok]) => (
                          <div key={k} className="flex items-center justify-between">
                            <span className="text-sm text-slate-300 font-inter">{k}</span>
                            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5', ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', ok ? 'bg-emerald-400' : 'bg-red-400')} />
                              {ok ? 'Configuré' : 'Manquant'}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                          <span className="text-sm text-slate-300 font-inter">Cron analytics</span>
                          <span className="text-xs text-slate-400">toutes les {system.cron_analytics_h} h</span>
                        </div>
                      </div>
                    </div>

                    {/* Barème crédits */}
                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-white font-sora mb-4">Barème (crédits)</h3>
                      <div className="space-y-2 text-sm">
                        {Object.entries(system.bareme).map(([action, val]) => (
                          <div key={action} className="flex items-center justify-between">
                            <span className="text-slate-300 capitalize">{action}</span>
                            <span className="text-slate-400 font-mono text-xs">
                              {typeof val === 'object' ? Object.entries(val).map(([q, c]) => `${q}:${c}`).join(' · ') : val}
                            </span>
                          </div>
                        ))}
                        <div className="pt-3 mt-1 border-t border-white/5 space-y-2">
                          {Object.entries(system.plans.credits).map(([plan, cr]) => (
                            <div key={plan} className="flex items-center justify-between">
                              <span className="text-slate-300 capitalize">{plan}</span>
                              <span className="text-slate-400 text-xs">{cr} cr · {system.plans.prix[plan]}€/mois</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white font-sora mb-4">Actions</h3>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={handleRefreshAnalytics} disabled={sysAction === 'analytics'} className="bg-slate-800 hover:bg-slate-700 text-slate-200">
                        {sysAction === 'analytics' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Synchroniser les analytics
                      </Button>
                      <Button onClick={handleResetCredits} disabled={sysAction === 'credits'} variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                        {sysAction === 'credits' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Coins className="w-4 h-4 mr-2" />}
                        Réinitialiser les crédits mensuels
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">« Réinitialiser » remet chaque utilisateur au quota de crédits de son forfait.</p>
                  </div>
                </>
              )}
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
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl text-white font-sora font-semibold">{selectedUser.nom}</h3>
                  <p className="text-slate-400">{selectedUser.email}</p>
                  <Badge className={selectedUser.actif ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}>
                    {selectedUser.actif ? 'Actif' : 'En attente'}
                  </Badge>
                </div>
                <Button size="sm" onClick={handleStartVision} disabled={userActionLoading} data-testid="vision-btn"
                  className="shrink-0 bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white font-inter text-xs hover:opacity-90">
                  {userActionLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
                  Mode Vision
                </Button>
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

              {/* Gestion forfait + crédits */}
              <div className="bg-slate-800/40 border border-white/5 rounded-xl p-4 space-y-4">
                <h4 className="text-sm font-semibold text-white font-sora flex items-center gap-2"><Crown className="w-4 h-4 text-amber-300" />Forfait & crédits</h4>

                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500">Forfait (change le solde aux crédits du plan)</p>
                  <div className="flex gap-2">
                    {PLAN_OPTIONS.map((p) => (
                      <button key={p} onClick={() => handleSetPlan(p)} disabled={userActionLoading}
                        className={cn('flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50',
                          (selectedUser.plan || 'gratuit') === p
                            ? cn(PLAN_CFG[p].bg, PLAN_CFG[p].color, 'ring-1 ring-white/20')
                            : 'bg-slate-900/50 text-slate-400 hover:text-white')}>
                        {PLAN_CFG[p].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500">Crédits — solde actuel : <span className="text-white font-semibold">{selectedUser.credits ?? 0}</span></p>
                  <div className="flex gap-2">
                    <Input type="number" value={creditInput} onChange={(e) => setCreditInput(e.target.value)}
                      placeholder="Montant" className="bg-slate-950/50 border-slate-800 text-slate-200 text-sm w-28" />
                    <Button size="sm" onClick={() => handleSetCredits('add')} disabled={userActionLoading} className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">
                      <Plus className="w-3.5 h-3.5 mr-1" />Ajouter
                    </Button>
                    <Button size="sm" onClick={() => handleSetCredits('set')} disabled={userActionLoading} variant="outline" className="border-slate-700 text-slate-300">
                      <Save className="w-3.5 h-3.5 mr-1" />Fixer
                    </Button>
                    {userActionLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 self-center" />}
                  </div>
                </div>
              </div>

              {/* Quotas (période en cours) — jauges + bonus individuel par type */}
              <div className="bg-slate-800/40 border border-white/5 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-white font-sora flex items-center gap-2"><Coins className="w-4 h-4 text-[#3AFFA3]" />Quotas — période en cours</h4>
                  {userUsage?.plan_name && <Badge className="bg-[#5B6CFF]/15 text-[#b9a6ff] border border-[#5B6CFF]/30">{userUsage.plan_name}</Badge>}
                </div>
                {!userUsage ? (
                  <div className="flex items-center gap-2 text-slate-400 text-xs py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Chargement des quotas…</div>
                ) : !(userUsage.gauges || []).length ? (
                  <p className="text-xs text-slate-500">Aucun abonnement actif — pas de quotas à afficher.</p>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-xs text-slate-500">« Bonus » = quantité offerte en plus du plan, pour CE client, sur la période en cours uniquement.</p>
                    {userUsage.gauges.map((g) => {
                      const pct = g.limit > 0 ? Math.min(100, Math.round((g.used / g.limit) * 100)) : 0;
                      return (
                        <div key={g.action_type} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between text-xs mb-1">
                              <span className="text-slate-300 capitalize">{g.label}</span>
                              <span className="text-slate-500 tabular-nums">{g.used}/{g.limit}{g.extra > 0 && <span className="text-[#3AFFA3]"> (+{g.extra})</span>} · reste {g.remaining}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                              <div className={`h-full rounded-full ${pct >= 90 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Input type="number" min="0" value={bonusInputs[g.action_type] ?? ''}
                              onChange={(e) => setBonusInputs((b) => ({ ...b, [g.action_type]: e.target.value }))}
                              className="bg-slate-950/50 border-slate-800 text-slate-200 text-xs w-20 h-8" title="Bonus (quantité offerte en plus du plan)" />
                            <Button size="sm" onClick={() => handleSetBonus(g.action_type)} disabled={userActionLoading}
                              className="h-8 bg-[#3AFFA3]/15 text-[#3AFFA3] hover:bg-[#3AFFA3]/25 border border-[#3AFFA3]/25 text-xs px-2.5">
                              <Save className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Thème vidéo Submagic (assigné par l'admin) */}
              <div className="bg-slate-800/40 border border-white/5 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-white font-sora flex items-center gap-2"><Video className="w-4 h-4 text-[#8A6CFF]" />Thème vidéo (Submagic)</h4>
                <p className="text-xs text-slate-500">Crée le thème de la marque dans l'éditeur Submagic, puis colle son <b className="text-slate-300">userThemeId</b> ici. Vide = le client utilise les 45 templates par défaut.</p>
                <div className="space-y-2">
                  <Input value={themeForm.label} onChange={(e) => setThemeForm((t) => ({ ...t, label: e.target.value }))}
                    placeholder="Nom affiché (ex. Thème GoodTime)" className="bg-slate-950/50 border-slate-800 text-slate-200 text-sm" />
                  <div className="flex gap-2">
                    <Input value={themeForm.id} onChange={(e) => setThemeForm((t) => ({ ...t, id: e.target.value }))}
                      placeholder="userThemeId (UUID Submagic)" className="bg-slate-950/50 border-slate-800 text-slate-200 text-sm flex-1" />
                    <Button size="sm" onClick={handleSaveTheme} disabled={userActionLoading} className="bg-[#5B6CFF]/20 text-[#b9a6ff] hover:bg-[#5B6CFF]/30 border border-[#5B6CFF]/30">
                      {userActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}Enregistrer
                    </Button>
                  </div>
                </div>
              </div>

              {/* User Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Forfait</p>
                  <p className="text-white">{PLAN_CFG[selectedUser.plan || 'gratuit'].label}{selectedUser.plan_renews_at ? ` · renouv. ${new Date(selectedUser.plan_renews_at).toLocaleDateString('fr-FR')}` : ''}</p>
                </div>
                <div>
                  <p className="text-slate-500">Abonnement Stripe</p>
                  <p className="text-white">{selectedUser.stripe_subscription_id ? 'Actif' : '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Réseaux connectés</p>
                  <p className="text-white capitalize">{selectedUser.reseaux_connectes?.length ? selectedUser.reseaux_connectes.join(', ') : 'Aucun'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Fuseau horaire</p>
                  <p className="text-white">{selectedUser.timezone || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Dernière activité</p>
                  <p className="text-white">{selectedUser.derniere_activite ? new Date(selectedUser.derniere_activite).toLocaleDateString('fr-FR') : '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Inscrit le</p>
                  <p className="text-white">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString('fr-FR') : '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Username</p>
                  <p className="text-white">{selectedUser.username || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">ID</p>
                  <p className="text-white font-mono text-xs">{selectedUser.telegram_id}</p>
                </div>
              </div>

              {/* Notifier ce user */}
              <Button variant="outline" onClick={() => { pushToUser(selectedUser); setSelectedUser(null); }}
                className="border-slate-700 text-slate-300 hover:text-white">
                <Bell className="w-4 h-4 mr-2" />Envoyer une notification à cet utilisateur
              </Button>

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
