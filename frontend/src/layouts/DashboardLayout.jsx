import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, FileText, MessageCircle, Calendar, Settings, LogOut, Menu, X } from 'lucide-react';
import { UserProvider, useUser } from '../context/UserContext';
import { removeToken } from '../lib/auth';
import { cn } from '../lib/utils';

const navItems = [
  { path: '/dashboard', label: 'Accueil', icon: Home },
  { path: '/dashboard/contenus', label: 'Contenus', icon: FileText },
  { path: '/dashboard/commentaires', label: 'Commentaires', icon: MessageCircle },
  { path: '/dashboard/planification', label: 'Planification', icon: Calendar },
  { path: '/dashboard/parametres', label: 'Paramètres', icon: Settings },
];

function DashboardContent() {
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    removeToken();
    navigate('/');
  };

  return (
    <div className="flex h-screen bg-[#020617] overflow-hidden">
      {/* Noise overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-white/5 bg-slate-950/50 backdrop-blur-xl relative z-10">
        <div className="p-6 border-b border-white/5">
          <h1 className="text-xl font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
            Dashboard
          </h1>
          {user?.nom && (
            <p className="text-sm text-slate-400 mt-1 font-inter truncate">
              {user.nom}
            </p>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/dashboard'}
                className={({ isActive }) =>
                  cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 font-inter",
                    isActive
                      ? "bg-gradient-to-r from-[#5B6CFF]/20 to-[#8A6CFF]/20 text-white border-l-2 border-[#5B6CFF]"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  )
                }
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 font-inter"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
          Dashboard
        </h1>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-400 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-xl pt-16">
          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/dashboard'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all font-inter",
                      isActive
                        ? "bg-[#5B6CFF]/20 text-white"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                    )
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              );
            })}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 mt-4 font-inter"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Déconnexion</span>
            </button>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10 pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
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
