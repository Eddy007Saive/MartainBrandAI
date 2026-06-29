import api from '../lib/api';

// Comptes liés (master + sous-comptes/marques) — facturation par compte (crédits propres)
export const accountService = {
  list: () => api.get('/accounts').then((r) => r.data),
  create: ({ nom, email, password }) =>
    api.post('/accounts', { nom, email, password }).then((r) => r.data),
  switch: (telegram_id) =>
    api.post('/accounts/switch', { telegram_id }).then((r) => r.data),
  remove: (telegram_id) =>
    api.delete(`/accounts/${telegram_id}`).then((r) => r.data),
};
