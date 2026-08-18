import api from '../lib/api';

// Programme d'apporteurs d'affaires : 25 % une fois sur le Pack Fondations,
// 10 % chaque mois tant que le filleul reste abonné.
export const affiliationService = {
  // --- affilié
  demander: (payload) => api.post('/affiliation/demande', payload).then((r) => r.data),
  demanderExterne: (payload) => api.post('/affiliation/demande-externe', payload).then((r) => r.data),
  moi: () => api.get('/affiliation/moi').then((r) => r.data),
  mesReleves: () => api.get('/affiliation/mes-releves').then((r) => r.data),
  majIban: (iban) => api.put('/affiliation/mon-iban', { iban }).then((r) => r.data),
  verifier: (code) => api.get(`/affiliation/verifier/${code}`).then((r) => r.data),

  // --- admin
  affilies: (statut) => api.get('/affiliation/admin/affilies', { params: { statut } }).then((r) => r.data),
  decider: (id, payload) => api.put(`/affiliation/admin/affilies/${id}`, payload).then((r) => r.data),
  iban: (id) => api.get(`/affiliation/admin/affilies/${id}/iban`).then((r) => r.data),
  commissions: (params) => api.get('/affiliation/admin/commissions', { params }).then((r) => r.data),
  resume: (periode) => api.get(`/affiliation/admin/resume/${periode}`).then((r) => r.data),
  validerCommission: (id) => api.post(`/affiliation/admin/commissions/${id}/valider`).then((r) => r.data),
  annulerCommission: (id) => api.post(`/affiliation/admin/commissions/${id}/annuler`).then((r) => r.data),
  traitementMensuel: (periode) => api.post(`/affiliation/admin/traitement-mensuel/${periode}`).then((r) => r.data),
  releves: (periode) => api.get('/affiliation/admin/releves', { params: { periode } }).then((r) => r.data),
  payerReleve: (id) => api.post(`/affiliation/admin/releves/${id}/payer`).then((r) => r.data),
};

export default affiliationService;
