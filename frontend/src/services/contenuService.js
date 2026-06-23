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

  // Importe une image (fichier) comme visuel du contenu
  uploadImage: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/contenus/${id}/image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  // Programme la publication du contenu via Late (push avec sa date)
  publier: (id) => api.post(`/late/publier/${id}`).then(r => r.data),

  // Annule l'envoi d'un contenu programmé dans Late
  annuler: (id) => api.post(`/late/annuler/${id}`).then(r => r.data),
};
