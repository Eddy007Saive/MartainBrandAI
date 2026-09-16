// Section « Style & Couleurs » des Paramètres : aperçus de style et aperçu de post « en direct ».
// Tout est dessiné en CSS à partir de la palette du client (aucune image générée) : le client voit
// immédiatement ce que ses trois couleurs et son style donnent sur un post, avant de payer une image.
// Piste B validée par le PO le 2026-09-16 (prototype HTML « Style & Couleurs, trois pistes »).

// Styles des images IA : mêmes clés que le serveur (miniature_service.STYLES) et la fenêtre Image.
export const IMAGE_STYLES = ['auto', 'photo', 'cinema', '3d', 'illustration', 'neon', 'pop'];

export const COULEURS_DEFAUT = { principale: '#003D2E', secondaire: '#0077FF', accent: '#3AFFA3' };

const hexRgb = (h) => {
  const s = String(h || '').replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const rgbHex = ([r, g, b]) => '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
// Mélange linéaire de deux couleurs (t = part de la seconde).
export const melange = (a, b, t) => rgbHex(hexRgb(a).map((x, i) => x + (hexRgb(b)[i] - x) * t));
const alpha = (h, a) => `rgba(${hexRgb(h).join(',')},${a})`;

const luminance = (h) => {
  const [r, g, b] = hexRgb(h).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Contraste WCAG entre l'accent et la principale : dit si un bouton accent sera lisible sur le fond.
export const contraste = (accent, principale) => {
  const [hi, lo] = [luminance(accent), luminance(principale)].sort((a, b) => b - a);
  const ratio = (hi + 0.05) / (lo + 0.05);
  return { ratio: Math.round(ratio * 10) / 10, niveau: ratio >= 4.5 ? 'bon' : ratio >= 3 ? 'moyen' : 'faible' };
};

export const paletteDe = (user) => ({
  principale: user?.couleur_principale || COULEURS_DEFAUT.principale,
  secondaire: user?.couleur_secondaire || COULEURS_DEFAUT.secondaire,
  accent: user?.couleur_accent || COULEURS_DEFAUT.accent,
});

// Aperçu d'un style, dessiné en CSS avec la palette. `grand` = remplit son conteneur (aperçu de post).
export function ApercuStyle({ style = 'photo', couleurs, grand = false, className = '' }) {
  const c = couleurs || COULEURS_DEFAUT;
  const base = grand
    ? { position: 'absolute', inset: 0 }
    : { position: 'relative', display: 'block', aspectRatio: '4 / 5', borderRadius: 9, overflow: 'hidden' };
  const fond = { ...base, background: c.principale, overflow: 'hidden' };
  const abs = { position: 'absolute' };
  switch (style) {
    case 'auto':
      return (
        <span className={className} style={{ ...fond, background: `linear-gradient(135deg, ${c.principale}, ${c.secondaire})` }}>
          <span style={{ ...abs, inset: 0, display: 'grid', placeItems: 'center', fontSize: grand ? 64 : 28, color: c.accent, textShadow: `0 0 14px ${c.accent}` }}>✦</span>
        </span>
      );
    case 'cinema':
      return (
        <span className={className} style={{ ...fond, background: `linear-gradient(180deg, #000 0 11%, ${melange(c.principale, c.secondaire, 0.3)} 11% 89%, #000 89%)` }}>
          <span style={{ ...abs, left: 0, right: 0, top: '40%', height: '20%', background: `radial-gradient(ellipse at 60% 50%, ${alpha(c.accent, 0.8)}, transparent 70%)` }} />
        </span>
      );
    case '3d':
      return (
        <span className={className} style={fond}>
          <span style={{ ...abs, left: '15%', right: '15%', bottom: '14%', height: '10%', borderRadius: '50%', background: alpha(c.accent, 0.45), filter: 'blur(4px)' }} />
          <span style={{ ...abs, left: '22%', top: '20%', width: '56%', aspectRatio: '1', borderRadius: '50%', boxShadow: '0 10px 18px -6px #000',
            background: `radial-gradient(circle at 32% 28%, #fff 0 6%, ${c.secondaire} 30%, ${melange(c.secondaire, '#000000', 0.55)} 100%)` }} />
        </span>
      );
    case 'illustration':
      return (
        <span className={className} style={{ ...fond, background: melange(c.principale, '#ffffff', 0.88) }}>
          <span style={{ ...abs, left: '14%', top: '18%', width: '48%', height: '48%', borderRadius: '12% 40% 12% 40%', background: c.secondaire }} />
          <span style={{ ...abs, right: '14%', bottom: '16%', width: '40%', height: '40%', borderRadius: '50%', background: c.accent, border: `3px solid ${c.principale}` }} />
        </span>
      );
    case 'neon':
      return (
        <span className={className} style={{ ...fond, background: '#05060a' }}>
          <span style={{ ...abs, left: '24%', top: '22%', width: '52%', aspectRatio: '1', borderRadius: '50%', border: `3px solid ${c.accent}`,
            boxShadow: `0 0 10px ${c.accent}, 0 0 28px ${c.accent}, inset 0 0 12px ${c.secondaire}` }} />
        </span>
      );
    case 'pop':
      return (
        <span className={className} style={{ ...fond, background: `radial-gradient(circle, ${melange(c.secondaire, '#000000', 0.2)} 22%, transparent 24%) 0 0 / 9px 9px, ${melange(c.accent, '#ffffff', 0.1)}` }}>
          <span style={{ ...abs, left: '22%', top: '26%', width: '56%', height: '40%', background: c.secondaire, border: '3px solid #111', transform: 'rotate(-6deg)', boxShadow: '5px 5px 0 #111' }} />
        </span>
      );
    default: // photo
      return (
        <span className={className} style={{ ...fond, background: `linear-gradient(180deg, ${melange(c.principale, '#ffffff', 0.22)} 0%, ${c.principale} 60%)` }}>
          <span style={{ ...abs, left: '18%', top: '22%', width: '44%', aspectRatio: '1', borderRadius: '50%', filter: 'blur(1px)',
            background: `radial-gradient(circle at 35% 30%, ${melange(c.accent, '#ffffff', 0.35)}, ${c.accent} 45%, transparent 72%)` }} />
        </span>
      );
  }
}

// Un post Instagram type, aux couleurs et au style du client. Se met à jour à chaque réglage.
export function ApercuPost({ user, style, textes }) {
  const c = paletteDe(user);
  const nom = user?.nom_marque || user?.nom || user?.username || 'Ta marque';
  const initiale = String(nom).charAt(0).toUpperCase();
  return (
    <article data-testid="apercu-post" className="mx-auto w-full max-w-[340px] rounded-[18px] overflow-hidden border border-white/10 text-white shadow-[0_30px_60px_-30px_#000]" style={{ background: c.principale }}>
      <header className="flex items-center gap-2.5 px-3.5 py-3">
        {user?.logo_url
          ? <img src={user.logo_url} alt="" className="w-8 h-8 rounded-[9px] bg-white object-contain p-0.5" />
          : <span className="w-8 h-8 rounded-[9px] grid place-items-center font-sora font-bold text-sm" style={{ background: c.secondaire }}>{initiale}</span>}
        <div className="min-w-0"><b className="block text-[13px] truncate">{nom}</b><small className="text-[11px] text-white/60">{textes.sous}</small></div>
      </header>
      <div className="relative mx-2.5 rounded-xl overflow-hidden" style={{ aspectRatio: '4 / 5', background: c.principale }}>
        <ApercuStyle style={style} couleurs={c} grand />
        <span className="absolute left-2.5 top-2.5 text-[10px] font-bold tracking-[0.08em] uppercase px-2 py-0.5 rounded-md bg-black/55">{textes.style}</span>
      </div>
      <p className="font-sora font-bold text-[17px] leading-[1.2] mx-3.5 mt-3.5 mb-1.5">
        {textes.titreAvant} <em className="not-italic" style={{ color: c.accent }}>{textes.titreAccent}</em> {textes.titreApres}
      </p>
      <p className="mx-3.5 mb-3 text-[12px] text-white/70">{textes.legende}</p>
      <footer className="flex items-center justify-between px-3.5 pb-3.5">
        <span className="text-[12px] font-bold px-3 py-2 rounded-[9px]" style={{ background: c.accent, color: '#0b1322' }}>{textes.bouton}</span>
        <span className="flex gap-1">{[0, 1, 2].map((i) => <i key={i} className="w-1.5 h-1.5 rounded-full opacity-70" style={{ background: c.secondaire }} />)}</span>
      </footer>
    </article>
  );
}
