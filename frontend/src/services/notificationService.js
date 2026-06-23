import api from '../lib/api';

export const notificationService = {
  list: () => api.get('/notifications').then((r) => r.data),
  markAll: () => api.post('/notifications/lus').then((r) => r.data),
  markOne: (id) => api.post(`/notifications/${id}/lu`).then((r) => r.data),
  registerDeviceToken: (token, platform) =>
    api.post('/notifications/device-token', { token, platform }).then((r) => r.data),
};
