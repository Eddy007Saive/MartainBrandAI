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
 * Pics de forme d'onde d'une source audio (Web Audio API), en cache par URL — le décodage
 * (télécharge tout le fichier, l'analyse) ne se fait qu'une fois par source, même si plusieurs
 * éléments de la timeline pointent vers le même fichier ou si le composant se re-rend.
 * Renvoie { pics: Float32Array (200 valeurs 0-1), duree } ou null (décodage impossible : piste
 * muette, CORS, navigateur sans Web Audio API — l'appelant se contente alors du bloc uni).
 */
const _cacheOndes = new Map();
export function chargerOnde(url) {
  if (!url) return Promise.resolve(null);
  if (_cacheOndes.has(url)) return _cacheOndes.get(url);
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  const p = !AC ? Promise.resolve(null) : fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const ctx = new AC();
      return ctx.decodeAudioData(buf).then((audioBuf) => {
        const data = audioBuf.getChannelData(0);
        const N = 200;
        const pas = Math.max(1, Math.floor(data.length / N));
        const pics = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          let max = 0;
          const debut = i * pas;
          for (let j = 0; j < pas && debut + j < data.length; j++) {
            const v = Math.abs(data[debut + j]);
            if (v > max) max = v;
          }
          pics[i] = max;
        }
        ctx.close();
        return { pics, duree: audioBuf.duration };
      });
    }).catch(() => null);
  _cacheOndes.set(url, p);
  return p;
}

/**
 * Pose un élément déjà fabriqué à la tête de lecture. Pur et déterministe : appelable dans un
 * updater React (StrictMode l'exécute deux fois, l'identifiant doit donc être tiré AVANT, par
 * l'appelant).
 *
 * Plusieurs pistes du même type (ex. modèle « écran partagé » : deux pistes Vidéo, chacune avec
 * son propre `cadreDefaut`) -> on cherche la première piste libre à cet instant plutôt que de
 * toujours remplir la première puis pousser en série dans le temps, sinon le 2e plan atterrit
 * bout à bout après le 1er au lieu de se superposer sur l'autre piste au même moment. Une seule
 * piste de ce type (cas courant) : comportement inchangé. La piste choisie fournit son
 * `cadreDefaut` si l'élément n'en a pas déjà un explicite.
 */
export function placerElement(projet, e, tete) {
  const debutSouhaite = Math.max(0, tete || 0);
  const libre = (pisteId, d) => !projet.elements.some((x) => x.piste === pisteId && d < x.debut + x.duree && d + e.duree > x.debut);
  const memeType = projet.pistes.filter((p) => p.type === e.type && !p.verrou);
  const cible = memeType.find((p) => libre(p.id, debutSouhaite))
    || memeType.find((p) => p.id === e.piste) || memeType[0]
    || projet.pistes.find((p) => p.id === e.piste);
  const piste = cible?.id ?? e.piste;
  let debut = debutSouhaite;
  if (!libre(piste, debut)) {
    const memePiste = projet.elements.filter((x) => x.piste === piste);
    debut = memePiste.reduce((m, x) => Math.max(m, x.debut + x.duree), 0);
  }
  const cadre = e.cadre && cible?.cadreDefaut ? { ...cible.cadreDefaut } : e.cadre;
  return { ...projet, elements: [...projet.elements, { ...e, piste, cadre, debut: arrondi(debut) }] };
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

/**
 * Mode magnétique (idée reprise d'OpenCut, licence MIT) : décale vers la gauche, de `delta`
 * secondes, les éléments de la piste qui commencent à partir de `depuis`. C'est ce qui referme
 * le trou laissé par une suppression ou un rognage, au lieu d'un passage noir dans la vidéo.
 * Seule la piste concernée bouge : les autres (textes, musique) restent où le client les a mis.
 */
export function recollerApres(projet, piste, depuis, delta) {
  if (!(delta > 0)) return projet;
  return {
    ...projet,
    elements: projet.elements.map((e) => (e.piste === piste && e.debut >= depuis - 0.001
      ? { ...e, debut: arrondi(Math.max(0, e.debut - delta), 0.001) } : e)),
  };
}

/**
 * Arrêt sur image (idée tirée de Concat, réécrite) : à l'instant t, le plan vidéo est coupé, la
 * suite de sa piste recule de `duree` secondes, et l'image de cet instant (extraite par
 * Cloudinary, transformation `so_`) occupe le trou sur la piste Images, mêmes cadre et
 * recadrage. Renvoie { projet, image } ; image null si ce n'est pas possible (plan non
 * Cloudinary, instant hors du plan, aucune piste Images libre de verrou).
 */
export function figerImage(projet, id, t, ids, duree = 2) {
  const e = projet.elements.find((x) => x.id === id);
  const pisteImage = projet.pistes.find((p) => p.type === 'image' && !p.verrou);
  if (!e || e.type !== 'video' || !estClip(e.src) || !pisteImage) return { projet, image: null };
  if (t <= e.debut + 0.1 || t >= e.debut + e.duree - 0.1) return { projet, image: null }; // mêmes marges que couperElement
  const seconde = (e.decalage || 0) + (t - e.debut) * (e.vitesse || 1);
  const src = e.src
    .replace('/video/upload/', `/video/upload/so_${Math.max(0, seconde).toFixed(2)}/`)
    .replace(/\.(mp4|mov|webm|m4v|avi)(\?.*)?$/i, '.jpg');
  const { projet: coupe } = couperElement(projet, id, t, ids.suite);
  const decale = {
    ...coupe,
    elements: coupe.elements.map((x) => (x.piste === e.piste && x.debut >= t - 0.001 ? { ...x, debut: arrondi(x.debut + duree, 0.001) } : x)),
  };
  const image = {
    id: ids.image, piste: pisteImage.id, type: 'image', debut: arrondi(t, 0.001), duree, src,
    cadre: { ...(e.cadre || { x: 0, y: 0, w: 100, h: 100 }) }, ajustement: e.ajustement || 'cover', rotation: e.rotation || 0,
    animation: 'aucune', opacite: e.opacite ?? 1,
    ...(e.recadre ? { recadre: { ...e.recadre } } : {}), ...(e.miroir ? { miroir: { ...e.miroir } } : {}), ...(e.rayon ? { rayon: e.rayon } : {}),
  };
  return { projet: { ...decale, elements: [...decale.elements, image] }, image: image.id };
}

/** Supprime des éléments et referme le trou que chacun laisse sur sa piste. Du plus tardif au
 * plus précoce : chaque décalage part ainsi des positions d'origine. */
export function supprimerEtRecoller(projet, ids) {
  const retires = projet.elements.filter((e) => ids.includes(e.id)).sort((a, b) => b.debut - a.debut);
  let p = { ...projet, elements: projet.elements.filter((e) => !ids.includes(e.id)) };
  retires.forEach((r) => { p = recollerApres(p, r.piste, r.debut + r.duree, r.duree); });
  return p;
}

/** Garde ce qui est APRÈS l'instant t (supprime le début de l'élément). Avec `recoller`,
 * l'élément et la suite de sa piste reculent pour ne pas laisser de trou. */
export function rognerAvant(projet, id, t, recoller = false) {
  const e = projet.elements.find((x) => x.id === id);
  if (!e || t <= e.debut + 0.05 || t >= e.debut + e.duree - 0.05) return projet;
  const delta = t - e.debut;
  const extra = e.type === 'video' || e.type === 'audio' ? { decalage: arrondi((e.decalage || 0) + delta * (e.vitesse || 1), 0.001) } : {};
  const p = majElement(projet, id, { ...extra, debut: arrondi(t, 0.001), duree: arrondi(e.duree - delta, 0.001) });
  return recoller ? recollerApres(p, e.piste, t, delta) : p;
}

/** Garde ce qui est AVANT l'instant t (supprime la fin de l'élément). Avec `recoller`, la suite
 * de la piste avance pour combler. */
export function rognerApres(projet, id, t, recoller = false) {
  const e = projet.elements.find((x) => x.id === id);
  if (!e || t <= e.debut + 0.05 || t >= e.debut + e.duree - 0.05) return projet;
  const fin = e.debut + e.duree;
  const p = majElement(projet, id, { duree: arrondi(t - e.debut, 0.001) });
  return recoller ? recollerApres(p, e.piste, fin, fin - t) : p;
}

/**
 * Images d'un plan vidéo Cloudinary à un instant donné de la source (transformation `so_`) :
 * de quoi dessiner une bande de miniatures sur la timeline, sans rien précalculer. L'instant
 * est calé sur une grille fixe (`pas` secondes) : chaque image distincte est une transformation
 * Cloudinary facturée, la grille fait resservir les mêmes d'un zoom à l'autre (et le cache).
 */
export function vignetteA(src, seconde, pas = 1, h = 84) {
  if (!estClip(src)) return null;
  const so = Math.max(0, Math.round(seconde / pas) * pas).toFixed(1);
  return src
    .replace('/video/upload/', `/video/upload/so_${so},h_${h},c_scale,q_auto/`)
    .replace(/\.(mp4|mov|webm|m4v|avi)(\?.*)?$/i, '.jpg');
}

/**
 * Lit un fichier de sous-titres SRT ou WebVTT -> [{ debut, duree, texte }] (secondes).
 * Accepte « 00:01:02,500 » et « 01:02.500 », ignore numéros, en-têtes, réglages de position
 * et balises (<i>, {\an8}…). Les lignes d'un même bloc sont jointes par un espace.
 */
export function lireSousTitres(contenu) {
  const enSec = (h) => {
    const m = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/.exec(h);
    if (!m) return null;
    return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
  };
  const blocs = String(contenu || '').replace(/^﻿/, '').replace(/\r/g, '').split(/\n\s*\n/);
  const out = [];
  blocs.forEach((bloc) => {
    const lignes = bloc.split('\n').map((l) => l.trim()).filter(Boolean);
    const i = lignes.findIndex((l) => l.includes('-->'));
    if (i < 0) return;
    const [a, b] = lignes[i].split('-->');
    const debut = enSec(a);
    const fin = enSec(b);
    const texte = lignes.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
    if (debut == null || fin == null || fin <= debut || !texte) return;
    out.push({ debut: arrondi(debut, 0.001), duree: arrondi(fin - debut, 0.001), texte: texte.slice(0, 600) });
  });
  return out.sort((x, y) => x.debut - y.debut);
}

/** Pose des sous-titres importés sur la piste Sous-titres ; `remplacer` retire d'abord ceux
 * qui y sont (même usage que « Générer les sous-titres », qui refait la piste). */
export function poserSousTitres(projet, lignes, ids, remplacer = true) {
  const piste = projet.pistes.find((p) => p.type === 'soustitres');
  if (!piste) return projet;
  const gardes = remplacer ? projet.elements.filter((e) => e.type !== 'soustitre') : projet.elements;
  const nouveaux = lignes.map((l, i) => ({ ...nouvelElement(projet, 'soustitre', { texte: l.texte }), id: ids[i], piste: piste.id, debut: l.debut, duree: l.duree }));
  return { ...projet, elements: [...gardes, ...nouveaux] };
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
    dureeSource: v.dureeSource,
  };
  return {
    projet: { ...projet, pistes, elements: [...projet.elements.map((x) => (x.id === id ? { ...x, volume: 0 } : x)), audio] },
    nouveau: nouveauId,
  };
}
