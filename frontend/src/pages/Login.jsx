import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2, Download, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { authService } from '../services/authService';
import { setToken, isAuthenticated, espaceParDefaut, getAppareil, setAppareil } from '../lib/auth';
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
  // Deuxieme temps : le serveur a envoye un code par email (appareil inconnu, ou
  // administrateur) et rendu un jeton d'attente. Tant que `etapeCode` est pose,
  // la carte montre la saisie du code a la place du formulaire.
  const [etapeCode, setEtapeCode] = useState(null);   // { jeton, email }
  const [code, setCode] = useState('');
  const [confiance, setConfiance] = useState(true);
  const [attente, setAttente] = useState(0);          // secondes avant de pouvoir renvoyer
  useEffect(() => {
    if (attente <= 0) return undefined;
    const id = setTimeout(() => setAttente((a) => a - 1), 1000);
    return () => clearTimeout(id);
  }, [attente]);

  // Meme formulaire pour tout le monde : c'est le compte qui decide ou l'on
  // atterrit. Un administrateur reste un utilisateur, il peut revenir sur
  // son tableau de bord sans se reconnecter.
  const entrer = (data) => {
    setToken(data.token);
    if (data.appareil) setAppareil(data.appareil);   // appareil de confiance : plus de code pendant 30 jours
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
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await authService.login(email, password, getAppareil());
      if (data.code_requis) {
        setEtapeCode({ jeton: data.jeton, email: data.email });
        setCode('');
        setAttente(60);
        return;
      }
      entrer(data);
    } catch (error) {
      // Un 401 = identifiants faux. Une reponse qui n'est pas une session =
      // panne de configuration : le dire, plutot que d'accuser l'utilisateur.
      if (error.response?.data?.detail === 'envoi_code_impossible') toast.error(t('auth.codeEnvoiImpossible'));
      else toast.error(error?.__reponseInvalide ? t('auth.toastServeur') : t('auth.toastError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCode = async (e) => {
    e.preventDefault();
    if (code.replace(/\D/g, '').length !== 6) { toast.error(t('auth.codeFaux')); return; }
    setLoading(true);
    try {
      const data = await authService.verifierCode(etapeCode.jeton, code.replace(/\D/g, ''), confiance);
      entrer(data);
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (detail === 'code_faux') toast.error(t('auth.codeFaux'));
      else if (detail === 'trop_essais') { toast.error(t('auth.codeTrop')); setEtapeCode(null); }
      else if (detail === 'code_expire' || detail === 'jeton_invalide') { toast.error(t('auth.codeExpire')); setEtapeCode(null); }
      else toast.error(error?.__reponseInvalide ? t('auth.toastServeur') : t('auth.toastError'));
    } finally {
      setLoading(false);
    }
  };

  const renvoyer = async () => {
    if (attente > 0 || !etapeCode) return;
    try {
      await authService.renvoyerCode(etapeCode.jeton);
      toast.success(t('auth.codeRenvoye'));
      setAttente(60);
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (detail === 'renvoi_trop_tot') setAttente(60);
      else if (detail === 'envoi_code_impossible') toast.error(t('auth.codeEnvoiImpossible'));
      else { toast.error(t('auth.codeExpire')); setEtapeCode(null); }
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

          {etapeCode ? (
            <form onSubmit={handleCode} className="space-y-[15px]" data-testid="login-code-form">
              <div className="w-11 h-11 rounded-xl grid place-items-center bg-[#3AFFA3]/10 text-[#3AFFA3] mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="font-sora text-2xl font-bold tracking-[-0.4px] text-white">{t('auth.codeTitre')}</h2>
              <p className="mt-[7px] mb-2 text-sm text-slate-500 font-inter">{t('auth.codeSous', { email: etapeCode.email })}</p>

              <div className="space-y-1.5">
                <Label htmlFor="code" className="text-slate-200 font-inter">{t('auth.codeLabel')}</Label>
                <Input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus
                  value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, '').slice(0, 7))}
                  placeholder="000 000" required data-testid="login-code"
                  className={`${CHAMP_AUTH} text-center text-[22px] tracking-[0.35em] font-semibold`} />
              </div>

              <label className="flex items-start gap-2.5 text-[13px] text-slate-300 font-inter cursor-pointer select-none">
                <input type="checkbox" checked={confiance} onChange={(e) => setConfiance(e.target.checked)}
                  data-testid="login-confiance" className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950/60 accent-[#3AFFA3]" />
                {t('auth.codeConfiance')}
              </label>

              <Button type="submit" disabled={loading} data-testid="login-code-submit"
                className="w-full h-11 mt-2 rounded-xl font-inter text-sm font-medium text-white
                           bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF]
                           shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_12px_28px_-8px_rgba(91,108,255,.6)]
                           transition-transform duration-150 ease-out-strong
                           hover:brightness-110 active:scale-[0.97]">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t('auth.codeValider')}
              </Button>

              <div className="flex items-center justify-between text-[12.5px] font-inter pt-1">
                <button type="button" onClick={() => setEtapeCode(null)} data-testid="login-code-retour"
                  className="text-slate-500 hover:text-slate-200 transition-colors">
                  {t('auth.codeRetour')}
                </button>
                <button type="button" onClick={renvoyer} disabled={attente > 0} data-testid="login-code-renvoyer"
                  className="text-[#3AFFA3] hover:text-[#7dffc4] disabled:text-slate-600 transition-colors">
                  {attente > 0 ? t('auth.codeRenvoyerDans', { s: attente }) : t('auth.codeRenvoyer')}
                </button>
              </div>
            </form>
          ) : (<>
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
          </>)}

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
