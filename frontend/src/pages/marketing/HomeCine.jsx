import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { APK_URL } from '../../lib/appDownload';
import { BOOKING_URL } from './shared';
import './homeCine.css';

gsap.registerPlugin(ScrollTrigger);

const CLD = 'https://res.cloudinary.com/dy9gp5pim/video/upload';

// Vidéos de fond par chapitre de la page (fondu enchaîné au scroll).
// `sel` = la section qui déclenche le clip ; un fichier manquant est ignoré (repli sur le précédent).
const BG_CLIPS = [
  { src: '/videos/hero-bg.mp4' },                     // hero : le coq tape puis réfléchit (bulle d'idée)
  { src: '/videos/bg-idle-wink.mp4', sel: '.cmp' },   // « Plutôt que… » : bras croisés, regard caméra, clin d'œil
  // recadrage : Hailuo a rendu le coq ~20 % plus petit sur ce clip -> on aligne sur les autres.
  // NB : ce transform inline REMPLACE le scale(.86) du CSS -> on combine (.86 x 1.2 = 1.032).
  { src: '/videos/bg-point.mp4', sel: '.aud', transform: 'scale(1.032) translateY(2.5%)' },  // « Pour qui » : pointe le titre + clin d'œil
  { src: '/videos/bg-work.mp4', sel: '.flow' },       // « Accompagnement » : il travaille, concentré (sans bulle)
  { none: true, sel: '.testi' },                      // Témoignages : fond noir, toute l'attention sur la vidéo client
  // { src: '/videos/bg-wave.mp4', sel: '.final' },   // CTA final : il salue (à activer quand le clip sera généré)
];

// Scènes de la galerie (vraies captures produit)
const SCENES = [
  { label: 'Studio IA', src: '/images/studio.jpg', cap: <><b>Studio IA</b> — <em>ta voix, pas du générique</em> · L'IA rédige dans ton ton, tu valides en un clic.</> },
  { label: 'Contenus', src: '/images/contenus.jpg', cap: <><b>Contenus</b> — <em>tout au même endroit</em> · Posts et visuels à ta charte, prêts à publier.</> },
  { label: 'Planification', src: '/images/planification.jpg', cap: <><b>Planification</b> — <em>en automatique</em> · Tes jours, ton heure : le calendrier publie tout seul.</> },
  { label: 'Commentaires', src: '/images/commentaires.jpg', cap: <><b>Commentaires</b> — <em>l'inbox unifiée</em> · Tu réponds à tous tes réseaux depuis un seul écran.</> },
  { label: 'Performance', src: '/images/performance.jpg', cap: <><b>Performance</b> — <em>tu sais ce qui marche</em> · Impressions, portée, engagement, réseau par réseau.</> },
  { label: 'Carrousels', src: '/images/carrousels.jpg', cap: <><b>Carrousels</b> — <em>des slides qui accrochent</em> · Générés à ta charte, rendus pixel-perfect.</> },
];

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
  { name: 'Ne rien faire', vals: ['0 € (réseaux morts)', 'Nul', '—', 'Nulle', '—', '—'] },
  { name: 'Un stagiaire / alternant', vals: ['Un salaire', 'Quelques posts', "Il l'apprend (ou pas)", 'Variable', 'Tu relis tout', 'Recrutement + formation'] },
  { name: 'Une agence', vals: ['1 500–3 000 €/mois', 'Forfait limité (8-20/mois)', 'Standardisée', 'Bonne', 'Tu attends les retours', 'Onboarding de semaines'] },
  { name: 'Postorico', win: true, vals: ['À partir de 0 €', 'Illimité, tous réseaux', 'Calibrée sur ta marque', 'Automatique', 'Tu valides en 1 clic', '2 minutes'] },
];
const CRITERIA = ['Coût', 'Volume', 'Ta voix', 'Régularité', 'Contrôle', 'Mise en route'];

export default function HomeCine() {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const impactRef = useRef(null);
  const [scene, setScene] = useState(0);

  // Témoignage vidéo dans la langue du visiteur
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const testi = lang === 'es'
    ? { flag: '🇪🇸', label: 'Testimonio de cliente · Español', src: `${CLD}/q_auto/marketing/temoignage-es.mp4`, poster: `${CLD}/so_2,q_auto/marketing/temoignage-es.jpg` }
    : { flag: '🇫🇷', label: 'Témoignage client · Français', src: `${CLD}/q_auto/marketing/temoignage-fr.mp4`, poster: `${CLD}/so_2,q_auto/marketing/temoignage-fr.jpg` };

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = matchMedia('(hover: none)').matches;

    // Défilement lissé
    const lenis = new Lenis({ lerp: 0.09 });
    lenis.on('scroll', ScrollTrigger.update);
    const raf = (t) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

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
    const H = impactRef.current;
    H.innerHTML = H.textContent.trim().split(/[^\S ]+/).map((w) => {
      const acc = w.startsWith('§');
      return `<span class="word${acc ? ' word--accent' : ''}">${w.replace('§', '')}</span>`;
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
    const st2 = ScrollTrigger.create({
      trigger: '.cine .gallery', start: 'top top', end: () => '+=' + (SCENES.length - 1) * window.innerHeight * 0.62,
      pin: '.cine .gallery-pin', scrub: 1,
      onUpdate: (s) => setScene(Math.max(0, Math.min(SCENES.length - 1, Math.round(s.progress * (SCENES.length - 1))))),
    });

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
      st1.kill(); st2.kill(); clipTriggers.forEach((t) => t.kill());
      ScrollTrigger.getAll().forEach((t) => t.kill());
      gsap.ticker.remove(raf);
      lenis.destroy();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div className="cine" ref={rootRef}>
      {/* Couches fond — un clip par chapitre, fondu enchaîné au scroll */}
      {/* opacité pilotée UNIQUEMENT en impératif (showClip) — pas dans le style JSX,
          sinon chaque re-render React écrase le fondu en cours */}
      {BG_CLIPS.filter((c) => c.src).map((c, i) => (
        <video key={c.src} ref={i === 0 ? videoRef : undefined} className="bg-video" src={c.src}
          muted loop playsInline preload={i === 0 ? 'auto' : 'metadata'}
          style={{ transition: 'opacity 700ms ease', ...(c.transform ? { transform: c.transform } : {}) }} />
      ))}
      <img className="poster-fallback" src="/images/hero-poster.jpg" alt="" />
      <div className="bg-tint" />
      <div className="grain" />

      {/* Nav */}
      <nav className="lnav"><div className="wrap">
        <Link className="brand" to="/"><img src="/logo.png" alt="Postorico" /><span className="bt"><b>Postorico</b><small>Studio de contenu IA</small></span></Link>
        <div className="nav-links">
          <Link to="/fonctionnalites">Fonctionnalités</Link>
          <Link to="/comment-ca-marche">Comment ça marche</Link>
          <Link to="/tarifs">Tarifs</Link>
          <Link to="/faq">FAQ</Link>
        </div>
        <div className="nav-right">
          <Link className="nav-link" to="/login">Se connecter</Link>
          <Link className="nav-cta grad" to="/register">Commencer</Link>
        </div>
      </div></nav>

      <div className="page">
        {/* HERO */}
        <section className="hero">
          <div className="hero-copy">
            <span className="kicker"><span className="dot" />Installé par des experts · Piloté par toi</span>
            <h1>On installe ton système marketing.<br /><span className="g">Tu le pilotes en 2&nbsp;h par mois.</span></h1>
            <p className="hero-sub">Nos experts étudient ta boîte et bâtissent ton studio de contenu <b>calibré sur ta voix</b>. Ensuite c'est toi aux commandes : tu génères, tu valides, tu publies. <b>La régularité d'une agence, sans la facture.</b></p>
            <div className="nets"><b>LinkedIn</b><i>·</i><b>Instagram</b><i>·</i><b>Facebook</b><i>·</i><b>TikTok</b><i>·</i><b>YouTube</b><i>·</i><b>Google Business</b></div>
            <div className="cta-row">
              <a className="btn grad" href={BOOKING_URL}>Réserve ton call de setup →</a>
              <Link className="btn ghost" to="/register">Créer mon compte</Link>
              <a className="btn apk" href={APK_URL}>↓ App Android</a>
            </div>
            <div className="hero-note">Échange gratuit · On étudie ta boîte avant tout</div>
            <div className="hstats">
              <div className="hstat"><b>2 h</b><span>par mois</span></div>
              <div className="hstat"><b>&lt; 30 s</b><span>par post</span></div>
              <div className="hstat"><b>6</b><span>réseaux</span></div>
              <div className="hstat"><b>0 €</b><span>pour démarrer</span></div>
            </div>
          </div>
          <div />
          {/* Bulles de logos qui montent depuis l'écran du laptop */}
          <div className="rise" aria-hidden="true">
            {RISE_LOGOS.map(([k, d]) => (
              <span key={k} className={`rlogo ${k}`}><svg viewBox="0 0 24 24"><path d={d} /></svg></span>
            ))}
          </div>
          <div className="scroll-cue">↓ scrolle</div>
        </section>

        {/* IMPACT */}
        <section className="impact"><div className="wrap">
          <h2 ref={impactRef}>Tu diriges une boîte, §pas §une §rédaction.</h2>
        </div></section>

        {/* PROBLÈME -> SOLUTION */}
        <section className="sec"><div className="wrap">
          <div className="shead">
            <div className="eyebrow">Le constat</div>
            <h2>Être présent sur les réseaux quand on dirige une boîte</h2>
            <p className="lead">Entre le manque de temps, l'irrégularité et les outils éparpillés, on lâche vite. Postorico change la donne.</p>
          </div>
          <div className="ps">
            <div className="pscol bad">
              <div className="ps-head"><span className="ps-ic">✗</span><h3>Sans Postorico</h3></div>
              <ul>
                <li><span className="mk">✗</span>Tu sais qu'il faut publier… mais tu diriges une boîte, pas une rédaction.</li>
                <li><span className="mk">✗</span>Soit tes réseaux sont morts, soit tu pries pour que ton stagiaire s'en sorte.</li>
                <li><span className="mk">✗</span>Tu jongles entre 5 apps et 10 onglets, ou tu paies une agence en aveugle.</li>
                <li><span className="mk">✗</span>Tu ne sais pas vraiment ce qui fonctionne (ni pourquoi).</li>
              </ul>
            </div>
            <div className="ps-arrow" aria-hidden="true">→</div>
            <div className="pscol good">
              <span className="ps-badge">La bascule</span>
              <div className="ps-head"><span className="ps-ic">✓</span><h3>Avec Postorico</h3></div>
              <ul>
                <li><span className="mk">✓</span>L'IA génère des sujets et des posts calibrés sur ta marque.</li>
                <li><span className="mk">✓</span>Tu valides en un clic — rien ne se publie sans ton feu vert.</li>
                <li><span className="mk">✓</span>Une fois validés, la programmation est automatique — la régularité sans y penser.</li>
                <li><span className="mk">✓</span>Tes vraies stats sous les yeux — tu sais enfin ce qui marche.</li>
              </ul>
            </div>
          </div>
        </div></section>

        {/* GALERIE shell d'app */}
        <section className="gallery"><div className="gallery-pin">
          <div className="preview">
            <div className="pbar"><i /><i /><i /></div>
            <div className="shot">
              <div className="sb">
                <div className="lg"><img src="/logo.png" alt="" /><b>Postorico</b></div>
                {SCENES.map((s, i) => (
                  <div key={s.label} className={'it' + (i === scene ? ' on' : '')}><span className="ic" />{s.label}</div>
                ))}
              </div>
              <div className="pmain">
                {SCENES.map((s, i) => (
                  <img key={s.src} src={s.src} className={i === scene ? 'on' : ''} alt={`Postorico — ${s.label}`} />
                ))}
                <div className="hp-dots">{SCENES.map((s, i) => <i key={s.label} className={i === scene ? 'on' : ''} />)}</div>
              </div>
            </div>
            <div className="pcap">{SCENES[scene].cap}</div>
          </div>
        </div></section>

        {/* PLUTÔT QUE… */}
        <section className="sec"><div className="wrap">
          <div className="shead">
            <div className="eyebrow">Plutôt que…</div>
            <h2>Tu connais déjà tes options. Voilà pourquoi Postorico gagne.</h2>
          </div>
          <div className="cmp">
            {CMP.map((o) => (
              <div key={o.name} className={'cmpcard' + (o.win ? ' win' : '')}>
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

        {/* POUR QUI */}
        <section className="sec"><div className="wrap">
          <div className="shead">
            <div className="eyebrow">Pour qui</div>
            <h2>Tu te reconnais dans une de ces situations ?</h2>
            <p className="lead">On ne s'adresse pas à un secteur, mais à une réalité de dirigeant.</p>
          </div>
          <div className="aud">
            <div className="acard">
              <div className="ab"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg></div>
              <h3>« Je n'ai pas le temps »</h3>
              <p>Tu fais tourner ta boîte, pas un studio de contenu. Postorico prend le relais — tu gardes la main, sans y passer tes journées.</p>
            </div>
            <div className="acard">
              <div className="ab"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>
              <h3>« Je délègue… et je croise les doigts »</h3>
              <p>Fini le quitte ou double du stagiaire. L'IA produit dans ta voix, tu valides en un clic. Régulier, sur marque, à chaque fois.</p>
            </div>
            <div className="acard">
              <div className="ab"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A6CFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V5a1 1 0 011-1h7v17M12 9h7a1 1 0 011 1v11M7 8h2M7 12h2M16 13h2M16 17h2" /></svg></div>
              <h3>« Je paie une agence »</h3>
              <p>Même régularité, sans forfait limité ni facture à 2 000 €. Publie autant que tu veux, sur tous tes réseaux. Tu reprends le contrôle.</p>
            </div>
          </div>
        </div></section>

        {/* ACCOMPAGNEMENT */}
        <section className="sec"><div className="wrap">
          <div className="shead">
            <div className="eyebrow">Accompagnement</div>
            <h2>Tu n'as pas le temps ? On construit ton système à ta place.</h2>
            <p className="lead">Nos experts marketing étudient ta marque et bâtissent ton studio sur-mesure. Tu n'as plus qu'à valider et publier.</p>
          </div>
          <div className="flow">
            <div className="fstep"><div className="n">1</div><h3>On étudie ta boîte</h3><p>Positionnement, offres, cibles, ton de marque, concurrents. Un vrai audit, pas un formulaire.</p></div>
            <div className="fstep"><div className="n">2</div><h3>On construit ton système</h3><p>Lignes éditoriales, angles, calendrier, calibrage de l'IA sur ta voix — et des propositions concrètes de posts et formats vidéo à ton image.</p></div>
            <div className="fstep"><div className="n">3</div><h3>Tu pilotes — en ~2 h/mois</h3><p>Le système est prêt : tu génères tes sujets, tu valides, tu produis tes visuels et vidéos, tu programmes. Rien ne sort sans toi.</p></div>
          </div>
          <div className="roles">
            <b>On installe. Tu pilotes.</b>
            <p><b>Nous :</b> on étudie ta marque, on paramètre tout, on crée tes modèles de visuels. — <b>Toi :</b> ~2 h par mois pour générer, valider et publier. Tu gardes le contrôle, on porte la complexité.</p>
          </div>
          <div className="cta-row center" style={{ marginTop: 32 }}>
            <a className="btn grad" href={BOOKING_URL}>Réserve ton call de setup →</a>
          </div>
        </div></section>

        {/* TÉMOIGNAGES */}
        <section className="testi"><div className="wrap">
          <div className="eyebrow">Accès anticipé</div>
          <h2>Les premiers dirigeants à bord</h2>
          <div className="tgrid">
            <figure className="vcard">
              <video src={testi.src} poster={testi.poster} controls preload="metadata" playsInline />
              <figcaption>{testi.flag} {testi.label}</figcaption>
            </figure>
            <div className="quotes">
              <div className="tcard"><div className="stars">★★★★★</div><p className="q">« Avant je payais une agence 2 000 €/mois. Là je gère ça moi-même en quelques minutes, et c'est plus à mon image. »</p><div className="who"><span className="av">A</span><div><b>Aurélie M.</b><small>Gérante, cabinet de conseil</small></div></div></div>
              <div className="tcard"><div className="stars">★★★★★</div><p className="q">« Le setup a tout changé : le système est calibré sur ma voix, je n'ai plus qu'à valider. »</p><div className="who"><span className="av">T</span><div><b>Thomas R.</b><small>Dirigeant PME</small></div></div></div>
            </div>
          </div>
        </div></section>

        {/* GOODTIME */}
        <section className="sec" style={{ paddingTop: 0 }}><div className="wrap">
          <div className="gtband">
            <span>Postorico est un produit <b>GoodTime BNB</b> — l'équipe derrière l'OS de la location courte durée. On construit des outils qui font gagner du temps aux pros.</span>
            <a href="https://gt-bnb.com" target="_blank" rel="noopener noreferrer">Découvrir GoodTime ↗</a>
          </div>
        </div></section>

        {/* CTA FINAL */}
        <section className="final"><div className="wrap">
          <div className="ctaband">
            <video className="mascot-wave" src={`${CLD}/q_auto/marketing/mascotte-wave.mp4`} autoPlay muted loop playsInline aria-hidden="true" />
            <h2>Prêt à reprendre le contrôle de ta présence ?</h2>
            <p>Réserve ton call de setup — on étudie ta boîte, on construit ton système, tu pilotes.</p>
            <div className="cta-row">
              <a className="btn grad" href={BOOKING_URL}>Réserve ton call de setup →</a>
              <Link className="btn ghost" to="/register">Créer mon compte</Link>
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
            <p>Ton studio de contenu IA, installé par des experts et calibré sur ta voix. Tu génères, tu valides, tu publies — 2 h par mois, tous réseaux.</p>
            <div className="fnets">LinkedIn · Instagram · Facebook · TikTok · YouTube · Google Business</div>
          </div>
          <div className="fcol">
            <h4>Produit</h4>
            <Link to="/fonctionnalites">Fonctionnalités</Link>
            <Link to="/comment-ca-marche">Comment ça marche</Link>
            <Link to="/tarifs">Tarifs</Link>
            <Link to="/faq">FAQ</Link>
          </div>
          <div className="fcol">
            <h4>Compte</h4>
            <Link to="/login">Se connecter</Link>
            <Link to="/register">Créer mon compte</Link>
            <a href={APK_URL}>App Android</a>
            <a href={BOOKING_URL}>Réserver un call</a>
          </div>
          <div className="fcol">
            <h4>Légal</h4>
            <Link to="/cgu">CGU</Link>
            <Link to="/confidentialite">Confidentialité</Link>
            <Link to="/mentions-legales">Mentions légales</Link>
            <a href="https://gt-bnb.com" target="_blank" rel="noopener noreferrer">GoodTime BNB ↗</a>
          </div>
        </div>
        <div className="fbottom wrap">
          <span>© 2026 Postorico — un produit GoodTime BNB</span>
          <span className="fmade">Fait avec 🐓 en France</span>
        </div>
      </footer>
    </div>
  );
}
