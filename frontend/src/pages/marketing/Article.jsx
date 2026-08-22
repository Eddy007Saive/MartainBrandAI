import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Link from '../../components/LienLangue';
import Metas from '../../components/Metas';
import NotFound from '../NotFound';
import {
  aLireAussi, articleParChemin, dateLisible, languesDe, cheminDe,
  ouverture, vignette,
} from '../../lib/blog';
import { cheminPourLangue, langueDuChemin } from '../../lib/langues';
import './blog.css';

const SITE = 'https://postorico.com';

/**
 * La page d'un article.
 *
 * Le corps du texte est du HTML compilé au build depuis le Markdown : il est
 * donc présent dans la page prérendue, ce qui est toute la raison d'être de
 * cette architecture. Un blog rendu par une requête au chargement serait
 * invisible pour les robots qui n'exécutent pas JavaScript — soit exactement
 * ceux qu'on cherche à toucher.
 *
 * Une adresse inconnue rend la page introuvable plutôt qu'un écran vide : un
 * slug d'article se partage, se recopie de travers, et se périme.
 */
export default function Article() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const langue = langueDuChemin(pathname);
  const article = articleParChemin(pathname);

  const alternatives = useMemo(() => (article
    ? languesDe(article.id).map((l) => ({ langue: l, chemin: cheminDe(article.id, l) }))
    : []), [article]);

  // Deux blocs de données structurées : l'article lui-même, et le fil
  // d'Ariane. Le second est ce qui fait apparaître « Postorico › Blog › … »
  // sous le lien dans les résultats, au lieu de l'adresse brute.
  const schema = useMemo(() => (article ? [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.titre,
      description: article.description,
      datePublished: article.date,
      dateModified: article.maj,
      wordCount: article.mots,
      inLanguage: article.langue,
      keywords: article.tags.join(', '),
      image: ouverture(article),
      author: { '@type': 'Organization', name: article.auteur, url: SITE },
      publisher: {
        '@type': 'Organization',
        name: 'Postorico',
        logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': SITE + article.chemin },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Postorico', item: SITE + cheminPourLangue('/', langue) },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + cheminPourLangue('/blog', langue) },
        { '@type': 'ListItem', position: 3, name: article.titre },
      ],
    },
  ] : null), [article, langue]);

  if (!article) return <NotFound />;

  // Les liens internes du texte sont interceptés : sans cela, un lien écrit
  // dans le Markdown rechargerait toute l'application au lieu de naviguer.
  const auClicDansLeTexte = (e) => {
    const a = e.target.closest('a');
    if (!a || a.target === '_blank') return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/')) return;
    e.preventDefault();
    navigate(href);
  };

  const suite = aLireAussi(article);

  return (
    <>
      <Metas
        titre={`${article.titre} · Postorico`}
        description={article.description}
        image={ouverture(article)}
        type="article"
        canonique={article.chemin}
        alternatives={alternatives}
        schema={schema}
        langue={langue}
      />

      <section><div className="wrap">
        <article className="post">
          <nav className="fil" aria-label="fil d'Ariane">
            <Link to="/blog" data-testid="article-retour-blog">{t('lp.blog.head.title')}</Link>
            <span aria-hidden="true">/</span>
            <span>{t('lp.blog.minutes', { n: article.minutes })}</span>
          </nav>

          <h1>{article.titre}</h1>
          <p className="lede">{article.description}</p>

          <div className="signature">
            {/* Le logo, pas la mascotte : l'auteur est l'equipe, et une
                vignette ronde d'un personnage en pied ne montre qu'un aplat. */}
            <img src="/logo.png" alt="" aria-hidden="true" />
            <span>
              <b style={{ color: 'var(--ink)', display: 'block', fontSize: 13.5 }}>{article.auteur}</b>
              <time dateTime={article.date}>{dateLisible(article.date, langue)}</time>
              {article.maj !== article.date && (
                <> · {t('lp.blog.maj', { date: dateLisible(article.maj, langue) })}</>
              )}
            </span>
          </div>

          {/* Le bandeau vient APRES le chapeau et la signature : une image
              posee avant le titre repousse le texte sous la ligne de flottaison,
              et c'est le titre qui doit accueillir le lecteur, pas un decor. */}
          {article.image && (
            <img className="bhero" src={ouverture(article)} alt="" aria-hidden="true" />
          )}

          {article.sommaire.length >= 3 && (
            <nav className="toc" aria-label={t('lp.blog.sommaire')}>
              <b>{t('lp.blog.sommaire')}</b>
              <ol>
                {article.sommaire.map((h) => (
                  <li key={h.id}><a href={`#${h.id}`}>{h.texte}</a></li>
                ))}
              </ol>
            </nav>
          )}

          {/* Le HTML vient de nos propres fichiers Markdown, compilés au build :
              il n'y a pas d'entrée utilisateur ici, donc rien à assainir. */}
          <div className="prose" data-testid="article-corps" onClick={auClicDansLeTexte}
            dangerouslySetInnerHTML={{ __html: article.html }} />

          {article.tags.length > 0 && (
            <div className="btags">
              {article.tags.map((tag) => <span key={tag} className="btag">#{tag}</span>)}
            </div>
          )}

          <aside className="bfin">
            <h3>{t('lp.blog.cta.titre')}</h3>
            <p>{t('lp.blog.cta.texte')}</p>
            <Link className="btn btn-grad" to="/register" data-testid="article-essai">
              {t('lp.blog.cta.bouton')}
            </Link>
          </aside>

          {suite.length > 0 && (
            <>
              <h2 style={{ fontSize: 20, marginTop: 52, textAlign: 'left' }}>{t('lp.blog.suite')}</h2>
              <div className="bgrid" style={{ marginTop: 20 }}>
                {suite.map((a) => (
                  <Link key={a.id} to={a.chemin} className="bcard" data-testid={`blog-suite-${a.id}`}>
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
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </article>
      </div></section>
    </>
  );
}
