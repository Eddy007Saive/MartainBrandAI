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

/**
 * Un JWT a trois segments et une charge utile lisible. Sans cette
 * verification, localStorage.setItem(undefined) enregistre la CHAINE
 * « undefined » — une valeur non vide, donc « connectee » aux yeux de
 * isAuthenticated(). C'est ainsi qu'on atterrissait sur le tableau de bord
 * avec des identifiants inexistants des que l'API ne repondait pas du JSON.
 */
export const jetonValide = (jeton) => {
  if (typeof jeton !== 'string') return false;
  if (!jeton || jeton === 'undefined' || jeton === 'null') return false;
  const parts = jeton.split('.');
  if (parts.length !== 3) return false;
  try {
    const charge = JSON.parse(
      decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))),
    );
    // exp absent : on ne refuse pas, c'est le serveur qui tranchera par un 401.
    // exp depasse : inutile de laisser entrer pour se faire ejecter au premier appel.
    if (charge.exp && charge.exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
};

export const getToken = () => {
  const jeton = localStorage.getItem(TOKEN_KEY);
  if (jeton && !jetonValide(jeton)) {
    // Reste d'une session cassee : on nettoie plutot que de le trainer.
    localStorage.removeItem(TOKEN_KEY);
    persist(TOKEN_KEY, null);
    return null;
  }
  return jeton;
};

export const setToken = (token) => {
  if (!jetonValide(token)) {
    throw new Error('jeton invalide : la reponse du serveur ne contient pas de session');
  }
  localStorage.setItem(TOKEN_KEY, token);
  persist(TOKEN_KEY, token);
};

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

// L'espace ou l'on travaille : « admin » ou « client ».
//
// Un administrateur qui gere aussi ses propres marques a DEUX espaces. Toutes
// les portes d'entree l'envoyaient sur l'administration — connexion, retour
// sur le site, bouton « Tableau de bord » — et son espace client n'etait
// accessible qu'en tapant l'adresse a la main. On memorise donc le dernier
// espace choisi explicitement, et c'est lui qui decide ou l'on atterrit.
const ESPACE_KEY = 'espace';

export const memoriserEspace = (espace) => {
  try { localStorage.setItem(ESPACE_KEY, espace); } catch { /* refuse : tant pis */ }
};

/** Ou envoyer quelqu'un qui vient de se connecter, ou qui revient sur le site. */
export const espaceParDefaut = () => {
  if (!isAdminAuthenticated()) return '/dashboard';
  let choisi = null;
  try { choisi = localStorage.getItem(ESPACE_KEY); } catch { /* refuse */ }
  // Sans choix memorise, un administrateur va a l'administration : c'est ce
  // qu'il fait neuf fois sur dix, et le passage dans l'autre sens est a un clic.
  return choisi === 'client' ? '/dashboard' : '/admin';
};

export const logout = () => {
  removeToken();
  // Ancienne cle des sessions ouvertes avant la fusion des connexions.
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ESPACE_KEY);
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
    if (jetonValide(t) && !localStorage.getItem(TOKEN_KEY)) localStorage.setItem(TOKEN_KEY, t);
    if (a && !localStorage.getItem(ADMIN_TOKEN_KEY)) localStorage.setItem(ADMIN_TOKEN_KEY, a);
  } catch {
    /* ignore */
  }
};
