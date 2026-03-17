import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, MessageSquare, CalendarDays, Settings, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';

const mainNav = [
  { to: '/dashboard/accueil', title: 'Accueil', icon: LayoutDashboard },
  { to: '/dashboard/contenus', title: 'Contenus', icon: FileText },
  { to: '/dashboard/commentaires', title: 'Commentaires', icon: MessageSquare },
  { to: '/dashboard/planification', title: 'Planification', icon: CalendarDays },
];

const bottomNav = [
  { to: '/dashboard/parametres', title: 'Paramètres', icon: Settings },
];

const SidebarLink = ({ to, title, icon: Icon }) => (
  <NavLink
    to={to}
    data-testid={`sidebar-${title.toLowerCase()}`}
    className={({ isActive }) => cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 font-inter",
      isActive
        ? "bg-gradient-to-r from-[#5B6CFF]/20 to-[#8A6CFF]/20 text-white border-l-2 border-[#5B6CFF]"
        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
    )}
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    <span className="text-sm font-medium">{title}</span>
  </NavLink>
);

export const Sidebar = ({ onLogout, userName }) => {
  return (
    <aside className="w-64 hidden md:flex flex-col border-r border-white/5 bg-slate-950/50 backdrop-blur-xl">
      <div className="p-6 border-b border-white/5">
        <h1 className="text-xl font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
          MartainBrand
        </h1>
        {userName && (
          <p className="text-sm text-slate-400 mt-1 font-inter truncate">
            {userName}
          </p>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {mainNav.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>

      <div className="p-4 border-t border-white/5 space-y-1">
        {bottomNav.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
        <button
          data-testid="logout-btn"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 font-inter"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
};

export const MobileNav = ({ onLogout }) => (
  <nav className="p-4 space-y-2">
    {[...mainNav, ...bottomNav].map((item) => (
      <SidebarLink key={item.to} {...item} />
    ))}
    <button
      onClick={onLogout}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 mt-4 font-inter"
    >
      <LogOut className="w-5 h-5" />
      <span className="text-sm font-medium">Déconnexion</span>
    </button>
  </nav>
);
