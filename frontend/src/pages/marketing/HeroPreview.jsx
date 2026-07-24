import { useState, useEffect } from 'react';

const SIDEBAR = ['Studio IA', 'Contenus', 'Planification', 'Commentaires', 'Performance', 'Carrousels'];

// Le shell du hero (fenêtre + sidebar + points) reste factice ; SEULES les images changent :
// le panneau central affiche de VRAIES captures de l'app (public/images), en fondu enchaîné.
const SCENES = [
  { label: 'Studio IA', src: '/images/studio.jpg' },
  { label: 'Contenus', src: '/images/contenus.jpg' },
  { label: 'Planification', src: '/images/planification.jpg' },
  { label: 'Performance', src: '/images/performance.jpg' },
];

export default function HeroPreview() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setI((p) => (p + 1) % SCENES.length), 4000);
    return () => clearInterval(id);
  }, [paused]);

  const active = SCENES[i];

  return (
    <div className="preview" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="pbar"><i /><i /><i /></div>
      <div className="shot">
        <div className="sb">
          <div className="lg"><img src="/logo.png" alt="" /><b>Presence OS</b></div>
          {SIDEBAR.map((t) => (
            <div key={t} className={'it' + (t === active.label ? ' on' : '')}><span className="ic" />{t}</div>
          ))}
        </div>
        <div className="main" style={{ position: 'relative', padding: 0, overflow: 'hidden' }}>
          {SCENES.map((s, idx) => (
            <img
              key={s.src}
              src={s.src}
              alt={`PresenceOS — ${s.label}`}
              loading={idx === 0 ? 'eager' : 'lazy'}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'left top',
                opacity: idx === i ? 1 : 0,
                transition: 'opacity 500ms cubic-bezier(.23,1,.32,1)',
              }}
            />
          ))}
          <div className="hp-dots" style={{ position: 'absolute', left: 0, right: 0, bottom: 12, zIndex: 2 }}>
            {SCENES.map((s, idx) => (
              <button key={s.label} className={idx === i ? 'on' : ''} onClick={() => setI(idx)} aria-label={s.label} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
