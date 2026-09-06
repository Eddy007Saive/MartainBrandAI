import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { authService } from '../services/authService';
import { setToken, espaceParDefaut } from '../lib/auth';
import { lireAffiliateRef } from '../hooks/useAffiliateRef';
import { track } from '../lib/analytics';

/**
 * « Continuer avec Google » — connexion et inscription, même bouton.
 *
 * Flux : le client OAuth est lu sur le serveur (/auth/google/config) ; au clic,
 * Google Identity Services ouvre sa fenêtre et rend un jeton d'accès ; le
 * serveur le vérifie auprès de Google, retrouve ou crée le compte, et renvoie
 * notre session habituelle. Le bouton est masqué tant que le serveur n'a pas
 * de client Google, et dans l'application Android (Google refuse l'OAuth dans
 * une WebView) : là, un mot l'explique à la place du bouton.
 *
 * Le bouton est volontairement sobre (surface sombre, filet) : l'action
 * principale de la carte garde seule le dégradé de la marque.
 */
const GIS_SRC = 'https://accounts.google.com/gsi/client';

const chargerGis = () => new Promise((resolve, reject) => {
  if (window.google?.accounts?.oauth2) { resolve(); return; }
  let s = document.querySelector(`script[src="${GIS_SRC}"]`);
  if (!s) {
    s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    document.head.appendChild(s);
  }
  s.addEventListener('load', () => resolve(), { once: true });
  s.addEventListener('error', () => reject(new Error('gis')), { once: true });
});

const fuseauDuNavigateur = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.includes('/') ? tz : undefined;
  } catch { return undefined; }
};

export function LogoGoogle() {
  // Le logo officiel, pas un « G » redessiné : c'est une marque tierce, on la
  // reproduit telle quelle ou on ne la met pas.
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.66z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l3.99-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.63l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

export default function BoutonGoogle({ testid = 'auth-google' }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(null);   // null = pas encore su, '' = pas configuré
  const [enCours, setEnCours] = useState(false);
  const clientRef = useRef(null);
  const natif = Capacitor.isNativePlatform();

  useEffect(() => {
    let vivant = true;
    authService.googleConfig()
      .then((c) => { if (vivant) setClientId(c?.client_id || ''); })
      .catch(() => { if (vivant) setClientId(''); });
    return () => { vivant = false; };
  }, []);

  const terminer = async (accessToken) => {
    try {
      const data = await authService.google({
        access_token: accessToken,
        langue: (i18n.resolvedLanguage || 'fr').slice(0, 2),
        fuseau: fuseauDuNavigateur(),
        ref: lireAffiliateRef() || undefined,
      });
      setToken(data.token);
      if (data.nouveau) {
        track('inscription');
        toast.success(t('register.toastWelcome'));
        navigate('/dashboard');
      } else if (data.is_admin) {
        toast.success(t('auth.toastAdminOk'));
        navigate(espaceParDefaut());
      } else if (data.pending) {
        toast.info(t('auth.toastPending'));
        navigate('/pending');
      } else {
        toast.success(t('auth.toastSuccess'));
        navigate('/dashboard');
      }
    } catch (e) {
      toast.error(e?.__reponseInvalide ? t('auth.toastServeur') : t('auth.googleErreur'));
    } finally {
      setEnCours(false);
    }
  };

  const lancer = async () => {
    if (!clientId || enCours) return;
    setEnCours(true);
    try {
      await chargerGis();
      if (!clientRef.current) {
        clientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: (r) => {
            if (r?.access_token) terminer(r.access_token);
            else { setEnCours(false); toast.error(t('auth.googleErreur')); }
          },
          // Fenêtre fermée par l'utilisateur : pas une erreur, on se tait.
          error_callback: (e) => { setEnCours(false); if (e?.type !== 'popup_closed') toast.error(t('auth.googleErreur')); },
        });
      }
      clientRef.current.requestAccessToken();
    } catch {
      setEnCours(false);
      toast.error(t('auth.googleErreur'));
    }
  };

  if (clientId === '' && !natif) return null;   // pas de client Google côté serveur : rien à montrer

  return (
    <>
      {natif ? (
        <p data-testid={`${testid}-indispo`} className="text-center text-[12.5px] text-slate-500 font-inter">
          {t('auth.googleIndispo')}
        </p>
      ) : (
        <button type="button" data-testid={testid} onClick={lancer} disabled={enCours || clientId === null}
          className="w-full h-11 flex items-center justify-center gap-2.5 rounded-xl
                     border border-white/[0.09] bg-white/[0.045] text-slate-200
                     text-sm font-medium font-inter
                     shadow-[inset_0_1px_0_rgba(255,255,255,.055)]
                     transition-[background-color,border-color,transform] duration-200 ease-out-strong
                     hover:bg-white/[0.075] hover:border-white/[0.16] active:scale-[0.97]
                     disabled:opacity-60 disabled:active:scale-100">
          {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogoGoogle />}
          {t('auth.google')}
        </button>
      )}

      {/* Un filet coupé par le mot, pas un mot posé sur un filet. */}
      <div className="flex items-center gap-3 my-[18px] text-[11.5px] uppercase tracking-[0.1em]
                      text-slate-600 font-inter
                      before:flex-1 before:h-px before:bg-white/[0.09] before:content-['']
                      after:flex-1 after:h-px after:bg-white/[0.09] after:content-['']">
        {t('auth.ou')}
      </div>
    </>
  );
}
