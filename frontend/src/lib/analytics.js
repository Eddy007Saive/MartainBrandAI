// PostHog — analytics produit + session replay.
// Clé PUBLIQUE de projet (faite pour vivre dans le bundle front) ; surchargable via .env.
import posthog from 'posthog-js';

const KEY = process.env.REACT_APP_POSTHOG_KEY || 'phc_naLg2dDPq2sc5uE4cEmopTz83Gpmbz4QmiXj883AKzFk';
const HOST = process.env.REACT_APP_POSTHOG_HOST || 'https://us.i.posthog.com';

let ready = false;

export function initAnalytics() {
  if (ready || !KEY) return;
  try {
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      // Replay : on masque tous les champs de saisie sauf ceux marqués data-ph-unmask
      // (les clés API / mots de passe des clients ne doivent jamais apparaître en clair).
      session_recording: {
        maskAllInputs: true,
        maskInputOptions: { password: true },
      },
      // En dev local, on log au lieu de polluer les données de prod
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') ph.opt_out_capturing();
      },
    });
    ready = true;
  } catch (e) {
    console.error('PostHog init error:', e);
  }
}

// Lie la session au compte (appelé quand l'utilisateur est chargé)
export function identifyUser(user) {
  if (!ready || !user?.telegram_id) return;
  try {
    posthog.identify(String(user.telegram_id), {
      email: user.email,
      nom: user.nom,
      plan: user.plan || 'gratuit',
      langue: user.langue || 'fr',
    });
  } catch (e) { /* jamais bloquant */ }
}

// Événement métier explicite (en plus de l'autocapture)
export function track(event, props = {}) {
  if (!ready) return;
  try { posthog.capture(event, props); } catch (e) { /* jamais bloquant */ }
}

// Déconnexion : coupe le lien session ↔ compte
export function resetAnalytics() {
  if (!ready) return;
  try { posthog.reset(); } catch (e) { /* jamais bloquant */ }
}
