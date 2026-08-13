import React from 'react';
import {
  AbsoluteFill, Img, interpolate, spring,
  useCurrentFrame, useVideoConfig, Sequence,
} from 'remotion';

/**
 * ReelSequence — moteur de séquences à durée variable.
 * Le reel est décrit par un SCÉNARIO (props.segments) généré par l'agent :
 * une suite de plans typo / image / cta, chacun avec son texte karaoké,
 * sa durée et son effet. La durée totale est calculée par calculateMetadata
 * dans Root.tsx. Chaque reel est unique : c'est le scénario qui change.
 */

type Brand = {
  nom: string;
  principale: string;
  accent: string;
  fond: string;
  logo?: string | null;
};

export type SequenceSegment = {
  type: 'typo' | 'image' | 'cta';
  dur: number;                                   // secondes (2 à 5)
  texte: string;                                 // texte karaoké du plan
  accents?: string[];                            // mots à surligner (chips)
  image?: string | null;                         // URL du visuel (type image)
  effet?: 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight';
  reveal?: 'carte' | 'lamelles' | 'portes' | 'stores' | 'iris';   // comment l'image APPARAÎT
  tilt?: number;                                 // inclinaison de la carte (degrés)
  bar?: string;                                  // texte du bandeau bas (type cta)
};

type Props = {
  brand: Brand;
  segments: SequenceSegment[];
};

export const XFADE = 0.35; // recouvrement entre plans (jamais d'écran vide)

// ---- couleur : encre lisible posée sur l'accent ----
const lum = (hex: string) => {
  const h = (hex || '#000').replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const inkOn = (bg: string) => (lum(bg) > 0.55 ? '#0b1310' : '#ffffff');

const strip = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// ---- pastille logo (client si dispo, sinon initiale) ----
const LogoMark: React.FC<{ brand: Brand; size: number }> = ({ brand, size }) => {
  if (brand.logo) {
    return <Img src={brand.logo} style={{ width: size, height: size, borderRadius: size / 4, objectFit: 'cover' }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 4,
      background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800, fontSize: size * 0.5, color: '#fff',
    }}>
      {(brand.nom || 'P')[0].toUpperCase()}
    </div>
  );
};

// ---- fond persistant : lignes de vitesse + halo ----
const Fond: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const x = ((frame / fps) * 110) % 240;
  const glow = interpolate(Math.sin(frame / 26), [-1, 1], [0.55, 1]);
  return (
    <>
      <AbsoluteFill style={{
        inset: '-30%' as never,
        background: `repeating-linear-gradient(112deg, rgba(234,240,251,0.026) 0 4px, transparent 4px 120px, ${brand.accent}12 120px 127px, transparent 127px 240px)`,
        transform: `translateX(${x}px)`,
      }} />
      <div style={{
        position: 'absolute', top: -300, right: -260, width: 860, height: 860, borderRadius: '50%',
        background: `radial-gradient(circle, ${brand.accent}1c, transparent 62%)`,
        opacity: glow,
      }} />
    </>
  );
};

// ---- karaoké : mots qui popent, mots-clés en chips ----
const Karaoke: React.FC<{
  texte: string; accents: string[]; brand: Brand;
  size: number; top: string; startDelay?: number;
}> = ({ texte, accents, brand, size, top, startDelay = 8 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const acc = new Set((accents || []).map(strip));
  let chipIndex = 0;
  const words = texte.split(/\s+/).filter(Boolean);
  return (
    <div style={{ position: 'absolute', left: 70, right: 70, top, textAlign: 'center', zIndex: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '10px 24px' }}>
        {words.map((w, i) => {
          const delay = startDelay + i * 5;
          const s = spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.7 } });
          const vis = frame >= delay;
          const isAcc = acc.has(strip(w));
          const kind = isAcc ? (chipIndex++ % 2 === 0 ? 'accent' : 'grad') : 'plain';
          const base: React.CSSProperties = {
            fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800,
            fontSize: size, lineHeight: 1.12, letterSpacing: '-0.5px',
            display: 'inline-block', opacity: vis ? Math.min(1, s * 3) : 0,
            transform: `scale(${vis ? Math.max(0.3, s) : 0.3}) rotate(${(1 - Math.min(1, s)) * (i % 2 ? 3 : -3)}deg)`,
            textShadow: '0 6px 30px rgba(0,0,0,0.55)',
          };
          if (kind === 'accent') {
            return (
              <span key={i} style={{
                ...base, color: inkOn(brand.accent), background: brand.accent,
                padding: '2px 24px', transform: `${base.transform} skewX(-8deg)`,
              }}>{w}</span>
            );
          }
          if (kind === 'grad') {
            return (
              <span key={i} style={{
                ...base, color: '#fff',
                background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
                padding: '2px 24px', borderRadius: 16,
              }}>{w}</span>
            );
          }
          return <span key={i} style={{ ...base, color: '#EAF0FB' }}>{w}</span>;
        })}
      </div>
    </div>
  );
};

// ---- coquille de plan : fondu d'entrée/sortie (cross-fade entre plans) ----
const Coquille: React.FC<{ durFrames: number; last: boolean; children: React.ReactNode }> = ({ durFrames, last, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const xf = Math.round(XFADE * fps);
  const inO = interpolate(frame, [0, Math.round(0.3 * fps)], [0, 1], { extrapolateRight: 'clamp' });
  const outO = last ? 1 : interpolate(frame, [durFrames - xf, durFrames], [1, 0], { extrapolateLeft: 'clamp' });
  return <AbsoluteFill style={{ opacity: Math.min(inO, outO) }}>{children}</AbsoluteFill>;
};

// ---- plan TYPO : plein écran typographique ----
const SegTypo: React.FC<{ seg: SequenceSegment; brand: Brand; durFrames: number; last: boolean }> = ({ seg, brand, durFrames, last }) => (
  <Coquille durFrames={durFrames} last={last}>
    <Karaoke texte={seg.texte} accents={seg.accents || []} brand={brand} size={108} top="38%" />
  </Coquille>
);

// ---- plan IMAGE : cadre borné + RÉVÉLATION variable (le piment du template) ----
// Le cadre ne bouge pas (le texte ne passe jamais sur l'image) ; c'est la façon
// dont l'image apparaît DANS le cadre qui change : carte, lamelles, portes,
// stores, iris. Le scénariste varie les reveals à chaque génération.
const SegImage: React.FC<{ seg: SequenceSegment; brand: Brand; durFrames: number; last: boolean }> = ({ seg, brand, durFrames, last }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 2, fps, config: { damping: 14, mass: 0.8 } });
  const p = interpolate(frame, [0, durFrames], [0, 1]);
  const rv = interpolate(frame, [3, Math.round(1.4 * fps)], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  let kScale = 1, kx = 0;
  if (seg.effet === 'zoomIn') kScale = 1 + 0.09 * p;
  else if (seg.effet === 'zoomOut') kScale = 1.09 - 0.09 * p;
  else if (seg.effet === 'panRight') { kScale = 1.12; kx = -40 + 80 * p; }
  else if (seg.effet === 'panLeft') { kScale = 1.12; kx = 40 - 80 * p; }
  else kScale = 1 + 0.06 * p;

  const imgStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
    transform: `scale(${kScale}) translateX(${kx}px)`,
  };
  const reveal = seg.reveal || 'carte';
  const N = 6;

  let contenu: React.ReactNode;
  if (!seg.image) {
    contenu = <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.05)' }} />;
  } else if (reveal === 'lamelles') {
    // 6 bandes verticales alternées haut/bas
    contenu = (
      <>
        {Array.from({ length: N }, (_, i) => {
          const pi = interpolate(frame, [i * 2, i * 2 + Math.round(0.5 * fps)], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - Math.pow(2, -10 * t) });
          const dir = i % 2 === 0 ? -1 : 1;
          return (
            <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(100 / N) * i}%`, width: `${100 / N + 0.2}%`,
              overflow: 'hidden', transform: `translateY(${dir * (1 - pi) * 104}%)` }}>
              <div style={{ position: 'absolute', top: 0, left: `${-i * 100}%`, width: `${N * 100}%`, height: '100%' }}>
                <Img src={seg.image!} style={imgStyle} />
              </div>
            </div>
          );
        })}
      </>
    );
  } else if (reveal === 'portes') {
    const demi = 50 * (1 - rv);
    contenu = (
      <>
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${demi}% 0 ${demi}%)` }}>
          <Img src={seg.image} style={imgStyle} />
        </div>
        {rv < 0.98 && <>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${demi}%`, width: 3, background: brand.accent, opacity: 0.85 }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, right: `${demi}%`, width: 3, background: brand.accent, opacity: 0.85 }} />
        </>}
      </>
    );
  } else if (reveal === 'stores') {
    contenu = (
      <>
        {Array.from({ length: 5 }, (_, i) => {
          const pi = interpolate(frame, [i * 3, i * 3 + Math.round(0.55 * fps)], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - Math.pow(1 - t, 3) });
          return (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${20 * i}%`, height: '20.3%',
              overflow: 'hidden', clipPath: `inset(0 ${(1 - pi) * 100}% 0 0)` }}>
              <div style={{ position: 'absolute', left: 0, top: `${-100 * i}%`, width: '100%', height: '500%' }}>
                <Img src={seg.image!} style={imgStyle} />
              </div>
            </div>
          );
        })}
      </>
    );
  } else if (reveal === 'iris') {
    const r = 8 + rv * 120;
    contenu = (
      <div style={{ position: 'absolute', inset: 0, clipPath: `circle(${r}% at 50% 46%)` }}>
        <Img src={seg.image} style={imgStyle} />
      </div>
    );
  } else {
    // 'carte' : fondu simple dans le cadre (le cadre lui-même monte déjà)
    contenu = <div style={{ position: 'absolute', inset: 0, opacity: Math.min(1, rv * 1.8) }}><Img src={seg.image} style={imgStyle} /></div>;
  }

  return (
    <Coquille durFrames={durFrames} last={last}>
      <div style={{
        position: 'absolute', left: 60, right: 60, top: 400, height: 780, borderRadius: 26, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 50px 130px rgba(0,0,0,0.6)',
        transform: `rotate(${seg.tilt || 0}deg) translateY(${(1 - enter) * 160}px)`,
        opacity: Math.min(1, enter * 2), background: 'rgba(0,0,0,0.25)',
      }}>
        {contenu}
      </div>
      <Karaoke texte={seg.texte} accents={seg.accents || []} brand={brand} size={88} top="67%" />
    </Coquille>
  );
};

// ---- plan CTA : offre + bandeau bas ----
const SegCta: React.FC<{ seg: SequenceSegment; brand: Brand; durFrames: number }> = ({ seg, brand, durFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bar = spring({ frame: frame - Math.round(durFrames * 0.4), fps, config: { damping: 200 } });
  const ink = inkOn(brand.accent);
  return (
    <Coquille durFrames={durFrames} last>
      <Karaoke texte={seg.texte} accents={seg.accents || []} brand={brand} size={124} top="34%" />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 170, background: brand.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40, padding: '0 64px',
        transform: `translateY(${(1 - bar) * 170}px)`,
      }}>
        <span style={{
          fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800, fontSize: 46,
          color: ink, whiteSpace: 'nowrap', letterSpacing: '-0.5px',
        }}>{seg.bar || seg.texte}</span>
        <LogoMark brand={brand} size={62} />
      </div>
    </Coquille>
  );
};

export const ReelSequence: React.FC<Props> = ({ brand, segments }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const segs = (segments || []).filter((s) => s && s.texte);

  // départs cumulés (secondes) — sert aux Sequence ET au punch global
  const starts: number[] = [];
  let t = 0;
  for (const s of segs) { starts.push(t); t += Math.max(1.2, Math.min(6, s.dur || 3)); }

  // zoom punch global au début de chaque plan (signature du montage)
  let punch = 1;
  for (const st of starts) {
    const f0 = st * fps;
    if (st > 0 && frame > f0) punch += 0.05 * Math.exp(-((frame - f0) / fps) * 5.5);
  }

  return (
    <AbsoluteFill style={{ background: brand.fond || '#020617', overflow: 'hidden' }}>
      <Fond brand={brand} />
      <AbsoluteFill style={{ transform: `scale(${punch})`, transformOrigin: 'center 46%' }}>
        {segs.map((seg, i) => {
          const durS = Math.max(1.2, Math.min(6, seg.dur || 3));
          const last = i === segs.length - 1;
          const durFrames = Math.round((durS + (last ? 0 : XFADE)) * fps);
          const from = Math.round(starts[i] * fps);
          const Comp = seg.type === 'image' ? SegImage : seg.type === 'cta' ? SegCta : SegTypo;
          return (
            <Sequence key={i} from={from} durationInFrames={durFrames}>
              <Comp seg={seg} brand={brand} durFrames={durFrames} last={last} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
      {/* bandeau haut permanent : identité du client */}
      <div style={{
        position: 'absolute', top: 56, left: 60, right: 60, zIndex: 8,
        display: 'flex', alignItems: 'center', gap: 18,
      }}>
        <LogoMark brand={brand} size={48} />
        <span style={{
          fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800, fontSize: 28,
          letterSpacing: '0.18em', color: '#EAF0FB', textTransform: 'uppercase',
        }}>{brand.nom}</span>
      </div>
    </AbsoluteFill>
  );
};

// Durée totale d'un scénario, en secondes (utilisée par calculateMetadata dans Root)
export const dureeScenario = (segments: SequenceSegment[]): number => {
  const s = (segments || []).reduce((acc, x) => acc + Math.max(1.2, Math.min(6, x?.dur || 3)), 0);
  return Math.max(6, Math.min(40, s));
};
