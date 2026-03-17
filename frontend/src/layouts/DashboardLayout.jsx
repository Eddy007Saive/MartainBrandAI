import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Loader2, Menu, X } from 'lucide-react';
import { toast } from 'sonner';
import { Sidebar, MobileNav } from '../components/Sidebar';
import api from '../lib/api';
import { removeToken } from '../lib/auth';
import UserContext from '../context/UserContext';

export default function DashboardLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await api.get('/users/me');
      if (!response.data.actif) {
        removeToken();
        navigate('/pending');
        return;
      }
      setUser(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement du profil');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    removeToken();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
      </div>
    );
  }

  return (
    <UserContext.Provider value={{ user, setUser, fetchUser }}>
      <div className="flex h-screen bg-[#020617] overflow-hidden" data-testid="dashboard">
        {/* Noise overlay */}
        <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

        {/* Desktop Sidebar */}
        <Sidebar onLogout={handleLogout} userName={user?.nom} />

        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
            MartainBrand
          </h1>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-slate-400 hover:text-white"
            data-testid="mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-xl pt-16"
            onClick={() => setMobileMenuOpen(false)}
          >
            <MobileNav onLogout={handleLogout} />
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative z-10 pt-16 md:pt-0">
          <Outlet />
        </main>
      </div>
    </UserContext.Provider>
  );
}
