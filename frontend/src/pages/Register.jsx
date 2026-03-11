import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import api from '../lib/api';

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    telegram_id: '',
    nom: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [noTelegramId, setNoTelegramId] = useState(false);

  useEffect(() => {
    const telegramId = searchParams.get('id');
    if (telegramId) {
      setFormData(prev => ({ ...prev, telegram_id: telegramId }));
    } else {
      setNoTelegramId(true);
    }
  }, [searchParams]);

  const validate = () => {
    const newErrors = {};
    
    if (!formData.nom.trim()) {
      newErrors.nom = 'Le nom est requis';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'L\'email est requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalide';
    }
    
    if (!formData.password) {
      newErrors.password = 'Le mot de passe est requis';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Minimum 6 caractères';
    }
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setLoading(true);
    
    try {
      const payload = {
        nom: formData.nom,
        email: formData.email,
        password: formData.password,
        username: formData.username || undefined,
        telegram_id: formData.telegram_id ? parseInt(formData.telegram_id) : undefined,
      };
      
      await api.post('/auth/register', payload);
      toast.success('Inscription réussie ! En attente de validation.');
      navigate('/pending');
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (detail === 'telegram_id_required') {
        toast.error('Inscription impossible sans lien Telegram');
      } else if (detail === 'telegram_id_exists') {
        toast.error('Ce compte Telegram est déjà inscrit');
      } else if (detail === 'email_exists') {
        toast.error('Cet email est déjà utilisé');
      } else {
        toast.error('Erreur lors de l\'inscription');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] relative overflow-hidden py-12 px-4">
      {/* Background gradient orb */}
      <div className="bg-violet-600/20 blur-[100px] w-[500px] h-[500px] rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      
      {/* Noise overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      
      {noTelegramId ? (
        <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-amber-400" />
          </div>
          
          <h1 className="text-2xl font-bold font-sora text-white mb-3">
            Lien d'inscription invalide
          </h1>
          
          <p className="text-slate-400 font-inter mb-6 leading-relaxed">
            Pour vous inscrire, vous devez utiliser le lien fourni par notre bot Telegram.
          </p>
          
          <p className="text-slate-500 font-inter text-sm mb-8">
            Le lien doit contenir votre identifiant Telegram unique (paramètre <code className="text-[#5B6CFF]">?id=</code>)
          </p>
          
          <Link to="/" data-testid="back-to-login">
            <Button
              variant="outline"
              className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 font-inter"
            >
              Retour à la connexion
            </Button>
          </Link>
        </div>
      ) : (
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
            Inscription
          </h1>
          <p className="text-slate-400 mt-2 font-inter">
            Créez votre compte
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formData.telegram_id && (
            <div className="space-y-2">
              <Label className="text-slate-300 font-inter">Telegram ID</Label>
              <Input
                value={formData.telegram_id}
                readOnly
                className="bg-slate-950/50 border-slate-800 text-slate-400 opacity-60"
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="nom" className="text-slate-300 font-inter">
              Nom <span className="text-red-400">*</span>
            </Label>
            <Input
              id="nom"
              name="nom"
              value={formData.nom}
              onChange={handleChange}
              placeholder="Votre nom"
              data-testid="register-nom"
              className={`bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500 ${errors.nom ? 'border-red-500' : ''}`}
            />
            {errors.nom && <p className="text-xs text-red-400">{errors.nom}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300 font-inter">
              Email <span className="text-red-400">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="votre@email.com"
              data-testid="register-email"
              className={`bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500 ${errors.email ? 'border-red-500' : ''}`}
            />
            {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="username" className="text-slate-300 font-inter">Username</Label>
            <Input
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="@username"
              data-testid="register-username"
              className="bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300 font-inter">
              Mot de passe <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                data-testid="register-password"
                className={`bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500 pr-10 ${errors.password ? 'border-red-500' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-slate-300 font-inter">
              Confirmer le mot de passe <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                data-testid="register-confirm-password"
                className={`bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500 pr-10 ${errors.confirmPassword ? 'border-red-500' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-xs text-red-400">{errors.confirmPassword}</p>}
          </div>

          <Button
            type="submit"
            disabled={loading}
            data-testid="register-submit"
            className="w-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 transition-all duration-300 shadow-[0_0_10px_rgba(91,108,255,0.2)] font-inter mt-6"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            S'inscrire
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link 
            to="/" 
            data-testid="login-link"
            className="text-sm text-slate-400 hover:text-[#5B6CFF] transition-colors font-inter"
          >
            Déjà un compte ? Se connecter
          </Link>
        </div>
      </div>
      )}
    </div>
  );
}
