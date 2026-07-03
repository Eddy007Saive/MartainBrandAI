import { Link } from 'react-router-dom';
import { PLANS, Check, SectionHead, BOOKING_URL } from './shared';

// ⚠️ Prix de setup = PLACEHOLDERS à valider (cf. brief §3). Ajuste ici.
const SETUP = [
  {
    name: 'Setup Essentiel',
    price: '490 €',
    desc: 'Pour démarrer propre, et vite.',
    feats: [
      'Étude de marque condensée',
      'Calibrage de l’IA sur ton ton',
      'Mise en place de tes réseaux',
      'Premier calendrier éditorial',
    ],
  },
  {
    name: 'Setup Sur-mesure',
    price: '1 290 €',
    popular: true,
    desc: 'Ton système marketing complet, clé en main.',
    feats: [
      'Audit complet (positionnement, offres, concurrents, cibles)',
      'Construction de ta ligne éditoriale',
      'Propositions de posts + concepts vidéo à ton image',
      'Calibrage avancé de l’IA sur ta voix',
      'Tout le Setup Essentiel inclus',
    ],
  },
];

export default function Pricing() {
  return (
    <>
      {/* 1. Le setup (paiement unique) */}
      <section><div className="wrap">
        <SectionHead eyebrow="On installe pour toi" title="D'abord, on construit ton système" lead="Un accompagnement unique : nos experts étudient ta marque et bâtissent ton studio sur-mesure. Tu n'as plus qu'à piloter." />
        <div className="pricing" style={{ maxWidth: 760, margin: '52px auto 0' }}>
          {SETUP.map((p) => (
            <div className={'plan' + (p.popular ? ' pop' : '')} key={p.name}>
              {p.popular && <span className="pbadge">★ Recommandé</span>}
              <div className="pname">{p.name}</div>
              <div className="price">{p.price}</div>
              <div className="pcred">Paiement unique</div>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '6px 0 4px' }}>{p.desc}</p>
              <ul>{p.feats.map((f) => <li key={f}><Check />{f}</li>)}</ul>
              <a className={'btn ' + (p.popular ? 'btn-grad' : 'btn-soft') + ' pbtn'} href={BOOKING_URL}>Réserve ton call →</a>
            </div>
          ))}
        </div>
        <p className="note" style={{ textAlign: 'center', marginTop: 18 }}>Échange gratuit · On étudie ta boîte avant de proposer quoi que ce soit.</p>
      </div></section>

      {/* 2. L'abonnement (le run mensuel) */}
      <section className="alt"><div className="wrap">
        <SectionHead eyebrow="Puis tu pilotes" title="L'abonnement mensuel" lead="Une fois le système en place : génération illimitée, planification multi-réseaux, validation et stats. Sans engagement, résiliable à tout moment." />
        <div className="pricing">
          {PLANS.map((p) => (
            <div className={'plan' + (p.popular ? ' pop' : '')} key={p.name}>
              {p.popular && <span className="pbadge">★ Populaire</span>}
              <div className="pname">{p.name}</div>
              <div className="price">{p.price}<small> /mois</small></div>
              <div className="pcred">{p.tag}</div>
              <ul>{p.feats.map((f) => <li key={f}><Check />{f}</li>)}</ul>
              <Link className={'btn ' + (p.popular ? 'btn-grad' : 'btn-soft') + ' pbtn'} to={p.to}>{p.cta}</Link>
            </div>
          ))}
        </div>
        <p className="note" style={{ textAlign: 'center', marginTop: 18 }}>Tu préfères démarrer seul ? L'offre Gratuite te laisse tester sans carte bancaire.</p>
      </div></section>

      {/* 3. vs Agence */}
      <section><div className="wrap">
        <div className="ctaband">
          <h2>Une agence te coûte 1 500–3 000 € <span style={{ color: 'var(--muted)', fontWeight: 600 }}>chaque mois.</span></h2>
          <p>Avec Presence OS : un setup une seule fois, puis un abonnement léger que tu pilotes en ~2 h par mois. La régularité d'une agence, sans la facture récurrente.</p>
          <div className="cta-row center">
            <a className="btn btn-grad" href={BOOKING_URL}>Réserve ton call de setup →</a>
            <Link className="btn btn-soft" to="/register">Créer mon compte</Link>
          </div>
        </div>
        <p className="note" style={{ textAlign: 'center', marginTop: 16 }}>Tarifs indicatifs, susceptibles d'évoluer.</p>
      </div></section>
    </>
  );
}
