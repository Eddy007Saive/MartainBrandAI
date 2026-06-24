import { Link } from 'react-router-dom';
import { NET, NetIcon, Check, SectionHead } from './shared';

const FLOW = [
  {
    t: 'Définis ta marque',
    p: 'Tu renseignes ton univers une seule fois. L’IA apprend qui tu es et ne s’en écarte plus.',
    li: ['Secteur, audience & objectifs', 'Ta voix de marque et ton ton', 'Tes piliers de contenu', 'Couleurs & logo de ta marque'],
  },
  {
    t: 'L’IA génère pour toi',
    p: 'À partir d’un sujet, l’IA rédige des contenus adaptés à chaque réseau — dans ta voix.',
    li: ['Des sujets en un clic', 'Posts calibrés par réseau', 'Carrousels brandés (PDF LinkedIn)', 'Scripts vidéo & visuels IA'],
  },
  {
    t: 'Valide, planifie, publie',
    p: 'Tu relis, tu ajustes, tu programmes. La publication part toute seule, à la bonne heure.',
    li: ['Édition rapide avant validation', 'Calendrier & créneaux automatiques', 'Publication multi-réseaux', 'Notifications + analyse des perfs'],
  },
];

const CREATES = [
  ['Posts', 'Textes optimisés pour chaque réseau, dans ta voix de marque.'],
  ['Carrousels', 'Slides aux couleurs de ta marque, export PDF pour LinkedIn.'],
  ['Scripts vidéo', 'Des scripts prêts à tourner pour Reels, TikTok, YouTube.'],
  ['Images IA', 'Des visuels générés pour accompagner tes publications.'],
  ['Avatar vidéo IA', 'Transforme tes scripts en vidéos avec ton avatar digital.'],
  ['Réponses commentaires', 'Réponds à ta communauté depuis l’inbox, notifié en temps réel.'],
];

export default function HowItWorks() {
  return (
    <>
      <section><div className="wrap">
        <SectionHead eyebrow="Comment ça marche" title="De l'idée à la publication, en pilote auto" lead="Trois étapes simples. Tu gardes le contrôle, l'IA fait le gros du travail." />
        <div className="flow">
          {FLOW.map((s, i) => (
            <div className="fstep" key={s.t}>
              <div className="n">{i + 1}</div>
              <h3>{s.t}</h3>
              <p>{s.p}</p>
              <ul>{s.li.map((x) => <li key={x}><Check />{x}</li>)}</ul>
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
        <SectionHead eyebrow="Ce que tu peux créer" title="Un seul sujet, tous les formats" lead="Décline une idée en plusieurs contenus, sans tout réécrire." />
        <div className="features">
          {CREATES.map(([t, d]) => (
            <div className="fcard" key={t}>
              <div className="fi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="2"><path d="M12 3l1.9 5.8L20 10l-5.1 3.7L16 20l-4-3.6L8 20l1.1-6.3L4 10l6.1-1.2z" /></svg></div>
              <h3>{t}</h3><p>{d}</p>
            </div>
          ))}
        </div>
      </div></section>

      <section><div className="wrap">
        <SectionHead eyebrow="En coulisses" title="La publication, sans y penser" lead="Une fois validé, tout s'enchaîne automatiquement." />
        <div className="flow">
          <div className="fstep"><h3>À la bonne heure</h3><p>Tes posts partent au créneau optimal, dans ton fuseau horaire — où que soient tes clients.</p></div>
          <div className="fstep"><h3>Tu es prévenu</h3><p>Une notification push t'informe quand un post est programmé, publié, ou si quelque chose échoue.</p></div>
          <div className="fstep"><h3>Tu mesures</h3><p>Impressions, j'aime, partages, engagement : tes vraies performances sont synchronisées chaque heure.</p></div>
        </div>
        <div className="cta-row center" style={{ marginTop: 48 }}>
          <Link className="btn btn-grad" to="/register">Commencer gratuitement →</Link>
          <Link className="btn btn-soft" to="/fonctionnalites">Voir les fonctionnalités</Link>
        </div>
      </div></section>
    </>
  );
}
