/**
 * Liens de téléchargement pour les visuels hébergés sur Cloudinary.
 *
 * Un simple <a download> ne suffit pas : le fichier vient d'un autre domaine,
 * donc le navigateur ignore l'attribut et se contente d'ouvrir l'image. La
 * solution côté Cloudinary est le drapeau `fl_attachment`, qui renvoie un
 * en-tête Content-Disposition — le fichier est alors vraiment enregistré,
 * avec le nom qu'on lui donne.
 */

/** Nom de fichier propre : sans accents, sans ponctuation, en minuscules. */
export function nomDeFichier(texte, defaut = 'postorico') {
  const base = (texte || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // enlève les accents
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return base || defaut;
}

/**
 * URL qui force le téléchargement.
 * @param {string} url  URL Cloudinary du visuel
 * @param {string} nom  nom du fichier voulu (sans extension)
 */
export function lienTelechargement(url, nom) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  const [base, fin] = url.split('/upload/');
  const flag = `fl_attachment${nom ? `:${nomDeFichier(nom)}` : ''}`;
  // Une transformation peut déjà être présente : on ajoute la nôtre devant.
  return `${base}/upload/${flag}/${fin}`;
}
