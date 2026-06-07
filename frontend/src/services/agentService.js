import api from '../lib/api';

export const agentService = {
  // Génère N sujets (neutres, sauvegardés comme brouillons) → { sujets:[{id,titre}], credits }
  sujets: (nombre = 6) =>
    api.post('/agent/sujets', { nombre }).then((r) => r.data),

  // Plan éditorial du mois (besoin/rempli/reste/format par réseau)
  plan: (year, month) =>
    api.get('/agent/plan', { params: (year && month) ? { year, month } : {} }).then((r) => r.data),

  // Génération en rafale : items [{sujet, reseau, qualite}] planifiés sur le mois
  rafale: (items, year, month) =>
    api.post('/agent/rafale', { items, year, month }).then((r) => r.data),

  // Liste les sujets sauvegardés (persistants)
  sujetsList: () => api.get('/agent/sujets').then((r) => r.data),

  // Supprime un sujet sauvegardé
  supprimerSujet: (id) => api.delete(`/agent/sujets/${id}`).then((r) => r.data),

  // Rédige un post sur un sujet ; save=true l'enregistre dans les contenus
  rediger: (sujet, reseau = 'linkedin', save = false, qualite = 'equilibre') =>
    api.post('/agent/rediger', { sujet, reseau, save, qualite }).then((r) => r.data),

  // Enregistre le texte (éventuellement édité) dans les contenus
  enregistrer: (contenu, titre, reseau) =>
    api.post('/agent/enregistrer', { contenu, titre, reseau }).then((r) => r.data),

  // Génère un script vidéo
  script: (sujet, type_video = 'Reel', qualite = 'equilibre') =>
    api.post('/agent/script', { sujet, type_video, qualite }).then((r) => r.data),

  // Génère un carrousel (slides texte + images rendues) -> { contenu_id, slides, slides_images, credits }
  // contenu_id fourni = régénère le carrousel d'un contenu existant
  carrousel: (sujet, reseau = 'linkedin', nb_slides = 5, qualite = 'equilibre', contenu_id = null) =>
    api.post('/agent/carrousel', { sujet, reseau, nb_slides, qualite, contenu_id }).then((r) => r.data),

  // Enregistre un script (édité) dans la table studio
  enregistrerScript: (script, titre, type_video = 'Reel') =>
    api.post('/agent/enregistrer-script', { script, titre, type_video }).then((r) => r.data),

  // Claude écrit un prompt d'image à partir du texte du post (éditable) ; sauvegardé sur le contenu
  imagePrompt: (texte, reseau = 'linkedin', contenu_id = null) =>
    api.post('/agent/image-prompt', { texte, reseau, contenu_id }).then((r) => r.data),

  // Génère l'image (nano-banana) et l'attache au contenu
  image: (contenu_id, prompt, avec_photo = false, modele = 'nano2') =>
    api.post('/agent/image', { contenu_id, prompt, avec_photo, modele }).then((r) => r.data),
};
