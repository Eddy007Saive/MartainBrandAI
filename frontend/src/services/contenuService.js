import api from '../lib/api';

export const contenuService = {
  getAll: (statut) => {
    const params = statut && statut !== 'all' ? `?statut=${statut}` : '';
    return api.get(`/contenus${params}`).then(r => r.data);
  },

  getById: (id) =>
    api.get(`/contenus/${id}`).then(r => r.data),

  update: (id, data) =>
    api.patch(`/contenus/${id}`, data).then(r => r.data),

  remove: (id) =>
    api.delete(`/contenus/${id}`).then(r => r.data),
};
