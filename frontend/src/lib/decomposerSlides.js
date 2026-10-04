// Décompose les slides d'un carrousel (aperçu HTML du modèle) en calques modifiables :
// - un FOND image : la slide entière (mascotte, logo, formes, pastilles, boutons…) SANS le texte ;
// - un TEXTE Konva par bloc de texte, à la même place, même police, taille, couleur et alignement.
// Le client retrouve sa slide à l'identique, mais chaque texte devient modifiable.
import { toJpeg } from 'html-to-image';
import { SLIDE_CSS } from '@/lib/carrouselPreview';
import { LARGEUR, HAUTEUR, nouvelId } from '@/lib/designCarrousel';

const INLINE = new Set(['inline', 'inline-block', 'contents']);

/** Les blocs de texte d'une slide : un élément portant du texte, remonté tant que son parent est
 * « en ligne » (span, b…), pour garder une phrase coupée en morceaux de style comme un seul bloc. */
function blocsTexte(racine) {
  const blocs = new Set();
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
  let noeud = marcheur.nextNode();
  while (noeud) {
    if (noeud.textContent.trim()) {
      let el = noeud.parentElement;
      while (el && el !== racine && el.parentElement && el.parentElement !== racine
        && INLINE.has(getComputedStyle(el).display) && INLINE.has(getComputedStyle(el.parentElement).display)) {
        el = el.parentElement;
      }
      if (el && el !== racine) blocs.add(el);
    }
    noeud = marcheur.nextNode();
  }
  // un bloc contenu dans un autre bloc retenu : on garde le plus grand
  return [...blocs].filter((b) => ![...blocs].some((autre) => autre !== b && autre.contains(b)));
}

/** Cadre des seuls caractères d'un bloc : un trait ou une pastille voisine du texte dans le même
 * bloc (« — ÉTAPE 01 ») ne doit pas décaler le texte sur le décor. */
function cadreTexte(bloc) {
  const range = document.createRange();
  const rects = [];
  const marcheur = document.createTreeWalker(bloc, NodeFilter.SHOW_TEXT);
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    if (n.textContent.trim()) { range.selectNodeContents(n); rects.push(...range.getClientRects()); }
  }
  if (!rects.length) return bloc.getBoundingClientRect();
  const left = Math.min(...rects.map((x) => x.left));
  const premier = rects.reduce((a, x) => (x.top < a.top ? x : a));
  // le cadre d'un glyphe exclut la demi-interligne, que Konva remet au-dessus de la 1re ligne
  const interligne = parseFloat(getComputedStyle(bloc).lineHeight);
  const top = premier.top - (Number.isFinite(interligne) ? Math.max(0, (interligne - premier.height) / 2) : 0);
  return { left, top, width: Math.max(...rects.map((x) => x.right)) - left };
}

/** Zone où le texte s'écrit : le cadre sans la marge intérieure ni la bordure (le texte d'un
 * bouton « Lien en bio » est au centre de sa pastille, pas dans son coin). */
function boiteContenu(bloc, cs) {
  const r = bloc.getBoundingClientRect();
  const ech = bloc.offsetWidth ? r.width / bloc.offsetWidth : 1;
  const v = (p) => (parseFloat(cs[p]) || 0) * ech;
  const gauche = v('paddingLeft') + v('borderLeftWidth');
  const haut = v('paddingTop') + v('borderTopWidth');
  return { left: r.left + gauche, top: r.top + haut, width: r.width - gauche - v('paddingRight') - v('borderRightWidth') };
}

const premiereFamille = (ff) => (ff || 'Inter').split(',')[0].replace(/["']/g, '').trim();

function versHex(couleur) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(couleur || '');
  if (!m) return { hex: couleur || '#ffffff', opacite: 1 };
  const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  return { hex, opacite: m[4] !== undefined ? Number(m[4]) : 1 };
}

/** Ombre portée CSS (« drop-shadow(rgba(…) 0px 12px 19px) ») traduite en ombre Konva. */
function ombre(filtre, k) {
  const m = /drop-shadow\((rgba?\([^)]*\)|#[0-9a-f]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/i.exec(filtre || '');
  if (!m) return {};
  const { hex, opacite } = versHex(m[1]);
  return { ombre: { couleur: hex, opacite, x: Number(m[2]) * k, y: Number(m[3]) * k, flou: Number(m[4]) * k } };
}

/** Version transparente d'une image Cloudinary : « e_upscale » et « f_auto » (JPEG pour un
 * chargement par script) aplatissent l'image sur du blanc ; le PNG d'origine garde son alpha. */
function sansFondBlanc(src) {
  if (!/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(src)) return src;
  return src.replace('/e_upscale/', '/').replace(/\bq_auto,?/, '').replace(/\bf_auto\b/, 'f_png')
    .replace(/\bw_(\d+)\b/,(m, w) => `w_${Math.max(Number(w), 1000)}`).replace(/,\//, '/');
}

/** Images du décor (mascotte, illustrations) : sorties du fond pour devenir des calques à part,
 * déplaçables, et rendues avec leur transparence (aplaties, elles arrivaient sur un carré blanc).
 * Le logo rond devient une image ronde (il suivra le logo de la marque dans un modèle). Restent
 * dans le fond : les icônes à filtre SVG (recoloration impossible à reproduire). */
function imagesDecor(slide, base, k) {
  return [...slide.querySelectorAll('img')].filter((img) => {
    const cs = getComputedStyle(img);
    return img.complete && img.naturalWidth && !/url\(/.test(cs.filter);
  }).map((img) => {
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const el = {
      id: nouvelId(), type: 'image', src: sansFondBlanc(img.currentSrc || img.src),
      x: (r.left - base.left) * k, y: (r.top - base.top) * k, width: r.width * k, height: r.height * k,
      opacity: Number(cs.opacity) || 1, ...ombre(cs.filter, k),
      ...(img.closest('.cz-av') || parseFloat(cs.borderRadius) >= r.width / 2 - 1 ? { rond: true } : {}),
    };
    // Retirée du fond SANS être retéléchargée : html-to-image ferait un fetch de l'URL, auquel
    // Cloudinary (f_auto) répond en JPEG — version que le navigateur resservirait ensuite aux
    // aperçus (mascotte sur carré blanc). Pixel transparent, même taille, mise en page intacte.
    img.style.setProperty('width', `${img.offsetWidth}px`, 'important');
    img.style.setProperty('height', `${img.offsetHeight}px`, 'important');
    img.removeAttribute('srcset');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    img.style.setProperty('visibility', 'hidden', 'important');
    return el;
  }).filter((e) => e.width > 4 && e.height > 4);
}

/** Titre « deux tons » : les derniers mots d'un bloc dans une autre couleur que le reste
 * (span coloré en fin de titre). Renvoie { accentMots, accentCouleur } ou {}. */
function deuxTons(bloc, principale) {
  const mots = [];
  const marcheur = document.createTreeWalker(bloc, NodeFilter.SHOW_TEXT);
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    const c = versHex(getComputedStyle(n.parentElement).color).hex;
    (n.textContent.match(/\S+/g) || []).forEach(() => mots.push(c));
  }
  let fin = 0;
  while (fin < mots.length && mots[mots.length - 1 - fin] !== principale) fin += 1;
  if (!fin || fin === mots.length) return {};
  const c = mots[mots.length - 1];
  if (mots.slice(-fin).some((x) => x !== c)) return {};
  return { accentMots: Math.min(fin, 5), accentCouleur: c };
}

/** htmls : slides de renderSlides(). Renvoie les pages du design (fond image + textes). */
export async function decomposerSlides(htmls) {
  const hote = document.createElement('div');
  hote.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;';
  const style = document.createElement('style');
  style.textContent = SLIDE_CSS;
  hote.appendChild(style);
  document.body.appendChild(hote);
  const pages = [];
  try {
    await document.fonts.ready;
    for (const html of htmls) {
      const cadre = document.createElement('div');
      cadre.innerHTML = String(html);
      hote.appendChild(cadre);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all([...cadre.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((ok) => { i.onload = ok; i.onerror = ok; }))));
      const slide = cadre.querySelector('.cz-slide');
      if (!slide) { cadre.remove(); continue; } // eslint-disable-line no-continue
      slide.style.borderRadius = '0'; // la slide finale est un rectangle plein
      const base = slide.getBoundingClientRect();
      const k = LARGEUR / base.width;

      // 1. relevé des textes (avant de les masquer)
      const elements = blocsTexte(slide).map((b) => {
        // un bloc qui porte aussi du décor (trait, puce) : on ne mesure que ses caractères
        const decor = [...b.querySelectorAll('*')].some((e) => !e.textContent.trim());
        const cs = getComputedStyle(b);
        const r = decor ? cadreTexte(b) : boiteContenu(b, cs);
        // une slide affichée en réduction (aperçu d'un modèle client, transform: scale) : la taille
        // calculée ignore la réduction, la largeur réelle à l'écran la donne
        const ech = b.offsetWidth ? b.getBoundingClientRect().width / b.offsetWidth : 1;
        const taille = (parseFloat(cs.fontSize) || 12) * ech;
        const interligne = cs.lineHeight === 'normal' ? 1.2 : (parseFloat(cs.lineHeight) / (taille / ech)) || 1.2;
        const { hex, opacite } = versHex(cs.color);
        const espacement = (parseFloat(cs.letterSpacing) || 0) * ech;
        return {
          id: nouvelId(), type: 'texte', text: b.innerText.replace(/\s+\n/g, '\n').trim(),
          x: (r.left - base.left) * k, y: (r.top - base.top) * k,
          width: Math.max(40, r.width * k + 2 * k), fontSize: Math.round(taille * k * 10) / 10,
          fontFamily: premiereFamille(cs.fontFamily), fill: hex, opacity: opacite,
          gras: (parseInt(cs.fontWeight, 10) || 400) >= 600, italique: cs.fontStyle === 'italic',
          align: ['center', 'right'].includes(cs.textAlign) ? cs.textAlign : 'left',
          lineHeight: Math.round(interligne * 100) / 100, letterSpacing: espacement * k,
          ...deuxTons(b, hex),
        };
      }).filter((e) => e.text);

      // 2. images du décor en calques à part (sous les textes)
      const images = imagesDecor(slide, base, k);

      // 3. fond : la même slide, textes et images du décor rendus invisibles
      slide.querySelectorAll('*').forEach((el) => {
        el.style.setProperty('color', 'transparent', 'important');
        el.style.setProperty('-webkit-text-stroke-color', 'transparent', 'important');
        el.style.setProperty('text-shadow', 'none', 'important');
      });
      slide.style.setProperty('color', 'transparent', 'important');
      let fondImage = null;
      try {
        fondImage = await toJpeg(slide, { quality: 0.92, pixelRatio: k, cacheBust: true, skipFonts: true }); // eslint-disable-line no-await-in-loop
      } catch (e) {
        fondImage = null;
      }
      cadre.remove();
      pages.push({ id: nouvelId(), fond: '#000000', degrade: null, fondImage, elements: [...images, ...elements] });
    }
  } finally {
    hote.remove();
  }
  return { v: 1, w: LARGEUR, h: HAUTEUR, pages };
}
