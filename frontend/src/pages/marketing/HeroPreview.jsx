import { useState, useEffect } from 'react';

// Fenêtre produit du hero — VRAIES captures de l'app (public/images), en fondu enchaîné.
// Remplace les anciennes scènes factices (mock sidebar + faux contenus).
const SCENES = [
  { label: 'Studio IA', src: '/images/studio.jpg' },
  { label: 'Contenus', src: '/images/contenus.jpg' },
  { label: 'Planification', src: '/images/planification.jpg' },
  { label: 'Performance', src: '/images/performance.jpg' },
];

const EASE = 'cubic-bezier(.23,1,.32,1)';

export default function HeroPreview() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setI((p) => (p + 1) % SCENES.length), 4000);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <div className="preview" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="pbar"><i /><i /><i /></div>
      <div className="shot" style={{ display: 'block', padding: 0 }}>
        {/* Captures — crossfade (transitions CSS, interruptibles) */}
        <div style={{ position: 'relative', aspectRatio: '1280 / 733', overflow: 'hidden', background: '#0a1120' }}>
          {SCENES.map((s, idx) => (
            <img
              key={s.src}
              src={s.src}
              alt={`PresenceOS — ${s.label}`}
              loading={idx === 0 ? 'eager' : 'lazy'}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'top left',
                opacity: idx === i ? 1 : 0,
                transition: `opacity 500ms ${EASE}`,
              }}
            />
          ))}
        </div>

        {/* Onglets de navigation */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
          {SCENES.map((s, idx) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setI(idx)}
              aria-label={s.label}
              style={{
                font: '500 11.5px Inter, system-ui, sans-serif', letterSpacing: '.01em', cursor: 'pointer',
                padding: '5px 11px', borderRadius: 8,
                border: `1px solid ${idx === i ? 'rgba(138,108,255,.45)' : 'rgba(255,255,255,.08)'}`,
                background: idx === i ? 'rgba(91,108,255,.15)' : 'transparent',
                color: idx === i ? '#fff' : '#8ea0bd',
                transition: 'color 150ms ease, background 150ms ease, border-color 150ms ease',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
