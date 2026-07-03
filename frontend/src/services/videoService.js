import api from '../lib/api';

export const videoService = {
  // Templates (live Submagic) + bibliothèque de sons
  getOptions: () => api.get('/video/options').then((r) => r.data),

  // Upload de la vidéo brute -> { video_url, duration, width, height }
  uploadRaw: (file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/video/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }).then((r) => r.data);
  },

  // Crée un contenu-script « À tourner » depuis un script -> { contenu_id }
  createDraft: (payload) => api.post('/video/draft', payload).then((r) => r.data),

  // Lance le montage -> { contenu_id, submagic_project_id, video_status }
  create: (payload) => api.post('/video/create', payload).then((r) => r.data),

  // Import direct d'une vidéo déjà prête (sans montage Submagic, sans quota) -> { contenu_id, video_status }
  importVideo: (payload) => api.post('/video/import', payload).then((r) => r.data),

  // Statut du montage (polling) -> { video_status, video_url?, video_preview_url? }
  status: (contenuId) => api.get(`/video/status/${contenuId}`).then((r) => r.data),
};
