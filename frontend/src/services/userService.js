import api from '../lib/api';

export const userService = {
  getMe: () =>
    api.get('/users/me').then(r => r.data),

  updateMe: (data) =>
    api.patch('/users/me', data).then(r => r.data),

  // Upload de la photo de profil (multipart) -> { photo_url }
  uploadPhoto: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/users/me/photo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

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

  connectPlatform: (platform) =>
    api.post('/users/me/connect', { platform }).then(r => r.data),

  disconnectPlatform: (platform) =>
    api.post('/users/me/disconnect', { platform }).then(r => r.data),
};
