import Link from '../../components/LienLangue';
import { Trans, useTranslation } from 'react-i18next';

import { Check, SectionHead, propsRdv } from './shared';

/**
 * Page Tarifs.
 *
 * L'abonnement est l'offre : il se suffit, avec 14 jours d'essai. Le Pack
 * Fondations est présenté comme un accélérateur optionnel — c'est un
 * changement de discours par rapport à l'ancienne page, où il était le
 * passage obligé. Les questions 5 à 7 de la FAQ générale ont été réalignées
 * dans le même mouvement, sinon le site se contredisait d'une page à l'autre.
 */
const SOUS_FEAT = ['1', '2', '3', '4', '5', '6'];
const PACK_FEAT = ['1', '2', '3', '4', '5', '6'];
const MULTI_FEAT = ['1', '2', '3', '4', '5'];
const COMPARE = ['start', 'brand', 'tpl', 'who', 'price'];
const QUESTIONS = ['1', '2', '3', '4', '5', '6'];

export default function Pricing() {
  const { t } = useTranslation();

  return (
    <>
      {/* 1. L'offre : l'abonnement d'abord, le pack à côté et clairement optionnel */}
      <section><div className="wrap">
        <SectionHead eyebrow={t('lp.pricing.head.eyebrow')} title={t('lp.pricing.head.title')}
          lead={t('lp.pricing.head.lead')} />

        <div className="duo">
          <div className="plan pop">
            <span className="pbadge">{t('lp.pricing.badge.allIn')}</span>
            <div className="pname">{t('lp.pricing.sub.name')}</div>
            <p className="pdesc">{t('lp.pricing.sub.desc')}</p>
            <div className="price">279 €<small> {t('lp.pricing.perMonthAll')}</small></div>
            <ul>{SOUS_FEAT.map((n) => <li key={n}><Check />{t(`lp.pricing.sub.feat.${n}`)}</li>)}</ul>
            <Link className="btn btn-grad pbtn" to="/register" data-testid="tarifs-essai">
              {t('lp.pricing.sub.cta')}
            </Link>
            <a className="btn btn-soft pbtn" {...propsRdv()} data-testid="tarifs-demo">
              {t('lp.pricing.sub.cta2')}
            </a>
            <p className="note">{t('lp.pricing.sub.note')}</p>
          </div>

          <div className="plan">
            <div className="pname">{t('lp.pricing.pack.name')}</div>
            <p className="pdesc">{t('lp.pricing.pack.desc')}</p>
            <div className="price">1 499 €<small> {t('lp.pricing.oneTime')}</small></div>
            <ul>{PACK_FEAT.map((n) => <li key={n}><Check />{t(`lp.pricing.pack.feat.${n}`)}</li>)}</ul>
            <a className="btn btn-soft pbtn" {...propsRdv()} data-testid="tarifs-pack">
              {t('lp.pricing.pack.cta')}
            </a>
            <p className="note">{t('lp.pricing.pack.note')}</p>
          </div>
        </div>
      </div></section>

      {/* 2. Le paramétrage : ce qui sépare un contenu générique d'un contenu à sa voix */}
      <section className="alt"><div className="wrap">
        <SectionHead eyebrow={t('lp.pricing.transition.eyebrow')} title={t('lp.pricing.transition.title')}
          lead={t('lp.pricing.transition.lead')} />
        <div className="keynote">
          <span className="eyebrow">{t('lp.pricing.keynote.eyebrow')}</span>
          <h3>{t('lp.pricing.keynote.title')}</h3>
          {['p1', 'p2', 'p3'].map((p) => (
            <p key={p}><Trans i18nKey={`lp.pricing.keynote.${p}`} components={{ b: <b /> }} /></p>
          ))}
        </div>
      </div></section>

      {/* 3. Le tableau : répondre franchement à « et si je ne prends pas le pack ? » */}
      <section><div className="wrap">
        <SectionHead title={t('lp.pricing.compare.title')} lead={t('lp.pricing.compare.lead')} />
        <div className="tblwrap">
          <table className="tcompare">
            <thead>
              <tr>
                <th />
                <th>{t('lp.pricing.compare.colA')}</th>
                <th className="hi">{t('lp.pricing.compare.colB')}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r}>
                  <td>{t(`lp.pricing.compare.row.${r}.l`)}</td>
                  <td><b>{t(`lp.pricing.compare.row.${r}.a`)}</b></td>
                  <td className="hi"><b>{t(`lp.pricing.compare.row.${r}.b`)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div></section>

      {/* 4. Multicompte */}
      <section className="alt"><div className="wrap">
        <SectionHead eyebrow={t('lp.pricing.multi.eyebrow')} title={t('lp.pricing.multi.title')}
          lead={t('lp.pricing.multi.lead')} />
        <div className="plan mc">
          <div className="pname">{t('lp.pricing.multi.name')}</div>
          <div className="price">{t('lp.pricing.multi.price')}</div>
          <div className="pcred">{t('lp.pricing.multi.tarif')}</div>
          <p className="pdesc">{t('lp.pricing.multi.desc')}</p>
          <ul>{MULTI_FEAT.map((n) => <li key={n}><Check />{t(`lp.pricing.multi.feat.${n}`)}</li>)}</ul>
          <a className="btn btn-grad pbtn" {...propsRdv()} data-testid="tarifs-devis">
            {t('lp.pricing.multi.cta')}
          </a>
        </div>
      </div></section>

      {/* 5. Les six questions qui reviennent au moment de payer. Les treize de
             la page FAQ restent la référence ; ici on répond sur place plutôt
             que d'envoyer quelqu'un ailleurs au moment de décider. */}
      <section><div className="wrap">
        <SectionHead title={t('lp.pricing.faq.title')} />
        <div className="acc">
          {QUESTIONS.map((n) => (
            <details key={n}>
              <summary>{t(`lp.pricing.faq.q.${n}.q`)}</summary>
              <p>{t(`lp.pricing.faq.q.${n}.a`)}</p>
            </details>
          ))}
        </div>
      </div></section>

      {/* 6. La sortie. La lettre de Rico suit : MarketingLayout la pose sur
             toutes les pages du site, il n'y a rien a ajouter ici. */}
      <section className="alt"><div className="wrap final">
        <h2>{t('lp.pricing.final.title')}</h2>
        <p>{t('lp.pricing.final.lead')}</p>
        <div className="finalbtns">
          <Link className="btn btn-grad" to="/register">{t('lp.pricing.sub.cta')}</Link>
          <a className="btn btn-soft" {...propsRdv()}>{t('lp.pricing.sub.cta2')}</a>
        </div>
      </div></section>
    </>
  );
}
