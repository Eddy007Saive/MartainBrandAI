import api from '../lib/api';

// Offres / produits du client : ce qu'il vend (produit / service / offre).
// Ces données ancrent la génération de contenu (Claude ne cite que ces faits).
export const offersService = {
  list: () => api.get('/offers').then((r) => r.data),
  create: (offer) => api.post('/offers', offer).then((r) => r.data),
  update: (id, patch) => api.patch(`/offers/${id}`, patch).then((r) => r.data),
  remove: (id) => api.delete(`/offers/${id}`).then((r) => r.data),
};
