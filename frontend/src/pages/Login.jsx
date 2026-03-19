import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Shield, Sparkles, BarChart3, MessageSquare, Calendar } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import api from '../lib/api';
import { setToken, setAdminToken } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await api.post('/auth/login', { email, password });
      setToken(response.data.token);
      if (response.data.pending) {
        toast.info('Compte en attente de validation');
        navigate('/pending');
      } else {
        toast.success('Connexion réussie');
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error('Email ou mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminLoading(true);
    
    try {
      const response = await api.post('/auth/admin-login', { password: adminPassword });
      setAdminToken(response.data.token);
      toast.success('Accès administrateur');
      navigate('/admin');
    } catch (error) {
      toast.error('Mot de passe administrateur incorrect');
    } finally {
      setAdminLoading(false);
    }
  };

  const features = [
    { icon: Sparkles, text: "Génération de contenu IA" },
    { icon: Calendar, text: "Planification intelligente" },
    { icon: BarChart3, text: "Analytics & Performance" },
    { icon: MessageSquare, text: "Gestion des commentaires" },
  ];

  return (
    <div className="min-h-screen w-full flex bg-[#020617] relative overflow-hidden">
      {/* Noise overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative z-10 flex-col justify-between p-12 bg-gradient-to-br from-slate-900/50 to-slate-950/80">
        {/* Background gradient orbs */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-[#5B6CFF]/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-40 right-20 w-96 h-96 bg-[#8A6CFF]/15 rounded-full blur-[120px]" />
        
        {/* Logo & Name */}
        <div className="relative">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center shadow-lg shadow-[#5B6CFF]/25">
              <span className="text-2xl font-bold text-white font-sora">P</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold font-sora text-white">PresenceOS</h1>
              <p className="text-slate-400 font-inter text-sm">Votre présence, amplifiée</p>
            </div>
          </div>
        </div>
        
        {/* Main content */}
        <div className="relative space-y-8">
          <div>
            <h2 className="text-4xl xl:text-5xl font-bold font-sora text-white leading-tight">
              Gérez votre présence<br />
              <span className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
                sur les réseaux sociaux
              </span>
            </h2>
            <p className="mt-6 text-lg text-slate-400 font-inter max-w-md leading-relaxed">
              Automatisez la création de contenu, planifiez vos publications et analysez vos performances. Tout en un seul endroit.
            </p>
          </div>
          
          {/* Features */}
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div 
                  key={index}
                  className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#5B6CFF]/20 to-[#8A6CFF]/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#8A6CFF]" />
                  </div>
                  <span className="text-sm text-slate-300 font-inter">{feature.text}</span>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Footer */}
        <div className="relative">
          <p className="text-slate-500 text-sm font-inter">
            © 2026 PresenceOS. Tous droits réservés.
          </p>
        </div>
      </div>
      
      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-6 sm:p-12 relative z-10">
        {/* Mobile logo */}
        <div className="lg:hidden absolute top-6 left-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center">
            <span className="text-lg font-bold text-white font-sora">P</span>
          </div>
          <span className="text-xl font-bold text-white font-sora">PresenceOS</span>
        </div>
        
        <div className="w-full max-w-md">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold font-sora text-white">
                Connexion
              </h2>
              <p className="text-slate-400 mt-2 font-inter text-sm">
                Accédez à votre espace personnel
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300 font-inter">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                  data-testid="login-email"
                  className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300 font-inter">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    data-testid="login-password"
                    className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                    data-testid="toggle-login-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                data-testid="login-submit"
                className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 transition-all duration-300 shadow-lg shadow-[#5B6CFF]/20 font-inter"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Se connecter
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link 
                to="/register" 
                data-testid="register-link"
                className="text-sm text-slate-400 hover:text-[#5B6CFF] transition-colors font-inter"
              >
                Pas encore de compte ? S'inscrire
              </Link>
            </div>

            {/* Admin login toggle */}
            <div className="mt-8 pt-6 border-t border-white/5">
              <button
                onClick={() => setShowAdminLogin(!showAdminLogin)}
                data-testid="admin-toggle"
                className="w-full flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-400 transition-colors font-inter"
              >
                <Shield className="w-3 h-3" />
                Accès administrateur
              </button>
              
              {showAdminLogin && (
                <form onSubmit={handleAdminLogin} className="mt-4 space-y-3 animate-fade-in">
                  <Input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Mot de passe admin"
                    data-testid="admin-password"
                    className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500 text-sm"
                  />
                  <Button
                    type="submit"
                    disabled={adminLoading}
                    data-testid="admin-submit"
                    className="w-full bg-slate-800 hover:bg-slate-700 text-sm font-inter"
                  >
                    {adminLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Connexion Admin
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
