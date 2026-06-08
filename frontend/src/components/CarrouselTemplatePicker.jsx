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

// Mini-aperçu d'une slide "étape" dans les couleurs du client
function Mini({ id, p, s, a }) {
  const cream = lighten(p, 0.93);
  const dark = darken(p, 0.5);
  const tagInk = p; // texte sur accent
  const wrap = { width: '100%', aspectRatio: '4/5', borderRadius: 8, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', padding: 9, gap: 5 };
  const tag = (bg, col) => ({ alignSelf: 'flex-start', background: bg, color: col, fontSize: 6, fontWeight: 800, letterSpacing: 0.5, padding: '2px 5px', borderRadius: 3 });
  const bar = (col, w) => ({ height: 6, width: w, background: col, borderRadius: 2 });
  const pill = (bg) => ({ height: 5, width: 16, background: bg, borderRadius: 3 });
  const dotrow = (col) => ({ display: 'flex', gap: 2, marginTop: 'auto' });

  if (id === 'creme') return (
    <div style={{ ...wrap, background: cream }}>
      <div style={tag(a, tagInk)}>ÉTAPE 01</div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={bar('#14201b', '85%')} /><div style={bar('#14201b', '55%')} />
        <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>{[0, 1, 2].map((i) => <span key={i} style={pill(a)} />)}</div>
      </div>
    </div>
  );
  if (id === 'sombre') return (
    <div style={{ ...wrap, background: dark }}>
      <div style={tag(a, tagInk)}>ÉTAPE 01</div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={bar('#eef1ec', '85%')} /><div style={bar('#eef1ec', '55%')} />
        <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>{[0, 1, 2].map((i) => <span key={i} style={{ ...pill('transparent'), border: `1px solid ${a}` }} />)}</div>
      </div>
    </div>
  );
  if (id === 'alterne') return (
    <div style={{ ...wrap, background: dark, padding: 0 }}>
      <div style={{ flex: 1, background: cream }} />
      <div style={{ flex: 1, background: dark, display: 'flex', alignItems: 'center', padding: 9 }}>
        <span style={tag(a, tagInk)}>ÉTAPE</span>
      </div>
    </div>
  );
  if (id === 'editorial') return (
    <div style={{ ...wrap, background: cream }}>
      <div style={{ height: 1, background: '#c9cfc6' }} />
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 8, color: p, fontWeight: 700 }}>01</div>
        <div style={bar('#14201b', '80%')} /><div style={bar('#9aa39a', '60%')} />
      </div>
      <div style={{ height: 1, background: '#c9cfc6', marginTop: 5 }} />
    </div>
  );
  if (id === 'pop') return (
    <div style={{ ...wrap, background: a }}>
      <div style={tag(p, a)}>ÉTAPE 01</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: darken(a, 0.06), opacity: 0.25, lineHeight: 0.8, marginTop: 'auto' }}>01</div>
      <div style={bar(p, '80%')} />
    </div>
  );
  // clean
  return (
    <div style={{ ...wrap, background: dark }}>
      <div style={{ fontSize: 11, color: a, fontWeight: 300, marginTop: 'auto' }}>01</div>
      <div style={bar('#fff', '78%')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.18)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: '45%', height: '100%', background: '#fff' }} />
        </div>
        <span style={{ fontSize: 5, color: 'rgba(255,255,255,.5)' }}>2/5</span>
      </div>
    </div>
  );
}

export default function CarrouselTemplatePicker({ value, onChange, colors }) {
  const p = colors?.p || '#003D2E';
  const s = colors?.s || '#0077FF';
  const a = colors?.a || '#3AFFA3';
  return (
    <div className="grid grid-cols-3 gap-2.5">
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
