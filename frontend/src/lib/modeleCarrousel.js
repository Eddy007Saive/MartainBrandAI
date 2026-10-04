// « Enregistrer comme modèle » : un design de l'éditeur devient un modèle réutilisable.
// Trois slides (couverture, étape répétée pour chaque idée, finale) ; chaque texte reçoit un
// rôle qui dit ce que l'IA y écrira. Le serveur fabrique le gabarit à partir de ces pages.
import Konva from 'konva';
import { HAUTEUR, styleTexte } from '@/lib/designCarrousel';

export const ROLES_PAGES = ['couverture', 'etape', 'final'];

/** Rôles proposés pour un texte selon sa slide (« fixe » = le texte reste tel quel). */
export const ROLES = {
  couverture: ['accroche', 'nom', 'compteur', 'fixe'],
  etape: ['titre', 'texte', 'numero', 'astuce', 'nom', 'compteur', 'fixe'],
  final: ['cta', 'cta_texte', 'nom', 'compteur', 'fixe'],
};
const VARIABLES = new Set(['accroche', 'titre', 'texte', 'astuce', 'cta', 'cta_texte']);

/** Les trois slides du modèle : la première, la deuxième (modèle des étapes) et la dernière. */
export function pagesDuModele(design) {
  const p = design?.pages || [];
  return p.length >= 3 ? [p[0], p[1], p[p.length - 1]] : null;
}

const plusGrand = (liste) => liste.reduce((a, e) => (!a || e.fontSize > a.fontSize ? e : a), null);
const plusLong = (liste, min) => liste.filter((e) => e.text.trim().length >= min)
  .reduce((a, e) => (!a || e.text.length > a.text.length ? e : a), null);

/** Rôles devinés (le client les corrige ensuite) : { [idElement]: rôle } pour les 3 slides. */
export function devinerRoles(pages, nomMarque) {
  const roles = {};
  const nom = (nomMarque || '').trim().toLowerCase();
  pages.forEach((page, i) => {
    const role = ROLES_PAGES[i];
    const textes = page.elements.filter((e) => e.type === 'texte' && e.text.trim());
    textes.forEach((e) => {
      const t = e.text.trim();
      if (/^\d{1,2}\s*\/\s*\d{1,2}$/.test(t)) roles[e.id] = 'compteur';
      else if (nom && t.toLowerCase() === nom) roles[e.id] = 'nom';
      else roles[e.id] = 'fixe';
    });
    let libres = textes.filter((e) => roles[e.id] === 'fixe');
    const prendre = (e, r) => { if (e) { roles[e.id] = r; libres = libres.filter((x) => x !== e); } };
    if (role === 'couverture') prendre(plusGrand(libres), 'accroche');
    if (role === 'etape') {
      prendre(libres.find((e) => /\d/.test(e.text) && e.text.trim().length <= 20), 'numero');
      prendre(plusGrand(libres), 'titre');
      prendre(plusLong(libres, 15), 'texte');
      prendre(plusLong(libres, 15), 'astuce');
    }
    if (role === 'final') {
      prendre(plusGrand(libres), 'cta');
      prendre(plusLong(libres, 15), 'cta_texte');
    }
  });
  return roles;
}

function hauteurTexte(e) {
  const n = new Konva.Text({
    text: e.text, width: e.width, fontSize: e.fontSize, fontFamily: e.fontFamily, fontStyle: styleTexte(e),
    lineHeight: e.lineHeight || 1.2, letterSpacing: e.letterSpacing || 0,
  });
  const h = n.height();
  n.destroy();
  return h;
}

/** Zone d'un texte : sa hauteur actuelle, ou pour un texte que l'IA remplira, de la place en
 * plus (50 % au plus, jamais au-delà du texte suivant en dessous). Le rendu réduit la police
 * si le texte déborde encore. */
function zone(e, page, role) {
  const h = hauteurTexte(e);
  if (!VARIABLES.has(role)) return Math.ceil(h * 1.1);
  const dessous = page.elements
    .filter((x) => x !== e && x.type === 'texte' && x.y > e.y + 4 && x.x < e.x + e.width && x.x + x.width > e.x)
    .map((x) => x.y);
  const bas = Math.min(dessous.length ? Math.min(...dessous) - 12 : HAUTEUR - 60, e.y + h * 1.5);
  return Math.ceil(Math.max(h * 1.1, bas - e.y));
}

/** Couleur de marque reconnue (« principale », « secondaire », « accent ») : le modèle la
 * suivra si la marque change de couleurs. */
function couleurDeMarque(couleur, palette) {
  const c = String(couleur || '').toLowerCase();
  return Object.keys(palette).find((k) => palette[k] && palette[k].toLowerCase() === c) || null;
}

/** Pages envoyées au serveur : rôles et zones posés sur chaque texte, logo et couleurs de
 * marque repérés (ils suivront la marque au lieu de rester figés dans le modèle). */
export function pagesPourServeur(pages, roles, { marque, apparence } = {}) {
  const palette = {
    principale: apparence?.p || marque?.carrousel_couleur_principale || marque?.couleur_principale,
    secondaire: apparence?.s || marque?.carrousel_couleur_secondaire || marque?.couleur_secondaire,
    accent: apparence?.a || marque?.carrousel_couleur_accent || marque?.couleur_accent,
  };
  return pages.map((page, i) => ({
    fond: page.fond, degrade: page.degrade || null, fondImage: page.fondImage || null,
    fondMarque: page.degrade ? null : couleurDeMarque(page.fond, palette),
    elements: page.elements.map((e) => {
      if (e.type === 'forme') {
        return { ...e, couleurMarque: couleurDeMarque(e.fill, palette), contourMarque: couleurDeMarque(e.stroke, palette) };
      }
      if (e.type !== 'texte') {
        const logo = e.rond || (marque?.logo_url && e.src === marque.logo_url);
        return logo ? { ...e, role: 'logo' } : e;
      }
      const role = roles[e.id] || 'fixe';
      return {
        ...e, role, height: zone(e, page, role),
        // tenu sur une ligne : le rendu ne le fera pas passer à la ligne (il rétrécit plutôt)
        uneLigne: !e.text.includes('\n') && hauteurTexte(e) <= e.fontSize * (e.lineHeight || 1.2) * 1.5,
        couleurMarque: couleurDeMarque(e.fill, palette),
        accentMarque: e.accentMots ? couleurDeMarque(e.accentCouleur, palette) : null,
      };
    }),
    role: ROLES_PAGES[i],
  }));
}
