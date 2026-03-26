import api from '../lib/api';

export const commentaireService = {
  getAll: (statut) => {
    const params = statut && statut !== 'all' ? `?statut=${statut}` : '';
    return api.get(`/commentaires${params}`).then(r => r.data);
  },

  update: (id, data) =>
    api.patch(`/commentaires/${id}`, data).then(r => r.data),
};
