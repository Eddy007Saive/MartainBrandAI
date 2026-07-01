import api from '../lib/api';

export const onboardingService = {
  // Envoi public du questionnaire d'audit de marque (lead anonyme)
  submitAudit: (payload) =>
    api.post('/onboarding/audit', payload).then((r) => r.data),

  // Upload public d'un fichier (logo / image) -> { url }
  uploadAsset: (file, kind = 'image') => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    return api.post('/onboarding/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  // Admin : liste des leads
  listAudits: () => api.get('/onboarding/audits').then((r) => r.data),
  getAudit: (id) => api.get(`/onboarding/audits/${id}`).then((r) => r.data),
};
