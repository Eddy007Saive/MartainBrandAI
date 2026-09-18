import api from '../lib/api';

// Éditeur vidéo manuel : projets de montage (JSON partagé avec la composition Remotion « Montage »)
export const editeurService = {
  lister: () => api.get('/editeur/montages').then((r) => r.data.montages || []),
  creer: (payload = {}) => api.post('/editeur/montages', payload).then((r) => r.data),
  lire: (id) => api.get(`/editeur/montages/${id}`).then((r) => r.data),
  modifier: (id, payload) => api.put(`/editeur/montages/${id}`, payload).then((r) => r.data),
  supprimer: (id) => api.delete(`/editeur/montages/${id}`).then((r) => r.data),
  medias: () => api.get('/editeur/medias').then((r) => r.data),
  // Export : 1 reel de quota, la ligne Contenus passe en rendu en cours
  rendre: (id, payload = {}) => api.post(`/editeur/montages/${id}/rendre`, payload, { timeout: 60000 }).then((r) => r.data),
  // Sous-titres d'un plan vidéo par transcription (Whisper, Studio Montage) -> { projet, nb, langue }
  transcrire: (id, elementId) => api.post(`/editeur/montages/${id}/transcrire`, { element_id: elementId }, { timeout: 480000 }).then((r) => r.data),
  // Ouvre un reel / une vidéo de Contenus dans l'éditeur -> { id, existant }
  depuisContenu: (contenuId) => api.post(`/editeur/montages/depuis-contenu/${contenuId}`).then((r) => r.data),
};

export default editeurService;
