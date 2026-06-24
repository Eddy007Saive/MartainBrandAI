import { Link } from 'react-router-dom';
import { PLANS, Check, SectionHead } from './shared';

export default function Pricing() {
  return (
    <section><div className="wrap">
      <SectionHead eyebrow="Tarifs" title="Des offres simples" lead="Commence gratuitement, change d'offre quand tu veux." />
      <div className="pricing">
        {PLANS.map((p) => (
          <div className={'plan' + (p.popular ? ' pop' : '')} key={p.name}>
            {p.popular && <span className="pbadge">★ Populaire</span>}
            <div className="pname">{p.name}</div>
            <div className="price">{p.price}<small> /mois</small></div>
            <div className="pcred">{p.credits} crédits / mois</div>
            <ul>{p.feats.map((f) => <li key={f}><Check />{f}</li>)}</ul>
            <Link className={'btn ' + (p.popular ? 'btn-grad' : 'btn-soft') + ' pbtn'} to={p.to}>{p.cta}</Link>
          </div>
        ))}
      </div>
    </div></section>
  );
}
