import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { APK_URL } from '../../lib/appDownload';
import { isAuthenticated, isAdminAuthenticated } from '../../lib/auth';
import LangSwitcher from '../../components/LangSwitcher';
import { propsRdv } from './shared';
import './homeCine.css';

gsap.registerPlugin(ScrollTrigger);

const CLD = 'https://res.cloudinary.com/dy9gp5pim/video/upload';

// Vidéos de fond par chapitre de la page (fondu enchaîné au scroll).
// `sel` = la section qui déclenche le clip ; un fichier manquant est ignoré (repli sur le précédent).
const BG_CLIPS = [
  // scale(1) : le CSS applique scale(.86) a toutes les couches, ce qui laissait
  // du fond nu de chaque cote sur grand ecran. Le clip d'accueil, lui, doit
  // remplir la largeur — c'est la premiere image du site.
  { src: '/videos/hero-bg.mp4', transform: 'scale(1)' },  // hero : le coq tape puis reflechit
  // Pas de scale(1) ici, contrairement au hero : le texte de ce chapitre est
  // CENTRE. A pleine echelle la mascotte se retrouve derriere le tableau et se
  // bat avec lui. Le scale(.86) du CSS et son masque la remettent en retrait.
  { src: '/videos/bg-idle-wink.mp4', sel: '.cmp' },   // « Plutot que... » : bras croises, clin d'oeil
  // recadrage : Hailuo a rendu le coq ~20 % plus petit sur ce clip -> on aligne sur les autres.
  // NB : ce transform inline REMPLACE le scale(.86) du CSS -> on combine (.86 x 1.2 = 1.032).
  { src: '/videos/bg-point.mp4', sel: '.aud', transform: 'scale(1.032) translateY(2.5%)' },  // « Pour qui » : pointe le titre + clin d'œil
  { src: '/videos/bg-work.mp4', sel: '.flow', transform: 'scale(1.032) translateY(2.5%)' },  // « Accompagnement » : il travaille, concentré
  { none: true, sel: '.testi' },                      // Témoignages : fond noir, toute l'attention sur la vidéo client
  // { src: '/videos/bg-wave.mp4', sel: '.final' },   // CTA final : il salue (à activer quand le clip sera généré)
];

// Scènes de la galerie (vraies captures produit)
// `id` sert de clé React stable (indépendante de la langue) ; les libellés viennent de i18n.
const SCENES = [
  { id: 'studio', src: '/images/studio.jpg', labelKey: 'lp.scenes.studio.label', tagKey: 'lp.scenes.studio.tag', descKey: 'lp.scenes.studio.desc' },
  { id: 'contenus', src: '/images/contenus.jpg', labelKey: 'lp.scenes.contenus.label', tagKey: 'lp.scenes.contenus.tag', descKey: 'lp.scenes.contenus.desc' },
  { id: 'planification', src: '/images/planification.jpg', labelKey: 'lp.scenes.planification.label', tagKey: 'lp.scenes.planification.tag', descKey: 'lp.scenes.planification.desc' },
  { id: 'commentaires', src: '/images/commentaires.jpg', labelKey: 'lp.scenes.commentaires.label', tagKey: 'lp.scenes.commentaires.tag', descKey: 'lp.scenes.commentaires.desc' },
  { id: 'performance', src: '/images/performance.jpg', labelKey: 'lp.scenes.performance.label', tagKey: 'lp.scenes.performance.tag', descKey: 'lp.scenes.performance.desc' },
  { id: 'carrousels', src: '/images/carrousels.jpg', labelKey: 'lp.scenes.carrousels.label', tagKey: 'lp.scenes.carrousels.tag', descKey: 'lp.scenes.carrousels.desc' },
];

// Légende d'une scène : « <b>Titre</b> — <em>accroche</em> · description »
function SceneCap({ scene }) {
  const { t } = useTranslation();
  return (
    <><b>{t(scene.labelKey)}</b> — <em>{t(scene.tagKey)}</em> · {t(scene.descKey)}</>
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

export default function HomeCine() {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const impactRef = useRef(null);
  const [scene, setScene] = useState(0);

  // Utilisateur déjà connecté -> « Mon dashboard » remplace Se connecter / Commencer
  const connecte = isAuthenticated() || isAdminAuthenticated();
  const dashTo = isAdminAuthenticated() ? '/admin' : '/dashboard';

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

    // Entrée du hero en cascade
    if (!reduced) {
      [...rootRef.current.querySelectorAll('.hero-copy > *')].forEach((el, i) => {
        el.style.opacity = 0; el.style.transform = 'translateY(22px)';
        el.style.transition = `opacity 650ms cubic-bezier(.23,1,.32,1) ${i * 80}ms, transform 650ms cubic-bezier(.23,1,.32,1) ${i * 80}ms`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.opacity = 1; el.style.transform = 'none';
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

    return () => {
      st1.kill(); clipTriggers.forEach((tr) => tr.kill());
      ScrollTrigger.getAll().forEach((tr) => tr.kill());
      gsap.ticker.remove(raf);
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
          style={{ transition: 'opacity 700ms ease', ...(c.transform ? { transform: c.transform } : {}) }} />
      ))}
      <img className="poster-fallback" src="/images/hero-poster.jpg" alt="" />
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
          <div className="hero-copy">
            <span className="kicker"><span className="dot" />{t('lp.hero.kicker')}</span>
            <h1>{t('lp.hero.title1')}<br /><span className="g">{t('lp.hero.title2')}</span></h1>
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
            <div className="preview" onMouseEnter={() => setScenePause(true)} onMouseLeave={() => setScenePause(false)}>
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
        <section className="sec"><div className="wrap">
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

        {/* POUR QUI */}
        <section className="sec"><div className="wrap">
          <div className="shead">
            <div className="eyebrow">{t('lp.aud.eyebrow')}</div>
            <h2>{t('lp.aud.title')}</h2>
            <p className="lead">{t('lp.aud.lead')}</p>
          </div>
          <div className="aud">
            <div className="acard">
              <div className="ab"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg></div>
              <h3>{t('lp.aud.1.title')}</h3>
              <p>{t('lp.aud.1.text')}</p>
            </div>
            <div className="acard">
              <div className="ab"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>
              <h3>{t('lp.aud.2.title')}</h3>
              <p>{t('lp.aud.2.text')}</p>
            </div>
            <div className="acard">
              <div className="ab"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V5a1 1 0 011-1h7v17M12 9h7a1 1 0 011 1v11M7 8h2M7 12h2M16 13h2M16 17h2" /></svg></div>
              <h3>{t('lp.aud.3.title')}</h3>
              <p>{t('lp.aud.3.text')}</p>
            </div>
          </div>
        </div></section>

        {/* ACCOMPAGNEMENT */}
        <section className="sec"><div className="wrap">
          <div className="shead">
            <div className="eyebrow">{t('lp.flow.eyebrow')}</div>
            <h2>{t('lp.flow.title')}</h2>
            <p className="lead">{t('lp.flow.lead')}</p>
          </div>
          <div className="flow">
            <div className="fstep"><div className="n">1</div><h3>{t('lp.flow.1.title')}</h3><p>{t('lp.flow.1.text')}</p></div>
            <div className="fstep"><div className="n">2</div><h3>{t('lp.flow.2.title')}</h3><p>{t('lp.flow.2.text')}</p></div>
            <div className="fstep"><div className="n">3</div><h3>{t('lp.flow.3.title')}</h3><p>{t('lp.flow.3.text')}</p></div>
          </div>
          <div className="roles">
            <b>{t('lp.flow.roles.title')}</b>
            <p><Trans i18nKey="lp.flow.roles.text" components={{ b: <b /> }} /></p>
          </div>
          <div className="cta-row center" style={{ marginTop: 32 }}>
            <a className="btn grad" {...propsRdv()}>{t('lp.cta.call')}</a>
          </div>
        </div></section>

        {/* TÉMOIGNAGES */}
        <section className="testi"><div className="wrap">
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
        <section className="sec avis-sec" style={{ paddingTop: 0 }}><div className="wrap">
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
        <section className="final"><div className="wrap">
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
