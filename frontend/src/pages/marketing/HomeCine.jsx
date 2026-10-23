import { useEffect, useRef, useState, Fragment } from 'react';
import Link from '../../components/LienLangue';
import { useTranslation, Trans } from 'react-i18next';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { animate } from 'motion/react';
import { APK_URL } from '../../lib/appDownload';
import { isAuthenticated, isAdminAuthenticated, espaceParDefaut } from '../../lib/auth';
import LangSwitcher from '../../components/LangSwitcher';
import { propsRdv } from './shared';
import { idVideoDemo } from '../../components/LecteurDemo';
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
  // hero : Rico valide un post (clip « Valider », 1280x720). Cale a gauche : sur un ecran 16:10
  // le recadrage « cover » rogne les cotes, et a 72 % les cartes qui apparaissent passaient sous le titre.
  { src: '/videos/hero-bg.mp4', pos: '0% 32%' },
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

// Vidéos décoratives : toujours muettes. L'attribut JSX `muted` ne suffit pas : React ne
// l'écrit pas dans le HTML pré-rendu (scripts/prerendu.js), et la page statique peut lancer
// la vidéo avec le son avant que React prenne la main. On pose la propriété nous-mêmes ; les
// fichiers eux-mêmes n'ont plus de piste audio (ac_none pour la mascotte sur Cloudinary).
const couperSon = (el) => { if (el) { el.muted = true; el.defaultMuted = true; el.volume = 0; } };

export default function HomeCine() {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
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
  // Démo vidéo : seulement dans les langues qui en ont une (même liste que le tableau de bord).
  const idDemo = idVideoDemo(lang);
  const [demoLancee, setDemoLancee] = useState(false);
  const testi = lang === 'es'
    ? { label: 'Testimonio de cliente · Español', src: `${CLD}/q_auto/marketing/temoignage-es.mp4`, poster: `${CLD}/so_2,q_auto/marketing/temoignage-es.jpg` }
    : { label: 'Témoignage client · Français', src: `${CLD}/q_auto/marketing/temoignage-fr.mp4`, poster: `${CLD}/so_2,q_auto/marketing/temoignage-fr.jpg` };

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
    //
    // Octobre 2026 : cascade SUPPRIMEE. La page est prerendue, le texte du hero
    // est donc visible des le HTML ; ce fondu le masquait (opacity 0) jusqu'a
    // l'execution du JavaScript puis le faisait reapparaitre. Lighthouse
    // mesurait 2,9 s de « delai d'affichage » sur le sous-titre (element LCP)
    // pour cette seule raison. Regle : ne jamais cacher par JavaScript un
    // element deja peint au-dessus de la ligne de flottaison.


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

    // ---- Geometrie partagee par les deux scenes scroll-liees (POUR QUI et
    // ACCOMPAGNEMENT). Les dimensions de la fenetre et les largeurs du rail
    // sont mesurees une fois (puis sur resize et apres chaque refresh
    // ScrollTrigger), et les deux getBoundingClientRect sont faits ENSEMBLE en
    // debut de frame, avant la moindre ecriture de style (voir onScrollFrame
    // plus bas). Avant, chaque rendu lisait la geometrie APRES les ecritures du
    // rendu precedent (et renderAcc lisait offsetWidth carte par carte entre
    // deux ecritures de largeur) : un recalcul force de mise en page par frame
    // de scroll, signale par Lighthouse (« ajustement force de la mise en
    // page »). Le rendu visuel est strictement identique. ----
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let renderPq = null;        // (rect de .pq-wrap) => void, null si reduced-motion
    let renderAccFrame = null;  // (rect de .acc-stage, ou null en mobile/reduced) => void
    let measureAcc = () => {};

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
      const pqCaptions = [1, 2, 3].map((k) => t(`lp.aud.caption.${k}`));

      // `r` = rect de pqWrap, lu par onScrollFrame avant toute ecriture (jamais ici)
      const renderPourQui = (r) => {
        const total = Math.max(1, r.height - vh);
        const p = pqClamp(-r.top / total);
        const brut = p * (n - 0.001);
        const active = Math.min(n - 1, Math.floor(brut));
        // Chaque situation reste POSEE (texte et image centres ensemble) pendant 60 % de
        // son passage ; la bascule vers la suivante se fait sur les 40 % restants, en
        // douceur. Avant, texte et image n'etaient centres qu'a un instant precis.
        const t = pqClamp((brut - active - 0.6) / 0.4);
        const local = t * t * (3 - 2 * t);
        const raw = active + local;
        const affiche = Math.min(n - 1, Math.round(raw));
        const avance = pqClamp(brut - active); // progression reelle (barres), meme pendant la pose

        pqSteps.forEach((step, i) => {
          let d = i - raw;
          if (i === n - 1) d = Math.max(d, 0); // dernière carte : jamais "sortie"
          // Sortie très courte vers le haut : une carte qui remonte de 150 px passait sur le titre.
          const y = d > 0 ? d * 300 : d * 40;
          const z = -Math.abs(d) * 180;
          const rotateX = d * -7;
          const scale = 1 - Math.min(0.12, Math.abs(d) * 0.055);
          let opacity = 1 - Math.min(1, Math.abs(d) * (d < 0 ? 1.6 : 0.95));
          if (Math.abs(d) > 1.15) opacity = 0;
          if (i === active) opacity = 1;
          if (i === active + 1) opacity = Math.max(opacity, local);
          // (plus de regle pour la carte precedente : elle a fini de s'effacer pendant la
          // bascule, elle ne doit pas revenir en fantome derriere la carte posee)
          step.style.visibility = opacity > 0.015 ? 'visible' : 'hidden';
          step.style.opacity = opacity;
          step.style.setProperty('--completion', `${i < active ? 100 : i === active ? avance * 100 : 0}%`);
          step.style.transform = `translate3d(0,${y}px,${z}px) rotateX(${rotateX}deg) scale(${scale})`;
          step.classList.toggle('is-active', i === active);
        });

        // Image : fondu enchaine SUR PLACE avec un leger zoom, jamais de glissement ni de
        // rotation (ils decouvraient le bord de la carte, l'image ne la couvrait plus).
        pqImgs.forEach((img, i) => {
          let d = i - raw;
          if (i === n - 1) d = Math.max(d, 0);
          const opacity = Math.max(0, 1 - Math.abs(d));
          img.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
          img.style.opacity = opacity;
          img.style.transform = `scale(${1 + Math.min(1, Math.abs(d)) * 0.05})`;
        });

        if (pqCount) pqCount.textContent = `${affiche + 1} / ${n}`;
        if (pqCaption) {
          pqCaption.querySelector('p').textContent = pqCaptions[affiche];
        }

        const wave = Math.sin(local * Math.PI);
        pqCard.style.transform = `translate3d(0,${-wave * 20}px,0) rotateX(${-2 + wave * 4}deg) rotateY(${(p - 0.5) * 5}deg) scale(${1 + wave * 0.025})`;

        const head = pqWrap.querySelector('.pq-head');
        if (head) head.style.transform = `translate3d(0,${(p - 0.5) * -14}px,70px)`;
        const left = pqWrap.querySelector('.pq-left');
        if (left) left.style.transform = `translate3d(0,${(p - 0.5) * 4}px,0)`;

        pqDots.forEach((dot, i) => {
          const fill = dot.querySelector('i');
          fill.style.width = i < active ? '100%' : i === active ? `${avance * 100}%` : '0%';
        });
      };

      if (!reduced) {
        // abonnement scroll/resize unique, partage avec ACCOMPAGNEMENT (onScrollFrame)
        renderPq = renderPourQui;

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
    if (accStageRef.current) {
      const stage = accStageRef.current;
      const rail = stage.querySelector('.acc-rail');
      const track = stage.querySelector('.acc-track');
      const cards = Array.from(stage.querySelectorAll('.acc-card'));
      const clampA = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

      // Largeurs du rail et des cartes : lues au montage, sur resize et apres
      // un refresh ScrollTrigger — jamais dans la boucle de rendu (offsetWidth
      // apres une ecriture de largeur = recalcul force de mise en page).
      let railW = 1;
      let usable = 0;
      let cardW = [];
      measureAcc = () => {
        railW = rail.clientWidth;
        cardW = cards.map((c) => c.offsetWidth);
        usable = Math.max(0, track.scrollWidth - railW + 90);
      };

      let accIdle = false; // etat « repos » (mobile / reduced-motion) deja applique
      // `r` = rect de stage lu par onScrollFrame, ou null en mobile / reduced-motion
      const renderAcc = (r) => {
        if (!r) {
          // rail en scroll horizontal natif : styles remis a zero UNE fois,
          // pas a chaque evenement scroll
          if (accIdle) return;
          accIdle = true;
          track.style.transform = '';
          cards.forEach((c) => { c.style.transform = ''; c.style.opacity = ''; });
          return;
        }
        accIdle = false;
        const p = clampA(-r.top / Math.max(1, r.height - vh));
        const x = p * usable;
        track.style.transform = `translate3d(${-x}px,0,0)`;
        const railCenter = railW / 2;
        cards.forEach((card, i) => {
          const center = i * (cardW[i] + 22) - x + 28 + cardW[i] / 2;
          const d = (center - railCenter) / Math.max(railW * 0.65, 1);
          card.style.transform = `translateZ(${-Math.min(1, Math.abs(d)) * 150}px) rotateY(${clampA(d, -1.3, 1.3) * -13}deg) scale(${1 - Math.min(0.08, Math.abs(d) * 0.055)})`;
          card.style.opacity = String(1 - Math.min(0.28, Math.abs(d) * 0.12));
          card.querySelector('.acc-progress i').style.width = `${clampA(1 - Math.abs(d)) * 100}%`;
        });
      };
      renderAccFrame = renderAcc;
    }

    // ---- Une seule frame de rendu pour les deux scenes : TOUTES les lectures
    // de geometrie d'abord, puis les ecritures. ----
    const onScrollFrame = () => {
      const pqRect = renderPq ? pqWrapRef.current.getBoundingClientRect() : null;
      const accRect = renderAccFrame && vw > 900 && !reduced ? accStageRef.current.getBoundingClientRect() : null;
      if (renderPq) renderPq(pqRect);
      if (renderAccFrame) renderAccFrame(accRect);
    };
    const onResize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      measureAcc();
      onScrollFrame();
    };
    let frameUnsub = null;
    if (renderPq || renderAccFrame) {
      // Lenis.on() renvoie une fonction de désinscription (pas de .off() sur
      // l'instance elle-même) — on la garde pour le cleanup.
      if (lenis) frameUnsub = lenis.on('scroll', onScrollFrame);
      else window.addEventListener('scroll', onScrollFrame, { passive: true });
      window.addEventListener('resize', onResize);
      // Apres un refresh ScrollTrigger (load, resize : pin-spacer de « impact »
      // recalcule), tout ce qui est sous le pin a bouge : on remesure et on
      // rejoue une frame, au lieu d'attendre le prochain scroll.
      ScrollTrigger.addEventListener('refresh', onResize);
      measureAcc();
      onScrollFrame();
    }
    const frameCleanup = () => {
      if (!(renderPq || renderAccFrame)) return;
      ScrollTrigger.removeEventListener('refresh', onResize);
      if (frameUnsub) frameUnsub();
      else window.removeEventListener('scroll', onScrollFrame);
      window.removeEventListener('resize', onResize);
    };

    return () => {
      clipTriggers.forEach((tr) => tr.kill());
      ScrollTrigger.getAll().forEach((tr) => tr.kill());
      gsap.ticker.remove(raf);
      pqCleanup();
      frameCleanup();
      if (lenis) lenis.destroy();
      document.removeEventListener('visibilitychange', onVis);
    };
    // re-cable tout (triggers, stack video) quand on bascule mobile <-> desktop
    // ou quand la langue change (légendes de « Pour qui »)
  }, [isTouch, lang, t]);

  return (
    <div className="cine" ref={rootRef}>
      {/* Couches fond — un clip par chapitre, fondu enchaîné au scroll */}
      {/* opacité pilotée UNIQUEMENT en impératif (showClip) — pas dans le style JSX,
          sinon chaque re-render React écrase le fondu en cours */}
      {!isTouch && BG_CLIPS.filter((c) => c.src).map((c, i) => (
        <video key={c.src} ref={(el) => { couperSon(el); if (i === 0) videoRef.current = el; }} className={`bg-video${i === 0 ? ' bg-video--hero' : ''}`} src={c.src}
          muted loop playsInline preload={i === 0 ? 'auto' : 'none'}
          style={{ transition: 'opacity 700ms ease', ...(c.pos ? { objectPosition: c.pos } : {}), ...(c.transform ? { transform: c.transform } : {}) }} />
      ))}
      <div className="bg-tint" />
      <div className="grain" />

      {/* Nav */}
      <nav className="lnav"><div className="wrap">
        <Link className="brand" to="/"><img src="/logo-72.png" srcSet="/logo-72.png 72w, /logo.png 120w" sizes="34px" width="34" height="34" alt="Postorico" /><span className="bt"><b>Postorico</b><small>{t('lp.brand.tagline')}</small></span></Link>
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
              <a className="nav-cta grad" {...propsRdv()}>{t('lp.cta.maDemo')}</a>
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
            <Link className="ghost" to="/register" style={{ transitionDelay: menuOpen ? '325ms' : '0ms' }}>{t('lp.cta.account')}</Link>
            <a className="cta" {...propsRdv()} style={{ transitionDelay: menuOpen ? '350ms' : '0ms' }}>{t('lp.cta.maDemo')}</a>
          </>
        )}
      </div>

      {/* <main> = repere principal demande par l'audit Lighthouse (accessibilite) ;
          la classe .page est conservee, le CSS ne cible que la classe */}
      <main className="page">
        {/* HERO */}
        <section className="hero">
          {/* Sur mobile, la vidéo/poster de fond est retirée (pas de Rico) :
              les hexagones flottants — déjà utilisés plus bas sur cette page
              et sur le reste du site — comblent le fond, sinon plat et vide. */}
          {isTouch && <FondHexagones />}
          <div className="hero-copy">
            <span className="kicker"><span className="dot" />{t('lp.hero.kicker')}</span>
            <h1 key={lang}><TitreAnime l1={t('lp.hero.title1')} l2={t('lp.hero.title2')} /></h1>
            <p className="hero-sub"><Trans i18nKey="lp.hero.sub" components={{ b: <b /> }} /></p>
            <p className="nets">LinkedIn · Instagram · Facebook · TikTok · YouTube · Google Business</p>
            {/* Deux appels à l'action seulement : la démo d'abord, le call de setup ensuite. */}
            <div className="cta-row">
              <a className="btn grad" {...propsRdv()} data-testid="hero-reserver-demo">{t('lp.cta.maDemo')}</a>
              <a className="btn ghost" {...propsRdv()} data-testid="hero-call">{t('lp.cta.call')}</a>
            </div>
            <p className="hero-note">{t('lp.hero.note')}</p>
          </div>
          <div />
        </section>

        {/* DÉMO VIDÉO. Façade : miniature + bouton lecture, l'iframe YouTube (~1 Mo de
            scripts) ne se charge qu'au clic, pour ne pas alourdir la page la plus visitée. */}
        {idDemo && (
          <section className="sec demo-sec" id="demo"><div className="wrap">
            <div className="shead">
              <h2>{t('lp.demo.title')}</h2>
              <p className="lead">{t('lp.demo.lead')}</p>
            </div>
            <div className="demo-video">
              {demoLancee ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${idDemo}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                  title={t('lp.demo.title')}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                />
              ) : (
                <button type="button" className="demo-play" onClick={() => setDemoLancee(true)}
                  aria-label={t('lp.demo.play')} data-testid="home-demo-play">
                  <img src={`https://i.ytimg.com/vi/${idDemo}/maxresdefault.jpg`} alt="" loading="lazy" width="1280" height="720" />
                  <span className="demo-btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
                </button>
              )}
            </div>
            {/* VideoObject : la vidéo peut sortir dans les résultats vidéo de Google et Bing. */}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'VideoObject',
              name: t('lp.demo.title'),
              description: t('lp.demo.lead'),
              thumbnailUrl: `https://i.ytimg.com/vi/${idDemo}/maxresdefault.jpg`,
              uploadDate: '2026-10-16',
              embedUrl: `https://www.youtube.com/embed/${idDemo}`,
              contentUrl: `https://www.youtube.com/watch?v=${idDemo}`,
              publisher: { '@type': 'Organization', name: 'Postorico', logo: { '@type': 'ImageObject', url: 'https://postorico.com/logo.png' } },
            }) }} />
          </div></section>
        )}

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
                  <div className="lg"><img src="/logo-72.png" srcSet="/logo-72.png 72w, /logo.png 120w" sizes="24px" width="24" height="24" alt="" /><b>Postorico</b></div>
                  {SCENES.map((s, i) => (
                    <button type="button" key={s.id} className={'it' + (i === scene ? ' on' : '')} onClick={() => setScene(i)}
                      aria-pressed={i === scene}><span className="ic" aria-hidden="true" />{t(s.labelKey)}</button>
                  ))}
                </div>
                <div className="pmain">
                  {SCENES.map((s, i) => (
                    <img key={s.src} src={s.src} className={i === scene ? 'on' : ''} alt={t('lp.scenes.alt', { name: t(s.labelKey) })} />
                  ))}
                  <div className="hp-dots">
                    {SCENES.map((s, i) => (
                      <button type="button" key={s.id} className={i === scene ? 'on' : ''} onClick={() => setScene(i)}
                        aria-label={t(s.labelKey)} aria-pressed={i === scene} />
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
            <h2>{t('lp.cmp.title')}</h2>
          </div>
          <div className="cmp">
            {CMP.map((o) => (
              <div key={o.id} className={'cmpcard' + (o.win ? ' win' : '')}>
                {/* h3 et non h4 : la section est titree en h2, pas de saut de niveau (audit Lighthouse) */}
                <h3>{t(o.nameKey)}</h3>
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
                <h2 className="pq-title">{t('lp.aud.title')}</h2>
                <p className="pq-lead">{t('lp.aud.lead')}</p>
              </div>

              <div className="pq-left">
                <div className="pq-steps">
                  <article className="pq-step" data-step="0">
                    <h3 className="pq-quote">{t('lp.aud.1.title')}</h3>
                    <p className="pq-desc">{t('lp.aud.1.text')}</p>
                    <div className="pq-tags"><span className="pq-tag">{t('lp.aud.tags.1a')}</span><span className="pq-tag">{t('lp.aud.tags.1b')}</span></div>
                  </article>
                  <article className="pq-step" data-step="1">
                    <h3 className="pq-quote">{t('lp.aud.2.title')}</h3>
                    <p className="pq-desc">{t('lp.aud.2.text')}</p>
                    <div className="pq-tags"><span className="pq-tag">{t('lp.aud.tags.2a')}</span><span className="pq-tag">{t('lp.aud.tags.2b')}</span></div>
                  </article>
                  <article className="pq-step" data-step="2">
                    <h3 className="pq-quote">{t('lp.aud.3.title')}</h3>
                    <p className="pq-desc">{t('lp.aud.3.text')}</p>
                    <div className="pq-tags"><span className="pq-tag">{t('lp.aud.tags.3a')}</span><span className="pq-tag">{t('lp.aud.tags.3b')}</span></div>
                  </article>
                </div>
                <div className="pq-progress"><div className="pq-dot"><i></i></div><div className="pq-dot"><i></i></div><div className="pq-dot"><i></i></div></div>
              </div>

              <div className="pq-card-stage">
                <div className="pq-card" ref={pqCardRef}>
                  <div className="pq-count">1 / 3</div>
                  <img src="/images/pour-qui/calendrier.jpg" data-img="0" alt={t('lp.aud.alt.1')} loading="lazy" decoding="async" />
                  <img src="/images/pour-qui/panneaux.jpg" data-img="1" alt={t('lp.aud.alt.2')} loading="lazy" decoding="async" />
                  <img src="/images/pour-qui/confiant.jpg" data-img="2" alt={t('lp.aud.alt.3')} loading="lazy" decoding="async" />
                  <span className="pq-sheen"></span>
                  <div className="pq-caption">
                    <p>{t('lp.aud.caption.1')}</p>
                  </div>
                </div>
              </div>

            </div>
            <div className="pq-hint">{t('lp.aud.hint')}</div>
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
                  <h2>{t('lp.flow.title')}</h2>
                  <p>{t('lp.flow.lead')}</p>
                </div>
              </aside>
              <div className="acc-rail">
                <div className="acc-track">
                  {[
                    { id: 'audit', idx: '1', kicker: t('lp.flow.1.kicker'), title: t('lp.flow.1.title'), text: t('lp.flow.1.text') },
                    { id: 'construction', idx: '2', kicker: t('lp.flow.2.kicker'), title: t('lp.flow.2.title'), text: t('lp.flow.2.text') },
                    { id: 'pilotage', idx: '3', kicker: t('lp.flow.3.kicker'), title: t('lp.flow.3.title'), text: t('lp.flow.3.text') },
                    { id: 'resultat', idx: '✓', kicker: t('lp.flow.roles.kicker'), title: t('lp.flow.roles.title'), text: <Trans i18nKey="lp.flow.roles.text" components={{ b: <b /> }} /> },
                  ].map((c) => (
                    <article className="acc-card" key={c.id}>
                      <div className="acc-card-index" aria-hidden="true">{c.idx}</div>
                      <div className="acc-card-content">
                        <div className="acc-card-kicker">{c.kicker}</div>
                        <h3>{c.title}</h3>
                        <p>{c.text}</p>
                      </div>
                      <div className="acc-progress"><i /></div>
                    </article>
                  ))}
                </div>
                <div className="acc-hint"><span />{t('lp.flow.hint')}</div>
              </div>
            </div>
            <a className="acc-cta" {...propsRdv()}>{t('lp.cta.call')}</a>
          </div>
        </div></section>

        {/* TÉMOIGNAGES */}
        <section className="testi"><FondHexagones /><div className="wrap">
          <h2>{t('lp.testi.title')}</h2>
          <div className="tgrid tgrid--solo">
            <figure className="vcard">
              <video src={testi.src} poster={testi.poster} controls preload="metadata" playsInline />
              <figcaption>{testi.label}</figcaption>
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

        {/* PRIX : la question que tout dirigeant se pose, avant l'appel final */}
        <section className="sec prix-sec"><div className="wrap">
          <div className="prix">
            <div>
              <h2>{t('lp.prix.title')}</h2>
              <p>{t('lp.prix.text')}</p>
            </div>
            <div className="prix-montant">
              <b>{t('lp.prix.montant')}</b>
              <span>{t('lp.prix.detail')}</span>
              <Link to="/tarifs">{t('lp.prix.lien')}</Link>
            </div>
          </div>
        </div></section>

        {/* CTA FINAL */}
        <section className="final"><FondHexagones /><div className="wrap">
          <div className="ctaband">
            {/* Rico qui salue : WebM transparent (Chrome, Firefox, Edge) ; MP4 deja compose sur la
                couleur du bandeau pour Safari, qui ne lit pas la transparence video. */}
            {!isTouch && (
              <video ref={couperSon} className="mascot-wave" autoPlay muted loop playsInline aria-hidden="true">
                <source src="/videos/rico-salut.webm" type='video/webm; codecs="vp9"' />
                <source src="/videos/rico-salut.mp4" type="video/mp4" />
              </video>
            )}
            <h2>{t('lp.final.title')}</h2>
            <p>{t('lp.final.text')}</p>
            {/* Le bouton principal de la page : grand, seul sur sa ligne. */}
            <a className="btn grad xl" {...propsRdv()} data-testid="home-reserver-demo">{t('lp.cta.demo')}</a>
            <div className="cta-row">
              <Link className="btn ghost" to="/register">{t('lp.cta.account')}</Link>
            </div>
          </div>
        </div></section>
      </main>

      {/* FOOTER */}
      <footer className="lfooter">
        <div className="fgrid wrap">
          <div className="fcol fbrand">
            <div className="fbrand-head"><img src="/logo-72.png" srcSet="/logo-72.png 72w, /logo.png 120w" sizes="28px" width="28" height="28" alt="" /><b>Postorico</b></div>
            <p>{t('lp.footer.about')}</p>
            <div className="fnets">LinkedIn · Instagram · Facebook · TikTok · YouTube · Google Business</div>
          </div>
          {/* titres de colonnes en h3 : dernier titre avant le footer = h2, pas de saut de niveau (audit Lighthouse) */}
          <div className="fcol">
            <h3>{t('lp.footer.product')}</h3>
            {NAV_LINKS.map(([labelKey, to]) => (
              <Link key={to} to={to}>{t(labelKey)}</Link>
            ))}
          </div>
          <div className="fcol">
            <h3>{t('lp.footer.account')}</h3>
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
            <h3>{t('lp.footer.legal')}</h3>
            <Link to="/cgu">{t('lp.footer.cgu')}</Link>
            <Link to="/cgv">{t('lp.footer.cgv')}</Link>
            <Link to="/confidentialite">{t('lp.footer.privacy')}</Link>
            <Link to="/mentions-legales">{t('lp.footer.legalNotice')}</Link>
          </div>
        </div>
        <div className="fbottom wrap">
          <span>{t('lp.footer.copy')}</span>
        </div>
      </footer>
    </div>
  );
}
