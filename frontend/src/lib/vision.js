import { getToken, setToken, removeToken } from './auth';

// Mode Vision (impersonation admin -> client) :
// on remplace le token utilisateur par le token vision (1 h) en sauvegardant l'éventuel
// token perso de l'admin, et on affiche un bandeau permanent dans le dashboard.
const KEY_META = 'visionMeta';
const KEY_BACKUP = 'visionBackupToken';

export const enterVision = (token, meta) => {
  // setToken en PREMIER : il refuse desormais un jeton malforme. S'il levait
  // apres l'ecriture de la sauvegarde et des metadonnees, on laisserait un
  // etat a moitie ecrit — bandeau Vision affiche, jeton inchange.
  const current = getToken();
  setToken(token);
  if (current) localStorage.setItem(KEY_BACKUP, current);
  localStorage.setItem(KEY_META, JSON.stringify(meta)); // {nom, email, expires_at}
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
  // Une session Vision dure une heure, le jeton d'administrateur huit : la
  // sauvegarde peut avoir expire entre-temps, et setToken la refuse alors.
  // On sort quand meme, quitte a redemander une connexion — rester coince en
  // Vision sans porte de sortie serait pire que de se reconnecter.
  try {
    if (backup) setToken(backup);
    else removeToken();
  } catch {
    removeToken();
  }
  localStorage.removeItem(KEY_META);
  localStorage.removeItem(KEY_BACKUP);
  window.location.href = '/admin';
};
