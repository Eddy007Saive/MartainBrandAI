import { useState, useEffect } from 'react';
import { NET, NetIcon } from './shared';

const Spark = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="2">
    <path d="M12 3l1.9 5.8L20 10l-5.1 3.7L16 20l-4-3.6L8 20l1.1-6.3L4 10l6.1-1.2z" />
  </svg>
);

const SIDEBAR = ['Studio IA', 'Contenus', 'Planification', 'Commentaires', 'Performance', 'Carrousels'];

// --- Scènes ---
function SceneStudio() {
  const sujets = [
    '5 erreurs qui plombent ta visibilité LinkedIn',
    'Le rituel matinal des fondateurs qui scalent',
    "Pourquoi ton audience ne réagit pas (et le fix)",
    '3 outils IA pour publier 2× plus vite',
  ];
  return (
    <div className="hp-scene">
      <div className="t">Génère des sujets</div>
      <div className="d">Des idées calibrées sur ta marque, en un clic.</div>
      <div className="hp-list">
        {sujets.map((s, i) => (
          <div className="hp-item hp-anim" style={{ animationDelay: `${0.05 + i * 0.09}s` }} key={s}>
            <span className="hp-spark"><Spark /></span>
            <span className="hp-itext">{s}</span>
            <span className="hp-add">+ Créer</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SceneComments() {
  const cmts = [
    { i: 'M', n: 'Marie L.', t: "Super post 🔥 t'aurais une ressource là-dessus ?", net: 'linkedin' },
    { i: 'K', n: 'Karim B.', t: "Exactement ce qu'il me fallait, merci 🙏", net: 'facebook' },
    { i: 'S', n: 'Sofia', t: 'Je partage à mon équipe !', net: 'instagram' },
  ];
  return (
    <div className="hp-scene">
      <div className="t">Commentaires</div>
      <div className="d">Réponds à ta communauté, au même endroit.</div>
      <div className="hp-chips">
        <span className="hp-chip on">12 nouveaux</span>
        <span className="hp-chip">Taux de réponse 92%</span>
      </div>
      <div className="hp-cmts">
        {cmts.map((c, idx) => (
          <div className="hp-cmt hp-anim" style={{ animationDelay: `${0.05 + idx * 0.1}s` }} key={c.n}>
            <span className="hp-av" style={{ background: NET[c.net].bg }}>{c.i}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="hp-cname">{c.n}<span className="hp-cnet" style={{ background: NET[c.net].bg }}><NetIcon id={c.net} size={9} /></span></div>
              <div className="hp-ctext">{c.t}</div>
              <div className="hp-cact"><span className="r">Répondre</span><span>♥ J'aime</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenePlanning() {
  // jour -> réseaux programmés
  const plan = { 2: ['linkedin'], 5: ['instagram', 'facebook'], 9: ['linkedin'], 12: ['tiktok'], 15: ['instagram'], 18: ['linkedin', 'youtube'], 20: ['facebook'] };
  return (
    <div className="hp-scene">
      <div className="t">Ton mois éditorial</div>
      <div className="d">Créneaux automatiques, à la bonne heure.</div>
      <div className="hp-cal">
        {Array.from({ length: 21 }).map((_, i) => (
          <div className="hp-cell hp-anim" style={{ animationDelay: `${i * 0.015}s` }} key={i}>
            <span className="num">{i + 1}</span>
            <span className="dots">{(plan[i] || []).map((n) => <span className="dot" key={n} style={{ background: NET[n].bg }} />)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenePerf() {
  const kpis = [
    { l: 'Impressions', v: '12,4k', d: '+18%' },
    { l: "J'aime", v: '1 240', d: '+9%' },
    { l: 'Commentaires', v: '318', d: '+24%' },
    { l: 'Partages', v: '96', d: '+12%' },
  ];
  return (
    <div className="hp-scene">
      <div className="t">Performance</div>
      <div className="d">Impressions, likes, partages — synchronisés tout seuls.</div>
      <div className="hp-kpis">
        {kpis.map((k, i) => (
          <div className="hp-kpi hp-anim" style={{ animationDelay: `${0.05 + i * 0.08}s` }} key={k.l}>
            <div className="kl">{k.l}</div>
            <div className="kv">{k.v}</div>
            <div className="kd">↑ {k.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SCENES = [
  { label: 'Studio IA', Comp: SceneStudio },
  { label: 'Commentaires', Comp: SceneComments },
  { label: 'Planification', Comp: ScenePlanning },
  { label: 'Performance', Comp: ScenePerf },
];

export default function HeroPreview() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setI((p) => (p + 1) % SCENES.length), 3200);
    return () => clearInterval(id);
  }, [paused]);

  const active = SCENES[i];
  const { Comp } = active;

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
        <div className="main">
          <Comp key={i} />
          <div className="hp-dots">
            {SCENES.map((s, idx) => (
              <button key={s.label} className={idx === i ? 'on' : ''} onClick={() => setI(idx)} aria-label={s.label} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
