// Chat support Tawk.to (tawk.to) — chargé À LA DEMANDE uniquement.
// La bulle n'est plus affichée en permanence : le chat s'ouvre depuis
// Paramètres → « Contacter le support », et disparaît complètement quand
// le client le réduit. L'ID est PUBLIC ; format "propertyId/widgetId".
const TAWK_ID = process.env.REACT_APP_TAWK_ID || '';

let loaded = false;
let pendingUser = null;   // identité connue avant que le widget soit prêt
let wantOpen = false;     // ouverture demandée pendant le chargement du script

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

function load() {
  if (loaded || !TAWK_ID) return;
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();
  // Sous les dialogs/toasts (z-50), décollée des bords ; remontée sur mobile.
  window.Tawk_API.customStyle = {
    zIndex: 45,
    visibility: {
      desktop: { position: 'br', xOffset: 18, yOffset: 18 },
      mobile: { position: 'br', xOffset: 10, yOffset: 72 },
    },
  };
  window.Tawk_API.onLoad = () => {
    const T = window.Tawk_API;
    applyIdentity(pendingUser);
    if (wantOpen) {
      wantOpen = false;
      try { T.showWidget(); T.maximize(); } catch (e) { /* ignore */ }
    } else {
      try { T.hideWidget(); } catch (e) { /* ignore */ }
    }
  };
  // Chat réduit par le client -> la bulle disparaît complètement.
  window.Tawk_API.onChatMinimized = () => {
    try { window.Tawk_API.hideWidget(); } catch (e) { /* ignore */ }
  };
  const s = document.createElement('script');
  s.src = `https://embed.tawk.to/${TAWK_ID}`;
  s.async = true;
  s.charset = 'UTF-8';
  s.setAttribute('crossorigin', '*');
  document.head.appendChild(s);
  loaded = true;
}

/** Mémorise l'identité du client (appliquée dès que le widget existe). */
export function identifyTawk(user) {
  if (!user) return;
  pendingUser = user;
  if (api()) applyIdentity(user);
}

/** Ouvre le chat support (charge le widget au premier appel). */
export function openTawk(user) {
  if (!TAWK_ID) return false;
  if (user) pendingUser = user;
  const T = api();
  if (!T) {
    wantOpen = true;
    load();
    return true;
  }
  applyIdentity(pendingUser);
  try { T.showWidget(); T.maximize(); } catch (e) { /* ignore */ }
  return true;
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
  try { if (typeof T.hideWidget === 'function') T.hideWidget(); } catch (e) { /* ignore */ }
}
