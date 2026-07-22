import { getToken, setToken, removeToken } from './auth';

// Mode Vision (impersonation admin -> client) :
// on remplace le token utilisateur par le token vision (1 h) en sauvegardant l'éventuel
// token perso de l'admin, et on affiche un bandeau permanent dans le dashboard.
const KEY_META = 'visionMeta';
const KEY_BACKUP = 'visionBackupToken';

export const enterVision = (token, meta) => {
  const current = getToken();
  if (current) localStorage.setItem(KEY_BACKUP, current);
  localStorage.setItem(KEY_META, JSON.stringify(meta)); // {nom, email, expires_at}
  setToken(token);
  window.location.href = '/dashboard';
};

export const getVision = () => {
  try {
    const meta = JSON.parse(localStorage.getItem(KEY_META) || 'null');
    if (!meta) return null;
    if (meta.expires_at && new Date(meta.expires_at) <= new Date()) {
      exitVision(); // session expirée -> retour auto à l'admin
      return null;
    }
    return meta;
  } catch {
    return null;
  }
};

export const exitVision = () => {
  const backup = localStorage.getItem(KEY_BACKUP);
  if (backup) setToken(backup);
  else removeToken();
  localStorage.removeItem(KEY_META);
  localStorage.removeItem(KEY_BACKUP);
  window.location.href = '/admin';
};
