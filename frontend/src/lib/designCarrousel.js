// Modèle du design d'un carrousel édité par le client (éditeur intégré, Konva) :
// { v, w, h, pages: [{ id, fond, fondImage, elements: [texte | image] }] }.
// Construit un premier design à partir du texte généré par l'IA et de la charte du client,
// et exporte chaque page en image (hors écran, à pleine définition).
import Konva from 'konva';
import { loadGoogleFont, loadCustomFonts, parseFontSpec } from '@/lib/carrouselPreview';

export const LARGEUR = 1080;
export const HAUTEUR = 1350;

let _n = 0;
export const nouvelId = () => `e${Date.now().toString(36)}${(++_n).toString(36)}`;

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const texteSur = (fond) => (luminance(fond) > 0.45 ? '#0f172a' : '#ffffff');

const lignes = (texte, taille, largeur) => Math.max(1, Math.ceil((String(texte || '').length * taille * 0.52) / largeur));

const HEX = /^#[0-9a-f]{6}$/i;
const COULEUR = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)/gi;

/** Fond (couleur unie ou dégradé) et couleur de texte de chaque slide du MODÈLE choisi pour ce
 * carrousel, lus dans l'aperçu HTML existant (renderSlides) : l'éditeur part ainsi du même
 * rendu que les slides du carrousel (crème, sombre, alterné, dégradés…). */
export function lireFondsSlides(htmls) {
  return (htmls || []).map((h) => {
    const m = /class="cz-slide" style="([^"]*)"/.exec(h || '');
    const regles = (m ? m[1] : '').split(';').map((x) => x.trim());
    const fondBrut = (regles.find((r) => r.startsWith('background:')) || '').slice(11).trim();
    const encre = (regles.find((r) => r.startsWith('color:')) || '').slice(6).trim() || null;
    let degrade = null;
    let fond = HEX.test(fondBrut) ? fondBrut : null;
    if (fondBrut.includes('linear-gradient')) {
      // la DERNIÈRE couche est le fond principal (les premières sont des motifs fins)
      const couches = fondBrut.split('linear-gradient(').slice(1);
      const derniere = couches[couches.length - 1] || '';
      const angle = Number((/(-?\d+(?:\.\d+)?)deg/.exec(derniere) || [])[1] || 180);
      const couleurs = derniere.match(COULEUR) || [];
      if (couleurs.length >= 2) {
        degrade = { angle, stops: couleurs.map((c, i) => [i / (couleurs.length - 1), c]) };
        fond = HEX.test(couleurs[0]) ? couleurs[0] : null;
      }
    }
    return { fond: fond || '#0f172a', degrade, encre };
  });
}

/** Dégradé CSS -> points de départ/arrivée Konva sur une page w×h (même angle que le CSS). */
export function degradeKonva(degrade, w, h) {
  if (!degrade) return {};
  const a = (degrade.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const l = Math.abs(w * dx) + Math.abs(h * dy);
  return {
    fillLinearGradientStartPoint: { x: w / 2 - (dx * l) / 2, y: h / 2 - (dy * l) / 2 },
    fillLinearGradientEndPoint: { x: w / 2 + (dx * l) / 2, y: h / 2 + (dy * l) / 2 },
    fillLinearGradientColorStops: degrade.stops.flat(),
  };
}

export const fondCss = (p) => (p?.degrade
  ? `linear-gradient(${p.degrade.angle}deg, ${p.degrade.stops.map(([o, c]) => `${c} ${Math.round(o * 100)}%`).join(', ')})`
  : (p?.fond || '#ffffff'));

/** Premier design : couverture (accroche), une page par idée, page d'appel à l'action — aux
 * couleurs, polices et fonds du carrousel (apparence : p, s, a, font, fontBody, slidesHtml). */
export function designInitial(carrousel, marque = {}, apparence = {}) {
  const fondDefaut = apparence.p || marque.couleur_principale || '#003D2E';
  const accentBrut = apparence.a || marque.couleur_accent || '#3AFFA3';
  const fondsModele = lireFondsSlides(apparence.slidesHtml);
  const titrePolice = parseFontSpec(apparence.font).family || 'Sora';
  const corpsPolice = parseFontSpec(apparence.fontBody).family || 'Inter';
  // fond, couleur du texte et accent lisible de la page n°i (repli : couleur principale unie)
  const style = (i) => {
    const m = fondsModele[i] || {};
    const fond = m.fond || fondDefaut;
    const encre = m.encre && HEX.test(m.encre) ? m.encre : texteSur(fond);
    const accent = luminance(fond) > 0.45 ? (apparence.p || '#0f172a') : accentBrut;
    return { fond, degrade: m.degrade || null, encre, accent };
  };
  const encre = texteSur(fondDefaut); // repli si un texte n'a pas de couleur
  const logo = marque.logo_url
    ? [{ id: nouvelId(), type: 'image', src: marque.logo_url, x: 90, y: HAUTEUR - 210, width: 120, height: 120 }]
    : [];
  const texte = (t, y, taille, opts = {}) => ({
    id: nouvelId(), type: 'texte', text: t || '', x: 90, y, width: LARGEUR - 180, fontSize: taille,
    fontFamily: opts.police || corpsPolice, fill: opts.couleur || encre, gras: !!opts.gras, align: opts.align || 'left',
  });

  const pages = [];
  const c = carrousel || {};
  const s0 = style(0);
  pages.push({
    id: nouvelId(), fond: s0.fond, degrade: s0.degrade, fondImage: null,
    elements: [
      texte(c.hook || '', 380, 92, { police: titrePolice, gras: true, couleur: s0.encre }),
      texte('Glisse →', HAUTEUR - 170, 36, { couleur: s0.accent, gras: true, align: 'right' }),
      ...logo.map((l) => ({ ...l, id: nouvelId() })),
    ],
  });
  (c.slides || []).forEach((s, i) => {
    const hTitre = lignes(s.titre, 70, LARGEUR - 180) * 70 * 1.2;
    const si = style(i + 1);
    pages.push({
      id: nouvelId(), fond: si.fond, degrade: si.degrade, fondImage: null,
      elements: [
        texte(String(i + 1).padStart(2, '0'), 150, 110, { police: titrePolice, couleur: si.accent, gras: true }),
        texte(s.titre || '', 330, 70, { police: titrePolice, gras: true, couleur: si.encre }),
        texte(s.texte || '', 330 + hTitre + 50, 42, { couleur: si.encre }),
      ],
    });
  });
  const cta = c.cta || {};
  const sc = style((c.slides || []).length + 1);
  pages.push({
    id: nouvelId(), fond: sc.fond, degrade: sc.degrade, fondImage: null,
    elements: [
      texte(cta.titre || 'On en parle ?', 450, 84, { police: titrePolice, gras: true, couleur: sc.encre }),
      texte(cta.texte || '', 450 + lignes(cta.titre, 84, LARGEUR - 180) * 84 * 1.2 + 50, 44, { couleur: sc.encre }),
      ...logo.map((l) => ({ ...l, id: nouvelId() })),
    ],
  });
  return { v: 1, w: LARGEUR, h: HAUTEUR, pages };
}

/** Carrousel déjà rendu : chaque page reprend l'image ACTUELLE de sa slide (mascotte, photos,
 * décor du modèle), telle quelle ; le client ajoute par-dessus. `origine` = n° de la slide,
 * pour pouvoir la remplacer par sa version « texte modifiable ». */
export function designDepuisSlides(slidesImages) {
  return {
    v: 1, w: LARGEUR, h: HAUTEUR,
    pages: (slidesImages || []).slice(0, 10).map((u, i) => ({
      id: nouvelId(), fond: '#000000', degrade: null, fondImage: u, origine: i, elements: [],
    })),
  };
}

/** Visuel d'un post : une seule page, au format de l'image (largeur 1080). */
export async function designDepuisImage(url) {
  const img = await chargerImage(url);
  const h = img ? Math.round((LARGEUR * img.height) / img.width) : LARGEUR;
  return {
    v: 1, w: LARGEUR, h: Math.min(Math.max(h, 540), 2160),
    pages: [{ id: nouvelId(), fond: '#000000', degrade: null, fondImage: url, elements: [] }],
  };
}

/** Opacité, ombre portée et forme d'un calque image (mascotte, logo rond repris d'un modèle). */
export const attributsImage = (e, img = null) => ({
  opacity: e.opacity ?? 1,
  ...(e.rond ? { cornerRadius: Math.min(e.width, e.height) / 2, ...recadrage(img, e.width, e.height) } : {}),
  ...(e.ombre ? {
    shadowColor: e.ombre.couleur, shadowOpacity: e.ombre.opacite, shadowBlur: e.ombre.flou,
    shadowOffsetX: e.ombre.x, shadowOffsetY: e.ombre.y,
  } : {}),
});

// ---- Texte « deux tons » : les N derniers mots dans une autre couleur (titre avec accent).
// Konva.Text n'a qu'une couleur : on met en page nous-mêmes, avec les mêmes règles (retour à
// la ligne aux mots, alignement, interligne, espacement des lettres).
let ctxMesure = null;
const policeCanvas = (e) => `${e.italique ? 'italic ' : ''}${e.gras ? 700 : 400} ${e.fontSize}px "${e.fontFamily}"`;
function preparerCtx(c, e) {
  c.font = policeCanvas(e);
  if ('letterSpacing' in c) c.letterSpacing = `${e.letterSpacing || 0}px`;
}

/** Lignes du texte : [[{ mot, accent }]] — `accent` sur les `accentMots` derniers mots. */
export function lignesRiches(e) {
  ctxMesure = ctxMesure || document.createElement('canvas').getContext('2d');
  preparerCtx(ctxMesure, e);
  const total = (e.text.match(/\S+/g) || []).length;
  const n = Math.min(e.accentMots || 0, total);
  let rang = 0;
  const lignes = [];
  e.text.split('\n').forEach((para) => {
    let ligne = [];
    para.split(/\s+/).filter(Boolean).forEach((mot) => {
      rang += 1;
      const m = { mot, accent: rang > total - n };
      const essai = [...ligne, m].map((x) => x.mot).join(' ');
      if (ligne.length && ctxMesure.measureText(essai).width > e.width) { lignes.push(ligne); ligne = [m]; } else ligne.push(m);
    });
    lignes.push(ligne);
  });
  return lignes;
}

export const hauteurRiche = (e) => lignesRiches(e).length * e.fontSize * (e.lineHeight || 1.2);

/** Dessine le texte sur un contexte 2D natif (déjà placé à l'origine de l'élément). */
export function dessinerRiche(c, e) {
  const lh = e.fontSize * (e.lineHeight || 1.2);
  const lignes = lignesRiches(e);
  preparerCtx(c, e);
  c.textBaseline = 'middle';
  const espace = c.measureText(' ').width;
  lignes.forEach((ligne, i) => {
    const largeurs = ligne.map((m) => c.measureText(m.mot).width);
    const total = largeurs.reduce((a, b) => a + b, 0) + espace * Math.max(0, ligne.length - 1);
    let x = 0;
    if (e.align === 'center') x = (e.width - total) / 2;
    else if (e.align === 'right') x = e.width - total;
    ligne.forEach((m, j) => {
      c.fillStyle = m.accent ? (e.accentCouleur || e.fill) : e.fill;
      c.fillText(m.mot, x, i * lh + lh / 2);
      x += largeurs[j] + espace;
    });
  });
}

/** Attributs d'un Konva.Shape qui dessine un texte deux tons (affichage comme export). */
export const attributsTexteRiche = (e) => ({
  x: e.x, y: e.y, width: e.width, height: hauteurRiche(e), rotation: e.rotation || 0, opacity: e.opacity ?? 1,
  sceneFunc: (ctx) => dessinerRiche(ctx._context, e),
  fill: e.fill, // jamais peint par sceneFunc : sert à Konva pour la zone de clic (hitFunc)
  hitFunc: (ctx, shape) => { ctx.beginPath(); ctx.rect(0, 0, shape.width(), shape.height()); ctx.closePath(); ctx.fillStrokeShape(shape); },
});
export const estRiche = (e) => e.type === 'texte' && (e.accentMots || 0) > 0;

// ---- Formes dessinées par le client (rectangle, ellipse, triangle, étoile, ligne, flèche).
// Toutes tracées dans leur boîte [0, largeur] × [0, hauteur], origine en haut à gauche comme
// les images : même aimantation, même cadre de sélection. Le tracé est identique côté
// serveur (SVG des modèles, carrousel_modele_service.py / modele-client.util.ts).
export const FORMES = ['rect', 'ellipse', 'triangle', 'etoile', 'ligne', 'fleche'];
export const formeOuverte = (e) => e.forme === 'ligne' || e.forme === 'fleche'; // trait seul

/** Sommets de l'étoile à 5 branches inscrite dans la boîte. */
export function pointsEtoile(w, h) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.45 : 1;
    pts.push(w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a));
  }
  return pts;
}
/** Taille de la pointe d'une flèche (mêmes règles que le serveur). */
export const pointeFleche = (e) => Math.min(e.height / 2, Math.max((e.strokeWidth || 0) * 2.5, 16));

function tracerForme(c, e) {
  const w = e.width;
  const h = e.height;
  c.beginPath();
  if (e.forme === 'rect') {
    const r = Math.min(e.rayon || 0, w / 2, h / 2);
    c.moveTo(r, 0);
    c.arcTo(w, 0, w, h, r);
    c.arcTo(w, h, 0, h, r);
    c.arcTo(0, h, 0, 0, r);
    c.arcTo(0, 0, w, 0, r);
    c.closePath();
  } else if (e.forme === 'ellipse') {
    c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (e.forme === 'triangle') {
    c.moveTo(w / 2, 0); c.lineTo(w, h); c.lineTo(0, h); c.closePath();
  } else if (e.forme === 'etoile') {
    const p = pointsEtoile(w, h);
    c.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
    c.closePath();
  } else {
    c.moveTo(0, h / 2); c.lineTo(w, h / 2);
    if (e.forme === 'fleche') {
      const t = pointeFleche(e);
      c.moveTo(w - t, h / 2 - t); c.lineTo(w, h / 2); c.lineTo(w - t, h / 2 + t);
    }
  }
}

/** Attributs d'un Konva.Shape qui dessine la forme (affichage, miniatures, export). */
export function attributsForme(e) {
  const ouverte = formeOuverte(e);
  const trait = e.stroke && (e.strokeWidth || 0) > 0;
  return {
    x: e.x, y: e.y, width: e.width, height: e.height, rotation: e.rotation || 0, opacity: e.opacity ?? 1,
    fill: !ouverte && e.fill ? e.fill : undefined,
    fillEnabled: !ouverte && !!e.fill,
    stroke: trait ? e.stroke : undefined,
    strokeWidth: trait ? e.strokeWidth : 0,
    strokeEnabled: !!trait,
    hitStrokeWidth: ouverte ? Math.max(30, e.strokeWidth || 0) : 'auto',
    lineCap: 'round', lineJoin: 'round',
    sceneFunc: (ctx, shape) => { tracerForme(ctx._context, e); ctx.fillStrokeShape(shape); },
  };
}

/** Nouvelle forme, au centre de la page, aux couleurs de la marque. */
export function nouvelleForme(forme, W, H, couleur, contraste) {
  const tailles = { rect: [420, 260], ellipse: [300, 300], triangle: [320, 280], etoile: [320, 320], ligne: [520, 40], fleche: [520, 60] };
  const [w, h] = tailles[forme] || [300, 300];
  const ouverte = forme === 'ligne' || forme === 'fleche';
  return {
    id: nouvelId(), type: 'forme', forme, x: (W - w) / 2, y: (H - h) / 2, width: w, height: h, opacity: 1,
    fill: ouverte ? null : couleur, stroke: ouverte ? (contraste || couleur) : null, strokeWidth: ouverte ? 10 : 0,
    rayon: forme === 'rect' ? 24 : 0,
  };
}

/** Style Konva d'un texte : « bold », « italic », « italic bold » ou « normal ». */
export const styleTexte = (e) => `${e.italique ? 'italic ' : ''}${e.gras ? 'bold' : ''}`.trim() || 'normal';

export function chargerImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new window.Image();
    img.crossOrigin = 'anonymous'; // sinon le canvas est « contaminé » et l'export échoue
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Polices utilisées par le design, chargées avant affichage ou export. */
export async function chargerPolices(design) {
  const familles = new Set();
  (design?.pages || []).forEach((p) => p.elements.forEach((e) => e.type === 'texte' && e.fontFamily && familles.add(e.fontFamily)));
  try { loadCustomFonts([...familles]); } catch (e) { /* pas une police maison */ }
  familles.forEach((f) => { try { loadGoogleFont(f); } catch (e) { /* police locale */ } });
  await Promise.all([...familles].flatMap((f) => [
    document.fonts.load(`400 40px "${f}"`).catch(() => {}),
    document.fonts.load(`700 40px "${f}"`).catch(() => {}),
  ]));
}

/** Image « couverture » : remplit la page sans déformer (recadrage centré). */
export function recadrage(img, w, h) {
  if (!img) return {};
  const r = Math.max(w / img.width, h / img.height);
  const cw = w / r;
  const ch = h / r;
  return { crop: { x: (img.width - cw) / 2, y: (img.height - ch) / 2, width: cw, height: ch } };
}

/** Exporte une page en JPEG 1080×1350, dessinée hors écran (indépendant de l'affichage). */
export async function exporterPage(page, design) {
  const w = design.w || LARGEUR;
  const h = design.h || HAUTEUR;
  const conteneur = document.createElement('div');
  const stage = new Konva.Stage({ container: conteneur, width: w, height: h });
  const layer = new Konva.Layer();
  stage.add(layer);
  layer.add(new Konva.Rect({ x: 0, y: 0, width: w, height: h, fill: page.fond || '#ffffff', ...degradeKonva(page.degrade, w, h) }));
  if (page.fondImage) {
    const img = await chargerImage(page.fondImage);
    if (img) layer.add(new Konva.Image({ image: img, x: 0, y: 0, width: w, height: h, ...recadrage(img, w, h) }));
  }
  for (const e of page.elements) {
    if (estRiche(e)) {
      layer.add(new Konva.Shape(attributsTexteRiche(e)));
    } else if (e.type === 'texte') {
      layer.add(new Konva.Text({
        x: e.x, y: e.y, width: e.width, text: e.text, fontSize: e.fontSize, fontFamily: e.fontFamily,
        fill: e.fill, fontStyle: styleTexte(e), align: e.align, lineHeight: e.lineHeight || 1.2,
        letterSpacing: e.letterSpacing || 0, opacity: e.opacity ?? 1, rotation: e.rotation || 0,
      }));
    } else if (e.type === 'forme') {
      layer.add(new Konva.Shape(attributsForme(e)));
    } else if (e.type === 'image') {
      const img = await chargerImage(e.src);
      if (img) layer.add(new Konva.Image({ image: img, x: e.x, y: e.y, width: e.width, height: e.height, rotation: e.rotation || 0, ...attributsImage(e, img) }));
    }
  }
  layer.draw();
  const url = stage.toDataURL({ mimeType: 'image/jpeg', quality: 0.92, pixelRatio: 1 });
  stage.destroy();
  return url;
}

/** Image importée par le client : réduite (1080 px max) et convertie en JPEG, pour rester légère. */
export function lireImageLocale(fichier, max = LARGEUR) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = reject;
    lecteur.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r);
        c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve({ src: c.toDataURL(fichier.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88), width: c.width, height: c.height });
      };
      img.onerror = reject;
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}
