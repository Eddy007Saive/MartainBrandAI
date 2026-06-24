import { Link } from 'react-router-dom';
import { FAQ, SectionHead } from './shared';

export default function Faq() {
  return (
    <section><div className="wrap">
      <SectionHead eyebrow="FAQ" title="Questions fréquentes" />
      <div className="faq">{FAQ.map(([q, a]) => (<div className="qa" key={q}><div className="q">{q}</div><div className="a">{a}</div></div>))}</div>
      <div className="cta-row center" style={{ marginTop: 44 }}>
        <Link className="btn btn-grad" to="/register">Démarrer gratuitement →</Link>
      </div>
    </div></section>
  );
}
