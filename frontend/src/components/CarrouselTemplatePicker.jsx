import React from 'react';

// --- mini utils couleur (mêmes dérivations approx. que le backend) ---
const toRgb = (h) => {
  h = (h || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => '#' + rgb.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const mix = (c1, c2, t) => { const a = toRgb(c1), b = toRgb(c2); return toHex(a.map((v, i) => v * (1 - t) + b[i] * t)); };
const lighten = (h, t) => mix(h, '#ffffff', t);
const darken = (h, t) => mix(h, '#000000', t);

const TEMPLATES = [
  { id: 'creme', label: 'Crème' },
  { id: 'sombre', label: 'Sombre' },
  { id: 'alterne', label: 'Alterné' },
  { id: 'editorial', label: 'Éditorial' },
  { id: 'pop', label: 'Pop' },
  { id: 'clean', label: 'Clean' },
];

// contenu d'exemple commun (pour comparer les STYLES, pas le contenu)
const EX = { tag: 'ÉTAPE 01', titre: 'Connais ta vraie valeur', pills: ['EBITDA', 'Process'], tip: "Ta valeur = ta capacité à t'absenter." };

function Mini({ id, p, s, a }) {
  const cream = lighten(p, 0.93);
  const dark = darken(p, 0.5);
  const wrap = { width: '100%', aspectRatio: '4/5', borderRadius: 7, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', padding: 9, fontFamily: 'Inter, sans-serif' };
  const tag = (bg, col) => ({ alignSelf: 'flex-start', background: bg, color: col, fontSize: 6.5, fontWeight: 800, letterSpacing: 0.6, padding: '2px 5px', borderRadius: 3, textTransform: 'uppercase' });
  const title = (col, extra = {}) => ({ color: col, fontSize: 15, fontWeight: 800, lineHeight: 0.98, letterSpacing: 0.2, textTransform: 'uppercase', ...extra });
  const pillsRow = { display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 };
  const pill = (bg, col, outline) => ({ fontSize: 5.5, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', background: bg, color: col, padding: '2px 5px', borderRadius: 3, border: outline || 'none' });
  const dots = (oncol, offcol) => (
    <div style={{ display: 'flex', gap: 2.5, alignItems: 'center', marginTop: 'auto', paddingTop: 6 }}>
      {[0, 1, 2, 3].map((i) => <span key={i} style={{ height: 3, width: i === 1 ? 11 : 3, borderRadius: 3, background: i === 1 ? oncol : offcol }} />)}
      <span style={{ marginLeft: 'auto', fontSize: 5.5, fontWeight: 700, color: offcol }}>2/5</span>
    </div>
  );

  if (id === 'creme') return (
    <div style={{ ...wrap, background: cream }}>
      <div style={tag(a, p)}>{EX.tag}</div>
      <div style={{ flex: 1 }} />
      <div style={title('#14201b')}>{EX.titre}</div>
      <div style={pillsRow}>{EX.pills.map((x) => <span key={x} style={pill(a, p)}>{x}</span>)}</div>
      <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid #d6dbd2' }}>
        <span style={pill(a, p)}>PRO TIP</span>
        <div style={{ fontSize: 7, color: '#5d655e', lineHeight: 1.35, marginTop: 3 }}>{EX.tip}</div>
      </div>
      {dots(p, '#c4cabf')}
    </div>
  );
  if (id === 'sombre') return (
    <div style={{ ...wrap, background: dark }}>
      <div style={tag(a, p)}>{EX.tag}</div>
      <div style={{ flex: 1 }} />
      <div style={title('#eef1ec')}>{EX.titre}</div>
      <div style={pillsRow}>{EX.pills.map((x) => <span key={x} style={pill('transparent', a, `1px solid ${a}`)}>{x}</span>)}</div>
      <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid rgba(255,255,255,.15)' }}>
        <span style={pill(a, p)}>PRO TIP</span>
        <div style={{ fontSize: 7, color: 'rgba(255,255,255,.66)', lineHeight: 1.35, marginTop: 3 }}>{EX.tip}</div>
      </div>
      {dots(a, 'rgba(255,255,255,.25)')}
    </div>
  );
  if (id === 'alterne') return (
    <div style={{ ...wrap, padding: 0, background: dark }}>
      <div style={{ background: cream, padding: '9px 9px 7px' }}>
        <div style={tag(a, p)}>CARROUSEL</div>
        <div style={{ ...title('#14201b', { fontSize: 12, marginTop: 5 }) }}>Ta valeur ?</div>
      </div>
      <div style={{ flex: 1, padding: 9, display: 'flex', flexDirection: 'column' }}>
        <div style={tag(a, p)}>{EX.tag}</div>
        <div style={{ ...title('#eef1ec', { marginTop: 'auto', fontSize: 13 }) }}>{EX.titre}</div>
        <div style={pillsRow}>{EX.pills.map((x) => <span key={x} style={pill('transparent', a, `1px solid ${a}`)}>{x}</span>)}</div>
      </div>
    </div>
  );
  if (id === 'editorial') return (
    <div style={{ ...wrap, background: cream }}>
      <div style={{ height: 1, background: '#c9cfc6' }} />
      <div style={{ fontSize: 8, letterSpacing: 1.5, color: '#5d655e', fontWeight: 600, marginTop: 5 }}>IDÉE 01</div>
      <div style={{ flex: 1 }} />
      <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 13, color: p, fontWeight: 700 }}>01</div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: '#14201b', lineHeight: 1.1, fontWeight: 600, marginTop: 2 }}>Connais ta vraie valeur</div>
      <div style={{ fontSize: 8, color: '#5d655e', marginTop: 4, lineHeight: 1.4 }}>{EX.tip}</div>
      <div style={{ height: 1, background: '#c9cfc6', marginTop: 'auto' }} />
    </div>
  );
  if (id === 'pop') return (
    <div style={{ ...wrap, background: a }}>
      <div style={tag(p, a)}>{EX.tag}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color: darken(a, 0.08), opacity: 0.22, lineHeight: 0.75, marginTop: 'auto', letterSpacing: -1 }}>01</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: p, lineHeight: 1, letterSpacing: -0.3, marginTop: 2 }}>Connais ta vraie valeur</div>
      <div style={pillsRow}>{EX.pills.map((x) => <span key={x} style={pill('rgba(0,61,46,.15)', p)}>{x}</span>)}</div>
      {dots(p, 'rgba(0,61,46,.25)')}
    </div>
  );
  // clean
  return (
    <div style={{ ...wrap, background: dark }}>
      <div style={{ fontSize: 8, letterSpacing: 1.5, color: a, fontWeight: 700, textTransform: 'uppercase' }}>Idée 01</div>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 16, fontWeight: 300, color: a, lineHeight: 1 }}>01</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.05, marginTop: 2, letterSpacing: -0.2 }}>Connais ta vraie valeur</div>
      <div style={pillsRow}>{EX.pills.map((x) => <span key={x} style={pill('rgba(255,255,255,.12)', '#fff')}>{x}</span>)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.18)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: '45%', height: '100%', background: '#fff' }} />
        </div>
        <span style={{ fontSize: 5.5, color: 'rgba(255,255,255,.5)', fontWeight: 700 }}>2/5</span>
      </div>
    </div>
  );
}

export default function CarrouselTemplatePicker({ value, onChange, colors }) {
  const p = colors?.p || '#003D2E';
  const s = colors?.s || '#0077FF';
  const a = colors?.a || '#3AFFA3';
  return (
    <div className="grid grid-cols-3 gap-2.5" style={{ maxWidth: 540 }}>
      {TEMPLATES.map((t) => {
        const on = (value || 'creme') === t.id;
        return (
          <button key={t.id} type="button" onClick={() => onChange(t.id)} data-testid={`carrousel-tpl-${t.id}`}
            className={`text-left rounded-xl p-1.5 border transition-all ${on ? 'border-[#5B6CFF] bg-[#5B6CFF]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}>
            <Mini id={t.id} p={p} s={s} a={a} />
            <div className={`mt-1.5 text-[11px] font-inter text-center ${on ? 'text-white font-semibold' : 'text-slate-400'}`}>{t.label}</div>
          </button>
        );
      })}
    </div>
  );
}
