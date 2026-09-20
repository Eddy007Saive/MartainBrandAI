/* COPIE GÉNÉRÉE par scripts/montage.mjs depuis backend/remotion/src/montage/Montage.jsx — ne pas éditer ici. */
/**
 * Composition « Montage » : rend un projet de l'éditeur vidéo manuel.
 *
 * SOURCE DE VÉRITÉ : backend/remotion/src/montage/ (copiée dans le front par
 * frontend/scripts/montage.mjs). Même code pour l'aperçu (@remotion/player) et le
 * rendu serveur (npx remotion render) : ce que le client voit est ce qu'il obtient.
 *
 * Chaque élément est une <Sequence> posée à son début ; les pistes donnent l'ordre
 * d'empilement (première piste = au-dessus). Les polices viennent de @remotion/google-fonts
 * (chargées seulement si le projet les utilise) : sans elles, le rendu serveur Linux retombait
 * sur une police sans rapport avec l'aperçu. Un échec de chargement ne bloque jamais le rendu.
 */
import React, { createContext, useContext } from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import { loadFont as fSora } from '@remotion/google-fonts/Sora';
import { loadFont as fInter } from '@remotion/google-fonts/Inter';
import { loadFont as fMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as fPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as fBebas } from '@remotion/google-fonts/BebasNeue';
import { loadFont as fAnton } from '@remotion/google-fonts/Anton';
import { loadFont as fPlayfair } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as fCaveat } from '@remotion/google-fonts/Caveat';
import { STYLE_SOUSTITRES_DEFAUT, TRANSITION_DUREE_DEFAUT, RECADRE_DEFAUT, prolongation } from './schema.js';

const POLICES = {
  Sora: "Sora, Inter, 'Segoe UI', sans-serif",
  Inter: "Inter, 'Segoe UI', sans-serif",
  Montserrat: "Montserrat, Inter, sans-serif",
  Poppins: "Poppins, Inter, sans-serif",
  'Bebas Neue': "'Bebas Neue', Impact, sans-serif",
  Anton: "Anton, Impact, sans-serif",
  'Playfair Display': "'Playfair Display', Georgia, serif",
  Caveat: "Caveat, 'Segoe Print', cursive",
  Georgia: "Georgia, 'Times New Roman', serif",
  Mono: "'JetBrains Mono', Consolas, monospace",
};
// Graisses [normal, gras] : les polices à une seule graisse ne doivent pas être « grossies » de force.
const POIDS = { 'Bebas Neue': [400, 400], Anton: [400, 400], Caveat: [500, 700] };
const SOUS = ['latin', 'latin-ext'];
const CHARGEURS = {
  Sora: () => fSora('normal', { weights: ['500', '800'], subsets: SOUS }),
  Inter: () => fInter('normal', { weights: ['500', '800'], subsets: SOUS }),
  Montserrat: () => fMontserrat('normal', { weights: ['500', '800'], subsets: SOUS }),
  Poppins: () => fPoppins('normal', { weights: ['500', '800'], subsets: SOUS }),
  'Bebas Neue': () => fBebas('normal', { weights: ['400'], subsets: SOUS }),
  Anton: () => fAnton('normal', { weights: ['400'], subsets: SOUS }),
  'Playfair Display': () => fPlayfair('normal', { weights: ['500', '800'], subsets: SOUS }),
  Caveat: () => fCaveat('normal', { weights: ['500', '700'], subsets: SOUS }),
};
const CHARGEES = new Set();
function chargerPolices(projet) {
  const utilisees = new Set([projet.soustitres?.style?.police || 'Sora']);
  (projet.elements || []).forEach((e) => { if (e.type === 'texte') utilisees.add(e.style?.police || 'Sora'); });
  utilisees.forEach((nom) => {
    if (!CHARGEURS[nom] || CHARGEES.has(nom)) return;
    CHARGEES.add(nom);
    try { CHARGEURS[nom](); } catch (err) { /* police indisponible : la police de repli prend le relais */ }
  });
}

// Aperçu figé : en pause, l'éditeur montre chaque élément dans son état posé (un texte animé
// ne doit pas être invisible sur sa première image). Jamais actif au rendu serveur.
const StatiqueCtx = createContext(false);

// ---- animations d'entrée / sortie (courtes, jamais plus de 0,5 s) ----
function useEntree(animation, dureeFrames) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const statique = useContext(StatiqueCtx);
  if (statique) return { opacity: 1, transform: 'none' };
  const fin = Math.max(0, dureeFrames - Math.round(fps * 0.35));
  const sortie = interpolate(frame, [fin, dureeFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (!animation || animation === 'aucune') return { opacity: sortie, transform: 'none' };
  if (animation === 'fondu') {
    const o = interpolate(frame, [0, Math.round(fps * 0.35)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return { opacity: Math.min(o, sortie), transform: 'none' };
  }
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 160, mass: 0.7 } });
  if (animation === 'monter') {
    return { opacity: Math.min(s, sortie), transform: `translateY(${(1 - s) * 40}px)` };
  }
  // pop
  return { opacity: Math.min(1, s * 1.4, sortie), transform: `scale(${0.7 + 0.3 * s})` };
}

// ---- transitions d'entrée d'un plan (le plan précédent est prolongé dessous par la composition) ----
function useTransition(transition) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const statique = useContext(StatiqueCtx);
  if (statique) return {};
  const type = transition?.type;
  if (!type || type === 'aucune') return {};
  const n = Math.max(1, Math.round((transition.duree || TRANSITION_DUREE_DEFAUT) * fps));
  const p = interpolate(frame, [0, n], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const doux = 1 - Math.pow(1 - p, 3); // ease-out
  if (type === 'fondu') return { opacity: p };
  if (type === 'noir') return { opacity: interpolate(p, [0, 0.5, 1], [0, 0, 1]) };
  if (type === 'glisser') return { transform: `translateX(${(1 - doux) * 100}%)` };
  if (type === 'zoom') return { opacity: Math.min(1, p * 2), transform: `scale(${1.25 - 0.25 * doux})` };
  if (type === 'volet') return { clipPath: `inset(0 ${(1 - doux) * 100}% 0 0)` };
  return {};
}

/** Fondu au noir de SORTIE quand le plan suivant entre par « noir » : la composition passe `sortieNoir`. */
function useSortieNoir(dureeFrames, sortieNoir) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const statique = useContext(StatiqueCtx);
  if (!sortieNoir || statique) return 1;
  const n = Math.max(1, Math.round(sortieNoir * fps / 2));
  return interpolate(frame, [dureeFrames - n, dureeFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

const cadreStyle = (cadre, largeur, hauteur, rotation) => {
  const c = cadre || { x: 0, y: 0, w: 100, h: 100 };
  return {
    position: 'absolute',
    left: (c.x / 100) * largeur,
    top: (c.y / 100) * hauteur,
    width: (c.w / 100) * largeur,
    height: (c.h / 100) * hauteur,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
  };
};

// Recadrage : zoom vers un point d'intérêt (objectPosition pour le cadrage « remplir », même point
// comme origine du zoom).
const recadrage = (e) => {
  const r = { ...RECADRE_DEFAUT, ...(e.recadre || {}) };
  return { zoom: r.zoom || 1, position: `${r.x}% ${r.y}%` };
};

// ---- éléments ----
const Video = ({ e, projet, dureeFrames, sortieNoir }) => {
  const { fps } = useVideoConfig();
  const st = cadreStyle(e.cadre, projet.largeur, projet.hauteur, e.rotation);
  const piste = (projet.pistes || []).find((p) => p.id === e.piste);
  const muet = piste?.muet || (e.volume ?? 1) === 0;
  const tr = useTransition(e.transition);
  const noir = useSortieNoir(dureeFrames, sortieNoir);
  const rc = recadrage(e);
  return (
    <div style={{ ...st, ...tr, opacity: (e.opacite ?? 1) * (tr.opacity ?? 1) * noir, overflow: 'hidden', borderRadius: e.rayon || 0,
      transform: [st.transform, tr.transform].filter(Boolean).join(' ') || undefined }}>
      <OffthreadVideo
        src={e.src}
        startFrom={Math.round((e.decalage || 0) * fps)}
        playbackRate={e.vitesse || 1}
        volume={muet ? 0 : (e.volume ?? 1)}
        muted={muet}
        style={{ width: '100%', height: '100%', objectFit: e.ajustement || 'cover', objectPosition: rc.position,
          transformOrigin: rc.position, transform: rc.zoom !== 1 ? `scale(${rc.zoom})` : undefined }}
      />
    </div>
  );
};

const Image = ({ e, projet, dureeFrames, sortieNoir }) => {
  const frame = useCurrentFrame();
  const st = cadreStyle(e.cadre, projet.largeur, projet.hauteur, e.rotation);
  // Léger mouvement de caméra pour qu'une photo ne soit jamais figée (Ken Burns discret).
  const zoom = e.animation === 'zoom' ? interpolate(frame, [0, dureeFrames], [1, 1.08]) : 1;
  const anim = useEntree(e.animation === 'zoom' ? 'aucune' : e.animation, dureeFrames);
  const tr = useTransition(e.transition);
  const noir = useSortieNoir(dureeFrames, sortieNoir);
  const rc = recadrage(e);
  return (
    <div style={{ ...st, ...tr, opacity: (e.opacite ?? 1) * anim.opacity * (tr.opacity ?? 1) * noir, overflow: 'hidden', borderRadius: e.rayon || 0,
      transform: [st.transform, tr.transform].filter(Boolean).join(' ') || undefined }}>
      <Img src={e.src} style={{ width: '100%', height: '100%', objectFit: e.ajustement || 'cover', objectPosition: rc.position,
        transformOrigin: rc.position, transform: `scale(${zoom * rc.zoom})` }} />
    </div>
  );
};

const Son = ({ e, projet, dureeFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const piste = (projet.pistes || []).find((p) => p.id === e.piste);
  if (piste?.muet) return null;
  const fondu = Math.round((e.fonduSortie || 0) * fps);
  const v = fondu > 0
    ? interpolate(frame, [dureeFrames - fondu, dureeFrames], [e.volume ?? 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : (e.volume ?? 1);
  return <Audio src={e.src} startFrom={Math.round((e.decalage || 0) * fps)} playbackRate={e.vitesse || 1} volume={Math.max(0, Math.min(1, v))} />;
};

export const boiteTexte = (style, echelle) => ({
  fontFamily: POLICES[style.police] || POLICES.Sora,
  fontSize: (style.taille || 64) * echelle,
  fontWeight: (POIDS[style.police] || [500, 800])[style.gras ? 1 : 0],
  fontStyle: style.italique ? 'italic' : 'normal',
  color: style.couleur || '#fff',
  background: style.fond && style.fond !== 'transparent' ? style.fond : 'transparent',
  borderRadius: (style.rayon || 0) * echelle,
  padding: style.marge ? `${style.marge * 0.55 * echelle}px ${style.marge * echelle}px` : 0,
  textAlign: style.align || 'center',
  textShadow: style.ombre ? `0 ${4 * echelle}px ${18 * echelle}px rgba(0,0,0,.55)` : 'none',
  WebkitTextStroke: style.contour ? `${Math.max(1, 2 * echelle)}px rgba(0,0,0,.85)` : undefined,
  lineHeight: 1.12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  display: 'inline-block',
  maxWidth: '100%',
});

const Texte = ({ e, projet, dureeFrames }) => {
  const echelle = projet.largeur / 1080;
  const anim = useEntree(e.style?.animation, dureeFrames);
  const st = cadreStyle(e.cadre, projet.largeur, projet.hauteur, e.rotation);
  const align = e.style?.align || 'center';
  return (
    <div style={{
      ...st, display: 'flex', alignItems: 'center',
      justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
      opacity: (e.opacite ?? 1) * anim.opacity, transform: `${st.transform && st.transform !== 'none' ? st.transform + ' ' : ''}${anim.transform}`,
    }}>
      <div style={boiteTexte(e.style || {}, echelle)}>{e.texte}</div>
    </div>
  );
};

/** Un sous-titre : phrase centrée en bas, dans le style commun du projet. Avec des mots
 *  horodatés, le mot en cours est surligné (mode 'surligne') ou les mots apparaissent au fil de la
 *  voix (mode 'apparition') ; sans mots, la phrase entière est affichée. */
const SousTitre = ({ e, projet }) => {
  const style = { ...STYLE_SOUSTITRES_DEFAUT, ...(projet.soustitres?.style || {}) };
  const echelle = projet.largeur / 1080;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 220, mass: 0.6 } });
  const mots = Array.isArray(e.mots) && e.mots.length ? e.mots : null;
  const mode = mots ? (style.mode || 'surligne') : 'phrase';
  const boite = boiteTexte({ ...style, align: 'center', ombre: !style.contour }, echelle);
  let contenu = e.texte;
  if (mode !== 'phrase') {
    // Le mot « en cours » : celui dont la fenêtre contient t, sinon le dernier déjà prononcé.
    let actif = -1;
    mots.forEach((m, i) => { if (t >= (m.t || 0)) actif = i; });
    contenu = mots.map((m, i) => {
      const dit = t >= (m.t || 0);
      const enCours = i === actif && t < (m.t || 0) + (m.d || 0.3) + 0.08;
      const visible = mode === 'surligne' || dit;
      return (
        <span key={i} style={{
          display: 'inline-block', marginRight: '0.28em',
          color: enCours ? style.couleurActive : style.couleur,
          opacity: visible ? 1 : 0,
          transform: enCours ? 'scale(1.1)' : 'scale(1)',
          transition: 'none',
        }}>{m.texte}</span>
      );
    });
  }
  return (
    <div style={{
      position: 'absolute', left: '6%', width: '88%', top: `${style.position}%`,
      display: 'flex', justifyContent: 'center', transform: `scale(${0.92 + 0.08 * pop})`,
    }}>
      <div style={boite}>{contenu}</div>
    </div>
  );
};

const Element = ({ e, projet, dureeFrames, sortieNoir }) => {
  if (e.type === 'video' && e.src) return <Video e={e} projet={projet} dureeFrames={dureeFrames} sortieNoir={sortieNoir} />;
  if (e.type === 'image' && e.src) return <Image e={e} projet={projet} dureeFrames={dureeFrames} sortieNoir={sortieNoir} />;
  if (e.type === 'audio' && e.src) return <Son e={e} projet={projet} dureeFrames={dureeFrames} />;
  if (e.type === 'texte') return <Texte e={e} projet={projet} dureeFrames={dureeFrames} />;
  if (e.type === 'soustitre') return <SousTitre e={e} projet={projet} />;
  return null;
};

export const Montage = (projet) => {
  const { fps } = useVideoConfig();
  const pistes = projet.pistes || [];
  const ordre = new Map(pistes.map((p, i) => [p.id, i]));
  // Du fond vers le dessus : dernière piste d'abord.
  const elements = [...(projet.elements || [])].sort((a, b) => (ordre.get(b.piste) ?? 0) - (ordre.get(a.piste) ?? 0));
  chargerPolices(projet);
  return (
    <StatiqueCtx.Provider value={!!projet.__statique}>
    <AbsoluteFill style={{ background: projet.fond || '#000' }}>
      {elements.map((e) => {
        // Un plan suivi d'une transition reste affiché dessous pendant celle-ci (prolongation) ;
        // s'il est suivi d'un « noir », il s'éteint lui-même sur la première moitié.
        const prolonge = (e.type === 'image' || e.type === 'video') ? prolongation(projet, e) : 0;
        const suivant = prolonge ? (projet.elements || []).find((x) => x.piste === e.piste && x.id !== e.id
          && Math.abs((x.debut || 0) - ((e.debut || 0) + (e.duree || 0))) <= 0.1) : null;
        const sortieNoir = suivant?.transition?.type === 'noir' ? prolonge : 0;
        const dureeFrames = Math.max(1, Math.round(((e.duree || 0) + prolonge) * fps));
        return (
          <Sequence key={e.id} from={Math.round((e.debut || 0) * fps)} durationInFrames={dureeFrames} layout="none">
            <Element e={e} projet={projet} dureeFrames={dureeFrames} sortieNoir={sortieNoir} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
    </StatiqueCtx.Provider>
  );
};

export default Montage;
