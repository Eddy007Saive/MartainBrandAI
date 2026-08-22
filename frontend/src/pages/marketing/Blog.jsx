import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Link from '../../components/LienLangue';
import Metas from '../../components/Metas';
import { SectionHead } from './shared';
import { articlesDe, dateLisible, vignette } from '../../lib/blog';
import { LANGUES, cheminPourLangue, langueDuChemin } from '../../lib/langues';
import './blog.css';

/**
 * L'index du blog.
 *
 * Sa raison d'être n'est pas décorative : c'est la page qui distribue
 * l'autorité vers les articles. Un article sans lien depuis une page indexée
 * n'est découvert que par le plan du site, et bien plus tard.
 */
const Fleche = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function Blog() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const langue = langueDuChemin(pathname);
  const articles = articlesDe(langue);

  // Mémorisé : ces objets sont des dépendances de l'effet qui pose les balises.
  // Recréés à chaque rendu, elles seraient retirées et reposées sans arrêt.
  const alternatives = useMemo(
    () => LANGUES.map((l) => ({ langue: l, chemin: cheminPourLangue('/blog', l) })),
    [],
  );
  const schema = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Blog Postorico',
    description: t('lp.blog.head.lead'),
    inLanguage: langue,
    url: `https://postorico.com${cheminPourLangue('/blog', langue)}`,
    blogPost: articles.map((a) => ({
      '@type': 'BlogPosting',
      headline: a.titre,
      datePublished: a.date,
      url: `https://postorico.com${a.chemin}`,
    })),
  }), [t, langue, articles]);

  return (
    <>
      <Metas
        titre={`${t('lp.blog.head.title')} · Postorico`}
        description={t('lp.blog.head.lead')}
        canonique={cheminPourLangue('/blog', langue)}
        alternatives={alternatives}
        schema={schema}
        langue={langue}
      />

      <section><div className="wrap">
        <SectionHead eyebrow={t('lp.blog.head.eyebrow')} title={t('lp.blog.head.title')}
          lead={t('lp.blog.head.lead')} />

        {articles.length === 0 ? (
          // Un blog vide dans une langue donnée n'est pas une erreur : c'est
          // l'état normal tant que les traductions n'ont pas été écrites. On
          // le dit, plutôt que d'afficher une grille vide.
          <p className="note" style={{ textAlign: 'center', marginTop: 34 }}>
            {t('lp.blog.vide')}
          </p>
        ) : (
          <div className="bgrid">
            {articles.map((a) => (
              <Link key={a.id} to={a.chemin} className="bcard" data-testid={`blog-carte-${a.id}`}>
                {/* Deux traitements : une illustration remplit le cadre,
                    une mascotte detouree se pose au sol. Le meme CSS pour les
                    deux donnerait un coq etire ou une image flottante. */}
                <div className={`bcover ${a.image ? 'illu' : 'mascotte'}`}>
                  <img src={vignette(a)} alt="" aria-hidden="true" loading="lazy" />
                </div>
                <div className="bbody">
                  <span className="bmeta">
                    <time dateTime={a.date}>{dateLisible(a.date, langue)}</time>
                    <span className="sep">·</span>
                    <span>{t('lp.blog.minutes', { n: a.minutes })}</span>
                  </span>
                  <h3>{a.titre}</h3>
                  <p>{a.description}</p>
                  <span className="bmore">{t('lp.blog.lire')} <Fleche /></span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div></section>
    </>
  );
}
