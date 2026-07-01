// Rendu des aperçus de carrousel (mêmes styles que le backend) — renvoie du HTML string.
// Contraste AUTOMATIQUE : couleur de texte calculée selon la luminosité du fond -> toujours lisible.

const toRgb = (h) => {
  h = (h || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r) => '#' + r.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = toRgb(a), y = toRgb(b); return toHex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
const light = (h, t) => mix(h, '#ffffff', t);
const dark = (h, t) => mix(h, '#000000', t);
const lum = (h) => { const [r, g, b] = toRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const inkOn = (bg) => (lum(bg) > 0.6 ? '#12150f' : '#ffffff');           // texte lisible sur un fond plein
const accOnLight = (a) => (lum(a) < 0.62 ? a : dark(a, 0.5));            // accent visible sur fond clair
const accOnDark = (a) => (lum(a) > 0.34 ? a : light(a, 0.42));           // accent visible sur fond sombre
const avHTML = (logo, initial, bg, ink) => (logo
  ? `<span class="cz-av" style="overflow:hidden"><img src="${logo}" style="width:100%;height:100%;object-fit:cover;display:block" alt=""></span>`
  : `<span class="cz-av" style="background:${bg};color:${ink}">${initial}</span>`);

export const TEMPLATES = [
  { id: 'creme', label: 'Crème' },
  { id: 'sombre', label: 'Sombre' },
  { id: 'alterne', label: 'Alterné' },
  { id: 'editorial', label: 'Éditorial' },
  { id: 'pop', label: 'Pop' },
  { id: 'clean', label: 'Clean' },
  { id: 'neon', label: 'Néon' },
];
const twoTone = (t, acc) => { const w = (t || '').split(' '); if (w.length < 2) return `<span style="color:${acc}">${t || ''}</span>`; const c = Math.ceil(w.length / 2); return `${w.slice(0, c).join(' ')} <span style="color:${acc}">${w.slice(c).join(' ')}</span>`; };
export const SLIDE_LABELS = ['Hook', 'Étape 01', 'Étape 02', 'Étape 03', 'CTA'];

export const SLIDE_CSS = `
.cz-slide{width:200px;height:250px;border-radius:13px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:18px 16px 28px;font-family:Inter,sans-serif}
.cz-tag{align-self:flex-start;font-size:7px;font-weight:800;letter-spacing:.8px;padding:3px 7px;border-radius:4px;text-transform:uppercase}
.cz-h1{font-family:Anton,sans-serif;font-size:27px;line-height:.95;letter-spacing:.3px;text-transform:uppercase}
.cz-h2{font-family:Anton,sans-serif;font-size:21px;line-height:.97;letter-spacing:.3px;text-transform:uppercase}
.cz-pills{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.cz-pill{font-size:7px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;padding:3px 6px;border-radius:4px}
.cz-tip{margin-top:8px;padding-top:7px}
.cz-tiplbl{font-size:6.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:2px 6px;border-radius:3px}
.cz-tiptxt{font-size:8.5px;line-height:1.4;margin-top:4px}
.cz-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;padding:0 16px 14px}
.cz-dots{display:flex;gap:3px;align-items:center}.cz-dots i{height:4px;width:4px;border-radius:4px}.cz-dots i.on{width:14px}
.cz-cnt{font-size:7px;font-weight:700}
.cz-foot{display:flex;align-items:center;gap:6px;font-size:8.5px;font-weight:700}
.cz-av{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:9px;font-family:Anton,sans-serif}
.cz-grow{flex:1}
`;

const DEMO_CONTENT = {
  hook: 'Le sujet de ton carrousel',
  slides: [
    { t: 'Idée forte 01', x: 'Une phrase qui appuie ton idée.', pills: ['Mot-clé', 'Mot-clé'], tip: 'Un conseil actionnable ici.', icon: 'chart' },
    { t: 'Idée forte 02', x: 'Une phrase qui appuie ton idée.', pills: ['Mot-clé', 'Mot-clé'], tip: 'Un conseil actionnable ici.', icon: 'brain' },
    { t: 'Idée forte 03', x: 'Une phrase qui appuie ton idée.', pills: ['Mot-clé', 'Mot-clé'], tip: 'Un conseil actionnable ici.', icon: 'rocket' },
  ],
  cta: { t: 'Passe à l’action', x: 'Ton appel à l’action final.' },
};
// CONTENT est mutable : renderSlides le remplace par le VRAI carrousel si fourni (colors.content = carrousel_data)
let CONTENT = DEMO_CONTENT;
function _mapContent(d) {
  if (!d || typeof d !== 'object') return DEMO_CONTENT;
  const slides = (d.slides || []).map((s) => ({
    t: s.titre || s.t || '', x: s.texte || s.x || '',
    pills: Array.isArray(s.pills) ? s.pills : [], tip: s.pro_tip || s.protip || s.tip || '', icon: s.icon || '',
  }));
  const cta = d.cta || {};
  return {
    hook: d.hook || DEMO_CONTENT.hook,
    slides: slides.length ? slides : DEMO_CONTENT.slides,
    cta: { t: cta.titre || cta.t || DEMO_CONTENT.cta.t, x: cta.texte || cta.x || DEMO_CONTENT.cta.x },
  };
}

// filtre duotone (recolore une icône 3D à la couleur d'accent)
const duotoneSvg = (a) => {
  const dk = toRgb(dark(a, 0.5)).map((v) => (v / 255).toFixed(3));
  const lt = toRgb(light(a, 0.3)).map((v) => (v / 255).toFixed(3));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><filter id="czic" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="table" tableValues="${dk[0]} ${lt[0]}"/><feFuncG type="table" tableValues="${dk[1]} ${lt[1]}"/><feFuncB type="table" tableValues="${dk[2]} ${lt[2]}"/></feComponentTransfer></filter></svg>`;
};

const dots = (n, i, on, off) => `<div class="cz-dots">${Array.from({ length: n }).map((_, k) => `<i class="${k === i ? 'on' : ''}" style="background:${k === i ? on : off}"></i>`).join('')}<span class="cz-cnt" style="color:${off};margin-left:6px">${i + 1}/${n}</span></div>`;
const pills = (arr, bg, col, out) => arr.map((x) => `<span class="cz-pill" style="background:${bg};color:${col};${out || ''}">${x}</span>`).join('');

function refFamily(P, A, { bg, bg2, ink, mut, line, accentText, pillOutline }, ctx) {
  const Aink = inkOn(A);
  const n = 2 + CONTENT.slides.length;
  const foot = `<div class="cz-foot" style="color:${ink}">${avHTML(ctx.logo, ctx.initial, A, Aink)}<div>${ctx.nom}</div></div>`;
  const out = [];
  out.push(`<div class="cz-slide" style="background:${bg};color:${ink}"><span class="cz-tag" style="background:${A};color:${Aink}">Carrousel</span><div class="cz-grow" style="display:flex;align-items:center"><div class="cz-h1">${CONTENT.hook}</div></div><div class="cz-bar">${foot}<span class="cz-cnt" style="color:${accentText};font-weight:700">SWIPE →</span></div></div>`);
  CONTENT.slides.forEach((s, i) => out.push(`<div class="cz-slide" style="background:${bg};color:${ink}"><span class="cz-tag" style="background:${A};color:${Aink}">Étape 0${i + 1}</span><div class="cz-grow"></div><div class="cz-h2">${s.t}</div><div class="cz-pills">${pills(s.pills, pillOutline ? 'transparent' : A, pillOutline ? accentText : Aink, pillOutline ? `border:1px solid ${accentText}` : '')}</div><div class="cz-tip" style="border-top:1px solid ${line}"><span class="cz-tiplbl" style="background:${A};color:${Aink}">Pro tip</span><div class="cz-tiptxt" style="color:${mut}">${s.tip}</div></div><div class="cz-bar"><div></div>${dots(n, i + 1, accentText, line)}</div></div>`));
  out.push(`<div class="cz-slide" style="background:${bg2};color:${ink}"><span class="cz-tag" style="background:${A};color:${Aink}">À toi de jouer</span><div class="cz-grow" style="display:flex;flex-direction:column;justify-content:center"><div class="cz-h2">${CONTENT.cta.t}</div><div class="cz-tiptxt" style="color:${mut};font-size:10px;margin-top:6px">${CONTENT.cta.x}</div><span style="align-self:flex-start;background:${A};color:${Aink};font-weight:800;font-size:9px;padding:7px 12px;border-radius:6px;margin-top:10px;text-transform:uppercase">Lien en bio →</span></div><div class="cz-bar">${foot}<div></div></div></div>`);
  return out;
}

function _renderRaw(tplId, colors) {
  const P = colors?.p || '#003D2E';
  const S = colors?.s || '#0077FF';
  const A = colors?.a || '#3AFFA3';
  const Aink = inkOn(A), Sink = inkOn(S);
  const CREAM = light(P, 0.93), CLINE = mix(P, '#ffffff', 0.8), NEAR = mix(P, '#0a0c0b', 0.5);
  const INKL = '#14201b', MUTL = '#5d655e', MUTD = 'rgba(255,255,255,.66)';
  const accL = accOnLight(A), accD = accOnDark(A);
  const n = 2 + CONTENT.slides.length;
  const logo = colors?.logo || null;
  const nom = (colors?.nom || 'Ta marque').trim() || 'Ta marque';
  const initial = (nom[0] || 'A').toUpperCase();
  const ctx = { logo, nom, initial };
  const av = (bg, ink) => avHTML(logo, initial, bg, ink);

  if (tplId === 'creme') return refFamily(P, A, { bg: CREAM, bg2: light(P, 0.88), ink: INKL, mut: MUTL, line: CLINE, accentText: accL, pillOutline: false }, ctx);
  if (tplId === 'sombre') return refFamily(P, A, { bg: NEAR, bg2: mix(P, '#0a0c0b', 0.62), ink: '#fff', mut: MUTD, line: 'rgba(255,255,255,.15)', accentText: accD, pillOutline: true }, ctx);

  if (tplId === 'alterne') {
    const out = [];
    out.push(`<div class="cz-slide" style="background:${CREAM};color:${INKL}"><span class="cz-tag" style="background:${A};color:${Aink}">Carrousel</span><div class="cz-grow" style="display:flex;align-items:center"><div class="cz-h1">${CONTENT.hook}</div></div><div class="cz-bar"><div class="cz-foot">${av(A, Aink)}<div>${nom}</div></div><span class="cz-cnt" style="color:${accL};font-weight:700">SWIPE →</span></div></div>`);
    CONTENT.slides.forEach((s, i) => { const dk = i % 2 === 0, bg = dk ? NEAR : CREAM, ink = dk ? '#fff' : INKL, mut = dk ? MUTD : MUTL, line = dk ? 'rgba(255,255,255,.15)' : CLINE, acc = dk ? accD : accL; out.push(`<div class="cz-slide" style="background:${bg};color:${ink}"><span class="cz-tag" style="background:${A};color:${Aink}">Étape 0${i + 1}</span><div class="cz-grow"></div><div class="cz-h2">${s.t}</div><div class="cz-pills">${pills(s.pills, dk ? 'transparent' : A, dk ? acc : Aink, dk ? `border:1px solid ${acc}` : '')}</div><div class="cz-tip" style="border-top:1px solid ${line}"><span class="cz-tiplbl" style="background:${A};color:${Aink}">Pro tip</span><div class="cz-tiptxt" style="color:${mut}">${s.tip}</div></div><div class="cz-bar"><div></div>${dots(n, i + 1, acc, line)}</div></div>`); });
    out.push(`<div class="cz-slide" style="background:${CREAM};color:${INKL}"><span class="cz-tag" style="background:${A};color:${Aink}">À toi de jouer</span><div class="cz-grow" style="display:flex;flex-direction:column;justify-content:center"><div class="cz-h2">${CONTENT.cta.t}</div><span style="align-self:flex-start;background:${A};color:${Aink};font-weight:800;font-size:9px;padding:7px 12px;border-radius:6px;margin-top:10px;text-transform:uppercase">Lien en bio →</span></div><div class="cz-bar"><div class="cz-foot">${av(A, Aink)}<div>${nom}</div></div><div></div></div></div>`);
    return out;
  }

  if (tplId === 'editorial') {
    const out = [];
    out.push(`<div class="cz-slide" style="background:${CREAM};color:${INKL}"><div style="height:1px;background:${CLINE}"></div><div class="cz-grow" style="display:flex;align-items:center"><div style="font-family:Fraunces,serif;font-weight:600;font-size:21px;line-height:1.05">${CONTENT.hook}</div></div><div style="height:1px;background:${CLINE}"></div><div class="cz-foot" style="margin-top:8px">${av(A, Aink)}<div>${nom}</div></div></div>`);
    CONTENT.slides.forEach((s, i) => { const dk = i % 2 === 0, bg = dk ? NEAR : CREAM, ink = dk ? '#fff' : INKL, acc = dk ? accD : accL, mut = dk ? MUTD : MUTL; out.push(`<div class="cz-slide" style="background:${bg};color:${ink}"><div style="display:flex;justify-content:space-between;font-size:8px;letter-spacing:1px;color:${mut};font-weight:600"><span>IDÉE 0${i + 1}</span><span>0${i + 2} / 0${n}</span></div><div class="cz-grow"></div><div style="font-family:Fraunces,serif;font-weight:500;font-size:24px;color:${acc}">0${i + 1}</div><div style="font-family:Fraunces,serif;font-weight:600;font-size:17px;line-height:1.1;margin-top:2px">${s.t}</div><div style="font-size:9px;color:${mut};margin-top:6px;line-height:1.4">${s.x}</div></div>`); });
    out.push(`<div class="cz-slide" style="background:${CREAM};color:${INKL}"><div style="height:1px;background:${CLINE}"></div><div class="cz-grow" style="display:flex;flex-direction:column;justify-content:center"><div style="font-family:Fraunces,serif;font-weight:600;font-size:20px">${CONTENT.cta.t}</div><span style="align-self:flex-start;border:1.5px solid ${accL};color:${accL};font-size:9px;font-weight:600;padding:7px 13px;border-radius:30px;margin-top:10px">Lien en bio →</span></div><div style="height:1px;background:${CLINE}"></div></div>`);
    return out;
  }

  if (tplId === 'pop') {
    // fonds pleins : accent vif ↔ quasi-noir (contraste garanti) ; CTA = secondaire
    const out = [];
    out.push(`<div class="cz-slide" style="background:${A};color:${Aink}"><div style="display:flex;justify-content:space-between"><span class="cz-tag" style="background:${Aink};color:${A}">Carrousel</span><span style="font-family:Sora,sans-serif;font-weight:800;font-size:8px">SWIPE →</span></div><div class="cz-grow" style="display:flex;align-items:center"><div style="font-family:Sora,sans-serif;font-weight:800;font-size:23px;line-height:1;letter-spacing:-.5px">${CONTENT.hook}</div></div><div style="display:flex;align-items:center;gap:6px;font-family:Sora,sans-serif;font-weight:700;font-size:9px">${av(Aink, A)}<span>${nom}</span></div></div>`);
    CONTENT.slides.forEach((s, i) => { const acc = i % 2 === 0, bg = acc ? A : NEAR, ink = acc ? Aink : '#fff'; out.push(`<div class="cz-slide" style="background:${bg};color:${ink}"><span class="cz-tag" style="background:${acc ? NEAR : A};color:${acc ? '#fff' : Aink}">Étape 0${i + 1}</span><div style="font-family:Sora,sans-serif;font-weight:800;font-size:48px;opacity:.16;line-height:.7;margin-top:auto;letter-spacing:-2px;color:${ink}">0${i + 1}</div><div style="font-family:Sora,sans-serif;font-weight:800;font-size:18px;line-height:1;letter-spacing:-.4px;margin-top:2px">${s.t}</div><div class="cz-pills">${pills(s.pills, acc ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.16)', ink, '')}</div></div>`); });
    out.push(`<div class="cz-slide" style="background:${S};color:${Sink}"><span class="cz-tag" style="background:${Sink};color:${S}">À toi</span><div class="cz-grow" style="display:flex;flex-direction:column;justify-content:center"><div style="font-family:Sora,sans-serif;font-weight:800;font-size:18px">${CONTENT.cta.t}</div><span style="align-self:flex-start;background:${Sink};color:${S};font-family:Sora,sans-serif;font-weight:800;font-size:10px;padding:8px 14px;border-radius:9px;margin-top:10px">Lien en bio →</span></div></div>`);
    return out;
  }

  if (tplId === 'neon') {
    const acc = accD;
    const D1 = mix(P, '#0a1430', 0.30), D2 = mix(P, '#04060e', 0.72);
    const gc = 'rgba(255,255,255,.05)';
    const bg = `background:linear-gradient(${gc} 1px,transparent 1px),linear-gradient(90deg,${gc} 1px,transparent 1px),linear-gradient(155deg,${D1},${D2});background-size:22px 22px,22px 22px,100% 100%`;
    const duo = duotoneSvg(A);
    const top = (i) => `<div style="display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2">`
      + `<div style="display:flex;align-items:center;gap:6px;font-family:Sora,sans-serif;font-weight:800;font-size:10px;color:#eaf1ff">${av(acc, inkOn(acc))}<span>${nom}</span></div>`
      + `<span style="font-family:Sora,sans-serif;font-weight:800;font-size:10px;color:${acc}">${i + 1}/${n}</span></div>`;
    const line = `<div style="width:34px;height:3px;background:${acc};border-radius:3px;margin:8px 0 7px;position:relative;z-index:2"></div>`;
    const num = (i) => `<div style="font-family:Sora,sans-serif;font-weight:800;font-size:50px;line-height:.8;letter-spacing:-2px;color:transparent;-webkit-text-stroke:2px ${acc}">0${i}</div>`;
    const h = (t, fs, mw) => `<div style="font-family:Sora,sans-serif;font-weight:800;font-size:${fs}px;line-height:1.02;letter-spacing:-.4px;text-transform:uppercase;position:relative;z-index:2;color:#eaf1ff${mw ? ';max-width:' + mw : ''}">${twoTone(t, acc)}</div>`;
    const illus = (icon) => icon ? `<div style="position:absolute;right:11px;bottom:25px;width:80px;z-index:1;pointer-events:none"><div style="position:absolute;right:-16px;bottom:-16px;width:112px;height:112px;border-radius:50%;background:radial-gradient(circle,${acc}3d,transparent 70%)"></div><img src="/icons3d/${icon}.png" style="position:relative;width:80px;display:block;opacity:.92;filter:url(#czic) drop-shadow(0 0 8px ${acc}aa)" alt=""></div>` : '';
    const o = [];
    o.push(`<div class="cz-slide" style="${bg}">${duo}${top(0)}<div class="cz-grow" style="display:flex;flex-direction:column;justify-content:center">${h(CONTENT.hook, 22)}${line}</div></div>`);
    CONTENT.slides.forEach((s, i) => o.push(`<div class="cz-slide" style="${bg}">${top(i + 1)}${illus(s.icon)}<div style="position:relative;z-index:2;margin-top:8px">${num(i + 1)}<div style="margin-top:2px">${h(s.t, 15)}</div>${line}</div><div style="flex:1;position:relative;z-index:2"><p style="font-size:9px;color:#9fb0cf">${s.x}</p></div></div>`));
    o.push(`<div class="cz-slide" style="${bg}">${top(n - 1)}<div class="cz-grow" style="display:flex;flex-direction:column;justify-content:center">${h(CONTENT.cta.t, 22)}${line}<p style="font-size:9px;color:#9fb0cf;position:relative;z-index:2">${CONTENT.cta.x}</p><span style="align-self:flex-start;background:${acc};color:${inkOn(acc)};font-family:Sora,sans-serif;font-weight:800;font-size:8.5px;padding:6px 11px;border-radius:7px;margin-top:8px;position:relative;z-index:2">Lien en bio →</span></div></div>`);
    return o;
  }

  // clean
  const grad = `linear-gradient(165deg,${NEAR},${mix(NEAR, A, 0.5)})`;
  const pbar = (i, lt) => `<div style="position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:6px;padding:0 16px 12px"><div style="flex:1;height:3px;border-radius:9px;overflow:hidden;background:${lt ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.16)'}"><div style="width:${(i + 1) / n * 100}%;height:100%;background:${lt ? accL : '#fff'}"></div></div><span style="font-size:7px;font-weight:700;color:${lt ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.5)'}">${i + 1}/${n}</span></div>`;
  const out = [];
  out.push(`<div class="cz-slide" style="background:${CREAM};color:#181a1f;justify-content:center"><div style="font-size:8px;font-weight:700;letter-spacing:1.5px;color:${accL};text-transform:uppercase;margin-bottom:8px">Carrousel</div><div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:20px;line-height:1.1">${CONTENT.hook}</div><div class="cz-grow"></div><div class="cz-foot">${av(A, Aink)}<div>${nom}</div></div>${pbar(0, true)}</div>`);
  CONTENT.slides.forEach((s, i) => { const dk = i % 2 === 0, bg = dk ? NEAR : CREAM, ink = dk ? '#fff' : '#181a1f', acc = dk ? accD : accL; out.push(`<div class="cz-slide" style="background:${bg};color:${ink};justify-content:flex-end"><div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:300;font-size:22px;color:${acc}">0${i + 1}</div><div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:17px;line-height:1.1;margin-top:2px">${s.t}</div><div class="cz-pills">${pills(s.pills, dk ? 'rgba(255,255,255,.12)' : A, dk ? '#fff' : Aink, '')}</div>${pbar(i + 1, !dk)}</div>`); });
  out.push(`<div class="cz-slide" style="background:${grad};color:#fff;justify-content:center"><div class="cz-foot">${av(A, Aink)}<div>${nom}</div></div><div class="cz-grow"></div><div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:18px">${CONTENT.cta.t}</div><span style="align-self:flex-start;background:#fff;color:${inkOn('#ffffff')};font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:10px;padding:8px 14px;border-radius:26px;margin-top:10px">Lien en bio →</span>${pbar(n - 1, false)}</div>`);
  return out;
}

// Police d'affichage : liste proposée + application (remplace la police signature du template)
const CZ_DISPLAY_FONTS = ['Anton', 'Fraunces', 'Sora'];
export const CAROUSEL_FONTS = [
  { id: '', label: 'Auto (par style)' },
  { id: 'Anton', label: 'Anton' },
  { id: 'Sora', label: 'Sora' },
  { id: 'Poppins', label: 'Poppins' },
  { id: 'Montserrat', label: 'Montserrat' },
  { id: 'Oswald', label: 'Oswald' },
  { id: 'Bebas Neue', label: 'Bebas Neue' },
  { id: 'Playfair Display', label: 'Playfair' },
  { id: 'Fraunces', label: 'Fraunces' },
];

function renderSlides(tplId, colors) {
  CONTENT = colors?.content ? _mapContent(colors.content) : DEMO_CONTENT;  // vrai carrousel si fourni
  let slides;
  try { slides = _renderRaw(tplId, colors); } finally { CONTENT = DEMO_CONTENT; }
  const font = colors?.font;
  if (!font) return slides;
  return slides.map((h) => CZ_DISPLAY_FONTS.reduce((acc, f) => acc.split('font-family:' + f).join("font-family:'" + font + "'"), h));
}

export { renderSlides };
