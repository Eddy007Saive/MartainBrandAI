import { Link } from 'react-router-dom';
import { APK_URL } from '../../lib/appDownload';
import HeroPreview from './HeroPreview';
import { SectionHead, GOODTIME } from './shared';

const STATS = [
  ['5', 'réseaux connectés'],
  ['< 30 s', 'pour générer un post'],
  ['100', 'crédits offerts au départ'],
  ['0 €', 'pour démarrer'],
];

const PAINS = [
  'Tu sais qu’il faut publier… mais tu n’as ni le temps ni les idées.',
  'Tu jongles entre 5 apps et 10 onglets pour gérer tes réseaux.',
  'Tu postes en rafale, puis plus rien pendant trois semaines.',
  'Tu ne sais pas vraiment ce qui fonctionne (ni pourquoi).',
];
const GAINS = [
  'L’IA génère des sujets et des posts calibrés sur ta marque.',
  'Tout au même endroit : génère, planifie, publie, réponds.',
  'Un calendrier qui te tient régulier, en pilote automatique.',
  'Tes vraies stats (impressions, engagement) sous les yeux.',
];

const ICONS = {
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  brief: 'M3 8h18v11H3zM8 8V6a2 2 0 012-2h4a2 2 0 012 2v2',
  cam: 'M3 8h3l2-2h8l2 2h3v11H3zM12 11a3 3 0 100 6 3 3 0 000-6z',
  build: 'M4 21V5a1 1 0 011-1h7v17M12 9h7a1 1 0 011 1v11M7 8h2M7 12h2M16 13h2M16 17h2',
};
const AUDIENCE = [
  ['user', 'Freelances & indépendants', 'Reste visible sans y passer tes soirées — la régularité, sans la charge mentale.'],
  ['brief', 'Coachs & consultants', 'Transforme ton expertise en posts qui attirent des clients qualifiés.'],
  ['cam', 'Créateurs de contenu', 'Décline une idée sur tous tes réseaux, sans tout réécrire à la main.'],
  ['build', 'PME & équipes', 'Une présence pro et régulière sur tes réseaux, sans passer par une agence.'],
];

const TESTIMONIALS = [
  ['A', 'Aurélie M.', 'Coach business', 'Je suis enfin régulière sur LinkedIn. En 15 min le dimanche, ma semaine est programmée.'],
  ['T', 'Thomas R.', 'Consultant indépendant', 'Les sujets générés sont étonnamment justes pour mon secteur. Un vrai gain de temps.'],
  ['L', 'Léa B.', 'Fondatrice de startup', 'Génération, planif et réponses aux commentaires au même endroit : je ne change plus d’outil.'],
];

const AudIcon = ({ d }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

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

      {/* Chiffres clés */}
      <section style={{ paddingTop: 0 }}><div className="wrap">
        <div className="statsband">
          {STATS.map(([v, l]) => (
            <div className="stat" key={l}><div className="sv">{v}</div><div className="sl">{l}</div></div>
          ))}
        </div>
      </div></section>

      {/* Problème -> Solution */}
      <section className="alt"><div className="wrap">
        <SectionHead eyebrow="Le constat" title="Être présent sur les réseaux, c'est épuisant" lead="Entre l'inspiration, la régularité et les outils éparpillés, on lâche vite. Presence OS change la donne." />
        <div className="ps">
          <div className="pscol bad">
            <h3>Sans Presence OS</h3>
            <ul>{PAINS.map((p) => <li key={p}><span className="mk">✗</span>{p}</li>)}</ul>
          </div>
          <div className="pscol good">
            <h3>Avec Presence OS</h3>
            <ul>{GAINS.map((g) => <li key={g}><span className="mk">✓</span>{g}</li>)}</ul>
          </div>
        </div>
      </div></section>

      {/* Pour qui */}
      <section><div className="wrap">
        <SectionHead eyebrow="Pour qui" title="Pensé pour celles et ceux qui n'ont pas le temps" lead="Quel que soit ton profil, Presence OS s'adapte à ta marque." />
        <div className="aud">
          {AUDIENCE.map(([ic, t, d]) => (
            <div className="acard" key={t}>
              <div className="ab"><AudIcon d={ICONS[ic]} /></div>
              <h3>{t}</h3><p>{d}</p>
            </div>
          ))}
        </div>
      </div></section>

      {/* Témoignages */}
      <section className="alt"><div className="wrap">
        <SectionHead eyebrow="Témoignages" title="Ils gagnent du temps chaque semaine" />
        <div className="testi">
          {TESTIMONIALS.map(([av, name, role, quote]) => (
            <div className="tcard" key={name}>
              <div className="stars">★★★★★</div>
              <p className="quote">« {quote} »</p>
              <div className="who"><span className="av">{av}</span><div><b>{name}</b><small>{role}</small></div></div>
            </div>
          ))}
        </div>
      </div></section>

      {/* Édité par GoodTime */}
      <section style={{ paddingTop: 0 }}><div className="wrap">
        <div className="gtband">
          <span className="gt-t">Presence OS est un produit <b>{GOODTIME.name}</b> — {GOODTIME.tagline}.</span>
          <a href={GOODTIME.url} target="_blank" rel="noopener noreferrer">Découvrir GoodTime ↗</a>
        </div>
      </div></section>

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
