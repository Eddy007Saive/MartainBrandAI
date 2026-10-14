import api from '../lib/api';

// Montage complet par l'agent IA du VPS (Claude Code + HyperFrames).
export const agentVideoService = {
  // { clips: [{ url }], consignes, reseau, format, duree_max_s, illustrations, logo, images: [{ url, description }] } -> { id, contenu_id, video_status }
  creer: (payload) => api.post('/agent-video', payload).then((r) => r.data),

  // -> { statut: en_cours|termine|echec, progression, erreur, debut, video_url, video_preview_url, resume }
  etat: (id) => api.get(`/agent-video/${id}`).then((r) => r.data),

  // Dernier montage par l'agent d'un contenu (même forme que etat, avec mode: video|motion)
  parContenu: (contenuId) => api.get(`/agent-video/contenu/${contenuId}`).then((r) => r.data),

  // Correction d'un montage terminé : { consignes, images: [{ url, description }] } -> état (nouvelle version en cours)
  corriger: (id, payload) => api.post(`/agent-video/${id}/corrections`, payload).then((r) => r.data),
};
