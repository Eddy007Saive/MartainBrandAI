import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { authService } from '../services/authService';
import { setToken } from '../lib/auth';

export default function Register() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
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

  const validate = () => {
    const newErrors = {};
    
    if (!formData.nom.trim()) {
      newErrors.nom = t('register.errName');
    }
    
    if (!formData.email.trim()) {
      newErrors.email = t('register.errEmailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('register.errEmailInvalid');
    }
    
    if (!formData.password) {
      newErrors.password = t('register.errPasswordRequired');
    } else if (formData.password.length < 6) {
      newErrors.password = t('register.errPasswordShort');
    }
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('register.errPasswordMatch');
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
      };

      const data = await authService.register(payload);
      if (data?.token) setToken(data.token);
      toast.success(t('register.toastWelcome'));
      navigate('/dashboard');
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (detail === 'email_exists') {
        toast.error(t('register.toastEmailExists'));
      } else {
        toast.error(t('register.toastError'));
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
      
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-sora bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] bg-clip-text text-transparent">
            {t('register.title')}
          </h1>
          <p className="text-slate-400 mt-2 font-inter">
            {t('register.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nom" className="text-slate-300 font-inter">
              {t('register.name')} <span className="text-red-400">*</span>
            </Label>
            <Input
              id="nom"
              name="nom"
              value={formData.nom}
              onChange={handleChange}
              placeholder={t('register.namePlaceholder')}
              data-testid="register-nom"
              className={`bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500 ${errors.nom ? 'border-red-500' : ''}`}
            />
            {errors.nom && <p className="text-xs text-red-400">{errors.nom}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300 font-inter">
              {t('auth.email')} <span className="text-red-400">*</span>
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
            <Label htmlFor="username" className="text-slate-300 font-inter">{t('register.username')}</Label>
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
              {t('auth.password')} <span className="text-red-400">*</span>
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
              {t('register.confirmPassword')} <span className="text-red-400">*</span>
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
            className="w-full bg-[#e7ecf5] text-[#0b1322] hover:bg-white transition-all duration-300 font-inter mt-6"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {t('register.submit')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link 
            to="/login" 
            data-testid="login-link"
            className="text-sm text-slate-400 hover:text-[#5B6CFF] transition-colors font-inter"
          >
            {t('register.haveAccount')}
          </Link>
        </div>
      </div>
    </div>
  );
}
