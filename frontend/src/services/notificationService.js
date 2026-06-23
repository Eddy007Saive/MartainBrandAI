import api from '../lib/api';

export const notificationService = {
  list: () => api.get('/notifications').then((r) => r.data),
  markAll: () => api.post('/notifications/lus').then((r) => r.data),
  markOne: (id) => api.post(`/notifications/${id}/lu`).then((r) => r.data),
};
