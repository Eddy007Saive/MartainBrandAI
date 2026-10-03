// Règles de publication partagées par Contenus : réseaux qui refusent un post sans média, et
// traduction lisible des erreurs renvoyées par Late (Zernio), souvent en anglais.

// Instagram, TikTok et YouTube ne publient jamais de texte seul ; une story non plus.
const MEDIA_OBLIGATOIRE = new Set(['instagram', 'tiktok', 'youtube']);

export function aUnMedia(c) {
  return Boolean(c?.video_url || c?.lien_visuel || (Array.isArray(c?.slides_images) && c.slides_images.length));
}

/** Le contenu ne peut pas partir tel quel : il lui faut une image ou une vidéo. */
export function manqueMedia(c) {
  if (!c || aUnMedia(c)) return false;
  return c.type === 'Story' || MEDIA_OBLIGATOIRE.has(String(c.reseau_cible || '').toLowerCase());
}

/** Message d'erreur de publication compréhensible (les nouveaux sont déjà traduits par le
 * backend ; on traduit aussi les anciens, enregistrés en anglais). */
export function erreurLisible(msg, t) {
  const m = String(msg || '');
  const low = m.toLowerCase();
  if (!m) return t('publication.erreur.inconnue');
  if (low.includes('require media') || low.includes('media content')) return t('publication.erreur.media');
  if (low.includes('do not belong') || low.includes('account not found') || low.includes('not found for this user')) return t('publication.erreur.compte');
  if (low.includes('token') && (low.includes('expired') || low.includes('invalid'))) return t('publication.erreur.expire');
  if (low.includes('aspect ratio')) return t('publication.erreur.format');
  if (low.includes('rate limit') || low.includes('too many')) return t('publication.erreur.limite');
  return m;
}
