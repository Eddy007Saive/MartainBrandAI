import { useState } from 'react';
import { lireAffiliateRef } from '../hooks/useAffiliateRef';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { authService } from '../services/authService';
import { billingService } from '../services/billingService';
import { setToken } from '../lib/auth';
import { track } from '../lib/analytics';
import LangSwitcher from '../components/LangSwitcher';
import AfficheAuth from '../components/AfficheAuth';
import BoutonGoogle from '../components/BoutonGoogle';
import { CHAMP_AUTH, LOGO_CARTE } from '../components/auth-styles';

/**
 * Robustesse du mot de passe : longueur, casse, chiffres, symboles.
 * Volontairement grossier — la jauge sert à encourager, pas à noter. La vraie
 * règle (6 caractères minimum) reste dans la validation.
 */
function robustesse(mdp) {
  if (!mdp) return 0;
  let n = 0;
  if (mdp.length >= 8) n++;
  if (mdp.length >= 12) n++;
  if (/[a-z]/.test(mdp) && /[A-Z]/.test(mdp)) n++;
  if (/\d/.test(mdp)) n++;
  if (/[^\w\s]/.test(mdp)) n++;
  return Math.min(3, Math.ceil(n * 3 / 5));
}

const TEINTES = ['bg-red-500', 'bg-amber-400', 'bg-[#3AFFA3]'];

/**
 * Un champ et son message d'erreur.
 *
 * Declares au niveau du MODULE, et non dans Register : une fonction definie
 * dans le corps du composant est recreee a chaque rendu, React y voit un
 * composant d'un autre type, demonte le champ et le remonte — et le focus
 * part a chaque lettre tapee.
 *
 * La marque « facultatif » remplace les asterisques rouges : un seul champ sur
 * cinq l'est, autant marquer l'exception plutot que la regle.
 */
const Champ = ({ id, label, facultatif, erreur, optionnel, children }) => (
  <div className="space-y-1.5 min-w-0">
    <Label htmlFor={id} className="flex items-baseline gap-1.5 text-slate-200 font-inter">
      {label}
      {facultatif && <span className="text-[11px] font-normal text-slate-600">{optionnel}</span>}
    </Label>
    {children}
    {erreur && <p className="text-xs text-red-400 font-inter">{erreur}</p>}
  </div>
);

const Oeil = ({ visible, bascule, testid, libelle }) => (
  <button type="button" onClick={bascule} data-testid={testid} aria-label={libelle}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500
               hover:text-slate-200 transition-colors">
    {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
  </button>
);

/** Le fuseau que déclare le navigateur, s'il en déclare un de crédible. */
const fuseauDuNavigateur = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.includes('/') ? tz : undefined;
  } catch {
    return undefined;   // navigateur ancien : le serveur gardera son défaut
  }
};

export default function Register() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
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
        // La langue du contenu généré démarre sur la langue de l'interface
        langue: (i18n.resolvedLanguage || 'fr').slice(0, 2),
        // Parrainage : code capté à l'arrivée sur le site, valable 30 jours
        ref: lireAffiliateRef() || undefined,
        // Le fuseau du navigateur — « Europe/Madrid », « America/Bogota ».
        //
        // Il donne le PAYS, ce que la langue ne sait pas faire : un Espagnol
        // et un Colombien écrivent tous deux « es » et n'ont ni la même
        // monnaie ni la même heure. Il décide donc de la devise de
        // facturation, et surtout de l'heure de publication : sans lui, un
        // client colombien qui programme un post « à 9 h » le voyait partir à
        // 9 h heure de Paris, soit 2 h du matin chez lui.
        fuseau: fuseauDuNavigateur(),
      };

      const data = await authService.register(payload);
      setToken(data.token);   // authService a deja verifie qu'il y en a un
      track('inscription');

      // La carte AVANT le produit. Le compte existe deja et le jeton est pose :
      // si Stripe echoue ou si la personne referme la page, elle retrouve son
      // compte — le tableau de bord lui redemandera sa carte.
      try {
        await billingService.checkout('pro', true);   // redirige vers Stripe
        return;                                       // on ne va pas plus loin
      } catch {
        toast.error(t('register.paiementIndisponible'));
      }
      toast.success(t('register.toastWelcome'));
      navigate('/dashboard');
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (detail === 'email_exists') {
        toast.error(t('register.toastEmailExists'));
      } else if (error?.__reponseInvalide) {
        toast.error(t('auth.toastServeur'));
      } else {
        toast.error(t('register.toastError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const force = robustesse(formData.password);
  const bord = (champ) => (errors[champ] ? ' border-red-500' : '');

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-[#020617]">
      <AfficheAuth />

      {/* items-start : le formulaire est plus haut que la connexion, le centrer
          ferait sortir son titre de l'ecran sur un portable. */}
      <section className="relative z-[1] flex justify-center items-start px-5 py-14 sm:px-6 lg:p-8 lg:py-12">
        <div className="absolute top-4 right-5 lg:top-6 lg:right-8">
          <LangSwitcher />
        </div>

        {/* Carte plus large que celle de la connexion : elle porte deux colonnes
            de champs, ce qui ramene la hauteur de 826 a ~620px — le formulaire
            tient a l'ecran au lieu de se derouler. */}
        <div className="w-full max-w-[480px] rounded-[20px] border border-white/[0.09] bg-[#0f172a]
                        p-7 sm:p-[30px]
                        shadow-[inset_0_1px_0_rgba(255,255,255,.055),0_2px_4px_rgba(0,0,0,.4),0_18px_40px_-12px_rgba(0,0,0,.66)]">

          <Link to="/" data-testid="auth-retour-site-mobile" className={LOGO_CARTE}>
            <img src="/logo.png" alt="Postorico"
              className="w-[46px] h-[46px] object-contain drop-shadow-[0_6px_16px_rgba(91,108,255,.4)]" />
          </Link>

          <h1 className="font-sora text-2xl font-bold tracking-[-0.4px] text-white">{t('register.title')}</h1>
          <p className="mt-[7px] mb-6 text-sm text-slate-500 font-inter">{t('register.subtitle')}</p>

          <BoutonGoogle testid="register-google" />

          <form onSubmit={handleSubmit} className="space-y-[15px]">
            {/* Identite : deux champs courts sur une ligne. */}
            <div className="grid sm:grid-cols-2 gap-[15px]">
              <Champ id="nom" label={t('register.name')} erreur={errors.nom} optionnel={t('register.optional')}>
                <Input id="nom" name="nom" value={formData.nom} onChange={handleChange}
                  placeholder={t('register.namePlaceholder')} data-testid="register-nom"
                  className={CHAMP_AUTH + bord('nom')} />
              </Champ>

              <Champ id="username" label={t('register.username')} facultatif erreur={errors.username} optionnel={t('register.optional')}>
                <Input id="username" name="username" value={formData.username} onChange={handleChange}
                  placeholder="@username" data-testid="register-username" className={CHAMP_AUTH} />
              </Champ>
            </div>

            {/* L'email porte l'identifiant de connexion : il garde toute la ligne. */}
            <Champ id="email" label={t('auth.email')} erreur={errors.email} optionnel={t('register.optional')}>
              <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange}
                placeholder={t('app.emailPh')} data-testid="register-email"
                className={CHAMP_AUTH + bord('email')} />
            </Champ>

            <div className="grid sm:grid-cols-2 gap-[15px]">
              <Champ id="password" label={t('auth.password')} erreur={errors.password} optionnel={t('register.optional')}>
                <div className="relative">
                  <Input id="password" name="password" type={showPassword ? 'text' : 'password'}
                    value={formData.password} onChange={handleChange} placeholder="••••••••"
                    data-testid="register-password"
                    className={CHAMP_AUTH + ' pr-10' + bord('password')} />
                  <Oeil visible={showPassword} bascule={() => setShowPassword(!showPassword)}
                    testid="toggle-register-password" libelle={t('auth.password')} />
                </div>
              </Champ>

              <Champ id="confirmPassword" label={t('register.confirmPassword')} erreur={errors.confirmPassword} optionnel={t('register.optional')}>
                <div className="relative">
                  <Input id="confirmPassword" name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword} onChange={handleChange} placeholder="••••••••"
                    data-testid="register-confirm-password"
                    className={CHAMP_AUTH + ' pr-10' + bord('confirmPassword')} />
                  <Oeil visible={showConfirmPassword} bascule={() => setShowConfirmPassword(!showConfirmPassword)}
                    testid="toggle-register-confirm" libelle={t('register.confirmPassword')} />
                </div>
              </Champ>
            </div>

            {/* La jauge n'apparait qu'une fois qu'on tape : afficher « faible »
                sur un champ vide, c'est reprocher a quelqu'un de ne rien avoir
                fait. Trois segments, un mot, rien de plus. */}
            {formData.password && (
              <div className="flex items-center gap-2.5 animate-fondu" data-testid="register-robustesse">
                <div className="flex gap-1 flex-1 max-w-[150px]">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className={`h-[3px] flex-1 rounded-full transition-colors duration-300
                      ${i < force ? TEINTES[force - 1] : 'bg-white/10'}`} />
                  ))}
                </div>
                <span className="text-[11.5px] text-slate-500 font-inter">
                  {t(['register.strengthWeak', 'register.strengthMedium', 'register.strengthStrong'][force - 1]
                     || 'register.strengthWeak')}
                </span>
              </div>
            )}

            <Button type="submit" disabled={loading} data-testid="register-submit"
              className="w-full h-11 !mt-6 rounded-xl font-inter text-sm font-medium text-white
                         bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF]
                         shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_12px_28px_-8px_rgba(91,108,255,.6)]
                         transition-transform duration-150 ease-out-strong
                         hover:brightness-110 active:scale-[0.97]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t('register.submit')}
            </Button>
          </form>

          <p className="mt-[18px] text-center text-[13.5px] text-slate-500 font-inter">
            {t('register.haveAccountPre')}{' '}
            <Link to="/login" data-testid="login-link"
              className="font-semibold text-[#3AFFA3] hover:text-[#7dffc4] transition-colors">
              {t('auth.signIn')}
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
