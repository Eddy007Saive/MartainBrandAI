import api from '../lib/api';

// Templates de marque : style réutilisable (images de référence + note de style)
export const templateService = {
  list: () => api.get('/agent/templates').then((r) => r.data),
  create: ({ nom, images, note }) =>
    api.post('/agent/templates', { nom, images, note }).then((r) => r.data),
  remove: (id) => api.delete(`/agent/templates/${id}`).then((r) => r.data),
};
