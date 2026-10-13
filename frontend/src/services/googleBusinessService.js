import api from '../lib/api';

// Fiche Google gérée depuis Postorico (au-delà des posts) : avis, photos, infos, liens, établissements.
export const googleBusinessService = {
  // -> { moyenne, total, avis: [{ id, auteur, photo, note, texte, date, reponse: { texte, date } | null }], suite }
  avis: (suite) => api.get('/google-business/avis', { params: suite ? { suite } : {} }).then((r) => r.data),
  // Réponse proposée par l'IA dans le ton de la marque -> { texte }
  suggestion: (avis) => api.post('/google-business/avis/suggestion', { auteur: avis.auteur, note: avis.note, texte: avis.texte }).then((r) => r.data),
  repondre: (id, message) => api.post(`/google-business/avis/${encodeURIComponent(id)}/reponse`, { message }).then((r) => r.data),
  supprimerReponse: (id) => api.delete(`/google-business/avis/${encodeURIComponent(id)}/reponse`).then((r) => r.data),

  // -> { photos: [{ id, url, miniature, categorie, description, date, video }] }
  photos: () => api.get('/google-business/photos').then((r) => r.data),
  ajouterPhoto: (url, categorie, description) => api.post('/google-business/photos', { url, categorie, description }, { timeout: 120000 }).then((r) => r.data),
  supprimerPhoto: (id) => api.delete(`/google-business/photos/${encodeURIComponent(id)}`).then((r) => r.data),

  // -> { nom, description, telephone, site, categorie, horaires, horaires_speciaux, verifiee, lien_maps, lien_avis }
  infos: () => api.get('/google-business/infos').then((r) => r.data),
  majInfos: (data) => api.patch('/google-business/infos', data).then((r) => r.data),
  genererDescription: () => api.post('/google-business/infos/description').then((r) => r.data),

  liens: () => api.get('/google-business/liens').then((r) => r.data),
  ajouterLien: (url, type) => api.post('/google-business/liens', { url, type }).then((r) => r.data),
  supprimerLien: (id) => api.delete('/google-business/liens', { params: { id } }).then((r) => r.data),

  etablissements: () => api.get('/google-business/etablissements').then((r) => r.data),
  choisirEtablissement: (id) => api.put('/google-business/etablissements', { id }).then((r) => r.data),
};
