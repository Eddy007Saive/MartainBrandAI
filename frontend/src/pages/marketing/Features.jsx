import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FEATURES, SectionHead } from './shared';

export default function Features() {
  const { t } = useTranslation();
  return (
    <section><div className="wrap">
      <SectionHead eyebrow={t('lp.feat.head.eyebrow')} title={t('lp.feat.head.title')} lead={t('lp.feat.head.lead')} />
      <div className="features">
        {FEATURES.map(([titleKey, descKey]) => (
          <div className="fcard" key={titleKey}>
            <div className="fi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="2"><path d="M12 3l1.9 5.8L20 10l-5.1 3.7L16 20l-4-3.6L8 20l1.1-6.3L4 10l6.1-1.2z" /></svg></div>
            <h3>{t(titleKey)}</h3><p>{t(descKey)}</p>
          </div>
        ))}
      </div>
      <div className="cta-row center" style={{ marginTop: 48 }}>
        <Link className="btn btn-grad" to="/register">{t('lp.feat.cta')}</Link>
      </div>
    </div></section>
  );
}
