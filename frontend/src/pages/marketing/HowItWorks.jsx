import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NET, NetIcon, Check, SectionHead } from './shared';

// Clés de traduction uniquement (résolues avec t() au rendu).
const FLOW = [
  {
    t: 'lp.steps.flow.1.t',
    p: 'lp.steps.flow.1.p',
    li: ['lp.steps.flow.1.li.1', 'lp.steps.flow.1.li.2', 'lp.steps.flow.1.li.3', 'lp.steps.flow.1.li.4'],
  },
  {
    t: 'lp.steps.flow.2.t',
    p: 'lp.steps.flow.2.p',
    li: ['lp.steps.flow.2.li.1', 'lp.steps.flow.2.li.2', 'lp.steps.flow.2.li.3', 'lp.steps.flow.2.li.4'],
  },
  {
    t: 'lp.steps.flow.3.t',
    p: 'lp.steps.flow.3.p',
    li: ['lp.steps.flow.3.li.1', 'lp.steps.flow.3.li.2', 'lp.steps.flow.3.li.3', 'lp.steps.flow.3.li.4'],
  },
];

const CREATES = [
  ['lp.steps.creates.1.t', 'lp.steps.creates.1.d'],
  ['lp.steps.creates.2.t', 'lp.steps.creates.2.d'],
  ['lp.steps.creates.3.t', 'lp.steps.creates.3.d'],
  ['lp.steps.creates.4.t', 'lp.steps.creates.4.d'],
  ['lp.steps.creates.5.t', 'lp.steps.creates.5.d'],
  ['lp.steps.creates.6.t', 'lp.steps.creates.6.d'],
];

export default function HowItWorks() {
  const { t } = useTranslation();
  return (
    <>
      <section><div className="wrap">
        <SectionHead eyebrow={t('lp.steps.head.eyebrow')} title={t('lp.steps.head.title')} lead={t('lp.steps.head.lead')} />
        <div className="flow">
          {FLOW.map((s, i) => (
            <div className="fstep" key={s.t}>
              <div className="n">{i + 1}</div>
              <h3>{t(s.t)}</h3>
              <p>{t(s.p)}</p>
              <ul>{s.li.map((x) => <li key={x}><Check />{t(x)}</li>)}</ul>
            </div>
          ))}
        </div>
        <div className="nets">
          {Object.keys(NET).map((n) => (
            <div className="nx" key={n}><span className="b" style={{ background: NET[n].bg, border: NET[n].border }}><NetIcon id={n} size={n === 'tiktok' ? 15 : 17} /></span>{n[0].toUpperCase() + n.slice(1)}</div>
          ))}
        </div>
      </div></section>

      <section className="alt"><div className="wrap">
        <SectionHead eyebrow={t('lp.steps.creates.head.eyebrow')} title={t('lp.steps.creates.head.title')} lead={t('lp.steps.creates.head.lead')} />
        <div className="features">
          {CREATES.map(([titleKey, descKey]) => (
            <div className="fcard" key={titleKey}>
              <div className="fi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="2"><path d="M12 3l1.9 5.8L20 10l-5.1 3.7L16 20l-4-3.6L8 20l1.1-6.3L4 10l6.1-1.2z" /></svg></div>
              <h3>{t(titleKey)}</h3><p>{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div></section>

      <section><div className="wrap">
        <SectionHead eyebrow={t('lp.steps.behind.head.eyebrow')} title={t('lp.steps.behind.head.title')} lead={t('lp.steps.behind.head.lead')} />
        <div className="flow">
          <div className="fstep"><h3>{t('lp.steps.behind.1.t')}</h3><p>{t('lp.steps.behind.1.p')}</p></div>
          <div className="fstep"><h3>{t('lp.steps.behind.2.t')}</h3><p>{t('lp.steps.behind.2.p')}</p></div>
          <div className="fstep"><h3>{t('lp.steps.behind.3.t')}</h3><p>{t('lp.steps.behind.3.p')}</p></div>
        </div>
        <div className="cta-row center" style={{ marginTop: 48 }}>
          <Link className="btn btn-grad" to="/register">{t('lp.steps.cta.start')}</Link>
          <Link className="btn btn-soft" to="/fonctionnalites">{t('lp.steps.cta.features')}</Link>
        </div>
      </div></section>
    </>
  );
}
