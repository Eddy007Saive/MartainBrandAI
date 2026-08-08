import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PLANS, Check, SectionHead, BOOKING_URL } from './shared';

// ⚠️ Prix de setup = PLACEHOLDERS à valider (cf. brief §3). Ajuste ici.
// Textes = clés de traduction (résolues avec t() au rendu).
const SETUP = [
  {
    id: 'essentiel',
    nameKey: 'lp.pricing.setup.plans.1.name',
    price: '490 €',
    descKey: 'lp.pricing.setup.plans.1.desc',
    featKeys: [
      'lp.pricing.setup.plans.1.feat.1',
      'lp.pricing.setup.plans.1.feat.2',
      'lp.pricing.setup.plans.1.feat.3',
      'lp.pricing.setup.plans.1.feat.4',
    ],
  },
  {
    id: 'surmesure',
    nameKey: 'lp.pricing.setup.plans.2.name',
    price: '1 290 €',
    popular: true,
    descKey: 'lp.pricing.setup.plans.2.desc',
    featKeys: [
      'lp.pricing.setup.plans.2.feat.1',
      'lp.pricing.setup.plans.2.feat.2',
      'lp.pricing.setup.plans.2.feat.3',
      'lp.pricing.setup.plans.2.feat.4',
      'lp.pricing.setup.plans.2.feat.5',
    ],
  },
];

const AGENCY_PRICE = '1 500–3 000 €';

export default function Pricing() {
  const { t } = useTranslation();
  return (
    <>
      {/* 1. Le setup (paiement unique) */}
      <section><div className="wrap">
        <SectionHead eyebrow={t('lp.pricing.setup.head.eyebrow')} title={t('lp.pricing.setup.head.title')} lead={t('lp.pricing.setup.head.lead')} />
        <div className="pricing" style={{ maxWidth: 760, margin: '52px auto 0' }}>
          {SETUP.map((p) => (
            <div className={'plan' + (p.popular ? ' pop' : '')} key={p.id}>
              {p.popular && <span className="pbadge">★ {t('lp.pricing.badge.recommended')}</span>}
              <div className="pname">{t(p.nameKey)}</div>
              <div className="price">{p.price}</div>
              <div className="pcred">{t('lp.pricing.oneTime')}</div>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '6px 0 4px' }}>{t(p.descKey)}</p>
              <ul>{p.featKeys.map((f) => <li key={f}><Check />{t(f)}</li>)}</ul>
              <a className={'btn ' + (p.popular ? 'btn-grad' : 'btn-soft') + ' pbtn'} href={BOOKING_URL}>{t('lp.pricing.setup.cta')}</a>
            </div>
          ))}
        </div>
        <p className="note" style={{ textAlign: 'center', marginTop: 18 }}>{t('lp.pricing.setup.note')}</p>
      </div></section>

      {/* 2. L'abonnement (le run mensuel) */}
      <section className="alt"><div className="wrap">
        <SectionHead eyebrow={t('lp.pricing.sub.head.eyebrow')} title={t('lp.pricing.sub.head.title')} lead={t('lp.pricing.sub.head.lead')} />
        <div className="pricing">
          {PLANS.map((p) => (
            <div className={'plan' + (p.popular ? ' pop' : '')} key={p.id}>
              {p.popular && <span className="pbadge">★ {t('lp.pricing.badge.popular')}</span>}
              <div className="pname">{t(p.nameKey)}</div>
              <div className="price">{p.price}<small> {t('lp.pricing.perMonth')}</small></div>
              <div className="pcred">{t(p.tagKey)}</div>
              <ul>{p.featKeys.map((f) => <li key={f}><Check />{t(f)}</li>)}</ul>
              <Link className={'btn ' + (p.popular ? 'btn-grad' : 'btn-soft') + ' pbtn'} to={p.to}>{t(p.ctaKey)}</Link>
            </div>
          ))}
        </div>
        <p className="note" style={{ textAlign: 'center', marginTop: 18 }}>{t('lp.pricing.sub.note')}</p>
      </div></section>

      {/* 3. vs Agence */}
      <section><div className="wrap">
        <div className="ctaband">
          <h2>{t('lp.pricing.agency.title', { price: AGENCY_PRICE })} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{t('lp.pricing.agency.titleAccent')}</span></h2>
          <p>{t('lp.pricing.agency.text')}</p>
          <div className="cta-row center">
            <a className="btn btn-grad" href={BOOKING_URL}>{t('lp.pricing.agency.ctaCall')}</a>
            <Link className="btn btn-soft" to="/register">{t('lp.pricing.agency.ctaSignup')}</Link>
          </div>
        </div>
        <p className="note" style={{ textAlign: 'center', marginTop: 16 }}>{t('lp.pricing.agency.note')}</p>
      </div></section>
    </>
  );
}
