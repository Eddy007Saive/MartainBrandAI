import { Link } from 'react-router-dom';
import { FEATURES, SectionHead } from './shared';

export default function Features() {
  return (
    <section><div className="wrap">
      <SectionHead eyebrow="Tout-en-un" title="Un studio complet pour ta marque" lead="De l'idée à la publication, sans changer d'outil." />
      <div className="features">
        {FEATURES.map(([t, d]) => (
          <div className="fcard" key={t}>
            <div className="fi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="2"><path d="M12 3l1.9 5.8L20 10l-5.1 3.7L16 20l-4-3.6L8 20l1.1-6.3L4 10l6.1-1.2z" /></svg></div>
            <h3>{t}</h3><p>{d}</p>
          </div>
        ))}
      </div>
      <div className="cta-row center" style={{ marginTop: 48 }}>
        <Link className="btn btn-grad" to="/register">Essayer gratuitement →</Link>
      </div>
    </div></section>
  );
}
