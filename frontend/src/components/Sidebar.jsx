import { User, Share2, Link, Key, Palette, LogOut, Plug } from 'lucide-react';
import { cn } from '../lib/utils';

const sections = [
  { id: 'identity', title: 'Identité', icon: User },
  { id: 'social', title: 'Réseaux Sociaux', icon: Share2 },
  { id: 'gpt_urls', title: 'URLs GPT', icon: Link },
  { id: 'api_keys', title: 'Clés API', icon: Key },
  { id: 'style', title: 'Style & Couleurs', icon: Palette },
  { id: 'connections', title: 'Connexions', icon: Plug },
];

export const Sidebar = ({ activeSection, setActiveSection, onLogout, userName, incompleteSections = [] }) => {
  return (
    <aside className="w-64 hidden md:flex flex-col border-r border-white/5 bg-slate-950/50 backdrop-blur-xl">
      <div className="p-6 border-b border-white/5">
        <h1 className="text-xl font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
          Dashboard
        </h1>
        {userName && (
          <p className="text-sm text-slate-400 mt-1 font-inter truncate">
            {userName}
          </p>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          const isIncomplete = incompleteSections.includes(section.id);
          return (
            <button
              key={section.id}
              data-testid={`sidebar-${section.id}`}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 font-inter",
                isActive
                  ? "bg-gradient-to-r from-[#5B6CFF]/20 to-[#8A6CFF]/20 text-white border-l-2 border-[#5B6CFF]"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium flex-1">{section.title}</span>
              {isIncomplete && (
                <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" title="Champs manquants" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
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
