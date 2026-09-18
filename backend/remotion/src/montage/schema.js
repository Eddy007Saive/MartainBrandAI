/**
 * Projet de montage (éditeur vidéo manuel) — schéma partagé navigateur / rendu.
 *
 * SOURCE DE VÉRITÉ : backend/remotion/src/montage/. Le front en reçoit une copie
 * (frontend/src/generated/montage/, script frontend/scripts/montage.mjs). Ne rien
 * importer ici qui n'existe pas dans un navigateur.
 *
 * Unités : temps en secondes, positions et tailles du cadre en % du canevas
 * (x, y = coin haut-gauche ; w, h), taille de police en px pour un canevas de
 * 1080 de large (mise à l'échelle par la composition).
 */

export const VERSION = 1;
export const FPS = 30;

export const TYPES_PISTE = ['texte', 'soustitres', 'image', 'video', 'audio'];

/** Styles de texte prêts à l'emploi (le client part d'un style, puis ajuste). */
export const STYLES_TEXTE = {
  titre:    { police: 'Sora', taille: 84, couleur: '#FFFFFF', fond: 'transparent', gras: true, italique: false, align: 'center', ombre: true, contour: false, rayon: 0, marge: 0, animation: 'monter' },
  etiquette:{ police: 'Sora', taille: 52, couleur: '#0B1322', fond: '#3AFFA3', gras: true, italique: false, align: 'center', ombre: false, contour: false, rayon: 18, marge: 22, animation: 'pop' },
  legende:  { police: 'Inter', taille: 44, couleur: '#FFFFFF', fond: 'rgba(2,6,23,0.72)', gras: false, italique: false, align: 'center', ombre: false, contour: false, rayon: 14, marge: 18, animation: 'fondu' },
  neon:     { police: 'Sora', taille: 76, couleur: '#3AFFA3', fond: 'transparent', gras: true, italique: false, align: 'center', ombre: true, contour: false, rayon: 0, marge: 0, animation: 'pop' },
  discret:  { police: 'Inter', taille: 38, couleur: '#E2E8F0', fond: 'transparent', gras: false, italique: true, align: 'left', ombre: true, contour: false, rayon: 0, marge: 0, animation: 'fondu' },
};

export const STYLE_SOUSTITRES_DEFAUT = {
  police: 'Sora', taille: 58, couleur: '#FFFFFF', couleurActive: '#3AFFA3', fond: 'rgba(2,6,23,0.55)',
  gras: true, contour: true, rayon: 16, marge: 20, position: 74,  // position = % du haut
};

export const ANIMATIONS = ['aucune', 'fondu', 'monter', 'pop'];

export function nouvelId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Un projet vide, vertical 9:16, avec les cinq pistes standard. */
export function projetVide(fond = '#020617') {
  return {
    version: VERSION,
    largeur: 1080,
    hauteur: 1920,
    fps: FPS,
    fond,
    pistes: [
      { id: 'p-texte', type: 'texte', nom: 'Textes', muet: false, verrou: false },
      { id: 'p-soustitres', type: 'soustitres', nom: 'Sous-titres', muet: false, verrou: false },
      { id: 'p-image', type: 'image', nom: 'Images', muet: false, verrou: false },
      { id: 'p-video', type: 'video', nom: 'Vidéo', muet: false, verrou: false },
      { id: 'p-audio', type: 'audio', nom: 'Audio', muet: false, verrou: false },
    ],
    elements: [],
    soustitres: { style: { ...STYLE_SOUSTITRES_DEFAUT } },
  };
}

/** Fin du dernier élément, en secondes (au moins 1 s pour que l'aperçu ait une frame). */
export function dureeProjet(projet) {
  const fin = (projet?.elements || []).reduce((m, e) => Math.max(m, (e.debut || 0) + (e.duree || 0)), 0);
  return Math.max(1, fin);
}

export function dureeEnFrames(projet) {
  return Math.max(1, Math.round(dureeProjet(projet) * (projet?.fps || FPS)));
}

/** Piste d'accueil d'un type d'élément. */
export function pisteDe(projet, type) {
  const t = type === 'soustitre' ? 'soustitres' : type;
  return (projet.pistes || []).find((p) => p.type === t)?.id || null;
}

/** Fabrique un élément prêt à poser sur la timeline. */
export function nouvelElement(projet, type, extra = {}) {
  const base = { id: nouvelId(), piste: pisteDe(projet, type), type, debut: 0, duree: 4, opacite: 1 };
  if (type === 'video') return { ...base, src: null, decalage: 0, volume: 1, vitesse: 1, cadre: { x: 0, y: 0, w: 100, h: 100 }, ajustement: 'cover', rotation: 0, ...extra };
  if (type === 'image') return { ...base, src: null, cadre: { x: 0, y: 0, w: 100, h: 100 }, ajustement: 'cover', rotation: 0, animation: 'aucune', ...extra };
  if (type === 'audio') return { ...base, src: null, decalage: 0, volume: 0.6, fonduSortie: 1, ...extra };
  if (type === 'texte') return { ...base, texte: 'Ton texte', cadre: { x: 8, y: 40, w: 84, h: 14 }, rotation: 0, style: { ...STYLES_TEXTE.titre }, ...extra };
  if (type === 'soustitre') return { ...base, texte: '', duree: 1.5, ...extra };
  return { ...base, ...extra };
}

/** Les éléments visibles à l'instant t, ordonnés du fond vers le dessus (ordre des pistes inversé). */
export function elementsA(projet, t) {
  const ordre = new Map((projet.pistes || []).map((p, i) => [p.id, i]));
  return (projet.elements || [])
    .filter((e) => t >= (e.debut || 0) && t < (e.debut || 0) + (e.duree || 0))
    .sort((a, b) => (ordre.get(b.piste) ?? 0) - (ordre.get(a.piste) ?? 0));
}
