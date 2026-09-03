import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from '../../components/LienLangue';
import Metas from '../../components/Metas';
import FondHexagones from '../../components/FondHexagones';
import { CSS, propsRdv, GOODTIME } from './shared';

// Page de démarchage : envoyée en lien direct (mail, LinkedIn), jamais depuis
// le menu du site. Header réduit au strict minimum — logo + un seul bouton —
// et hors indexation (robots.txt), donc pas de canonical/hreflang ici.
const CL = (nom) => `https://res.cloudinary.com/dy9gp5pim/image/upload/f_auto,q_auto/marketing/pourquoi/${nom}`;
const RICO_STUDIO = CL('rico-studio.webp');
const CAPTURES = [CL('capture-contenus.webp'), CL('capture-validation.webp'), CL('capture-planification.webp')];

const RAISONS = ['r1', 'r2', 'r3', 'r4', 'r5'];
const ETAPES = [
  ['e1', 'auto'], ['e2', 'auto'], ['e3', 'vous'], ['e4', 'auto'], ['e5', 'auto'], ['e6', 'auto'],
];

// Additions propres à cette page — mêmes tokens que shared.jsx (var(--card),
// var(--line), rayon 18px), rien de nouveau créé.
const PAGE_CSS = `
.lp .nav-cta .note{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--muted)}
.lp .nav-cta .note .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent)}
@media(max-width:640px){.lp .nav-cta .note{display:none}}
.lp nav .brand img{transition:transform 200ms var(--ease)}
@media(hover:hover) and (pointer:fine){.lp nav .brand:hover img{transform:scale(1.06) rotate(-4deg)}}

.lp .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;text-align:left}
.lp .hero-grid h1{margin:0;max-width:none;font-size:48px}
.lp .hero-grid .sub{margin:20px 0 0;max-width:480px}
.lp .hero-grid .cta-row{justify-content:flex-start;margin-top:32px}
.lp h1 .g{background:linear-gradient(100deg,#eef0ff 0%,#c7cbff 18%,#5B6CFF 42%,#8A6CFF 62%,#3AFFA3 100%);background-size:220% 220%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:gGlow 7s ease-in-out infinite}
@keyframes gGlow{0%,100%{background-position:0% 45%}50%{background-position:100% 55%}}
@media(prefers-reduced-motion:reduce){.lp h1 .g{animation:none}}
.lp .pill{box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 8px 20px -14px rgba(58,255,163,.5)}
.lp .hero-visual{position:relative;padding-bottom:34px}
.lp .hero-visual::before{content:"";position:absolute;inset:-30px -30px 4px;background:radial-gradient(circle at 28% 22%,rgba(138,108,255,.32),transparent 62%);filter:blur(8px);z-index:0}
.lp .hero-img{position:relative;z-index:1;border-radius:20px;border:1px solid var(--line2);width:100%;display:block;box-shadow:0 40px 90px -40px rgba(91,108,255,.55);transition:transform 420ms var(--ease),box-shadow 420ms var(--ease)}
@media(hover:hover) and (pointer:fine){.lp .hero-visual:hover .hero-img{transform:translateY(-4px);box-shadow:0 50px 100px -35px rgba(91,108,255,.65)}}
@media(max-width:860px){.lp .hero-grid{grid-template-columns:1fr;text-align:center}.lp .hero-grid .cta-row{justify-content:center}.lp .hero-grid .sub{margin-left:auto;margin-right:auto}}

.lp .phrases{margin-top:44px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.lp .phrases p{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 14px 14px 0;padding:18px 20px;font-size:16px;font-weight:600;letter-spacing:-.01em;line-height:1.35}
.lp .apres{margin-top:28px;max-width:640px;color:var(--muted);font-size:15.5px;line-height:1.7}
.lp .apres strong{color:var(--ink);font-weight:700}

.lp .ordre{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.lp .temps{background:var(--card);padding:28px 26px;transition:background 200ms var(--ease)}
.lp .temps.apres-coup{background:var(--panel)}
.lp .temps .rang{font-size:12px;font-weight:700;color:#8A6CFF;letter-spacing:.08em;text-transform:uppercase}
.lp .temps.apres-coup .rang{color:var(--accent)}
.lp .temps h3{font-family:Sora;font-weight:700;font-size:17px;margin-top:8px}
.lp .temps p{margin-top:10px;color:var(--muted);font-size:14.5px;line-height:1.65}
.lp .sortie{margin-top:24px;color:var(--muted);font-size:15px;line-height:1.7;max-width:640px}
@media(hover:hover) and (pointer:fine){.lp .temps:hover{background:#111c30}}

.lp .raisons{margin-top:44px;display:flex;flex-direction:column}
.lp .raison{display:grid;grid-template-columns:auto 1fr;gap:18px;padding:22px 4px;border-top:1px solid var(--line)}
.lp .raison:last-of-type{border-bottom:1px solid var(--line)}
.lp .puce{width:9px;height:9px;margin-top:7px;border-radius:50%;background:var(--accent);flex:none;box-shadow:0 0 0 4px rgba(58,255,163,.14);transition:box-shadow 200ms var(--ease)}
.lp .raison h3{font-family:Sora;font-weight:700;font-size:16.5px}
.lp .raison p{margin-top:7px;color:var(--muted);font-size:14.5px;line-height:1.7;max-width:680px}
@media(hover:hover) and (pointer:fine){.lp .raison:hover .puce{box-shadow:0 0 0 5px rgba(58,255,163,.2)}}

.lp .compte{margin-top:32px;border:1px solid var(--line);border-left:3px solid #8A6CFF;border-radius:14px;background:linear-gradient(135deg,rgba(91,108,255,.07),var(--card));padding:22px 24px}
.lp .compte p{max-width:640px;color:var(--muted);font-size:15px;line-height:1.7}
.lp .compte p+p{margin-top:10px}
.lp .compte strong{color:var(--ink);font-weight:700}

.lp .bande{border:1px solid var(--line2);border-radius:20px;background:linear-gradient(135deg,rgba(91,108,255,.15),rgba(58,255,163,.06));padding:36px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
.lp .bande h3{font-family:Sora;font-weight:700;font-size:22px;letter-spacing:-.02em;max-width:24ch}
.lp .bande .cta-row{margin-top:0;flex-direction:column;align-items:flex-start;gap:8px}

.lp .fstep.cle{background:linear-gradient(160deg,rgba(58,255,163,.08),var(--card));border-color:rgba(58,255,163,.25)}
.lp .fstep{transition:transform 220ms var(--ease),border-color 220ms var(--ease)}
.lp .tag{display:inline-block;margin-top:2px;font-size:12px;font-weight:600;padding:4px 11px;border-radius:99px}
.lp .tag.auto{color:#8A6CFF;border:1px solid rgba(138,108,255,.35);background:rgba(138,108,255,.1)}
.lp .tag.vous{color:var(--accent);border:1px solid rgba(58,255,163,.4);background:rgba(58,255,163,.12)}

.lp .capture{margin-top:26px;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--card);box-shadow:0 30px 60px -35px rgba(0,0,0,.7);transition:transform 220ms var(--ease),border-color 220ms var(--ease)}
.lp .capture img{width:100%;display:block;transition:transform 320ms var(--ease)}
.lp .capture figcaption{padding:16px 20px;border-top:1px solid var(--line);font-size:14px;color:var(--muted);line-height:1.55}
@media(hover:hover) and (pointer:fine){.lp .fcard:hover,.lp .fstep:hover,.lp .capture:hover{transform:translateY(-3px);border-color:var(--line2)}.lp .capture:hover img{transform:scale(1.015)}}

.lp .studio-zone{display:grid;grid-template-columns:1.05fr .95fr;gap:44px;align-items:center}
.lp .studio-zone .lead{text-align:left;margin-left:0}
.lp .studio-zone .eyebrow,.lp .studio-zone .h2{text-align:left}
.lp .studio-img{border-radius:20px;border:1px solid var(--line2);width:100%;display:block;box-shadow:0 30px 70px -35px rgba(58,255,163,.35)}
.lp .final .promesse{margin-top:18px;color:var(--dim);font-size:13.5px;max-width:480px;margin-left:auto;margin-right:auto}
@media(max-width:860px){.lp .studio-zone{grid-template-columns:1fr}.lp .studio-zone .lead,.lp .studio-zone .eyebrow,.lp .studio-zone .h2{text-align:center}}
@media(max-width:760px){.lp .phrases,.lp .ordre{grid-template-columns:1fr}}
`;

export default function Pourquoi() {
  const { t } = useTranslation();

  // Reveal au scroll — même mécanique que MarketingLayout, appliquée ici
  // puisque cette page ne passe pas par ce layout.
  useEffect(() => {
    const root = document.querySelector('.lp');
    if (!root) return undefined;
    root.classList.add('anim');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '-40px' });
    document.querySelectorAll('.lp section .wrap > *:not(.in)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) el.classList.add('in');
      else io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp">
      <style>{CSS}</style>
      <style>{PAGE_CSS}</style>
      <Metas
        titre={t('pourquoi.meta.titre')}
        description={t('pourquoi.meta.description')}
        image={RICO_STUDIO}
      />
      <FondHexagones />

      <nav><div className="wrap">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="Postorico" />
          <div><b>{t('pourquoi.entete.nom')}</b><small>{t('pourquoi.entete.sousTitre')}</small></div>
        </Link>
        <div className="nav-cta">
          <span className="note"><span className="dot" />{t('pourquoi.cta.sansEngagement')}</span>
          <a className="btn btn-grad sm" {...propsRdv()}>{t('pourquoi.cta.reserver')} →</a>
        </div>
      </div></nav>

      <div className="pagebody">

        <section className="hero"><div className="wrap">
          <div className="hero-grid">
            <div>
              <div className="pill"><span className="dot" />{t('pourquoi.hero.oeil')}</div>
              <h1>{t('pourquoi.hero.h1Debut')}<span className="g">{t('pourquoi.hero.h1Lueur')}</span></h1>
              <p className="sub">{t('pourquoi.hero.chapeau')}</p>
              <div className="cta-row">
                <a className="btn btn-grad" {...propsRdv()}>{t('pourquoi.cta.reserver')} →</a>
                <span className="note">{t('pourquoi.cta.sansEngagement20')}</span>
              </div>
            </div>
            <div className="hero-visual">
              <img className="hero-img" src={RICO_STUDIO} alt="Studio Postorico" />
            </div>
          </div>
        </div></section>

        <section className="alt"><div className="wrap">
          <div className="eyebrow">{t('pourquoi.dit.eyebrow')}</div>
          <div className="h2">{t('pourquoi.dit.titre')}</div>
          <div className="phrases">
            <p>{t('pourquoi.dit.phrase1')}</p>
            <p>{t('pourquoi.dit.phrase2')}</p>
            <p>{t('pourquoi.dit.phrase3')}</p>
          </div>
          <p className="apres">{t('pourquoi.dit.apresAvant')}<strong>{t('pourquoi.dit.apresFort')}</strong></p>
        </div></section>

        <section><div className="wrap">
          <div className="eyebrow">{t('pourquoi.ordre.eyebrow')}</div>
          <div className="h2">{t('pourquoi.ordre.titre')}</div>
          <p className="lead">{t('pourquoi.ordre.intro')}</p>
          <div className="ordre">
            <div className="temps">
              <span className="rang">{t('pourquoi.ordre.etape1.rang')}</span>
              <h3>{t('pourquoi.ordre.etape1.titre')}</h3>
              <p>{t('pourquoi.ordre.etape1.texte')}</p>
            </div>
            <div className="temps apres-coup">
              <span className="rang">{t('pourquoi.ordre.etape2.rang')}</span>
              <h3>{t('pourquoi.ordre.etape2.titre')}</h3>
              <p>{t('pourquoi.ordre.etape2.texte')}</p>
            </div>
          </div>
          <p className="sortie">{t('pourquoi.ordre.sortie')}</p>
        </div></section>

        <section className="alt"><div className="wrap">
          <div className="eyebrow">{t('pourquoi.raisons.eyebrow')}</div>
          <div className="h2">{t('pourquoi.raisons.titre')}</div>
          <p className="lead">{t('pourquoi.raisons.intro')}</p>
          <div className="raisons">
            {RAISONS.map((r) => (
              <div className="raison" key={r}>
                <span className="puce" />
                <div>
                  <h3>{t(`pourquoi.raisons.${r}.titre`)}</h3>
                  <p>{t(`pourquoi.raisons.${r}.texte`)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="compte">
            <p><strong>{t('pourquoi.raisons.compteFort')}</strong>{t('pourquoi.raisons.compteTexte')}</p>
          </div>
        </div></section>

        <section style={{ paddingTop: 0 }}><div className="wrap">
          <div className="bande">
            <h3>{t('pourquoi.bande.titre')}</h3>
            <div className="cta-row">
              <a className="btn btn-grad" {...propsRdv()}>{t('pourquoi.cta.reserver')} →</a>
              <span className="note">{t('pourquoi.cta.sansEngagement')}</span>
            </div>
          </div>
        </div></section>

        <section><div className="wrap">
          <div className="eyebrow">{t('pourquoi.etapes.eyebrow')}</div>
          <div className="h2">{t('pourquoi.etapes.titre')}</div>
          <p className="lead">{t('pourquoi.etapes.intro')}</p>
          <div className="flow">
            {ETAPES.map(([e, type], i) => (
              <div className={`fstep${type === 'vous' ? ' cle' : ''}`} key={e}>
                <div className="n">{i + 1}</div>
                <h3>{t(`pourquoi.etapes.${e}.titre`)}</h3>
                <p>{t(`pourquoi.etapes.${e}.texte`)}</p>
                <span className={`tag ${type}`}>{t(`pourquoi.etapes.${e}.tag`)}</span>
              </div>
            ))}
          </div>
          <p className="sortie">{t('pourquoi.etapes.sortie')}</p>
        </div></section>

        <section className="alt"><div className="wrap">
          <div className="eyebrow">{t('pourquoi.captures.eyebrow')}</div>
          <div className="h2">{t('pourquoi.captures.titre')}</div>
          <p className="lead">{t('pourquoi.captures.intro')}</p>
          {CAPTURES.map((src, i) => (
            <figure className="capture" key={src}>
              <img src={src} alt="" />
              <figcaption>{t(`pourquoi.captures.c${i + 1}`)}</figcaption>
            </figure>
          ))}
        </div></section>

        <section><div className="wrap">
          <div className="eyebrow">{t('pourquoi.iaRaisons.eyebrow')}</div>
          <div className="h2">{t('pourquoi.iaRaisons.titre')}</div>
          <p className="lead">{t('pourquoi.iaRaisons.intro')}</p>
          <div className="features">
            <div className="fcard"><h3>{t('pourquoi.iaRaisons.r1.titre')}</h3><p>{t('pourquoi.iaRaisons.r1.texte')}</p></div>
            <div className="fcard"><h3>{t('pourquoi.iaRaisons.r2.titre')}</h3><p>{t('pourquoi.iaRaisons.r2.texte')}</p></div>
            <div className="fcard"><h3>{t('pourquoi.iaRaisons.r3.titre')}</h3><p>{t('pourquoi.iaRaisons.r3.texte')}</p></div>
          </div>
          <div className="compte">
            <p><strong>{t('pourquoi.iaRaisons.compte1Fort')}</strong>{t('pourquoi.iaRaisons.compte1Texte')}</p>
            <p><strong>{t('pourquoi.iaRaisons.compte2Fort')}</strong>{t('pourquoi.iaRaisons.compte2Texte')}</p>
            <p><strong>{t('pourquoi.iaRaisons.compte3Fort')}</strong>{t('pourquoi.iaRaisons.compte3Texte')}</p>
          </div>
        </div></section>

        <section className="alt"><div className="wrap">
          <div className="studio-zone">
            <div>
              <div className="eyebrow">{t('pourquoi.studio.eyebrow')}</div>
              <div className="h2">{t('pourquoi.studio.titre')}</div>
              <p className="lead">{t('pourquoi.studio.intro')}</p>
            </div>
            <img className="studio-img" src={RICO_STUDIO} alt="Le studio Postorico" />
          </div>
        </div></section>

        <section><div className="wrap final">
          <div className="eyebrow">{t('pourquoi.final.eyebrow')}</div>
          <div className="h2">{t('pourquoi.final.titre')}</div>
          <p className="lead">{t('pourquoi.final.intro')}</p>
          <div className="cta-row" style={{ marginTop: 32 }}>
            <a className="btn btn-grad" {...propsRdv()}>{t('pourquoi.cta.reserver')} →</a>
          </div>
          <p className="promesse">{t('pourquoi.final.promesse')}</p>
        </div></section>

      </div>

      <footer><div className="wrap">
        <div className="brand">
          <img src="/logo.png" alt="" style={{ width: 30, height: 30 }} />
          <div><b>Postorico</b><small>Un produit <a href={GOODTIME.url} target="_blank" rel="noopener noreferrer">{GOODTIME.name} ↗</a> · © 2026</small></div>
        </div>
        <div className="flinks">
          <Link to="/cgu">CGU</Link>
          <Link to="/confidentialite">Confidentialité</Link>
        </div>
      </div></footer>
    </div>
  );
}
