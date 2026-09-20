/** Petits utilitaires de l'éditeur (temps, médias, projet). */
import { nouvelElement, nouvelId, dureeProjet } from '../../generated/montage/schema.js';

export { nouvelId };

export const fmtTemps = (s) => {
  const t = Math.max(0, s || 0);
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};

export const arrondi = (x, pas = 0.05) => Math.round(x / pas) * pas;

/** Durée d'un média distant (vidéo ou audio) via les métadonnées du navigateur, 8 s max d'attente. */
export function dureeMedia(url, type = 'video') {
  return new Promise((resolve) => {
    const el = document.createElement(type === 'audio' ? 'audio' : 'video');
    el.preload = 'metadata';
    const fin = (d) => { el.src = ''; resolve(d); };
    const garde = setTimeout(() => fin(null), 8000);
    el.onloadedmetadata = () => { clearTimeout(garde); fin(Number.isFinite(el.duration) ? el.duration : null); };
    el.onerror = () => { clearTimeout(garde); fin(null); };
    el.src = url;
  });
}

export const estClip = (url) => /\/video\/upload\//.test(url || '') && !/\.(jpg|png|webp)$/i.test(url || '');

/**
 * Pose un élément déjà fabriqué à la tête de lecture, après le dernier élément de sa piste si la
 * place est prise. Pur et déterministe : appelable dans un updater React (StrictMode l'exécute deux
 * fois, l'identifiant doit donc être tiré AVANT, par l'appelant).
 */
export function placerElement(projet, e, tete) {
  const memePiste = projet.elements.filter((x) => x.piste === e.piste);
  let debut = Math.max(0, tete || 0);
  const chevauche = (d) => memePiste.some((x) => d < x.debut + x.duree && d + e.duree > x.debut);
  if (chevauche(debut)) {
    debut = memePiste.reduce((m, x) => Math.max(m, x.debut + x.duree), 0);
  }
  return { ...projet, elements: [...projet.elements, { ...e, debut: arrondi(debut) }] };
}

export { nouvelElement };

export function majElement(projet, id, maj) {
  return { ...projet, elements: projet.elements.map((e) => (e.id === id ? { ...e, ...(typeof maj === 'function' ? maj(e) : maj) } : e)) };
}

export function supprimerElement(projet, id) {
  return { ...projet, elements: projet.elements.filter((e) => e.id !== id) };
}

/** Coupe l'élément en deux à l'instant t (dans ses bornes). */
export function couperElement(projet, id, t, nouveauId) {
  const e = projet.elements.find((x) => x.id === id);
  if (!e || t <= e.debut + 0.1 || t >= e.debut + e.duree - 0.1) return { projet, nouveau: null };
  const avant = { ...e, duree: arrondi(t - e.debut, 0.001) };
  const apres = {
    ...e, id: nouveauId, debut: arrondi(t, 0.001), duree: arrondi(e.debut + e.duree - t, 0.001),
    ...(e.type === 'video' || e.type === 'audio' ? { decalage: (e.decalage || 0) + (t - e.debut) * (e.vitesse || 1) } : {}),
  };
  return { projet: { ...projet, elements: projet.elements.flatMap((x) => (x.id === id ? [avant, apres] : [x])) }, nouveau: apres.id };
}

export function dupliquerElement(projet, id, nouveauId) {
  const e = projet.elements.find((x) => x.id === id);
  if (!e) return { projet, nouveau: null };
  const copie = { ...e, id: nouveauId, debut: arrondi(e.debut + e.duree) };
  return { projet: { ...projet, elements: [...projet.elements, copie] }, nouveau: copie.id };
}

/** Bords utiles pour l'aimantation : débuts et fins des autres éléments + 0 + tête de lecture. */
export function aimants(projet, saufId, tete) {
  const s = new Set([0, arrondi(tete || 0, 0.001)]);
  projet.elements.forEach((e) => { if (e.id !== saufId) { s.add(e.debut); s.add(e.debut + e.duree); } });
  return [...s];
}

export function aimanter(valeur, cibles, tolerance) {
  let meilleur = valeur, ecart = tolerance;
  cibles.forEach((c) => { const d = Math.abs(c - valeur); if (d < ecart) { ecart = d; meilleur = c; } });
  return meilleur;
}

export { dureeProjet };

/**
 * Sépare l'audio d'un plan vidéo : le plan devient muet, un élément audio indépendant (mêmes
 * bornes, même départ dans la source, même vitesse) est posé sur la piste Audio — ou sur une
 * piste Audio supplémentaire si celle-là est déjà occupée à cet endroit (musique, voix off).
 * Le client peut alors déplacer, couper ou supprimer le son sans toucher à l'image.
 */
export function separerAudio(projet, id, nouveauId, nouvellePisteId) {
  const v = projet.elements.find((x) => x.id === id);
  if (!v || v.type !== 'video') return { projet, nouveau: null };
  const pistesAudio = projet.pistes.filter((p) => p.type === 'audio');
  const occupee = (pisteId) => projet.elements.some((x) => x.piste === pisteId && v.debut < x.debut + x.duree && v.debut + v.duree > x.debut);
  let pistes = projet.pistes;
  let piste = pistesAudio.find((p) => !p.verrou && !occupee(p.id));
  if (!piste) {
    piste = { id: nouvellePisteId, type: 'audio', nom: 'Audio', muet: false, verrou: false };
    pistes = [...pistes, piste];
  }
  const audio = {
    id: nouveauId, piste: piste.id, type: 'audio', debut: v.debut, duree: v.duree, opacite: 1,
    src: v.src, decalage: v.decalage || 0, vitesse: v.vitesse || 1, volume: v.volume ?? 1, fonduSortie: 0,
  };
  return {
    projet: { ...projet, pistes, elements: [...projet.elements.map((x) => (x.id === id ? { ...x, volume: 0 } : x)), audio] },
    nouveau: nouveauId,
  };
}
