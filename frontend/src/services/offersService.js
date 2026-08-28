import api from '../lib/api';

// Offres / produits du client : ce qu'il vend (produit / service / offre).
// Ces données ancrent la génération de contenu (Claude ne cite que ces faits).
export const offersService = {
  list: () => api.get('/offers').then((r) => r.data),
  create: (offer) => api.post('/offers', offer).then((r) => r.data),
  update: (id, patch) => api.patch(`/offers/${id}`, patch).then((r) => r.data),
  remove: (id) => api.delete(`/offers/${id}`).then((r) => r.data),

  // Photos d'une offre (Product Vision Agent) : analysées à l'upload, réutilisées.
  listAssets: (offerId) => api.get(`/offers/${offerId}/assets`).then((r) => r.data),
  addAsset: (offerId, file, role = 'other') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('role', role);
    return api.post(`/offers/${offerId}/assets`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  removeAsset: (assetId) => api.delete(`/offers/assets/${assetId}`).then((r) => r.data),
};
