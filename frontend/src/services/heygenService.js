import api from '../lib/api';

export const heygenService = {
  createAvatar: (formData) =>
    api.post('/heygen/create-avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 min for large uploads
    }).then(r => r.data),

  getAvatar: () =>
    api.get('/heygen/avatar').then(r => r.data),

  deleteAvatar: () =>
    api.delete('/heygen/avatar').then(r => r.data),
};
