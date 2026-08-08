import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FAQ, SectionHead } from './shared';

export default function Faq() {
  const { t } = useTranslation();
  return (
    <section><div className="wrap">
      <SectionHead eyebrow={t('lp.faq.head.eyebrow')} title={t('lp.faq.head.title')} />
      <div className="faq">{FAQ.map(([qKey, aKey]) => (<div className="qa" key={qKey}><div className="q">{t(qKey)}</div><div className="a">{t(aKey)}</div></div>))}</div>
      <div className="cta-row center" style={{ marginTop: 44 }}>
        <Link className="btn btn-grad" to="/register">{t('lp.faq.cta')}</Link>
      </div>
    </div></section>
  );
}
