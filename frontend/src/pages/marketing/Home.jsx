import { Link } from 'react-router-dom';
import { APK_URL } from '../../lib/appDownload';
import HeroPreview from './HeroPreview';

export default function Home() {
  return (
    <>
      <header className="hero"><div className="wrap">
        <span className="pill"><span className="dot" />Propulsé par l'IA · 5 réseaux</span>
        <h1>Ta présence sur les réseaux,<br /><span className="g">pilotée par l'IA.</span></h1>
        <p className="sub">Génère, valide et programme tes posts LinkedIn, Instagram, Facebook, TikTok &amp; YouTube — depuis un seul studio. Ta marque, ta voix, en pilote automatique.</p>
        <div className="cta-row">
          <Link className="btn btn-grad" to="/register">Créer mon compte →</Link>
          <a className="btn btn-ghost" href={APK_URL}>↓ Télécharger l'app Android</a>
        </div>
        <div className="note">Gratuit pour démarrer · Sans carte bancaire</div>

        <HeroPreview />
      </div></header>

      <section><div className="wrap">
        <div className="ctaband">
          <h2>Prêt à reprendre le contrôle de ta présence ?</h2>
          <p>Crée ton compte en 2 minutes, ou installe l'app pour piloter depuis ton téléphone.</p>
          <div className="cta-row center">
            <Link className="btn btn-grad" to="/register">Créer mon compte</Link>
            <a className="btn btn-ghost" href={APK_URL}>↓ Télécharger l'app Android</a>
          </div>
        </div>
      </div></section>
    </>
  );
}
