import { Link } from 'react-router-dom';
import { NET, NetIcon, STEPS, SectionHead } from './shared';

export default function HowItWorks() {
  return (
    <section><div className="wrap">
      <SectionHead eyebrow="Comment ça marche" title="3 étapes, c'est tout" />
      <div className="steps">
        {STEPS.map(([t, d], i) => (<div className="step" key={t}><div className="n">{i + 1}</div><h3>{t}</h3><p>{d}</p></div>))}
      </div>
      <div className="nets">
        {Object.keys(NET).map((n) => (
          <div className="nx" key={n}><span className="b" style={{ background: NET[n].bg, border: NET[n].border }}><NetIcon id={n} size={n === 'tiktok' ? 15 : 17} /></span>{n[0].toUpperCase() + n.slice(1)}</div>
        ))}
      </div>
      <div className="cta-row center" style={{ marginTop: 48 }}>
        <Link className="btn btn-grad" to="/register">Créer mon compte →</Link>
      </div>
    </div></section>
  );
}
