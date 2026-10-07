import api from '../lib/api';

/** Message d'erreur lisible : NestJS renvoie `{ message }` (chaîne ou liste pour une
 * validation), l'ancien backend `{ detail }`. */
export const messageErreur = (e, repli) => {
  const d = e?.response?.data || {};
  const m = d.message ?? d.detail;
  if (Array.isArray(m)) return m.join(' · ');
  return (typeof m === 'string' && m) || repli;
};

export const workflowService = {
  lister: () => api.get('/workflows').then((r) => r.data),
  obtenir: (id) => api.get(`/workflows/${id}`).then((r) => r.data),
  creer: (payload) => api.post('/workflows', payload).then((r) => r.data),
  modifier: (id, payload) => api.patch(`/workflows/${id}`, payload).then((r) => r.data),
  activer: (id) => api.post(`/workflows/${id}/activate`).then((r) => r.data),
  pause: (id) => api.post(`/workflows/${id}/pause`).then((r) => r.data),
  supprimer: (id) => api.delete(`/workflows/${id}`).then((r) => r.data),
  posts: (accountId) => api.get('/workflows/posts', { params: { accountId } }).then((r) => r.data),
  executions: (id) => api.get(`/workflows/${id}/executions`).then((r) => r.data),
};
