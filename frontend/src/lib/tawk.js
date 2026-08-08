// Chat support Tawk.to (tawk.to) — chargé uniquement dans le dashboard client.
// L'ID est PUBLIC (il identifie le widget, pas un secret) ; format "propertyId/widgetId"
// (les deux segments à la fin de l'URL du widget : https://embed.tawk.to/<propertyId>/<widgetId>).
const TAWK_ID = process.env.REACT_APP_TAWK_ID || '';

let loaded = false;
let pendingUser = null; // identité reçue avant que le widget soit prêt

const api = () => (window.Tawk_API && typeof window.Tawk_API.showWidget === 'function' ? window.Tawk_API : null);

function applyIdentity(user) {
  const T = window.Tawk_API;
  if (!T || typeof T.setAttributes !== 'function' || !user) return;
  try {
    T.setAttributes({
      name: user.nom || user.username || '',
      email: user.email || '',
      plan: user.plan || 'gratuit',
      secteur: (user.secteur || '').slice(0, 100),
    }, () => {});
  } catch (e) { /* jamais bloquant */ }
}

/** Charge le widget (une seule fois) et affiche la bulle. No-op si l'ID n'est pas configuré. */
export function initTawk() {
  if (!TAWK_ID) return;
  if (loaded) {
    const T = api();
    if (T) { try { T.showWidget(); } catch (e) { /* widget pas prêt */ } }
    return;
  }
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();
  // Intégration au design : sous les dialogs/toasts (z-50) et décollée des bords ;
  // sur mobile, remontée pour ne pas chevaucher les CTA en bas de page.
  // (Couleur, langue et Attention Grabber se règlent dans l'admin Tawk, pas ici.)
  window.Tawk_API.customStyle = {
    zIndex: 45,
    visibility: {
      desktop: { position: 'br', xOffset: 18, yOffset: 18 },
      mobile: { position: 'br', xOffset: 10, yOffset: 72 },
    },
  };
  window.Tawk_API.onLoad = () => { if (pendingUser) { applyIdentity(pendingUser); pendingUser = null; } };
  const s = document.createElement('script');
  s.src = `https://embed.tawk.to/${TAWK_ID}`;
  s.async = true;
  s.charset = 'UTF-8';
  s.setAttribute('crossorigin', '*');
  document.head.appendChild(s);
  loaded = true;
}

/** Identifie l'utilisateur connecté : le support voit "qui parle" sans demander. */
export function identifyTawk(user) {
  if (!TAWK_ID || !user) return;
  if (api()) applyIdentity(user);
  else pendingUser = user; // sera appliqué dans onLoad
}

/** Masque la bulle (en quittant le dashboard : admin, vitrine, login…). */
export function hideTawk() {
  const T = api();
  if (!loaded || !T) return;
  try { T.hideWidget(); } catch (e) { /* ignore */ }
}

/** Déconnexion : termine la conversation pour ne pas mélanger deux comptes. */
export function resetTawk() {
  pendingUser = null;
  const T = window.Tawk_API;
  if (!loaded || !T) return;
  try { if (typeof T.endChat === 'function') T.endChat(); } catch (e) { /* ignore */ }
}
