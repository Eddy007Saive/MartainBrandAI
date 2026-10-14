import api from '../lib/api';

// Publicités Meta (Facebook / Instagram) via Zernio : booster un post publié, suivre les pubs.
export const publiciteService = {
  // -> { page_connectee, reconnexion?, comptes: [{ id, nom, devise, fuseau, budget_min_jour, utilisable, alertes }] }
  etat: () => api.get('/publicite/etat').then((r) => r.data),
  // -> { pubs: [{ id, nom, statut, allumee, motif_refus, objectif, budget, debut, fin, stats }], chargement }
  pubs: (comptePub, du, au) => api.get('/publicite/pubs', { params: { compte_pub: comptePub, du, au } }).then((r) => r.data),
  changerStatut: (id, allumer) => api.put(`/publicite/pubs/${encodeURIComponent(id)}/statut`, { allumer }).then((r) => r.data),
  // -> { lieux: [{ id, nom, region }] }
  lieux: (q) => api.get('/publicite/lieux', { params: { q } }).then((r) => r.data),
  booster: (demande) => api.post('/publicite/booster', demande, { timeout: 120000 }).then((r) => r.data),
  // -> { objectif, budget_jour, jours, age_min, age_max, raison }
  conseil: (contenuId) => api.post('/publicite/conseil', { contenu_id: contenuId }).then((r) => r.data),
};
