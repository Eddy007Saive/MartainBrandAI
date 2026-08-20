import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const TOKEN_KEY = 'token';
const ADMIN_TOKEN_KEY = 'adminToken';
const native = Capacitor.isNativePlatform();

// Miroir vers le stockage natif persistant (Android/iOS).
// localStorage peut être effacé par la WebView quand on ferme l'app -> on double avec Preferences.
const persist = (key, value) => {
  if (!native) return;
  if (value === null) Preferences.remove({ key }).catch(() => {});
  else Preferences.set({ key, value }).catch(() => {});
};

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => { localStorage.setItem(TOKEN_KEY, token); persist(TOKEN_KEY, token); };
export const removeToken = () => { localStorage.removeItem(TOKEN_KEY); persist(TOKEN_KEY, null); };

// Administrateur et client entrent par le MEME formulaire, avec le MEME jeton.
// La qualite d'administrateur se lit dans la revendication du jeton — plus de
// seconde cle en stockage, qui obligeait a maintenir deux chemins reseau.
const revendications = (jeton) => {
  try {
    const charge = jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(charge))));
  } catch {
    return {};
  }
};

export const getAdminToken = () => getToken();
export const removeAdminToken = () => removeToken();

export const isAuthenticated = () => !!getToken();
export const isAdminAuthenticated = () => {
  const jeton = getToken();
  return !!jeton && revendications(jeton).is_admin === true;
};

export const logout = () => {
  removeToken();
  // Ancienne cle des sessions ouvertes avant la fusion des connexions.
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  persist(ADMIN_TOKEN_KEY, null);
};

// Au démarrage (mobile) : recharge le token depuis le natif persistant vers localStorage,
// pour que l'app reste connectée après fermeture. No-op sur le web.
export const hydrateAuth = async () => {
  if (!native) return;
  try {
    const [{ value: t }, { value: a }] = await Promise.all([
      Preferences.get({ key: TOKEN_KEY }),
      Preferences.get({ key: ADMIN_TOKEN_KEY }),
    ]);
    if (t && !localStorage.getItem(TOKEN_KEY)) localStorage.setItem(TOKEN_KEY, t);
    if (a && !localStorage.getItem(ADMIN_TOKEN_KEY)) localStorage.setItem(ADMIN_TOKEN_KEY, a);
  } catch {
    /* ignore */
  }
};
