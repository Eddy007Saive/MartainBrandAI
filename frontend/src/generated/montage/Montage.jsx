/* COPIE GÉNÉRÉE par scripts/montage.mjs depuis backend/remotion/src/montage/Montage.jsx — ne pas éditer ici. */
/**
 * Composition « Montage » : rend un projet de l'éditeur vidéo manuel.
 *
 * SOURCE DE VÉRITÉ : backend/remotion/src/montage/ (copiée dans le front par
 * frontend/scripts/montage.mjs). Même code pour l'aperçu (@remotion/player) et le
 * rendu serveur (npx remotion render) : ce que le client voit est ce qu'il obtient.
 *
 * Chaque élément est une <Sequence> posée à son début ; les pistes donnent l'ordre
 * d'empilement (première piste = au-dessus). Aucun delayRender : une police
 * absente tombe sur la police de repli, jamais sur un rendu bloqué.
 */
import React from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import { STYLE_SOUSTITRES_DEFAUT } from './schema.js';

const POLICES = {
  Sora: "Sora, Inter, 'Segoe UI', sans-serif",
  Inter: "Inter, 'Segoe UI', sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  Mono: "'JetBrains Mono', Consolas, monospace",
};

// ---- animations d'entrée / sortie (courtes, jamais plus de 0,5 s) ----
function useEntree(animation, dureeFrames) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
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

// ---- éléments ----
const Video = ({ e, projet }) => {
  const { fps } = useVideoConfig();
  const st = cadreStyle(e.cadre, projet.largeur, projet.hauteur, e.rotation);
  const piste = (projet.pistes || []).find((p) => p.id === e.piste);
  const muet = piste?.muet || (e.volume ?? 1) === 0;
  return (
    <div style={{ ...st, opacity: e.opacite ?? 1, overflow: 'hidden', borderRadius: e.rayon || 0 }}>
      <OffthreadVideo
        src={e.src}
        startFrom={Math.round((e.decalage || 0) * fps)}
        playbackRate={e.vitesse || 1}
        volume={muet ? 0 : (e.volume ?? 1)}
        muted={muet}
        style={{ width: '100%', height: '100%', objectFit: e.ajustement || 'cover' }}
      />
    </div>
  );
};

const Image = ({ e, projet, dureeFrames }) => {
  const frame = useCurrentFrame();
  const st = cadreStyle(e.cadre, projet.largeur, projet.hauteur, e.rotation);
  // Léger mouvement de caméra pour qu'une photo ne soit jamais figée (Ken Burns discret).
  const zoom = e.animation === 'zoom' ? interpolate(frame, [0, dureeFrames], [1, 1.08]) : 1;
  const anim = useEntree(e.animation === 'zoom' ? 'aucune' : e.animation, dureeFrames);
  return (
    <div style={{ ...st, opacity: (e.opacite ?? 1) * anim.opacity, overflow: 'hidden', borderRadius: e.rayon || 0 }}>
      <Img src={e.src} style={{ width: '100%', height: '100%', objectFit: e.ajustement || 'cover', transform: `scale(${zoom})` }} />
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
  return <Audio src={e.src} startFrom={Math.round((e.decalage || 0) * fps)} volume={Math.max(0, Math.min(1, v))} />;
};

export const boiteTexte = (style, echelle) => ({
  fontFamily: POLICES[style.police] || POLICES.Sora,
  fontSize: (style.taille || 64) * echelle,
  fontWeight: style.gras ? 800 : 500,
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

/** Un sous-titre : phrase centrée en bas, dans le style commun du projet. */
const SousTitre = ({ e, projet }) => {
  const style = { ...STYLE_SOUSTITRES_DEFAUT, ...(projet.soustitres?.style || {}) };
  const echelle = projet.largeur / 1080;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 220, mass: 0.6 } });
  return (
    <div style={{
      position: 'absolute', left: '6%', width: '88%', top: `${style.position}%`,
      display: 'flex', justifyContent: 'center', transform: `scale(${0.92 + 0.08 * pop})`,
    }}>
      <div style={boiteTexte({ ...style, align: 'center', ombre: !style.contour }, echelle)}>{e.texte}</div>
    </div>
  );
};

const Element = ({ e, projet }) => {
  const { fps } = useVideoConfig();
  const dureeFrames = Math.max(1, Math.round((e.duree || 0) * fps));
  if (e.type === 'video' && e.src) return <Video e={e} projet={projet} />;
  if (e.type === 'image' && e.src) return <Image e={e} projet={projet} dureeFrames={dureeFrames} />;
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
  return (
    <AbsoluteFill style={{ background: projet.fond || '#000' }}>
      {elements.map((e) => (
        <Sequence key={e.id} from={Math.round((e.debut || 0) * fps)} durationInFrames={Math.max(1, Math.round((e.duree || 0) * fps))} layout="none">
          <Element e={e} projet={projet} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export default Montage;
