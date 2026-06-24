import { Link } from 'react-router-dom';
import { APK_URL } from '../../lib/appDownload';
import HeroPreview from './HeroPreview';
import { SectionHead, GOODTIME, BOOKING_URL } from './shared';

const STATS = [
  ['5', 'réseaux connectés'],
  ['< 30 s', 'pour générer un post'],
  ['100', 'crédits offerts au départ'],
  ['0 €', 'pour démarrer'],
];

const PAINS = [
  'Tu sais qu’il faut publier… mais tu diriges une boîte, pas une rédaction.',
  'Soit tes réseaux sont morts, soit tu pries pour que ton stagiaire s’en sorte.',
  'Tu jongles entre 5 apps et 10 onglets, ou tu paies une agence en aveugle.',
  'Tu ne sais pas vraiment ce qui fonctionne (ni pourquoi).',
];
const GAINS = [
  'L’IA génère des sujets et des posts calibrés sur ta marque.',
  'Tu valides en un clic — rien ne se publie sans ton feu vert.',
  'Une fois validés, la programmation est automatique — la régularité sans y penser.',
  'Tes vraies stats sous les yeux — tu sais enfin ce qui marche.',
];

// Comparatif « Plutôt que… » — chaque option et ses attributs
const CRITERIA = ['Coût', 'Volume', 'Ta voix', 'Régularité', 'Contrôle', 'Mise en route'];
const OPTIONS = [
  { name: 'Ne rien faire', vals: ['0 € (réseaux morts)', 'Nul', '—', 'Nulle', '—', '—'] },
  { name: 'Un stagiaire / alternant', vals: ['Un salaire', 'Quelques posts', 'Il l’apprend (ou pas)', 'Variable', 'Tu relis tout', 'Recrutement + formation'] },
  { name: 'Une agence', vals: ['1 500–3 000 €/mois', 'Forfait limité (8-20/mois)', 'Standardisée', 'Bonne', 'Tu attends les retours', 'Onboarding de semaines'] },
  { name: 'Presence OS', win: true, vals: ['À partir de 0 €', 'Illimité, tous réseaux', 'Calibrée sur ta marque', 'Automatique', 'Tu valides en 1 clic', '2 minutes'] },
];

const ICONS = {
  clock: 'M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z',
  hands: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  building: 'M4 21V5a1 1 0 011-1h7v17M12 9h7a1 1 0 011 1v11M7 8h2M7 12h2M16 13h2M16 17h2',
};
// « Pour qui » par SITUATION (pas par secteur)
const AUDIENCE = [
  ['clock', '« Je n’ai pas le temps »', 'Tu fais tourner ta boîte, pas un studio de contenu. Presence OS prend le relais — tu gardes la main, sans y passer tes journées.'],
  ['hands', '« Je délègue… et je croise les doigts »', 'Fini le quitte ou double du stagiaire. L’IA produit dans ta voix, tu valides en un clic. Régulier, sur marque, à chaque fois.'],
  ['building', '« Je paie une agence »', 'Même régularité, sans forfait limité ni facture à 2 000 €. Publie autant que tu veux, sur tous tes réseaux. Tu reprends le contrôle.'],
];

const SETUP = [
  ['On étudie ta boîte', 'Positionnement, offres, cibles, ton de marque, concurrents. Un vrai audit, pas un formulaire.'],
  ['On construit ton système', 'Lignes éditoriales, angles, calendrier, calibrage de l’IA sur ta voix — et des propositions concrètes de posts et formats vidéo à ton image.'],
  ['Tu pilotes — en ~2 h/mois', 'Le système est prêt : tu génères tes sujets, tu valides, tu produis tes visuels et vidéos, tu programmes. C’est ton contenu, ta voix, tes validations — rien ne sort sans toi.'],
];

// TODO Martin : remplacer par de VRAIS témoignages (dirigeants : nom complet + entreprise + photo).
const TESTIMONIALS = [
  ['A', 'Aurélie M.', 'Gérante, cabinet de conseil', 'Avant je payais une agence 2 000 €/mois. Là je gère ça moi-même en quelques minutes, et c’est plus à mon image.'],
  ['T', 'Thomas R.', 'Dirigeant PME', 'Le setup a tout changé : le système est calibré sur ma voix, je n’ai plus qu’à valider. Un gain de temps énorme.'],
  ['L', 'Léa B.', 'Fondatrice de startup', 'Génération, planif et réponses aux commentaires au même endroit. Je ne jongle plus entre dix outils.'],
];

const AudIcon = ({ d }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

export default function Home() {
  return (
    <>
      <header className="hero"><div className="wrap">
        <span className="pill"><span className="dot" />Installé par des experts · Piloté par toi</span>
        <h1>On installe ton système marketing.<br /><span className="g">Tu le pilotes en 2 h par mois.</span></h1>
        <p className="sub">Nos experts étudient ton entreprise, ton positionnement et ton ton de marque, puis bâtissent ton studio de contenu sur-mesure — calibré sur ta voix. Ensuite, c’est toi aux commandes : tu génères tes posts et visuels sur LinkedIn, Instagram, Facebook, TikTok &amp; YouTube, tu valides, tu publies. La régularité d’une agence, le contrôle total, sans la facture mensuelle.</p>
        <div className="cta-row">
          <a className="btn btn-grad" href={BOOKING_URL}>Réserve ton call de setup →</a>
          <Link className="btn btn-soft" to="/register">Créer mon compte</Link>
          <a className="btn btn-ghost" href={APK_URL}>↓ App Android</a>
        </div>
        <div className="note">Échange gratuit · On étudie ta boîte avant tout</div>

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
        <SectionHead eyebrow="Le constat" title="Être présent sur les réseaux quand on dirige une boîte" lead="Entre le manque de temps, l’irrégularité et les outils éparpillés, on lâche vite. Presence OS change la donne." />
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

      {/* Plutôt que… (cœur du positionnement) */}
      <section><div className="wrap">
        <SectionHead eyebrow="Plutôt que…" title="Tu connais déjà tes options. Voilà pourquoi Presence OS gagne." />
        <div className="cmp">
          {OPTIONS.map((o) => (
            <div className={'cmpcard' + (o.win ? ' win' : '')} key={o.name}>
              {o.win && <span className="badge">★ Le bon choix</span>}
              <h4>{o.name}</h4>
              <div className="rows">
                {o.vals.map((v, i) => (
                  <div className="r" key={CRITERIA[i]}><span className="k">{CRITERIA[i]}</span><span className="v">{v}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div></section>

      {/* Pour qui (par situation) */}
      <section className="alt"><div className="wrap">
        <SectionHead eyebrow="Pour qui" title="Tu te reconnais dans une de ces situations ?" lead="On ne s’adresse pas à un secteur, mais à une réalité de dirigeant." />
        <div className="aud">
          {AUDIENCE.map(([ic, t, d]) => (
            <div className="acard" key={t}>
              <div className="ab"><AudIcon d={ICONS[ic]} /></div>
              <h3>{t}</h3><p>{d}</p>
            </div>
          ))}
        </div>
      </div></section>

      {/* Accompagnement / Setup */}
      <section><div className="wrap">
        <SectionHead eyebrow="Accompagnement" title="Tu n’as pas le temps ? On construit ton système à ta place." lead="Nos experts marketing étudient ta marque et bâtissent ton studio sur-mesure. Tu n’as plus qu’à valider et publier." />
        <div className="flow">
          {SETUP.map((s, i) => (
            <div className="fstep" key={s[0]}><div className="n">{i + 1}</div><h3>{s[0]}</h3><p>{s[1]}</p></div>
          ))}
        </div>
        <div className="roles">
          <b>On installe. Tu pilotes.</b>
          <p><b>Nous :</b> on étudie ta marque, on paramètre tout, on crée tes modèles de visuels. — <b>Toi :</b> ~2 h par mois pour générer, valider et publier. Tu gardes le contrôle, on porte la complexité.</p>
        </div>
        <div className="cta-row center" style={{ marginTop: 32 }}>
          <a className="btn btn-grad" href={BOOKING_URL}>Réserve ton call de setup →</a>
        </div>
      </div></section>

      {/* Témoignages (accès anticipé) */}
      <section className="alt"><div className="wrap">
        <SectionHead eyebrow="Accès anticipé" title="Les premiers dirigeants à bord" lead="Ils testent Presence OS et reprennent la main sur leur présence." />
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
          <span className="gt-t">Presence OS est un produit <b>{GOODTIME.name}</b> — l’équipe derrière l’OS de la location courte durée. On construit des outils qui font gagner du temps aux pros.</span>
          <a href={GOODTIME.url} target="_blank" rel="noopener noreferrer">Découvrir GoodTime ↗</a>
        </div>
      </div></section>

      <section><div className="wrap">
        <div className="ctaband">
          <h2>Prêt à reprendre le contrôle de ta présence ?</h2>
          <p>Réserve ton call de setup, crée ton compte en 2 minutes, ou installe l’app pour piloter depuis ton téléphone.</p>
          <div className="cta-row center">
            <a className="btn btn-grad" href={BOOKING_URL}>Réserve ton call de setup →</a>
            <Link className="btn btn-soft" to="/register">Créer mon compte</Link>
            <a className="btn btn-ghost" href={APK_URL}>↓ App Android</a>
          </div>
        </div>
      </div></section>
    </>
  );
}
