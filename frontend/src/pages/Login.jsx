import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2, Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { authService } from '../services/authService';
import { setToken, isAuthenticated, espaceParDefaut } from '../lib/auth';
import { APK_URL, downloadHidden, markDownloaded } from '../lib/appDownload';
import LangSwitcher from '../components/LangSwitcher';
import AfficheAuth from '../components/AfficheAuth';
import BoutonGoogle from '../components/BoutonGoogle';
import { CARTE_AUTH, CHAMP_AUTH, LOGO_CARTE } from '../components/auth-styles';

export default function Login() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Déjà connecté ? -> on évite l'écran de login (l'app mobile démarre toujours sur "/")
  useEffect(() => {
    // `espaceParDefaut` tient compte du dernier espace choisi : un
    // administrateur qui travaillait dans son espace client y revient.
    if (isAuthenticated()) navigate(espaceParDefaut(), { replace: true });
  }, [navigate]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await authService.login(email, password);
      setToken(data.token);
      // Meme formulaire pour tout le monde : c'est le compte qui decide ou l'on
      // atterrit. Un administrateur reste un utilisateur, il peut revenir sur
      // son tableau de bord sans se reconnecter.
      if (data.is_admin) {
        toast.success(t('auth.toastAdminOk'));
        navigate(espaceParDefaut());
      } else if (data.pending) {
        toast.info(t('auth.toastPending'));
        navigate('/pending');
      } else {
        toast.success(t('auth.toastSuccess'));
        navigate('/dashboard');
      }
    } catch (error) {
      // Un 401 = identifiants faux. Une reponse qui n'est pas une session =
      // panne de configuration : le dire, plutot que d'accuser l'utilisateur.
      toast.error(error?.__reponseInvalide ? t('auth.toastServeur') : t('auth.toastError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-[#020617]">
      <AfficheAuth />

      <section className="relative z-[1] grid place-items-center px-5 py-14 sm:px-6 lg:p-8">
        <div className="absolute top-4 right-5 lg:top-6 lg:right-8">
          <LangSwitcher />
        </div>

        <div className={CARTE_AUTH}>
          {/* Sur telephone l'affiche disparait : sans ce logo la page n'aurait
              plus aucune identite de marque. */}
          <Link to="/" data-testid="auth-retour-site-mobile" className={LOGO_CARTE}>
            <img src="/logo.png" alt="Postorico"
              className="w-[46px] h-[46px] object-contain drop-shadow-[0_6px_16px_rgba(91,108,255,.4)]" />
          </Link>

          <h2 className="font-sora text-2xl font-bold tracking-[-0.4px] text-white">{t('auth.login')}</h2>
          <p className="mt-[7px] mb-6 text-sm text-slate-500 font-inter">{t('auth.loginSub')}</p>

          <BoutonGoogle testid="login-google" />

          <form onSubmit={handleLogin} className="space-y-[15px]">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-200 font-inter">{t('auth.email')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('app.emailPh')} required data-testid="login-email" className={CHAMP_AUTH} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password" className="text-slate-200 font-inter">{t('auth.password')}</Label>
                <Link to="/forgot-password" data-testid="forgot-password-link"
                  className="text-[12.5px] text-slate-500 hover:text-[#3AFFA3] transition-colors font-inter">
                  {t('auth.forgotShort')}
                </Link>
              </div>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                  data-testid="login-password" className={`${CHAMP_AUTH} pr-10`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  data-testid="toggle-login-password" aria-label={t('auth.password')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500
                             hover:text-slate-200 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} data-testid="login-submit"
              className="w-full h-11 mt-2 rounded-xl font-inter text-sm font-medium text-white
                         bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF]
                         shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_12px_28px_-8px_rgba(91,108,255,.6)]
                         transition-transform duration-150 ease-out-strong
                         hover:brightness-110 active:scale-[0.97]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t('auth.signIn')}
            </Button>
          </form>

          <p className="mt-[18px] text-center text-[13.5px] text-slate-500 font-inter">
            {t('auth.noAccountPre')}{' '}
            <Link to="/register" data-testid="register-link"
              className="font-semibold text-[#3AFFA3] hover:text-[#7dffc4] transition-colors">
              {t('auth.createAccount')}
            </Link>
          </p>

          {/* Telechargement de l'APK : web uniquement, masque une fois fait. */}
          {!downloadHidden() && (
            <div className="mt-6 pt-[18px] border-t border-white/[0.07] text-center">
              <a href={APK_URL} onClick={markDownloaded} data-testid="download-android"
                className="inline-flex items-center gap-[7px] text-[12.5px] text-slate-500
                           hover:text-slate-200 transition-colors font-inter">
                <Download className="w-[13px] h-[13px]" />
                {t('auth.androidApp')}
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
