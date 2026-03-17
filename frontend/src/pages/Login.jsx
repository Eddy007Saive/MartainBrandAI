import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react';
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

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] relative overflow-hidden">
      {/* Background gradient orb */}
      <div className="bg-indigo-600/20 blur-[100px] w-[500px] h-[500px] rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      
      {/* Noise overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
            Connexion
          </h1>
          <p className="text-slate-400 mt-2 font-inter">
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
            className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 transition-all duration-300 shadow-[0_0_10px_rgba(91,108,255,0.2)] font-inter"
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
  );
}
