import api from '../lib/api';

export const userService = {
  getMe: () =>
    api.get('/users/me').then(r => r.data),

  updateMe: (data) =>
    api.patch('/users/me', data).then(r => r.data),

  deleteMe: () =>
    api.delete('/users/me').then(r => r.data),

  connectPlatform: (platform) =>
    api.post('/users/me/connect', { platform }).then(r => r.data),

  disconnectPlatform: (platform) =>
    api.post('/users/me/disconnect', { platform }).then(r => r.data),
};
