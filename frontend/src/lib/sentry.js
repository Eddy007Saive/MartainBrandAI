// Sentry : alertes sur les erreurs du site et de l'application. Inactif sans REACT_APP_SENTRY_DSN
// (fixé au build, comme REACT_APP_BACKEND_URL). Ne part chez Sentry que la pile de l'erreur, la page
// et l'id interne du compte : jamais l'email, ni le contenu saisi, ni les jetons.
import * as Sentry from '@sentry/react';

const DSN = process.env.REACT_APP_SENTRY_DSN;
export const sentryActif = Boolean(DSN);

export function initSentry() {
  if (!sentryActif) return;
  Sentry.init({
    dsn: DSN,
    environment: process.env.REACT_APP_SENTRY_ENV || 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0, // erreurs seulement
    // Bruit connu, sans effet pour l'utilisateur : extensions du navigateur, mesures de mise en page,
    // réseau coupé pendant un chargement de page.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      /^Network Error$/,
      /Loading chunk \d+ failed/,
    ],
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
  });
}

/** Rattache les erreurs au compte connecté (id interne seulement). */
export function identifierSentry(id) {
  if (sentryActif) Sentry.setUser(id ? { id } : null);
}

/** Options de createRoot (React 19) : les erreurs non rattrapées partent chez Sentry. */
export const optionsRacine = sentryActif
  ? { onUncaughtError: Sentry.reactErrorHandler(), onCaughtError: Sentry.reactErrorHandler() }
  : {};
