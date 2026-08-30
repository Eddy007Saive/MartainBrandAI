import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, Users, Activity, Settings, LogOut, Search, Download,
  UserCheck, UserX, Trash2, Eye, FileText, MessageCircle, TrendingUp,
  Loader2, ChevronRight, ChevronLeft, ChevronDown, Clock, CheckCircle, XCircle, RefreshCw,
  Video, ExternalLink, Save, AlertCircle, Bell, Send, Coins, Crown,
  Plus, Minus, DollarSign, Wifi, Inbox, Copy, BarChart3, Handshake, Briefcase, TrendingDown, Menu, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import QuotaConfigTab from '../components/admin/QuotaConfigTab';
import AuditsTab from '../components/admin/AuditsTab';
import BillingTab from '../components/admin/BillingTab';
import AffiliationTab from '../components/admin/AffiliationTab';
import RemplirDepuisSite from '../components/RemplirDepuisSite';
import AdminPromos from './AdminPromos';
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
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid } from 'recharts';
import { removeAdminToken, memoriserEspace } from '../lib/auth';
import BlocFacturation from '../components/admin/BlocFacturation';
import Resiliations from '../components/admin/Resiliations';
import { cn } from '../lib/utils';
import { adminService } from '../services/adminService';
import CarrouselTemplateImport from '../components/CarrouselTemplateImport';
import { enterVision } from '../lib/vision';

// Douze entrees a plat, c'est une liste qu'on parcourt du regard a chaque
// fois. Regroupees par intention — piloter, gerer les clients, suivre l'argent
// — on va droit a la bonne famille.
//
// « Parametres » reste hors groupe : un parent a un seul enfant n'est pas un
// classement, c'est un pli inutile.
const navGroupes = [
  {
    id: 'pilotage', label: 'Pilotage', icon: LayoutDashboard,
    enfants: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'activity', label: 'Activité', icon: Activity },
    ],
  },
  {
    id: 'clients', label: 'Clients', icon: Users,
    enfants: [
      { id: 'users', label: 'Utilisateurs', icon: Users },
      { id: 'audits', label: 'Audits', icon: Inbox },
      { id: 'avatars', label: 'Avatars', icon: Video },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    id: 'revenus', label: 'Revenus', icon: DollarSign,
    enfants: [
      { id: 'quotas', label: 'Offres & quotas', icon: Coins },
      { id: 'facturation', label: 'Facturation', icon: FileText },
      { id: 'promos', label: 'Codes promo', icon: DollarSign },
      { id: 'affiliation', label: 'Affiliation', icon: Handshake },
      { id: 'departs', label: 'Départs', icon: TrendingDown },
    ],
  },
];
const navSeuls = [{ id: 'settings', label: 'Paramètres', icon: Settings }];

// Le groupe qui contient un onglet — sert a rouvrir le bon au chargement.
const groupeDe = (tabId) =>
  navGroupes.find((g) => g.enfants.some((e) => e.id === tabId))?.id || null;

const PLAN_CFG = {
  gratuit: { label: 'Gratuit', color: 'text-slate-300', bg: 'bg-slate-500/20' },
  pro: { label: 'Pro', color: 'text-indigo-300', bg: 'bg-indigo-500/20' },
  business: { label: 'Business', color: 'text-amber-300', bg: 'bg-amber-500/20' },
  boss: { label: 'Boss', color: 'text-fuchsia-300', bg: 'bg-fuchsia-500/20' },
};
const PLAN_OPTIONS = ['gratuit', 'pro', 'business', 'boss'];

const NET_DOT = { linkedin: '#0a66c2', instagram: '#d62976', facebook: '#1877f2', tiktok: '#e5e7eb', youtube: '#ff0000', googlebusiness: '#4285f4', twitter: '#000000' };

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

const AVATAR_STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  in_progress: { label: 'En cours', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  complete: { label: 'Prêt', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  failed: { label: 'Échec', color: 'text-red-400', bg: 'bg-red-500/20' },
};

export default function Admin() {
  const navigate = useNavigate();
  // Navigation pilotée par l'URL : chaque onglet a sa propre adresse (?tab=users, ?tab=quotas…)
  // et la fiche client est une PAGE (?tab=users&u=<telegram_id>) — refresh/retour navigateur OK.
  const [searchParams, setSearchParams] = useSearchParams();
  const viewedUser = searchParams.get('u');
  const activeTab = viewedUser ? 'client' : (searchParams.get('tab') || 'dashboard');
  // Un seul groupe ouvert a la fois : deux ouverts et l'on retrouve la liste a
  // plat qu'on cherchait a eviter.
  //
  // Pas de memorisation en stockage local : l'ouverture suit l'onglet actif,
  // qui est lui-meme dans l'URL. Un souvenir separe serait ecrase a chaque
  // chargement par l'effet ci-dessous — une promesse que le code ne tient pas.
  const [groupeOuvert, setGroupeOuvert] = useState(() => groupeDe(activeTab) || 'pilotage');

  // Arriver sur un onglet par un lien direct ou le retour arriere ouvre son
  // groupe. Depend du seul activeTab : ouvrir un autre groupe a la main pour
  // regarder ce qu'il contient ne doit pas le refermer aussitot.
  useEffect(() => {
    const g = groupeDe(activeTab);
    if (g) setGroupeOuvert(g);
  }, [activeTab]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const basculerGroupe = (id) => setGroupeOuvert((ouvert) => (ouvert === id ? null : id));
  const setActiveTab = (t) => { setSearchParams(t === 'dashboard' ? {} : { tab: t }); setMobileMenuOpen(false); };
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
  const [themeForm, setThemeForm] = useState({ id: '', label: '' });
  const [carrTpls, setCarrTpls] = useState([]);   // catalogue des templates de carrousel sur mesure
  const [carrSel, setCarrSel] = useState([]);     // ceux attribues au compte ouvert
  const [userActionLoading, setUserActionLoading] = useState(false);

  // Quotas du client (jauges période courante + bonus individuels)
  const [userUsage, setUserUsage] = useState(null);
  const [bonusInputs, setBonusInputs] = useState({});

  // Paramètres (système)
  const [system, setSystem] = useState(null);
  const [apiBalances, setApiBalances] = useState(null);
  const [produit, setProduit] = useState(null); // synthèse Analytics (business + PostHog)
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
      } else if (activeTab === 'analytics') {
        adminService.getAnalyticsProduit().then(setProduit).catch(() => setProduit(null));
      } else if (activeTab === 'settings') {
        const sys = await adminService.getSystem();
        setSystem(sys);
        // Soldes fournisseurs IA (OpenRouter/Anthropic) — non bloquant si un fournisseur rame
        adminService.getApiBalances().then(setApiBalances).catch(() => setApiBalances(null));
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

  // Clic sur un client -> navigation vers sa PAGE (l'effet ci-dessous charge les données)
  const handleViewUser = (telegramId) => setSearchParams({ tab: 'users', u: telegramId });

  const loadUserDetail = async (telegramId) => {
    try {
      const userData = await adminService.getUser(telegramId);
      const contenusData = await adminService.getUserContenus(telegramId);
      setSelectedUser(userData);
      setUserContenus(contenusData);
      setThemeForm({ id: userData.submagic_theme_id || '', label: userData.submagic_theme_label || '' });
      setCarrSel((userData.carrousel_templates_exclusifs || '').split(',').map((x) => x.trim()).filter(Boolean));
      if (!carrTpls.length) adminService.getCarrouselTemplates()
        .then((d) => setCarrTpls([...(d?.exclusifs || []), ...((d?.importes || []).map((x) => x.id))]))
        .catch(() => {});
    } catch (error) {
      toast.error('Erreur lors du chargement du profil');
    }
  };

  useEffect(() => {
    if (viewedUser) loadUserDetail(viewedUser);
    else { setSelectedUser(null); setUserContenus([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedUser]);

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

  const handleSaveCarrTpls = async (next) => {
    if (!selectedUser) return;
    setUserActionLoading(true);
    try {
      await adminService.setCarrouselTemplates(selectedUser.telegram_id, next);
      setCarrSel(next);
      setSelectedUser((u) => (u ? { ...u, carrousel_templates_exclusifs: next.join(',') || null } : u));
      toast.success(next.length ? 'Template(s) attribué(s) ✓' : 'Templates sur mesure retirés');
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur attribution'); }
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

      {/* Barre du haut (mobile) : titre + hamburger — la sidebar est cachée hors drawer */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-slate-950/90 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold font-sora bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">Admin Panel</h1>
        <button onClick={() => setMobileMenuOpen((o) => !o)} className="text-slate-300 hover:text-white p-1" aria-label="Menu">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Fond sombre (mobile) quand le drawer est ouvert */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar : statique en desktop, drawer coulissant en mobile */}
      <aside className={cn(
        "w-64 flex flex-col border-r border-white/5 backdrop-blur-xl",
        "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out-strong bg-slate-950/95",
        "md:static md:z-10 md:translate-x-0 md:bg-slate-950/50",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="p-6 border-b border-white/5">
          <h1 className="text-xl font-bold font-sora bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
            Admin Panel
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-inter">Gestion de la plateforme</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navGroupes.map((groupe) => {
            const Icone = groupe.icon;
            const ouvert = groupeOuvert === groupe.id;
            // Un point sur le parent replie dit ou l'on se trouve sans l'ouvrir.
            const contientActif = groupe.enfants.some(
              (e) => e.id === activeTab || (e.id === 'users' && activeTab === 'client'));
            return (
              <div key={groupe.id}>
                <button
                  onClick={() => basculerGroupe(groupe.id)}
                  aria-expanded={ouvert}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left font-inter",
                    "transition-colors duration-200",
                    contientActif && !ouvert ? "text-white" : "text-slate-300 hover:text-white hover:bg-slate-800/40",
                  )}
                >
                  <Icone className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className="text-[13px] font-semibold tracking-wide flex-1">{groupe.label}</span>
                  {contientActif && !ouvert && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                  <ChevronDown className={cn(
                    "w-4 h-4 flex-shrink-0 transition-transform duration-200 ease-out-strong",
                    ouvert ? "rotate-0" : "-rotate-90")} />
                </button>

                {/* Replie par la hauteur plutot que par display:none : la
                    transition existe, et le contenu reste dans le DOM pour la
                    recherche du navigateur. */}
                <div className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out-strong",
                  ouvert ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="overflow-hidden">
                    <div className="pt-1 pb-1 space-y-0.5">
                      {groupe.enfants.map((item) => {
                        const Icon = item.icon;
                        const actif = activeTab === item.id
                          || (item.id === 'users' && activeTab === 'client');
                        return (
                          <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            tabIndex={ouvert ? 0 : -1}
                            className={cn(
                              "w-full flex items-center gap-3 pl-6 pr-4 py-2.5 rounded-lg text-left",
                              "transition-colors duration-200 font-inter",
                              actif
                                ? "bg-gradient-to-r from-red-500/20 to-orange-500/20 text-white border-l-2 border-red-500"
                                : "text-slate-400 hover:text-white hover:bg-slate-800/50",
                            )}
                          >
                            <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                            <span className="text-sm font-medium">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Hors groupe : voir « Systeme > Parametres » couterait un pli pour
              une seule entree. */}
          <div className="pt-2 mt-2 border-t border-white/5">
            {navSeuls.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left",
                    "transition-colors duration-200 font-inter",
                    activeTab === item.id
                      ? "bg-gradient-to-r from-red-500/20 to-orange-500/20 text-white border-l-2 border-red-500"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50",
                  )}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-white/5 space-y-1">
          {/* Un administrateur gere souvent ses propres marques. Sans ce
              passage, son espace client n'etait accessible qu'en tapant
              l'adresse : toutes les portes d'entree menaient ici. */}
          <button
            onClick={() => { memoriserEspace('client'); navigate('/dashboard'); }}
            data-testid="vers-espace-client"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all duration-200 font-inter"
          >
            <Briefcase className="w-5 h-5" />
            <span className="text-sm font-medium">Mon espace client</span>
          </button>
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
      <main className="flex-1 overflow-y-auto relative z-10 pt-14 md:pt-0">
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

          {/* Analytics Tab — synthèse chiffrée (business + PostHog) + dashboard embarqué */}
          {activeTab === 'analytics' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white font-sora">Analytics produit</h2>
                  <p className="text-sm text-slate-400 font-inter">Business (base de données) + comportement (PostHog). Cache 10 min.</p>
                </div>
                <a href="https://us.posthog.com/shared/x6aulyqg5IjJ_83ANU5hlR1fLWpA3g" target="_blank" rel="noreferrer"
                  className="text-xs text-slate-400 hover:text-white font-inter inline-flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> Plein écran
                </a>
              </div>

              {/* KPIs business — source de vérité : Supabase/Stripe */}
              {produit?.business && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
                    <p className="text-xs text-slate-400">MRR</p>
                    <p className="text-2xl font-bold text-emerald-400 font-sora">{produit.business.mrr_eur.toLocaleString('fr-FR')} €</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{produit.business.clients_payants} abonnement{produit.business.clients_payants > 1 ? 's' : ''} actif{produit.business.clients_payants > 1 ? 's' : ''}</p>
                  </div>
                  <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
                    <p className="text-xs text-slate-400">Conversion → payant</p>
                    <p className="text-2xl font-bold text-white font-sora">{produit.business.conversion_payant_pct}%</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{produit.business.clients_payants} payants / {produit.business.clients_actifs} clients actifs</p>
                  </div>
                  <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
                    <p className="text-xs text-slate-400">Contenus publiés</p>
                    <p className="text-2xl font-bold text-white font-sora">{produit.business.contenus_publies}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">sur {produit.business.contenus_total} générés</p>
                  </div>
                  <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4">
                    <p className="text-xs text-slate-400">Par plan</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {Object.entries(produit.business.par_plan).map(([p, n]) => (
                        <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10 capitalize">{p} · {n}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Funnel d'activation chiffré (PostHog) */}
              {produit?.posthog?.funnel && (
                <div className="bg-slate-900/40 border border-white/5 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white font-sora mb-3">Funnel d'activation (90 jours)</h3>
                  <div className="space-y-2">
                    {produit.posthog.funnel.map((s, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-inter w-40 shrink-0 truncate">{s.etape}</span>
                        <div className="flex-1 h-6 bg-slate-800/60 rounded-md overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] rounded-md"
                            style={{ width: `${Math.max(2, s.pct)}%` }} />
                        </div>
                        <span className="text-xs text-slate-300 font-inter w-24 text-right">{s.n} · {s.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Courbes hebdo (PostHog) */}
              {produit?.posthog?.series && (
                <div className="bg-slate-900/40 border border-white/5 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white font-sora mb-3">Activité hebdomadaire (60 jours)</h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={(() => {
                        const s = produit.posthog.series;
                        const keys = Object.keys(s);
                        const labels = s[keys[0]]?.labels || [];
                        return labels.map((l, i) => {
                          const row = { semaine: l };
                          keys.forEach((k) => { row[k] = s[k]?.data?.[i] ?? 0; });
                          return row;
                        });
                      })()}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="semaine" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                        <ChartTooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#94a3b8' }} />
                        <Line type="monotone" dataKey="Contenus générés" stroke="#8A6CFF" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Posts validés" stroke="#3AFFA3" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Sessions" stroke="#64748b" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-4 mt-2 text-[11px] text-slate-400">
                    <span><span className="inline-block w-2.5 h-0.5 bg-[#8A6CFF] align-middle mr-1.5" />Contenus générés</span>
                    <span><span className="inline-block w-2.5 h-0.5 bg-[#3AFFA3] align-middle mr-1.5" />Posts validés</span>
                    <span><span className="inline-block w-2.5 h-0.5 bg-slate-500 align-middle mr-1.5" />Sessions (dirigeants actifs)</span>
                  </div>
                </div>
              )}

              {/* PostHog non configuré côté serveur */}
              {produit && !produit.posthog_configure && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-300/90 font-inter">
                  Funnel et courbes désactivés : ajoute la variable <code className="text-amber-200">POSTHOG_API_KEY</code> (Personal API key PostHog) sur Railway pour activer les chiffres de conversion ici.
                </div>
              )}
              <iframe
                title="Dashboard PostHog"
                src="https://us.posthog.com/embedded/x6aulyqg5IjJ_83ANU5hlR1fLWpA3g"
                className="w-full rounded-2xl border border-white/[0.06] bg-[#0f172a]"
                // PostHog n'offre pas de thème sombre forçable sur les dashboards partagés
                // (il suit le thème de l'OS du visiteur) -> inversion CSS + rotation des teintes
                // pour un rendu sombre cohérent avec l'admin, couleurs des courbes préservées.
                style={{ height: 'calc(100vh - 220px)', minHeight: 900, filter: 'invert(0.92) hue-rotate(180deg)' }}
              />
            </div>
          )}

          {/* Offres & quotas Tab */}
          {activeTab === 'audits' && <AuditsTab />}
          {activeTab === 'quotas' && <QuotaConfigTab />}
          {activeTab === 'promos' && <AdminPromos />}
          {activeTab === 'facturation' && <BillingTab />}
          {activeTab === 'affiliation' && <AffiliationTab />}
          {activeTab === 'departs' && <Resiliations />}

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

              <CarrouselTemplateImport />

              {loading || !system ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>
              ) : (
                <>
                  {/* Soldes fournisseurs IA */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white font-sora mb-1">Soldes API (fournisseurs IA)</h3>
                    <p className="text-xs text-slate-500 mb-4">OpenRouter = solde prépayé restant (images). Claude = dépense du mois en cours (Anthropic n'expose pas de solde via API).</p>
                    {!apiBalances ? (
                      <div className="flex items-center gap-2 text-slate-500 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" />Interrogation des fournisseurs…</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-slate-800/40 rounded-lg p-4">
                          <p className="text-xs text-slate-400 mb-1">OpenRouter (images)</p>
                          {apiBalances.openrouter ? (
                            <>
                              <p className={cn('text-2xl font-bold font-sora', apiBalances.openrouter.restant_usd < 20 ? 'text-red-400' : apiBalances.openrouter.restant_usd < 50 ? 'text-amber-400' : 'text-emerald-400')}>
                                ${apiBalances.openrouter.restant_usd} <span className="text-sm font-normal text-slate-500">restants</span>
                              </p>
                              <p className="text-xs text-slate-500 mt-1">${apiBalances.openrouter.consomme_usd} consommés / ${apiBalances.openrouter.achete_usd} achetés</p>
                              {apiBalances.openrouter.restant_usd < 20 && <p className="text-xs text-red-400 mt-1.5">⚠ Solde faible — recharge sur openrouter.ai</p>}
                            </>
                          ) : <p className="text-sm text-slate-500">Indisponible</p>}
                        </div>
                        <div className="bg-slate-800/40 rounded-lg p-4">
                          <p className="text-xs text-slate-400 mb-1">Claude / Anthropic (textes)</p>
                          {apiBalances.anthropic ? (
                            <>
                              <p className="text-2xl font-bold font-sora text-white">${apiBalances.anthropic.mois_usd} <span className="text-sm font-normal text-slate-500">ce mois-ci</span></p>
                              <p className="text-xs text-slate-500 mt-1">
                                {apiBalances.anthropic.mode === 'officiel' ? 'Chiffre officiel (clé Admin Anthropic)' : 'Estimation interne (usage_log) — solde visible sur console.anthropic.com'}
                              </p>
                            </>
                          ) : <p className="text-sm text-slate-500">Indisponible</p>}
                        </div>
                      </div>
                    )}
                  </div>

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
                          {Object.entries(system.plans || {}).map(([plan, prix]) => (
                            <div key={plan} className="flex items-center justify-between">
                              <span className="text-slate-300 capitalize">{plan}</span>
                              <span className="text-slate-400 text-xs">{prix}€/mois</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rendus vidéo — le coût d'un reel, c'est du temps de calcul */}
                  {system.rendus?.total?.n > 0 && (
                    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-white font-sora mb-1">Rendus vidéo (Remotion)</h3>
                      <p className="text-xs text-slate-500 mb-4">
                        Un reel ne consomme pas de tokens : il consomme du temps de calcul. Coût estimé au tarif serveur.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                        {[
                          { v: system.rendus.total.n, l: 'rendus' },
                          { v: `${system.rendus.total.moyenne_s}s`, l: 'durée moyenne' },
                          { v: `$${system.rendus.total.cout_moyen_usd}`, l: 'coût moyen' },
                          { v: `$${system.rendus.total.cost_usd}`, l: 'coût total' },
                        ].map((s) => (
                          <div key={s.l} className="bg-slate-800/40 rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-white font-sora tabular-nums">{s.v}</p>
                            <p className="text-xs text-slate-500 mt-1">{s.l}</p>
                          </div>
                        ))}
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-500 text-xs border-b border-white/5">
                            <th className="text-left py-2 font-medium">Template</th>
                            <th className="text-right py-2 font-medium">Rendus</th>
                            <th className="text-right py-2 font-medium">Moyenne</th>
                            <th className="text-right py-2 font-medium">Coût moyen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {system.rendus.par_template.map((r) => (
                            <tr key={r.template} className="border-b border-white/[0.03]">
                              <td className="py-2 text-slate-300">{r.template}</td>
                              <td className="py-2 text-right text-slate-300 tabular-nums">
                                {r.n}{r.echecs > 0 && <span className="text-amber-400"> ({r.echecs} échec{r.echecs > 1 ? 's' : ''})</span>}
                              </td>
                              <td className="py-2 text-right text-slate-400 tabular-nums">{r.moyenne_s}s</td>
                              <td className="py-2 text-right text-slate-400 tabular-nums">${r.cout_moyen_usd}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {system.rendus.total.echecs > 0 && (
                        <p className="text-xs text-amber-400/80 mt-3">
                          {system.rendus.total.echecs} rendu(s) échoué(s) — ils consomment du CPU sans rien produire.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white font-sora mb-4">Actions</h3>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={handleRefreshAnalytics} disabled={sysAction === 'analytics'} className="bg-slate-800 hover:bg-slate-700 text-slate-200">
                        {sysAction === 'analytics' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Synchroniser les analytics
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">Les quotas se réinitialisent seuls à chaque période — rien à faire ici.</p>
                  </div>
                </>
              )}
            </div>
          )}
          {/* PAGE CLIENT — indépendante, pilotée par l'URL (?tab=users&u=<id>) */}
          {activeTab === 'client' && (
            <div className="max-w-3xl mx-auto">
              <button onClick={() => setSearchParams({ tab: 'users' })} data-testid="back-to-users"
                className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white font-inter transition-colors">
                <ChevronLeft className="w-4 h-4" />Retour aux utilisateurs
              </button>
              {!selectedUser && (
                <div className="flex items-center justify-center py-16 gap-2 text-slate-400 font-inter text-sm">
                  <Loader2 className="w-5 h-5 animate-spin text-red-400" />Chargement du profil…
                </div>
              )}
          {selectedUser && (
            <div className="space-y-3.5">
              {/* La fiche de marque est posee par l'equipe, pas par le client :
                  c'est le coeur du Pack Fondations. On lit son site, on relit,
                  on applique sur SON compte. */}
              <RemplirDepuisSite
                user={selectedUser}
                admin={{
                  analyser: adminService.analyserSite,
                  appliquer: (payload) => adminService
                    .appliquerMarque(selectedUser.telegram_id, payload)
                    .then((r) => { loadUserDetail(selectedUser.telegram_id); return r; }),
                }} />
              {/* Identité */}
              <div className="flex items-center gap-3.5 pb-3.5 border-b border-white/[0.06]">
                <div className="w-[46px] h-[46px] rounded-[14px] bg-gradient-to-br from-red-500 to-orange-500 grid place-items-center text-white font-sora font-bold text-base shrink-0">
                  {getInitials(selectedUser.nom)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base text-white font-sora font-semibold truncate">{selectedUser.nom}</h3>
                    <span className={`shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${selectedUser.actif ? 'bg-[#3AFFA3]/10 text-[#3AFFA3] border-[#3AFFA3]/25' : 'bg-amber-500/10 text-amber-400 border-amber-500/25'}`}>
                      {selectedUser.actif ? 'Actif' : 'En attente'}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-slate-500 truncate">{selectedUser.email}</p>
                </div>
                <Button size="sm" onClick={handleStartVision} disabled={userActionLoading} data-testid="vision-btn"
                  className="shrink-0 bg-[#5B6CFF]/15 border border-[#8A6CFF]/35 text-[#c4b5fd] hover:bg-[#5B6CFF]/25 hover:text-white font-inter text-xs rounded-[11px] transition-all active:scale-[0.97]">
                  {userActionLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
                  Mode Vision
                </Button>
              </div>

              {/* Facturation : la carte laissée au Pack, et le bouton qui
                  démarre l'abonnement quand le paramétrage est livré. */}
              <BlocFacturation telegramId={selectedUser.telegram_id} />

              {/* Stats — bande unique, séparateurs hairline */}
              {selectedUser.stats && (
                <div className="grid grid-cols-1 sm:grid-cols-3 rounded-[14px] border border-white/[0.06] bg-[#0a1120] overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
                  {[
                    { v: selectedUser.stats.total_contenus, l: 'Contenus' },
                    { v: selectedUser.stats.total_commentaires, l: 'Commentaires' },
                    { v: selectedUser.stats.contenus_par_statut?.['Publié'] || 0, l: 'Publiés' },
                  ].map((s) => (
                    <div key={s.l} className="py-3.5 px-4 text-center">
                      <p className="text-[22px] leading-tight font-bold text-white font-sora tabular-nums">{s.v}</p>
                      <p className="text-[11px] text-slate-500">{s.l}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Forfait & crédits */}
              <div className="rounded-[14px] border border-white/[0.06] bg-[#0a1120] p-4 space-y-3">
                <div className="text-[10.5px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Forfait &amp; crédits</div>
                <div className="flex gap-1 p-1 bg-[#0c1322] border border-white/[0.06] rounded-[11px]">
                  {PLAN_OPTIONS.map((p) => (
                    <button key={p} onClick={() => handleSetPlan(p)} disabled={userActionLoading}
                      className={cn('flex-1 py-2 rounded-lg text-xs font-medium font-inter transition-all active:scale-[0.97] disabled:opacity-50',
                        (selectedUser.plan || 'gratuit') === p
                          ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white'
                          : 'text-slate-400 hover:text-white')}>
                      {PLAN_CFG[p].label}
                    </button>
                  ))}
                </div>
                {/* Le solde de crédits a disparu avec les quotas : tout se règle
                    dans le panneau « Quotas » ci-dessous, type d'action par type d'action. */}
              </div>

              {/* Quotas (période en cours) — jauges + bonus individuel par type */}
              <div className="rounded-[14px] border border-white/[0.06] bg-[#0a1120] p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[10.5px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Quotas — période en cours</div>
                  {userUsage?.plan_name && <span className="text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full bg-[#5B6CFF]/15 text-[#b9a6ff] border border-[#8A6CFF]/30">{userUsage.plan_name}</span>}
                </div>
                {!userUsage ? (
                  <div className="flex items-center gap-2 text-slate-400 text-xs py-3"><Loader2 className="w-3.5 h-3.5 animate-spin" />Chargement des quotas…</div>
                ) : !(userUsage.gauges || []).length ? (
                  <p className="text-xs text-slate-500 py-2">Aucun abonnement actif — pas de quotas à afficher.</p>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-600 mt-1.5 mb-1">« Bonus » = offert en plus du plan, pour ce client, sur la période en cours.</p>
                    <div className="divide-y divide-white/[0.06]">
                      {userUsage.gauges.map((g) => {
                        const pct = g.limit > 0 ? Math.min(100, Math.round((g.used / g.limit) * 100)) : 0;
                        return (
                          <div key={g.action_type} className="flex items-center gap-3.5 py-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between mb-1.5">
                                <span className="text-xs text-slate-300 font-medium capitalize">{g.label}</span>
                                <span className="text-[11.5px] text-slate-500 tabular-nums">{g.used}/{g.limit}{g.extra > 0 && <span className="text-[#3AFFA3]"> (+{g.extra})</span>} · reste {g.remaining}</span>
                              </div>
                              <div className="h-[5px] rounded bg-white/[0.06] overflow-hidden">
                                <div className={`h-full rounded ${pct >= 90 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]'}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Input type="number" min="0" value={bonusInputs[g.action_type] ?? ''}
                                onChange={(e) => setBonusInputs((b) => ({ ...b, [g.action_type]: e.target.value }))}
                                className="bg-[#0c1322] border-white/[0.06] focus:border-[#3AFFA3]/50 text-slate-200 text-xs w-14 h-7 text-center rounded-lg tabular-nums" title="Bonus (quantité offerte en plus du plan)" />
                              <Button size="sm" onClick={() => handleSetBonus(g.action_type)} disabled={userActionLoading}
                                className="h-7 w-7 p-0 bg-[#3AFFA3]/10 text-[#3AFFA3] hover:bg-[#3AFFA3]/20 border border-[#3AFFA3]/25 rounded-lg transition-all active:scale-[0.94]">
                                <Save className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Thème vidéo Submagic (assigné par l'admin) */}
              <div className="rounded-[14px] border border-white/[0.06] bg-[#0a1120] p-4 space-y-2.5">
                <div className="text-[10.5px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Thème vidéo (Submagic)</div>
                <p className="text-[11px] text-slate-600">Crée le thème dans l'éditeur Submagic puis colle son <b className="text-slate-400">userThemeId</b>. Vide = 45 templates par défaut.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input value={themeForm.label} onChange={(e) => setThemeForm((t) => ({ ...t, label: e.target.value }))}
                    placeholder="Nom affiché (ex. Thème GoodTime)" className="bg-[#0c1322] border-white/[0.06] text-slate-200 text-sm h-9 rounded-[9px] sm:w-56" />
                  <Input value={themeForm.id} onChange={(e) => setThemeForm((t) => ({ ...t, id: e.target.value }))}
                    placeholder="userThemeId (UUID Submagic)" className="bg-[#0c1322] border-white/[0.06] text-slate-200 text-sm h-9 rounded-[9px] flex-1" />
                  <Button size="sm" onClick={handleSaveTheme} disabled={userActionLoading}
                    className="h-9 bg-[#5B6CFF]/15 text-[#b9a6ff] hover:bg-[#5B6CFF]/25 border border-[#8A6CFF]/30 rounded-[9px] transition-all active:scale-[0.97]">
                    {userActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}Enregistrer
                  </Button>
                </div>
              </div>

              {/* Templates de carrousel sur mesure (attribués par l'admin) */}
              <div className="rounded-[14px] border border-white/[0.06] bg-[#0a1120] p-4 space-y-2.5">
                <div className="text-[10.5px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Templates de carrousel sur mesure</div>
                <p className="text-[11px] text-slate-600">Designs réservés : invisibles dans le studio du client tant qu'ils ne lui sont pas attribués.</p>
                {carrTpls.length === 0 ? (
                  <p className="text-[12px] text-slate-500">Aucun template sur mesure disponible.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {carrTpls.map((id) => {
                      const on = carrSel.includes(id);
                      return (
                        <button key={id} type="button" disabled={userActionLoading}
                          onClick={() => handleSaveCarrTpls(on ? carrSel.filter((x) => x !== id) : [...carrSel, id])}
                          data-testid={`admin-carr-tpl-${id}`}
                          className={`px-3 py-1.5 rounded-[9px] text-[12.5px] font-medium border transition-all active:scale-[0.97] disabled:opacity-50 ${
                            on ? 'border-[#3AFFA3]/50 bg-[#3AFFA3]/10 text-[#3AFFA3]' : 'border-white/[0.08] bg-[#0c1322] text-slate-400 hover:text-white hover:border-white/20'}`}>
                          {on && <CheckCircle className="w-3.5 h-3.5 mr-1 inline -mt-px" />}{id}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Détails — liste hairline (plus de grille qui déborde) */}
              <div className="rounded-[14px] border border-white/[0.06] bg-[#0a1120] p-4">
                <div className="text-[10.5px] uppercase tracking-[0.16em] text-slate-500 font-semibold mb-1">Détails</div>
                <div className="divide-y divide-white/[0.06] text-[13px]">
                  {[
                    ['Forfait', `${PLAN_CFG[selectedUser.plan || 'gratuit'].label}${selectedUser.plan_renews_at ? ` · renouv. ${new Date(selectedUser.plan_renews_at).toLocaleDateString('fr-FR')}` : ''}`],
                    ['Abonnement Stripe', selectedUser.stripe_subscription_id ? 'Actif' : '—'],
                    ['Réseaux connectés', selectedUser.reseaux_connectes?.length ? selectedUser.reseaux_connectes.join(', ') : 'Aucun'],
                    ['Fuseau horaire', selectedUser.timezone || '—'],
                    ['Dernière activité', `${selectedUser.derniere_activite ? new Date(selectedUser.derniere_activite).toLocaleDateString('fr-FR') : '—'} · inscrit le ${selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString('fr-FR') : '—'}`],
                    ['Username', selectedUser.username || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 py-2.5">
                      <span className="w-[150px] shrink-0 text-slate-500 text-xs">{k}</span>
                      <span className="text-slate-200 min-w-0 flex-1 truncate capitalize">{v}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 py-2.5">
                    <span className="w-[150px] shrink-0 text-slate-500 text-xs">ID</span>
                    <span className="min-w-0 flex-1 flex items-center gap-1.5">
                      <code className="font-mono text-[11.5px] text-slate-400 bg-[#0c1322] border border-white/[0.06] rounded-[7px] px-2 py-1 truncate">{selectedUser.telegram_id}</code>
                      <button title="Copier l'ID" data-testid="copy-user-id"
                        onClick={() => { navigator.clipboard?.writeText(selectedUser.telegram_id); toast.success('ID copié'); }}
                        className="shrink-0 w-[26px] h-[26px] grid place-items-center rounded-[7px] border border-white/[0.06] text-slate-500 hover:text-white hover:border-white/[0.18] transition-all active:scale-[0.92]">
                        <Copy className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                </div>
              </div>

              {/* Derniers contenus */}
              {userContenus.length > 0 && (
                <div className="rounded-[14px] border border-white/[0.06] bg-[#0a1120] p-4">
                  <div className="text-[10.5px] uppercase tracking-[0.16em] text-slate-500 font-semibold mb-1">Derniers contenus</div>
                  <div className="divide-y divide-white/[0.06] max-h-56 overflow-y-auto">
                    {userContenus.slice(0, 10).map((c) => (
                      <div key={c.id} className="flex items-center gap-2.5 py-2.5">
                        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          c.statut === 'Publié' || c.statut === 'Publie' ? 'bg-blue-500/10 text-blue-300 border-blue-500/25' :
                          c.statut === 'Validé' || c.statut === 'Valider' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' :
                          'bg-amber-500/10 text-amber-300 border-amber-500/25'}`}>
                          {c.statut}
                        </span>
                        <p className="text-slate-300 text-[12.5px] truncate flex-1">{c.titre || c.contenu?.substring(0, 50)}</p>
                        <p className="text-[10.5px] text-slate-600 tabular-nums shrink-0">{new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button onClick={() => { pushToUser(selectedUser); setSelectedUser(null); }}
                  className="flex-1 h-9 bg-white/[0.04] text-slate-300 hover:text-white border border-white/[0.06] hover:border-white/[0.16] rounded-[9px] font-inter text-xs transition-all active:scale-[0.98]">
                  <Bell className="w-3.5 h-3.5 mr-2" />Envoyer une notification
                </Button>
                <Button onClick={() => { const u = selectedUser; setSelectedUser(null); setDeleteConfirm(u); }}
                  className="h-9 bg-transparent text-red-400/80 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/35 rounded-[9px] font-inter text-xs transition-all active:scale-[0.98]">
                  Supprimer le compte
                </Button>
              </div>
            </div>
          )}
            </div>
          )}
        </div>
      </main>

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
