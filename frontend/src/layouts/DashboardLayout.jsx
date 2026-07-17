import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { initPush } from '../lib/push';
import { Home, FileText, MessageCircle, Calendar, CalendarDays, Settings, LogOut, Menu, X, Sparkles, LayoutGrid, Download, ArrowLeft, BarChart3, User, Megaphone, Plug, CreditCard, Palette, Video, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { UserProvider, useUser } from '../context/UserContext';
import { removeToken } from '../lib/auth';
import { cn } from '../lib/utils';
import NotificationsBell from '../components/NotificationsBell';
import AccountSwitcher from '../components/AccountSwitcher';
import { APK_URL, downloadHidden, markDownloaded } from '../lib/appDownload';

const navItems = [
  { path: '/dashboard', label: 'nav.home', icon: Home },
  { path: '/dashboard/studio', label: 'nav.studio', icon: Sparkles },
  { path: '/dashboard/plan', label: 'nav.plan', icon: CalendarDays },
  { path: '/dashboard/contenus', label: 'nav.contents', icon: FileText },
  { path: '/dashboard/commentaires', label: 'nav.comments', icon: MessageCircle },
  { path: '/dashboard/performance', label: 'nav.performance', icon: BarChart3 },
  { path: '/dashboard/planification', label: 'nav.planning', icon: Calendar },
  { path: '/dashboard/carrousels', label: 'nav.carousels', icon: LayoutGrid },
  { path: '/dashboard/parametres', label: 'nav.settings', icon: Settings },
];

// Sous-navigation Paramètres : le sidebar principal se transforme en réglages quand on entre dans Paramètres.
const SETTINGS_NAV = [
  { id: 'identity', label: 'nav.identity', icon: User },
  { id: 'marque', label: 'nav.brandVoice', icon: Megaphone },
  { id: 'connections', label: 'nav.socials', icon: Plug },
  { id: 'schedules', label: 'nav.planning', icon: Calendar },
  { id: 'abonnement', label: 'nav.subscription', icon: CreditCard },
  { id: 'style', label: 'nav.style', icon: Palette },
  { id: 'avatar', label: 'nav.avatar', icon: Video, soon: true },
];

function SettingsNav({ onNavigate }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const active = params.get('s') || 'identity';
  return (
    <div className="flex-1 px-3 py-4 overflow-y-auto">
      <button
        onClick={() => navigate('/dashboard')}
        className="group w-full flex items-center gap-2.5 px-1 py-1.5 mb-3 text-left"
      >
        <span className="w-8 h-8 rounded-lg grid place-items-center border border-white/[0.08] bg-white/[0.03] text-slate-300 transition-transform duration-150 group-hover:-translate-x-0.5 group-hover:border-white/20">
          <ChevronLeft className="w-4 h-4" />
        </span>
        <span className="leading-tight">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-600 font-inter font-semibold">{t('nav.settingsGroup')}</span>
          <span className="block text-sm font-bold text-white font-sora">{t('nav.settings')}</span>
        </span>
      </button>
      <div className="space-y-1">
        {SETTINGS_NAV.map((s, i) => {
          const Icon = s.icon;
          const on = active === s.id;
          return (
            <button
              key={s.id}
              onClick={() => { setParams({ s: s.id }); onNavigate?.(); }}
              data-testid={`settings-nav-${s.id}`}
              style={{ animationDelay: `${i * 30}ms` }}
              className={cn(
                'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium font-inter transition-all duration-150 animate-in fade-in-0 slide-in-from-left-2 fill-mode-both',
                on ? 'bg-white/[0.06] text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
              )}
            >
              {on && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-gradient-to-b from-[#5B6CFF] to-[#8A6CFF]" />}
              <Icon className={cn('w-[18px] h-[18px] transition-colors', on ? 'text-[#8A6CFF]' : 'text-slate-500 group-hover:text-slate-300')} />
              <span className="flex-1 text-left">{t(s.label)}</span>
              {s.soon && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#8A6CFF]/15 text-[#b9a6ff] border border-[#8A6CFF]/30">{t('nav.soon')}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavItem({ item, onClick }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === '/dashboard'}
      onClick={onClick}
      data-testid={`nav-${item.label.split('.').pop()}`}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium font-inter transition-all duration-150',
          isActive ? 'bg-white/[0.06] text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-gradient-to-b from-[#5B6CFF] to-[#8A6CFF]" />}
          <Icon className={cn('w-[18px] h-[18px] transition-colors', isActive ? 'text-[#8A6CFF]' : 'text-slate-500 group-hover:text-slate-300')} />
          <span>{t(item.label)}</span>
        </>
      )}
    </NavLink>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.png" alt="Presence OS" className="w-9 h-9 object-contain flex-shrink-0" />
      <div className="leading-tight">
        <p className="text-sm font-bold text-white font-sora">Presence OS</p>
        <p className="text-[11px] text-slate-500 font-inter">Studio de contenu IA</p>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { t } = useTranslation();
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showDl, setShowDl] = useState(!downloadHidden());

  const isHome = location.pathname === '/dashboard' || location.pathname === '/dashboard/';
  const inSettings = location.pathname.startsWith('/dashboard/parametres');
  const goBack = () => { if (window.history.length > 1) navigate(-1); else navigate('/dashboard'); };

  // Notifications push (mobile) : demande la permission + enregistre le token
  useEffect(() => { initPush(); }, []);

  // Bouton retour Android : revenir en arrière dans l'app ; sur l'accueil -> mettre en arrière-plan (ne pas quitter)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle;
    CapApp.addListener('backButton', () => {
      // 1) Si une popup / lightbox est ouverte -> la fermer d'abord (Echap)
      const overlay = document.querySelector(
        '[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper], [data-cz-lightbox]'
      );
      if (overlay) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
        const closeBtn = overlay.querySelector('[data-cz-close], [aria-label="Close"], [aria-label="Fermer"]');
        if (closeBtn) closeBtn.click();
        return;
      }
      // 2) Sinon : revenir en arrière, ou mettre en arrière-plan sur l'accueil
      const p = window.location.pathname;
      if (p !== '/dashboard' && p !== '/dashboard/' && window.history.length > 1) {
        window.history.back();
      } else {
        CapApp.minimizeApp();
      }
    }).then((h) => { handle = h; });
    return () => { if (handle) handle.remove(); };
  }, []);

  const dismissDl = () => { markDownloaded(); setShowDl(false); };

  const handleLogout = () => {
    logout();
    removeToken();
    navigate('/login');
  };

  const initial = (user?.nom || user?.username || 'U').charAt(0).toUpperCase();

  const UserBlock = () => (
    <div className="p-3 border-t border-white/[0.06] space-y-1">
      <div className="flex items-center gap-3 px-2 py-2">
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-white/15" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white font-inter truncate">{user?.nom || user?.username || 'Utilisateur'}</p>
          {user?.email && <p className="text-[11px] text-slate-500 font-inter truncate">{user.email}</p>}
        </div>
      </div>
      <button
        onClick={handleLogout}
        data-testid="logout-btn"
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 text-sm font-medium font-inter"
      >
        <LogOut className="w-[18px] h-[18px]" />
        <span>{t('nav.logout')}</span>
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#020617] overflow-hidden">
      {/* Glow + noise (desktop uniquement — allégé sur mobile) */}
      <div className="hidden md:block fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#5B6CFF]/[0.06] blur-[120px] rounded-full pointer-events-none z-0" />
      <div className="hidden md:block fixed inset-0 z-[1] pointer-events-none opacity-[0.025] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-white/[0.06] bg-[#080c17]/80 backdrop-blur-xl relative z-10">
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
          <Brand />
        </div>
        {!inSettings && (
          <div className="px-3 pt-3">
            <AccountSwitcher />
          </div>
        )}
        {inSettings ? (
          <SettingsNav />
        ) : (
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-slate-600 font-inter px-3 mb-2">Menu</p>
            {navItems.map((item) => (
              <NavItem key={item.path} item={item} />
            ))}
          </nav>
        )}
        <UserBlock />
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#080c17]/90 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {!isHome && (
            <button onClick={goBack} aria-label="Retour" className="w-9 h-9 -ml-1 rounded-lg grid place-items-center text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <Brand />
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-slate-400 hover:text-white">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Cloche notifications (desktop) */}
      <div className="hidden md:block fixed top-5 right-7 z-30">
        <NotificationsBell />
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-[#050810]/95 backdrop-blur-xl pt-20 flex flex-col">
          <nav className="px-4 space-y-1 flex-1">
            {navItems.map((item) => (
              <NavItem key={item.path} item={item} onClick={() => setMobileMenuOpen(false)} />
            ))}
          </nav>
          <UserBlock />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10 pt-16 md:pt-0">
        <div className="p-5 md:p-8 w-full min-h-full">
          {showDl && (
            <div className="mb-5 flex items-center gap-3 p-3 rounded-xl border border-[#3AFFA3]/25 bg-[#3AFFA3]/[0.06]">
              <Download className="w-5 h-5 text-[#3AFFA3] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white font-inter">Installe l'app mobile</p>
                <p className="text-xs text-slate-400 font-inter">Notifications push + accès rapide depuis ton téléphone.</p>
              </div>
              <a href={APK_URL} onClick={dismissDl}
                className="shrink-0 px-3 py-2 rounded-lg bg-[#3AFFA3]/15 text-[#3AFFA3] text-[13px] font-semibold hover:bg-[#3AFFA3]/25 transition-colors">
                Télécharger
              </a>
              <button onClick={dismissDl} aria-label="Fermer" className="shrink-0 text-slate-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <UserProvider>
      <DashboardContent />
    </UserProvider>
  );
}
