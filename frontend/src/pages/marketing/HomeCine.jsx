import { useEffect, useRef, useState, Fragment } from 'react';
import Link from '../../components/LienLangue';
import { useTranslation, Trans } from 'react-i18next';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { animate, motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { APK_URL } from '../../lib/appDownload';
import { isAuthenticated, isAdminAuthenticated, espaceParDefaut } from '../../lib/auth';
import LangSwitcher from '../../components/LangSwitcher';
import { propsRdv } from './shared';
import './homeCine.css';

// Inclinaison 3D façon carte à jouer, au survol de la vitrine produit (desktop uniquement,
// pas de curseur au doigt) — même traitement que la galerie du prototype HTML validé.
const TILT_SPRING = { type: 'spring', stiffness: 300, damping: 22 };
const tiltMove = (e) => {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width;
  const py = (e.clientY - r.top) / r.height;
  animate(el, { rotateX: (py - 0.5) * -9, rotateY: (px - 0.5) * 9, scale: 1.012 }, TILT_SPRING);
  el.style.setProperty('--mx', `${px * 100}%`);
  el.style.setProperty('--my', `${py * 100}%`);
};
const tiltLeave = (e) => animate(e.currentTarget, { rotateX: 0, rotateY: 0, scale: 1 }, TILT_SPRING);

gsap.registerPlugin(ScrollTrigger);

const CLD = 'https://res.cloudinary.com/dy9gp5pim/video/upload';

// Vidéos de fond par chapitre de la page (fondu enchaîné au scroll).
// `sel` = la section qui déclenche le clip ; un fichier manquant est ignoré (repli sur le précédent).
const BG_CLIPS = [
  // Nouvelle generation (studio violet, Rico + panneaux holographiques, deja
  // cadree avec le tiers gauche vide) : recadrage centre, propre a chaque clip
  // via `pos` — ne pas lui laisser l'objet-position globale de .bg-video
  // (72% 32%), calee sur l'ancienne source 1024x448, qui pousse l'image vers
  // le bas/le bord sur ces nouvelles compositions differentes.
  { src: '/videos/hero-bg.mp4' },  // hero : Rico presente les formats generes (cadrage global, deja bon)
  // `sel` pointe sur le wrapper <section> (sec-cmp/sec-aud/sec-flow), pas sur la
  // grille de cartes a l'interieur : la grille arrive visuellement APRES le
  // titre+texte de la section, donc un trigger cale dessus declenchait le fond
  // en retard (on lisait deja le titre de la section suivante avec l'ancien fond).
  { src: '/videos/bg-idle-wink.mp4', sel: '.sec-cmp', pos: 'center' },  // comparatif : Rico confiant, ailes croisees
  // Comme le hero : aucune transformation, « cover » remplit l'ecran. Le clip
  // v4 est cadre pour ca — le coq est deja a droite, le tiers gauche est vide.
  { none: true, sel: '.sec-aud' },  // « Pour qui » : section scroll 3D autonome, pas de vidéo de fond
  { none: true, sel: '.sec-flow' },  // accompagnement : rail 3D autonome, pas de vidéo de fond
  { none: true, sel: '.testi' },                      // Témoignages : fond noir, toute l'attention sur la vidéo client
  // { src: '/videos/bg-wave.mp4', sel: '.final' },   // CTA final : il salue (à activer quand le clip sera généré)
];

/**
 * Hexagones flottants du bas de page.
 *
 * Les quatre premieres sections sont portees par une video ; a partir des
 * temoignages plus rien ne bouge, et la page tombe d'un coup. Ces hexagones
 * reprennent EXACTEMENT le motif de la page de connexion et du decor des
 * clips — meme trace, meme violet, meme mint : c'est la forme de la marque,
 * on ne va pas en inventer une seconde pour le bas de page.
 *
 * Contours seuls, jamais pleins : un aplat attirerait l'oeil, or c'est un
 * fond. Positions et durees toutes differentes, sinon les sept battent a
 * l'unisson et l'on voit la mecanique.
 */
const HEXAGONES = [
  { x: '6%',  y: '12%', t: 104, d: 26, r: -8,  c: 'v', o: 0.20 },
  { x: '22%', y: '68%', t: 58,  d: 19, r: 12,  c: 'm', o: 0.16 },
  { x: '41%', y: '24%', t: 40,  d: 23, r: 4,   c: 'v', o: 0.12 },
  { x: '63%', y: '78%', t: 78,  d: 17, r: -14, c: 'm', o: 0.15 },
  { x: '78%', y: '18%', t: 64,  d: 29, r: 7,   c: 'v', o: 0.18 },
  { x: '90%', y: '58%', t: 46,  d: 21, r: -5,  c: 'm', o: 0.14 },
  { x: '52%', y: '92%', t: 32,  d: 25, r: 18,  c: 'v', o: 0.11 },
];

const FondHexagones = () => (
  <span className="hex-layer" aria-hidden="true">
    {HEXAGONES.map((g, i) => (
      <svg key={i} className={`hexf hexf--${g.c}`} viewBox="0 0 100 112"
        width={g.t} height={g.t * 1.12}
        style={{ left: g.x, top: g.y, animationDuration: `${g.d}s`, animationDelay: `${-i * 3}s`,
                 opacity: g.o, '--r': `${g.r}deg` }}>
        <polygon points="25,2 75,2 99,56 75,110 25,110 1,56" fill="none" stroke="currentColor"
          strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    ))}
  </span>
);

// Les captures sont IMPORTEES, pas referencees par leur chemin. Webpack leur
// pose alors un condense de leur contenu dans le nom (contenus.a1b2c3.jpg) :
// remplacer l'image change son nom, donc plus aucun cache a purger. C'est le
// meme mecanisme qui rend le reste du build fiable — et il remplace le cache
// d'un jour de /images, qui faisait qu'une capture changee hier s'affichait
// encore le lendemain.
import capStudio from '../../assets/captures/studio.jpg';
import capContenus from '../../assets/captures/contenus.jpg';
import capPlanification from '../../assets/captures/planification.jpg';
import capCommentaires from '../../assets/captures/commentaires.jpg';
import capPerformance from '../../assets/captures/performance.jpg';
import capCarrousels from '../../assets/captures/carrousels.jpg';

// Scènes de la galerie (vraies captures produit)
// `id` sert de clé React stable (indépendante de la langue) ; les libellés viennent de i18n.
const SCENES = [
  { id: 'studio', src: capStudio, labelKey: 'lp.scenes.studio.label', tagKey: 'lp.scenes.studio.tag', descKey: 'lp.scenes.studio.desc' },
  { id: 'contenus', src: capContenus, labelKey: 'lp.scenes.contenus.label', tagKey: 'lp.scenes.contenus.tag', descKey: 'lp.scenes.contenus.desc' },
  { id: 'planification', src: capPlanification, labelKey: 'lp.scenes.planification.label', tagKey: 'lp.scenes.planification.tag', descKey: 'lp.scenes.planification.desc' },
  { id: 'commentaires', src: capCommentaires, labelKey: 'lp.scenes.commentaires.label', tagKey: 'lp.scenes.commentaires.tag', descKey: 'lp.scenes.commentaires.desc' },
  { id: 'performance', src: capPerformance, labelKey: 'lp.scenes.performance.label', tagKey: 'lp.scenes.performance.tag', descKey: 'lp.scenes.performance.desc' },
  { id: 'carrousels', src: capCarrousels, labelKey: 'lp.scenes.carrousels.label', tagKey: 'lp.scenes.carrousels.tag', descKey: 'lp.scenes.carrousels.desc' },
];

// Légende d'une scène : « <b>Titre</b> — <em>accroche</em> · description »
function SceneCap({ scene }) {
  const { t } = useTranslation();
  return (
    <><b>{t(scene.labelKey)}</b> : <em>{t(scene.tagKey)}</em> · {t(scene.descKey)}</>
  );
}

// Icônes réseaux (bulles qui montent depuis l'écran du laptop)
const RISE_LOGOS = [
  ['li', 'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45z'],
  ['ig', 'M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zm0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z'],
  ['fb', 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z'],
  ['tk', 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'],
  ['yt', 'M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z'],
  ['gb', 'M21.6 9.22H12.2v3.72h5.41c-.5 2.47-2.6 3.89-5.41 3.89a5.96 5.96 0 0 1 0-11.92c1.52 0 2.9.56 3.98 1.47l2.8-2.8A9.93 9.93 0 0 0 12.2 1.2C6.71 1.2 2.28 5.63 2.28 11.12s4.43 9.92 9.92 9.92c4.96 0 9.47-3.6 9.47-9.92 0-.65-.03-1.28-.07-1.9z'],
  ['x', 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z'],
];

const CMP = [
  { id: 'nothing', nameKey: 'lp.cmp.nothing.name', valKeys: ['lp.cmp.nothing.v1', 'lp.cmp.nothing.v2', 'lp.cmp.nothing.v3', 'lp.cmp.nothing.v4', 'lp.cmp.nothing.v5', 'lp.cmp.nothing.v6'] },
  { id: 'intern', nameKey: 'lp.cmp.intern.name', valKeys: ['lp.cmp.intern.v1', 'lp.cmp.intern.v2', 'lp.cmp.intern.v3', 'lp.cmp.intern.v4', 'lp.cmp.intern.v5', 'lp.cmp.intern.v6'] },
  { id: 'agency', nameKey: 'lp.cmp.agency.name', valKeys: ['lp.cmp.agency.v1', 'lp.cmp.agency.v2', 'lp.cmp.agency.v3', 'lp.cmp.agency.v4', 'lp.cmp.agency.v5', 'lp.cmp.agency.v6'] },
  // nom de marque : la valeur reste « Postorico » dans les trois langues
  { id: 'postorico', win: true, nameKey: 'lp.cmp.postorico.name', valKeys: ['lp.cmp.postorico.v1', 'lp.cmp.postorico.v2', 'lp.cmp.postorico.v3', 'lp.cmp.postorico.v4', 'lp.cmp.postorico.v5', 'lp.cmp.postorico.v6'] },
];
const CRITERIA = ['lp.cmp.crit.cost', 'lp.cmp.crit.volume', 'lp.cmp.crit.voice', 'lp.cmp.crit.consistency', 'lp.cmp.crit.control', 'lp.cmp.crit.setup'];

// Avis clients (accès anticipé) — TODO Martin : remplacer par de vrais avis nominatifs
// `nom` = nom propre, jamais traduit ; rôle et citation viennent de i18n.
const AVIS = [
  { nom: 'Aurélie M.', roleKey: 'lp.avis.1.role', quoteKey: 'lp.avis.1.quote' },
  { nom: 'Thomas R.', roleKey: 'lp.avis.2.role', quoteKey: 'lp.avis.2.quote' },
  { nom: 'Léa B.', roleKey: 'lp.avis.3.role', quoteKey: 'lp.avis.3.quote' },
];

// Liens de navigation (nav desktop + menu mobile)
const NAV_LINKS = [
  ['lp.nav.features', '/fonctionnalites'],
  ['lp.nav.how', '/comment-ca-marche'],
  ['lp.nav.pricing', '/tarifs'],
  ['lp.nav.faq', '/faq'],
];

// Halo violet qui suit le curseur sur le hero (inspiration : « Toolkit Hero Section », 21st.dev).
// Écoute le mousemove du parent (la section hero) ; inactif sur tactile et si prefers-reduced-motion.
// pointer-events:none et mix-blend-mode:screen : il éclaire le fond vidéo sans gêner les clics.
function HeroGlow() {
  const ref = useRef(null);
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || matchMedia('(hover: none)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      x.set(e.clientX - r.left);
      y.set(e.clientY - r.top);
    };
    const onLeave = () => { x.set(-1000); y.set(-1000); };
    host.addEventListener('mousemove', onMove, { passive: true });
    host.addEventListener('mouseleave', onLeave);
    return () => { host.removeEventListener('mousemove', onMove); host.removeEventListener('mouseleave', onLeave); };
  }, [x, y]);
  const background = useMotionTemplate`radial-gradient(520px circle at ${x}px ${y}px, rgba(138,108,255,.22), rgba(91,108,255,.08) 45%, transparent 75%)`;
  return <motion.div ref={ref} className="hero-glow" aria-hidden="true" style={{ background }} />;
}

// Titre du hero mot à mot : chaque mot est un <span class="mot"> avec son rang (--i) pour une
// révélation en cascade (flou -> net) ; la 2e ligne garde le dégradé .g (dérive animée en CSS).
function TitreAnime({ l1, l2 }) {
  const m1 = l1.split(' ').filter(Boolean);
  const m2 = l2.split(' ').filter(Boolean);
  // L'espace reste HORS du span (inline-block avale un espace final) ; Fragment pour la clé.
  const mot = (m, i) => <Fragment key={i}><span className="mot" style={{ '--i': i }}>{m}</span>{' '}</Fragment>;
  return (
    <>
      {m1.map(mot)}
      <br />
      <span className="g">{m2.map((m, i) => mot(m, m1.length + i))}</span>
    </>
  );
}

export default function HomeCine() {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const impactRef = useRef(null);
  const pqWrapRef = useRef(null);
  const pqCardRef = useRef(null);
  const accStageRef = useRef(null);
  const [scene, setScene] = useState(0);

  // Utilisateur déjà connecté -> « Mon dashboard » remplace Se connecter / Commencer
  const connecte = isAuthenticated() || isAdminAuthenticated();
  const dashTo = espaceParDefaut();

  // Galerie desktop : carrousel autonome (avance seul, pause au survol, sidebar/points cliquables)
  const [scenePause, setScenePause] = useState(false);
  useEffect(() => {
    if (scenePause) return undefined;
    const id = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 4000);
    return () => clearInterval(id);
  }, [scenePause]);

  // Mobile : AUCUNE video rendue (sinon elles se telechargent meme masquees) — poster statique a la place.
  // Critere : tactile OU ecran <= 900px, reevalue au redimensionnement.
  const mobileQuery = () => window.matchMedia('(hover: none)').matches || window.innerWidth <= 900;
  const [isTouch, setIsTouch] = useState(() => typeof window !== 'undefined' && mobileQuery());
  useEffect(() => {
    const onR = () => setIsTouch(mobileQuery());
    window.addEventListener('resize', onR, { passive: true });
    return () => window.removeEventListener('resize', onR);
  }, []);

  // Menu mobile (burger) — bloque le scroll de fond tant qu'il est ouvert
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Carrousel d'avis : avance tout seul, cliquable via les points
  const [avisIdx, setAvisIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAvisIdx((i) => (i + 1) % AVIS.length), 5000);
    return () => clearInterval(id);
  }, []);

  // Témoignage vidéo dans la langue du visiteur
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const testi = lang === 'es'
    ? { flag: '🇪🇸', label: 'Testimonio de cliente · Español', src: `${CLD}/q_auto/marketing/temoignage-es.mp4`, poster: `${CLD}/so_2,q_auto/marketing/temoignage-es.jpg` }
    : { flag: '🇫🇷', label: 'Témoignage client · Français', src: `${CLD}/q_auto/marketing/temoignage-fr.mp4`, poster: `${CLD}/so_2,q_auto/marketing/temoignage-fr.jpg` };

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = matchMedia('(hover: none)').matches;

    // Défilement lissé — DESKTOP uniquement : sur mobile, Lenis capture les gestes
    // tactiles et bloque le carrousel horizontal (scroll natif = comportement normal).
    const lenis = isTouch ? null : new Lenis({ lerp: 0.09 });
    const raf = (time) => { if (lenis) lenis.raf(time * 1000); };
    if (lenis) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    }

    // Entrée du hero en cascade — fondu seul, sans déplacement. Un translateY
    // bouge visuellement l'élément après le premier rendu : Chrome le compte
    // comme décalage de mise en page (CLS) même si transform ne touche pas au
    // flux, puisque le score se base sur la position visuelle, pas le layout.
    // Sur le hero (entièrement au-dessus de la ligne de flottaison, vu à
    // chaque visite), ça pénalisait directement le score sans bénéfice réel.
    if (!reduced) {
      [...rootRef.current.querySelectorAll('.hero-copy > *')].forEach((el, i) => {
        el.style.opacity = 0;
        el.style.transition = `opacity 650ms cubic-bezier(.23,1,.32,1) ${i * 80}ms`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.opacity = 1;
        }));
      });
    }

    // Impact : reveal mot à mot scrubé
    // (le h2 est remonté via key={lang} à chaque changement de langue -> on repart d'un texte propre)
    const H = impactRef.current;
    // Découpe MOT à MOT (l'ancien `[^\S ]+` ne coupait que sur les retours à la ligne :
    // un seul span, et les § restaient visibles à l'écran).
    // Le texte source est mémorisé : au 2e passage de l'effet (StrictMode, ou re-render)
    // le DOM ne contient plus les § et les mots accentués seraient perdus.
    const src = H.dataset.raw || (H.dataset.raw = H.textContent.trim());
    H.innerHTML = src.split(/\s+/).map((w) => {
      const acc = w.startsWith('§');
      return `<span class="word${acc ? ' word--accent' : ''}">${w.replace(/§/g, '')}</span>`;
    }).join(' ');
    const words = [...H.querySelectorAll('.word')];
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const renderImpact = (p) => {
      const N = words.length;
      words.forEach((el, i) => {
        // lisible dès l'arrivée (base 0.4), révélation complète sur la 1re moitié du pin
        const o = clamp((p * 2 - (i / N) * 0.6) / 0.14);
        el.style.opacity = 0.4 + o * 0.6;
        el.style.filter = `blur(${(1 - o) * 4}px)`;
        el.style.transform = `translateY(${(1 - o) * 12}px)`;
      });
    };
    renderImpact(0);
    const st1 = ScrollTrigger.create({
      trigger: '.cine .impact', start: 'top top', end: () => '+=' + window.innerHeight * 0.7,
      pin: true, scrub: 1, onUpdate: (s) => renderImpact(s.progress),
    });

    // Galerie : la scène active suit le scroll
    // (galerie : carrousel autonome — plus de pin ScrollTrigger)

    // Vidéos de fond par chapitre : fondu enchaîné au scroll.
    // Chaque clip = { sel: section qui le déclenche } ; s'il manque (404), on garde le précédent.
    const stack = [...rootRef.current.querySelectorAll('.bg-video')];
    stack.forEach((v, i) => { v.style.opacity = i === 0 ? '1' : '0'; });
    // vidIdx[i] = index dans `stack` du clip i de BG_CLIPS (null pour les chapitres sans vidéo)
    let n = 0;
    const vidIdx = BG_CLIPS.map((c) => (c.src ? n++ : null));
    const ok = stack.map(() => true);
    stack.forEach((v, i) => v.addEventListener('error', () => { ok[i] = false; }, { once: true }));
    let curClip = 0;
    const showClip = (idx) => {
      // repli sur le chapitre précédent si le fichier du clip manque (les chapitres "none" sont toujours valides)
      while (idx > 0 && !BG_CLIPS[idx].none && !ok[vidIdx[idx]]) idx -= 1;
      if (idx === curClip) return;
      curClip = idx;
      const active = BG_CLIPS[idx].none ? -1 : vidIdx[idx];
      stack.forEach((v, i) => {
        v.style.opacity = i === active ? 1 : 0;
        if (i === active) { if (!touch && !reduced) v.play().catch(() => {}); }
        else v.pause();
      });
    };
    const clipTriggers = BG_CLIPS.map((c, i) => (i === 0 || !c.sel) ? null : ScrollTrigger.create({
      trigger: `.cine ${c.sel}`, start: 'top 55%',
      onEnter: () => showClip(i),
      onLeaveBack: () => showClip(i - 1),
    })).filter(Boolean);

    const bgv = stack[0];
    if (bgv && !touch && !reduced) bgv.play().catch(() => {});
    const onVis = () => {
      if (!document.hidden && stack[curClip] && stack[curClip].paused && !touch && !reduced) stack[curClip].play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);

    // ---- POUR QUI : empilement 3D scroll-scrubbé (prototype validé, voir
    // _design/landing-redesign/pour-qui-scroll.html) — chaque carte est une
    // fonction continue de la position de scroll (pas d'étapes qui "sautent").
    // La dernière carte ne repart jamais une fois atteinte (gelée à d=0),
    // sinon elle "sortirait" sans rien pour la remplacer. ----
    let pqCleanup = () => {};
    if (pqWrapRef.current && pqCardRef.current) {
      const pqWrap = pqWrapRef.current;
      const pqCard = pqCardRef.current;
      const pqSteps = Array.from(pqWrap.querySelectorAll('.pq-step'));
      const pqImgs = Array.from(pqCard.querySelectorAll('img'));
      const pqDots = Array.from(pqWrap.querySelectorAll('.pq-dot'));
      const pqCount = pqWrap.querySelector('.pq-count');
      const pqCaption = pqWrap.querySelector('.pq-caption');
      const n = pqSteps.length;
      const pqClamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
      const pqCaptions = [
        ['Système Postorico', 'Le calendrier du mois, prêt avant même que tu y penses.'],
        ['Système Postorico', 'Écrit dans ta voix. Tu relis, tu valides en un clic.'],
        ['Système Postorico', 'Le même résultat qu’une agence, sans la facture qui va avec.'],
      ];

      const renderPourQui = () => {
        const r = pqWrap.getBoundingClientRect();
        const total = Math.max(1, r.height - window.innerHeight);
        const p = pqClamp(-r.top / total);
        const raw = p * (n - 0.001);
        const active = Math.min(n - 1, Math.floor(raw));
        const local = pqClamp(raw - active);

        pqSteps.forEach((step, i) => {
          let d = i - raw;
          if (i === n - 1) d = Math.max(d, 0); // dernière carte : jamais "sortie"
          const y = d > 0 ? d * 300 : d * 150; // sortie plus courte que l'entrée (ne recouvre pas le titre)
          const z = -Math.abs(d) * 180;
          const rotateX = d * -7;
          const scale = 1 - Math.min(0.12, Math.abs(d) * 0.055);
          let opacity = 1 - Math.min(1, Math.abs(d) * 0.95);
          if (Math.abs(d) > 1.15) opacity = 0;
          if (i === active) opacity = 1;
          if (i === active + 1) opacity = Math.max(opacity, local);
          if (i === active - 1) opacity = Math.max(opacity, 1 - local);
          step.style.visibility = opacity > 0.015 ? 'visible' : 'hidden';
          step.style.opacity = opacity;
          step.style.setProperty('--completion', `${i < active ? 100 : i === active ? local * 100 : 0}%`);
          step.style.transform = `translate3d(0,${y}px,${z}px) rotateX(${rotateX}deg) scale(${scale})`;
          step.classList.toggle('is-active', i === active);
        });

        pqImgs.forEach((img, i) => {
          let d = i - raw;
          if (i === n - 1) d = Math.max(d, 0);
          const opacity = Math.max(0, 1 - Math.abs(d) * 1.25);
          img.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
          img.style.opacity = opacity;
          img.style.transform = `translate3d(${d * 110}px,${d * -18}px,${-Math.abs(d) * 170}px) rotateY(${d * -9}deg) scale(${1 - Math.min(0.08, Math.abs(d) * 0.035)})`;
        });

        if (pqCount) pqCount.textContent = `${active + 1} / ${n}`;
        if (pqCaption) {
          pqCaption.querySelector('b').textContent = pqCaptions[active][0];
          pqCaption.querySelector('p').textContent = pqCaptions[active][1];
        }

        const wave = Math.sin(local * Math.PI);
        pqCard.style.transform = `translate3d(0,${-wave * 20}px,0) rotateX(${-2 + wave * 4}deg) rotateY(${(p - 0.5) * 5}deg) scale(${1 + wave * 0.025})`;

        const head = pqWrap.querySelector('.pq-head');
        if (head) head.style.transform = `translate3d(0,${(p - 0.5) * -14}px,70px)`;
        const left = pqWrap.querySelector('.pq-left');
        if (left) left.style.transform = `translate3d(0,${(p - 0.5) * 4}px,0)`;

        pqDots.forEach((dot, i) => {
          const fill = dot.querySelector('i');
          fill.style.width = i < active ? '100%' : i === active ? `${local * 100}%` : '0%';
        });
      };

      if (!reduced) {
        // Lenis.on() renvoie une fonction de désinscription (pas de .off() sur
        // l'instance elle-même) — on la garde pour le cleanup.
        let pqUnsubscribe = null;
        if (lenis) pqUnsubscribe = lenis.on('scroll', renderPourQui);
        else window.addEventListener('scroll', renderPourQui, { passive: true });
        window.addEventListener('resize', renderPourQui);
        renderPourQui();

        let pqPointerHandler = null;
        if (matchMedia('(hover:hover)').matches) {
          pqPointerHandler = (e) => {
            const r = pqCard.getBoundingClientRect();
            pqCard.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
            pqCard.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
          };
          pqCard.addEventListener('pointermove', pqPointerHandler);
        }
        pqCleanup = () => {
          if (pqUnsubscribe) pqUnsubscribe();
          else window.removeEventListener('scroll', renderPourQui);
          window.removeEventListener('resize', renderPourQui);
          if (pqPointerHandler) pqCard.removeEventListener('pointermove', pqPointerHandler);
        };
      } else {
        // reduced motion : état final statique, pas d'animation scroll-liée
        pqSteps.forEach((step, i) => { step.style.opacity = i === 0 ? 1 : 0; step.style.visibility = i === 0 ? 'visible' : 'hidden'; });
        pqImgs.forEach((img, i) => { img.style.opacity = i === 0 ? 1 : 0; img.style.visibility = i === 0 ? 'visible' : 'hidden'; });
      }
    }

    // ---- ACCOMPAGNEMENT : rail horizontal 3D piloté par le scroll. La scène
    // reste épinglée (sticky) et le scroll vertical fait glisser la piste vers
    // la gauche ; chaque carte pivote (rotateY), recule (Z) et rétrécit selon
    // sa distance au centre du rail. Desktop seulement : sous 900px, la piste
    // défile en scroll horizontal natif. ----
    let accCleanup = () => {};
    if (accStageRef.current) {
      const stage = accStageRef.current;
      const rail = stage.querySelector('.acc-rail');
      const track = stage.querySelector('.acc-track');
      const cards = Array.from(stage.querySelectorAll('.acc-card'));
      const metric = stage.querySelector('.acc-metric-number');
      const clampA = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

      const renderAcc = () => {
        if (window.innerWidth <= 900 || reduced) {
          track.style.transform = '';
          cards.forEach((c) => { c.style.transform = ''; c.style.opacity = ''; });
          return;
        }
        const r = stage.getBoundingClientRect();
        const p = clampA(-r.top / Math.max(1, r.height - window.innerHeight));
        const usable = Math.max(0, track.scrollWidth - rail.clientWidth + 90);
        const x = p * usable;
        track.style.transform = `translate3d(${-x}px,0,0)`;
        const railCenter = rail.clientWidth / 2;
        cards.forEach((card, i) => {
          const center = i * (card.offsetWidth + 22) - x + 28 + card.offsetWidth / 2;
          const d = (center - railCenter) / Math.max(rail.clientWidth * 0.65, 1);
          card.style.transform = `translateZ(${-Math.min(1, Math.abs(d)) * 150}px) rotateY(${clampA(d, -1.3, 1.3) * -13}deg) scale(${1 - Math.min(0.08, Math.abs(d) * 0.055)})`;
          card.style.opacity = String(1 - Math.min(0.28, Math.abs(d) * 0.12));
          card.querySelector('.acc-progress i').style.width = `${clampA(1 - Math.abs(d)) * 100}%`;
        });
        if (metric) metric.textContent = String(Math.min(cards.length, Math.floor(p * cards.length) + 1)).padStart(2, '0');
      };

      let accUnsub = null;
      if (lenis) accUnsub = lenis.on('scroll', renderAcc);
      else window.addEventListener('scroll', renderAcc, { passive: true });
      window.addEventListener('resize', renderAcc);
      renderAcc();
      accCleanup = () => {
        if (accUnsub) accUnsub();
        else window.removeEventListener('scroll', renderAcc);
        window.removeEventListener('resize', renderAcc);
      };
    }

    return () => {
      st1.kill(); clipTriggers.forEach((tr) => tr.kill());
      ScrollTrigger.getAll().forEach((tr) => tr.kill());
      gsap.ticker.remove(raf);
      pqCleanup();
      accCleanup();
      if (lenis) lenis.destroy();
      document.removeEventListener('visibilitychange', onVis);
    };
    // re-cable tout (pins, triggers, stack video) quand on bascule mobile <-> desktop
    // ou quand la langue change (le titre « impact » est re-decoupe mot a mot)
  }, [isTouch, lang]);

  return (
    <div className="cine" ref={rootRef}>
      {/* Couches fond — un clip par chapitre, fondu enchaîné au scroll */}
      {/* opacité pilotée UNIQUEMENT en impératif (showClip) — pas dans le style JSX,
          sinon chaque re-render React écrase le fondu en cours */}
      {!isTouch && BG_CLIPS.filter((c) => c.src).map((c, i) => (
        <video key={c.src} ref={i === 0 ? videoRef : undefined} className="bg-video" src={c.src}
          muted loop playsInline preload={i === 0 ? 'auto' : 'metadata'}
          style={{ transition: 'opacity 700ms ease', ...(c.pos ? { objectPosition: c.pos } : {}), ...(c.transform ? { transform: c.transform } : {}) }} />
      ))}
      <div className="bg-tint" />
      <div className="grain" />

      {/* Nav */}
      <nav className="lnav"><div className="wrap">
        <Link className="brand" to="/"><img src="/logo.png" alt="Postorico" /><span className="bt"><b>Postorico</b><small>{t('lp.brand.tagline')}</small></span></Link>
        <div className="nav-links">
          {NAV_LINKS.map(([labelKey, to]) => (
            <Link key={to} to={to}>{t(labelKey)}</Link>
          ))}
        </div>
        <div className="nav-right">
          <LangSwitcher />
          {connecte ? (
            <Link className="nav-cta grad" to={dashTo}>{t('lp.nav.dashboard')}</Link>
          ) : (
            <>
              <Link className="nav-link" to="/login">{t('lp.nav.login')}</Link>
              <Link className="nav-cta grad" to="/register">{t('lp.nav.start')}</Link>
            </>
          )}
          <button className={`burger${menuOpen ? ' open' : ''}`} aria-label={t('lp.nav.menu')} aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}><i /><i /><i /></button>
        </div>
      </div></nav>

      {/* Menu mobile plein écran */}
      <div className={`mmenu${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)}>
        {NAV_LINKS.map(([labelKey, to], i) => (
          <Link key={to} to={to} style={{ transitionDelay: menuOpen ? `${80 + i * 50}ms` : '0ms' }}>{t(labelKey)}</Link>
        ))}
        <div className="sep" />
        {connecte ? (
          <Link className="cta" to={dashTo} style={{ transitionDelay: menuOpen ? '300ms' : '0ms' }}>{t('lp.nav.dashboard')}</Link>
        ) : (
          <>
            <Link className="ghost" to="/login" style={{ transitionDelay: menuOpen ? '300ms' : '0ms' }}>{t('lp.nav.login')}</Link>
            <Link className="cta" to="/register" style={{ transitionDelay: menuOpen ? '350ms' : '0ms' }}>{t('lp.nav.start')}</Link>
          </>
        )}
      </div>

      <div className="page">
        {/* HERO */}
        <section className="hero">
          {/* Sur mobile, la vidéo/poster de fond est retirée (pas de Rico) :
              les hexagones flottants — déjà utilisés plus bas sur cette page
              et sur le reste du site — comblent le fond, sinon plat et vide. */}
          {isTouch && <FondHexagones />}
          {!isTouch && <HeroGlow />}
          <div className="hero-copy">
            <span className="kicker"><span className="dot" />{t('lp.hero.kicker')}</span>
            <h1 key={lang}><TitreAnime l1={t('lp.hero.title1')} l2={t('lp.hero.title2')} /></h1>
            <p className="hero-sub"><Trans i18nKey="lp.hero.sub" components={{ b: <b /> }} /></p>
            <div className="nets"><b>LinkedIn</b><i>·</i><b>Instagram</b><i>·</i><b>Facebook</b><i>·</i><b>TikTok</b><i>·</i><b>YouTube</b><i>·</i><b>Google Business</b></div>
            <div className="cta-row">
              <a className="btn grad" {...propsRdv()}>{t('lp.cta.call')}</a>
              <Link className="btn ghost" to="/register">{t('lp.cta.account')}</Link>
              <a className="btn apk" href={APK_URL}>{t('lp.cta.apk')}</a>
            </div>
            <div className="hero-note">{t('lp.hero.note')}</div>
            <div className="hstats">
              <div className="hstat"><b>{t('lp.hero.stat1.v')}</b><span>{t('lp.hero.stat1.l')}</span></div>
              <div className="hstat"><b>{t('lp.hero.stat2.v')}</b><span>{t('lp.hero.stat2.l')}</span></div>
              <div className="hstat"><b>{t('lp.hero.stat3.v')}</b><span>{t('lp.hero.stat3.l')}</span></div>
              <div className="hstat"><b>{t('lp.hero.stat4.v')}</b><span>{t('lp.hero.stat4.l')}</span></div>
            </div>
          </div>
          <div />
          {/* Bulles de logos qui montent depuis l'écran du laptop */}
          <div className="rise" aria-hidden="true">
            {RISE_LOGOS.map(([k, d]) => (
              <span key={k} className={`rlogo ${k}`}><svg viewBox="0 0 24 24"><path d={d} /></svg></span>
            ))}
          </div>
          <div className="scroll-cue">{t('lp.hero.scroll')}</div>
        </section>

        {/* IMPACT */}
        <section className="impact"><div className="wrap">
          <h2 key={lang} ref={impactRef}>{t('lp.impact.title')}</h2>
        </div></section>

        {/* PROBLÈME -> SOLUTION */}
        <section className="sec"><div className="wrap">
          <div className="shead">
            <div className="eyebrow">{t('lp.ps.eyebrow')}</div>
            <h2>{t('lp.ps.title')}</h2>
            <p className="lead">{t('lp.ps.lead')}</p>
          </div>
          <div className="ps">
            <div className="pscol bad">
              <div className="ps-head"><span className="ps-ic">✗</span><h3>{t('lp.ps.bad.title')}</h3></div>
              <ul>
                <li><span className="mk">✗</span>{t('lp.ps.bad.1')}</li>
                <li><span className="mk">✗</span>{t('lp.ps.bad.2')}</li>
                <li><span className="mk">✗</span>{t('lp.ps.bad.3')}</li>
                <li><span className="mk">✗</span>{t('lp.ps.bad.4')}</li>
              </ul>
            </div>
            <div className="ps-arrow" aria-hidden="true">→</div>
            <div className="pscol good">
              <span className="ps-badge">{t('lp.ps.good.badge')}</span>
              <div className="ps-head"><span className="ps-ic">✓</span><h3>{t('lp.ps.good.title')}</h3></div>
              <ul>
                <li><span className="mk">✓</span>{t('lp.ps.good.1')}</li>
                <li><span className="mk">✓</span>{t('lp.ps.good.2')}</li>
                <li><span className="mk">✓</span>{t('lp.ps.good.3')}</li>
                <li><span className="mk">✓</span>{t('lp.ps.good.4')}</li>
              </ul>
            </div>
          </div>
        </div></section>

        {/* GALERIE : shell d'app épinglé (desktop) / carrousel à balayage (mobile) */}
        {isTouch ? (
          <section className="gallery-mob">
            <div className="mgal" data-lenis-prevent>
              {SCENES.map((s) => (
                <figure key={s.id} className="mgal-card">
                  <img src={s.src} alt={t('lp.scenes.alt', { name: t(s.labelKey) })} loading="lazy" />
                  <figcaption><SceneCap scene={s} /></figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : (
          <section className="gallery"><div className="gallery-pin">
            <div className="preview"
              onMouseEnter={() => setScenePause(true)} onMouseLeave={() => setScenePause(false)}
              onPointerMove={tiltMove} onPointerLeave={tiltLeave}>
              <span className="preview-sheen" aria-hidden="true" />
              <div className="pbar"><i /><i /><i /></div>
              <div className="shot">
                <div className="sb">
                  <div className="lg"><img src="/logo.png" alt="" /><b>Postorico</b></div>
                  {SCENES.map((s, i) => (
                    <div key={s.id} className={'it' + (i === scene ? ' on' : '')} onClick={() => setScene(i)}
                      role="button" tabIndex={0}><span className="ic" />{t(s.labelKey)}</div>
                  ))}
                </div>
                <div className="pmain">
                  {SCENES.map((s, i) => (
                    <img key={s.src} src={s.src} className={i === scene ? 'on' : ''} alt={t('lp.scenes.alt', { name: t(s.labelKey) })} />
                  ))}
                  <div className="hp-dots">
                    {SCENES.map((s, i) => (
                      <i key={s.id} className={i === scene ? 'on' : ''} onClick={() => setScene(i)} role="button" />
                    ))}
                  </div>
                </div>
              </div>
              <div className="pcap"><SceneCap scene={SCENES[scene]} /></div>
            </div>
          </div></section>
        )}

        {/* PLUTÔT QUE… */}
        <section className="sec sec-cmp"><div className="wrap">
          <div className="shead">
            <div className="eyebrow">{t('lp.cmp.eyebrow')}</div>
            <h2>{t('lp.cmp.title')}</h2>
          </div>
          <div className="cmp">
            {CMP.map((o) => (
              <div key={o.id} className={'cmpcard' + (o.win ? ' win' : '')}>
                {o.win && <span className="badge">{t('lp.cmp.badge')}</span>}
                <h4>{t(o.nameKey)}</h4>
                <div className="rows">
                  {o.valKeys.map((vk, i) => (
                    <div className="r" key={CRITERIA[i]}><span className="k">{t(CRITERIA[i])}</span><span className="v">{t(vk)}</span></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div></section>

        {/* POUR QUI — scroll 3D : le texte s'empile en continu (fonction directe de la
            position de scroll, pas d'étapes qui "sautent"), la carte à droite suit le
            même calendrier. Prototype validé : _design/landing-redesign/pour-qui-scroll.html */}
        <section className="sec-aud"><div className="pq-wrap" ref={pqWrapRef}>
          <div className="pq-sticky">
            <div className="pq-inner">

              <div className="pq-head">
                <div className="pq-eyebrow">{t('lp.aud.eyebrow')}</div>
                <h2 className="pq-title">{t('lp.aud.title')}</h2>
                <p className="pq-lead">{t('lp.aud.lead')}</p>
              </div>

              <div className="pq-left">
                <div className="pq-steps">
                  <article className="pq-step" data-step="0">
                    <div className="pq-num">01 / 03</div>
                    <h3 className="pq-quote">{t('lp.aud.1.title')}</h3>
                    <p className="pq-desc">{t('lp.aud.1.text')}</p>
                    <div className="pq-tags"><span className="pq-tag">2-3h / mois</span><span className="pq-tag">Zéro recrutement</span></div>
                  </article>
                  <article className="pq-step" data-step="1">
                    <div className="pq-num">02 / 03</div>
                    <h3 className="pq-quote">{t('lp.aud.2.title')}</h3>
                    <p className="pq-desc">{t('lp.aud.2.text')}</p>
                    <div className="pq-tags"><span className="pq-tag">Ta voix, pas un ton générique</span><span className="pq-tag">Validation en 1 clic</span></div>
                  </article>
                  <article className="pq-step" data-step="2">
                    <div className="pq-num">03 / 03</div>
                    <h3 className="pq-quote">{t('lp.aud.3.title')}</h3>
                    <p className="pq-desc">{t('lp.aud.3.text')}</p>
                    <div className="pq-tags"><span className="pq-tag">Pas de forfait limité</span><span className="pq-tag">10× moins cher</span></div>
                  </article>
                </div>
                <div className="pq-progress"><div className="pq-dot"><i></i></div><div className="pq-dot"><i></i></div><div className="pq-dot"><i></i></div></div>
              </div>

              <div className="pq-card-stage">
                <div className="pq-card" ref={pqCardRef}>
                  <div className="pq-count">1 / 3</div>
                  <img src="/images/pour-qui/calendrier.jpg" data-img="0" alt="Rico — calendrier" />
                  <img src="/images/pour-qui/panneaux.jpg" data-img="1" alt="Rico — formats" />
                  <img src="/images/pour-qui/confiant.jpg" data-img="2" alt="Rico — confiance" />
                  <span className="pq-sheen"></span>
                  <div className="pq-caption">
                    <b>Système Postorico</b>
                    <p>Le calendrier du mois, prêt avant même que tu y penses.</p>
                  </div>
                </div>
              </div>

            </div>
            <div className="pq-hint">continue à scroller ↓</div>
          </div>
        </div></section>

        {/* ACCOMPAGNEMENT */}
        {/* Rail horizontal 3D : le scroll vertical fait défiler les cartes de côté,
            chaque carte pivote selon sa distance au centre. Porté depuis
            frontend/assets/postorico-final-3-sections-corrige.html (dernière section). */}
        <section className="sec-flow"><div className="acc-stage" ref={accStageRef}>
          <div className="acc-scene">
            <div className="acc-stars" aria-hidden="true" />
            <div className="acc-layout">
              <aside className="acc-intro">
                <div>
                  <div className="acc-eyebrow">{t('lp.flow.eyebrow')}</div>
                  <h2>{t('lp.flow.title')}</h2>
                  <p>{t('lp.flow.lead')}</p>
                </div>
                <div className="acc-metric">
                  <div className="acc-metric-label">Ton système</div>
                  <div className="acc-metric-number">01</div>
                  <div className="acc-metric-sub">étudier · construire · piloter</div>
                </div>
              </aside>
              <div className="acc-rail">
                <div className="acc-track">
                  {[
                    { pill: 'Étape 01', idx: '1', kicker: 'Audit', title: t('lp.flow.1.title'), text: t('lp.flow.1.text'), tags: ['Audit', 'Positionnement'] },
                    { pill: 'Étape 02', idx: '2', kicker: 'Construction', title: t('lp.flow.2.title'), text: t('lp.flow.2.text'), tags: ['Système', 'Calendrier'] },
                    { pill: 'Étape 03', idx: '3', kicker: 'Pilotage', title: t('lp.flow.3.title'), text: t('lp.flow.3.text'), tags: ['Contrôle', '~2 h / mois'] },
                    { pill: 'Résultat', idx: '✓', kicker: 'Système installé', title: t('lp.flow.roles.title'), text: <Trans i18nKey="lp.flow.roles.text" components={{ b: <b /> }} />, tags: ['Prêt à utiliser', 'Tu gardes le contrôle'] },
                  ].map((c) => (
                    <article className="acc-card" key={c.pill}>
                      <div className="acc-pill">{c.pill}</div>
                      <div className="acc-card-index">{c.idx}</div>
                      <div className="acc-card-content">
                        <div className="acc-card-kicker">{c.kicker}</div>
                        <h3>{c.title}</h3>
                        <p>{c.text}</p>
                        <div className="acc-card-tags">{c.tags.map((tg) => <span className="acc-tag" key={tg}>{tg}</span>)}</div>
                      </div>
                      <div className="acc-progress"><i /></div>
                    </article>
                  ))}
                </div>
                <div className="acc-hint"><span />Continue à scroller</div>
              </div>
            </div>
            <a className="acc-cta" {...propsRdv()}>{t('lp.cta.call')}</a>
          </div>
        </div></section>

        {/* TÉMOIGNAGES */}
        <section className="testi"><FondHexagones /><div className="wrap">
          <div className="eyebrow">{t('lp.testi.eyebrow')}</div>
          <h2>{t('lp.testi.title')}</h2>
          <div className="tgrid tgrid--solo">
            <figure className="vcard">
              <video src={testi.src} poster={testi.poster} controls preload="metadata" playsInline />
              <figcaption>{testi.flag} {testi.label}</figcaption>
            </figure>
          </div>
        </div></section>

        {/* CARROUSEL D'AVIS */}
        <section className="sec avis-sec" style={{ paddingTop: 0 }}><FondHexagones /><div className="wrap">
          <div className="avis">
            <div className="avis-track" style={{ transform: `translateX(-${avisIdx * 100}%)` }}>
              {AVIS.map((a) => (
                <figure className="avis-card" key={a.nom}>
                  <div className="stars">★★★★★</div>
                  {/* les guillemets font partie de la traduction (« » en fr/es, “ ” en en) */}
                  <blockquote>{t(a.quoteKey)}</blockquote>
                  <figcaption><span className="av">{a.nom[0]}</span><div><b>{a.nom}</b><small>{t(a.roleKey)}</small></div></figcaption>
                </figure>
              ))}
            </div>
            <div className="avis-dots">
              {AVIS.map((a, i) => (
                <button key={a.nom} className={i === avisIdx ? 'on' : ''} onClick={() => setAvisIdx(i)} aria-label={a.nom} />
              ))}
            </div>
          </div>
        </div></section>

        {/* CTA FINAL */}
        <section className="final"><FondHexagones /><div className="wrap">
          <div className="ctaband">
            {!isTouch && <video className="mascot-wave" src={`${CLD}/q_auto/marketing/mascotte-wave.mp4`} autoPlay muted loop playsInline aria-hidden="true" />}
            <h2>{t('lp.final.title')}</h2>
            <p>{t('lp.final.text')}</p>
            <div className="cta-row">
              <a className="btn grad" {...propsRdv()}>{t('lp.cta.call')}</a>
              <Link className="btn ghost" to="/register">{t('lp.cta.account')}</Link>
            </div>
          </div>
        </div></section>
      </div>

      {/* FOOTER */}
      <footer className="lfooter">
        <div className="fb">POSTORICO</div>
        <div className="fgrid wrap">
          <div className="fcol fbrand">
            <div className="fbrand-head"><img src="/logo.png" alt="" /><b>Postorico</b></div>
            <p>{t('lp.footer.about')}</p>
            <div className="fnets">LinkedIn · Instagram · Facebook · TikTok · YouTube · Google Business</div>
          </div>
          <div className="fcol">
            <h4>{t('lp.footer.product')}</h4>
            {NAV_LINKS.map(([labelKey, to]) => (
              <Link key={to} to={to}>{t(labelKey)}</Link>
            ))}
          </div>
          <div className="fcol">
            <h4>{t('lp.footer.account')}</h4>
            {connecte ? (
              <Link to={dashTo}>{t('lp.nav.dashboard')}</Link>
            ) : (
              <>
                <Link to="/login">{t('lp.nav.login')}</Link>
                <Link to="/register">{t('lp.cta.account')}</Link>
              </>
            )}
            <a href={APK_URL}>{t('lp.footer.apk')}</a>
            <a {...propsRdv()}>{t('lp.footer.book')}</a>
          </div>
          <div className="fcol">
            <h4>{t('lp.footer.legal')}</h4>
            <Link to="/cgu">{t('lp.footer.cgu')}</Link>
            <Link to="/confidentialite">{t('lp.footer.privacy')}</Link>
            <Link to="/mentions-legales">{t('lp.footer.legalNotice')}</Link>
            <a href="https://gt-bnb.com" target="_blank" rel="noopener noreferrer">GoodTime BNB ↗</a>
          </div>
        </div>
        <div className="fbottom wrap">
          <span>{t('lp.footer.copy')}</span>
          <span className="fmade">{t('lp.footer.made')}</span>
        </div>
      </footer>
    </div>
  );
}
