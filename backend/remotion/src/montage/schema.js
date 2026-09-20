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

/** mode : 'phrase' (bloc fixe), 'surligne' (phrase entière, mot en cours en couleur active),
 *  'apparition' (les mots apparaissent au fil de la voix, façon Submagic). Les deux modes animés
 *  demandent des mots horodatés sur l'élément : `mots: [{t, d, texte}]`, t et d relatifs au début
 *  du sous-titre ; sans eux, le sous-titre se comporte en 'phrase'. */
export const STYLE_SOUSTITRES_DEFAUT = {
  police: 'Sora', taille: 58, couleur: '#FFFFFF', couleurActive: '#3AFFA3', fond: 'rgba(2,6,23,0.55)',
  gras: true, contour: true, rayon: 16, marge: 20, position: 74,  // position = % du haut
  mode: 'surligne',
};
export const MODES_SOUSTITRES = ['phrase', 'surligne', 'apparition'];

export const ANIMATIONS = ['aucune', 'fondu', 'monter', 'pop'];

/** Polices proposées (Google Fonts, chargées par la composition via @remotion/google-fonts :
 *  même fichier de police à l'aperçu et au rendu serveur). Georgia et Mono restent des polices
 *  système, sans chargement. */
export const POLICES_LISTE = ['Sora', 'Inter', 'Montserrat', 'Poppins', 'Bebas Neue', 'Anton', 'Playfair Display', 'Caveat', 'Georgia', 'Mono'];

/** Recadrage d'un plan image ou vidéo : zoom (1 à 5) vers un point d'intérêt x, y en % du média. */
export const RECADRE_DEFAUT = { zoom: 1, x: 50, y: 50 };

/** Transitions d'ENTRÉE d'un plan image ou vidéo : le plan précédent de la même piste reste
 *  affiché dessous pendant la transition (il est prolongé d'autant par la composition). */
export const TRANSITIONS = ['aucune', 'fondu', 'glisser', 'zoom', 'volet', 'noir'];
export const TRANSITION_DUREE_DEFAUT = 0.5;

/** Prolongation d'un plan : la durée de la transition du plan qui le suit sur la même piste,
 *  s'ils se touchent (à 0,1 s près). Partagé aperçu / rendu. */
export function prolongation(projet, e) {
  const fin = (e.debut || 0) + (e.duree || 0);
  const suivant = (projet.elements || []).find((x) => x.id !== e.id && x.piste === e.piste
    && x.transition && x.transition.type && x.transition.type !== 'aucune' && Math.abs((x.debut || 0) - fin) <= 0.1);
  return suivant ? Math.min(2, Math.max(0.1, suivant.transition.duree || TRANSITION_DUREE_DEFAUT)) : 0;
}

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
