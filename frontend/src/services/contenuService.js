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

  // Recycle un post vers d'autres réseaux (une copie par réseau, créneau propre)
  recycler: (id, reseaux) => api.post(`/contenus/${id}/recycler`, { reseaux }).then(r => r.data),

  // Génère un reel animé à la charte (Remotion) — rendu long : timeout large
  genererReel: (id, template = 'affiche', extra = {}) => api.post('/reels/generer', { contenu_id: id, template, ...extra }, { timeout: 300000 }).then(r => r.data),
  // Séquence : visuels choisis par le client + banque de la marque
  reelUploadImage: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/reels/upload-image', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }).then(r => r.data);
  },
  reelBanque: () => api.get('/reels/banque').then(r => r.data.images || []),
  reelBanqueAjouter: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/reels/banque', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }).then(r => r.data);
  },
  reelBanqueSupprimer: (assetId) => api.delete(`/reels/banque/${assetId}`).then(r => r.data),
  regenererReel: (id, extra = {}) => api.post('/reels/regenerer', { reel_id: id, ...extra }, { timeout: 300000 }).then(r => r.data),
  creerReel: (extra = {}) => api.post('/reels/creer', extra, { timeout: 300000 }).then(r => r.data),
  reelTemplates: () => api.get('/reels/templates').then(r => r.data),   // {templates, musiques, categories}
  reelRecommander: (id) => api.get(`/reels/recommander/${id}`).then(r => r.data),

  // Replanifie sur le prochain créneau libre (algorithme de planification) + reprogramme Zernio
  replanifier: (id) => api.post(`/contenus/${id}/replanifier`).then(r => r.data),

  // Programme la publication du contenu via Late (push avec sa date)
  publier: (id) => api.post(`/late/publier/${id}`).then(r => r.data),

  // Annule l'envoi d'un contenu programmé dans Late
  annuler: (id) => api.post(`/late/annuler/${id}`).then(r => r.data),
  declinerStory: (id) => api.post(`/contenus/${id}/story`).then(r => r.data),
};
