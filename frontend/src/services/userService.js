import api from '../lib/api';

export const userService = {
  getMe: () =>
    api.get('/users/me').then(r => r.data),

  // Lit le site du client et propose sa fiche de marque. Long (20-40 s) :
  // le serveur ouvre un vrai navigateur pour rendre le JavaScript.
  analyserSite: (url, langue) =>
    api.post('/users/me/analyser-site', { url, langue }, { timeout: 90000 }).then(r => r.data),

  // Reprend le logo repere sur le site : le backend en fait une copie chez
  // nous, on ne pointe jamais vers le site du client.
  logoDepuisSite: (url) =>
    api.post('/users/me/logo-depuis-site', { url }).then(r => r.data),

  updateMe: (data) =>
    api.patch('/users/me', data).then(r => r.data),

  // Premiers pas : état des 6 étapes du démarrage, calculé côté serveur depuis les données
  // force : contourne le cache serveur (20 s), juste après une action.
  demarrage: (force = false) =>
    api.get('/users/me/demarrage', { params: force ? { force: 1 } : {} }).then(r => r.data),

  // Upload de la photo de profil (multipart) -> { photo_url }
  uploadPhoto: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/users/me/photo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  // Logo de marque (utilisé dans les carrousels)
  uploadLogo: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/users/me/logo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  deleteLogo: () => api.delete('/users/me/logo').then(r => r.data),

  // Avatar (photo de profil)
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/users/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  // Changement de mot de passe
  changePassword: (old_password, new_password) =>
    api.post('/users/me/password', { old_password, new_password }).then(r => r.data),

  deleteMe: () =>
    api.delete('/users/me').then(r => r.data),

  // Inspirations visuelles (images que l'utilisateur aime)
  listInspirations: () =>
    api.get('/users/me/inspirations').then(r => r.data),

  addInspiration: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/users/me/inspirations', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  removeInspiration: (url) =>
    api.delete('/users/me/inspirations', { data: { url } }).then(r => r.data),
  // Marque/démarque une inspiration comme "à toujours intégrer littéralement" (ex. la mascotte)
  setInspirationIntegration: (url, integrate) =>
    api.post('/users/me/inspirations/integrate', { url, integrate }).then(r => r.data),

  connectPlatform: (platform) =>
    api.post('/users/me/connect', { platform }).then(r => r.data),

  disconnectPlatform: (platform) =>
    api.post('/users/me/disconnect', { platform }).then(r => r.data),

  // Métadonnées des comptes connectés (nom, @username, avatar) via Zernio
  socialAccounts: () =>
    api.get('/users/me/social-accounts').then(r => r.data),
};
