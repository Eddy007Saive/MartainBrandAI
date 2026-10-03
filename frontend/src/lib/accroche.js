// Aide à l'accroche, calculée dans le navigateur (aucun appel à l'IA).
// Critères retenus après l'étape 0 (octobre 2026, 30 accroches publiées, 3 comptes) : ce qui suit
// les interactions, c'est l'essentiel dès le début et un fait concret. « Enjeu » et « public »
// n'apportaient rien : ils ne sont pas affichés.

const NOMBRES = new Set(['deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze',
  'douze', 'quinze', 'vingt', 'trente', 'quarante', 'cinquante', 'cent', 'cents', 'mille', 'million',
  'millions', 'moitié', 'double', 'triple', 'zéro', 'dizaine', 'centaine',
  'two', 'three', 'four', 'five', 'ten', 'hundred', 'thousand', 'million', 'half',
  'dos', 'tres', 'cuatro', 'cinco', 'diez', 'cien', 'mil', 'millón', 'mitad']);
const ARGENT = new Set(['€', '%', 'euros', 'euro', '$', 'dollars', 'prix', 'coût', 'coûte', 'coûté', 'budget',
  'facture', 'marge', 'chiffre', 'revenus', 'salaire', 'loyer']);
const ENJEUX = new Set(['arrête', 'arrêtez', 'arrêter', 'jamais', 'erreur', 'erreurs', 'perdu', 'perdre',
  'personne', 'pas', 'plus', 'sans', 'mais', 'problème', 'risque', 'faux', 'vrai', 'secret', 'pire', 'raté',
  'échec', 'seul', 'seule', 'seulement', 'déjà', 'encore', 'rien', 'aucun', 'aucune', 'piège', 'attention',
  'stop', 'never', 'wrong', 'mistake', 'lost', 'nobody', 'nunca', 'error', 'nadie', 'perdido']);
const SALUTS = /^(bonjour|hello|salut|coucou|bienvenue|hi|hola|buenos)\b/i;
const MOT = /[\p{L}\p{N}€%$'’-]+/gu;

export const COUPURE_INSTAGRAM = 125; // environ, là où le fil coupe la légende par « … plus »

export function premiereLigne(texte) {
  return ((texte || '').split('\n').find((l) => l.trim()) || '').trim();
}

/** Points à améliorer sur la première ligne (vide = rien à signaler). */
export function conseilsAccroche(texte) {
  const ligne = premiereLigne(texte);
  if (!ligne) return [];
  const mots = (ligne.match(MOT) || []).map((m) => m.toLowerCase());
  const n = mots.length;
  const estConcret = (m) => /\d/.test(m) || NOMBRES.has(m) || ARGENT.has(m);
  const conseils = [];
  if (SALUTS.test(ligne)) conseils.push('salutation');
  if (ligne.startsWith('#') || ligne.startsWith('@')) conseils.push('hashtag');
  const debut = mots.slice(0, Math.max(1, Math.floor(n / 2)));
  if (!debut.some((m) => estConcret(m) || ENJEUX.has(m))) conseils.push('tard');
  if (!mots.some(estConcret)) conseils.push('concret');
  if (n > 16) conseils.push('longue');
  return conseils;
}

/** Ce que le fil Instagram montre avant « … plus ». */
export function apercuInstagram(texte) {
  const t = (texte || '').trim();
  if (t.length <= COUPURE_INSTAGRAM) return { visible: t, coupe: false };
  return { visible: t.slice(0, COUPURE_INSTAGRAM).replace(/\s+\S*$/, ''), coupe: true };
}
