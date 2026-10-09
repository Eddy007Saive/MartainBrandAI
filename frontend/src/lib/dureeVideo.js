import i18n from '../i18n';

// Durée maximale d'une vidéo importée (banque, Studio vidéo). Le serveur vérifie aussi
// (VIDEO_DUREE_MAX_S côté Nest) : ce contrôle-ci évite seulement d'envoyer pour rien.
export const DUREE_MAX_VIDEO_S = 300;

/** Durée d'un fichier vidéo lue dans le navigateur, ou null si illisible (codec non pris en
 * charge, ex. HEVC sur certains navigateurs) : dans ce cas, le serveur tranchera. */
export function dureeVideo(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const fin = (d) => { URL.revokeObjectURL(url); clearTimeout(minuteur); resolve(d); };
    const minuteur = setTimeout(() => fin(null), 8000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => fin(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => fin(null);
    video.src = url;
  });
}

const formatDuree = (s) => {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const r = total % 60;
  if (!m) return `${r} s`;
  return r ? `${m} min ${r} s` : `${m} min`;
};

/** Message d'erreur si la vidéo dépasse la durée maximale, sinon null. */
export async function videoTropLongue(file) {
  if (!file?.type?.startsWith('video/')) return null;
  const d = await dureeVideo(file);
  if (d === null || d <= DUREE_MAX_VIDEO_S + 0.5) return null;
  return i18n.t('video.tropLongue', { duree: formatDuree(d), max: formatDuree(DUREE_MAX_VIDEO_S) });
}
