import React from 'react';
import {
  AbsoluteFill, Audio, Img, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig, Sequence,
} from 'remotion';

/**
 * ReelSequence — moteur de séquences à durée variable.
 * Le reel est décrit par un SCÉNARIO (props.segments) généré par l'agent :
 * une suite de plans typo / image / cta, chacun avec son texte karaoké,
 * sa durée et son effet. La durée totale est calculée par calculateMetadata
 * dans Root.tsx. Chaque reel est unique : c'est le scénario qui change.
 *
 * Le STYLE pilote l'habillage complet (typo, cadres, fond, ornements) :
 * un seul moteur, dix écritures.
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
  label?: string;                                // badge du plan (AVANT/APRÈS, signature du témoin…)
};

export type SequenceStyle =
  | 'signature' | 'cinema' | 'editorial'
  | 'impact' | 'odyssee' | 'vlog' | 'carnet'
  | 'avantapres' | 'temoignage' | 'conseils';

type Props = {
  brand: Brand;
  segments: SequenceSegment[];
  style?: SequenceStyle;
  musique?: string | null;   // URL de la piste de fond (bibliothèque partagée) — mixée au rendu
};

export const XFADE = 0.35; // recouvrement entre plans (jamais d'écran vide)

// Police manuscrite du style Carnet — chargée depuis public/ (le rendu prod est
// un Linux sans polices fantaisie ; on n'ajoute pas de dépendance pour ça).
// JAMAIS de delayRender ici : un FontFace.load() suspendu bloquait tout rendu
// jusqu'au timeout (vu en local). Chargement en tâche de fond ; si la police
// n'est pas prête, le style Carnet sort avec la cursive de repli — jamais d'échec.
if (typeof document !== 'undefined') {
  new FontFace('CarnetScript', `url(${staticFile('fonts/caveat.ttf')})`)
    .load()
    .then((f) => { (document.fonts as FontFaceSet).add(f); })
    .catch(() => {});
}

// ---- couleur : encre lisible posée sur l'accent ----
const lum = (hex: string) => {
  const h = (hex || '#000').replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const inkOn = (bg: string) => (lum(bg) > 0.55 ? '#0b1310' : '#ffffff');

const strip = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Le style Carnet vit sur papier crème : encre sombre partout.
const PAPER = '#f0e7d4';
const PAPER_INK = '#2b2118';
const surPapier = (style?: SequenceStyle) => style === 'carnet';

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

// ---- fond persistant, par style ----
const Fond: React.FC<{ brand: Brand; style: SequenceStyle }> = ({ brand, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const glow = interpolate(Math.sin(frame / 26), [-1, 1], [0.55, 1]);

  if (style === 'carnet') {
    // Papier : grain fin + tache café discrète
    return (
      <>
        <AbsoluteFill style={{
          background: `repeating-linear-gradient(0deg, rgba(120,90,50,0.035) 0 1px, transparent 1px 5px),
                       repeating-linear-gradient(90deg, rgba(120,90,50,0.025) 0 1px, transparent 1px 7px)`,
        }} />
        <div style={{
          position: 'absolute', bottom: -220, left: -180, width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(140,100,50,0.12), transparent 60%)',
        }} />
      </>
    );
  }
  if (style === 'impact') {
    // Brutal : rien que la nuit + un halo qui pulse à peine
    return (
      <>
        <AbsoluteFill style={{ boxShadow: 'inset 0 0 280px rgba(0,0,0,0.85)' }} />
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
          width: 900, height: 900, borderRadius: '50%',
          background: `radial-gradient(circle, ${brand.accent}10, transparent 58%)`, opacity: glow,
        }} />
      </>
    );
  }
  if (style === 'odyssee') {
    // Espace : poussière d'étoiles qui dérive + double halo profond
    const drift = ((frame / fps) * 14) % 90;
    return (
      <>
        <AbsoluteFill style={{
          background: `radial-gradient(1.6px 1.6px at 18% 22%, rgba(255,255,255,0.5), transparent 100%),
                       radial-gradient(1.2px 1.2px at 64% 9%, rgba(255,255,255,0.36), transparent 100%),
                       radial-gradient(1.8px 1.8px at 82% 41%, rgba(255,255,255,0.42), transparent 100%),
                       radial-gradient(1.1px 1.1px at 35% 65%, rgba(255,255,255,0.3), transparent 100%),
                       radial-gradient(1.5px 1.5px at 71% 84%, rgba(255,255,255,0.4), transparent 100%),
                       radial-gradient(1.2px 1.2px at 9% 88%, rgba(255,255,255,0.3), transparent 100%)`,
          backgroundSize: '520px 900px',
          transform: `translateY(${drift}px)`,
        }} />
        <div style={{
          position: 'absolute', top: -340, right: -280, width: 980, height: 980, borderRadius: '50%',
          background: `radial-gradient(circle, ${brand.principale}22, transparent 60%)`, opacity: glow,
        }} />
        <div style={{
          position: 'absolute', bottom: -380, left: -300, width: 900, height: 900, borderRadius: '50%',
          background: `radial-gradient(circle, ${brand.accent}16, transparent 62%)`,
        }} />
      </>
    );
  }
  // défaut (signature & co) : lignes de vitesse + halo
  const x = ((frame / fps) * 110) % 240;
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

// ---- karaoké : mots qui popent — l'écriture change avec le style ----
const Karaoke: React.FC<{
  texte: string; accents: string[]; brand: Brand;
  size: number; top: string; startDelay?: number; mode?: SequenceStyle;
}> = ({ texte, accents, brand, size, top, startDelay = 8, mode = 'signature' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const acc = new Set((accents || []).map(strip));
  let chipIndex = 0;
  const words = texte.split(/\s+/).filter(Boolean);
  const MUL: Partial<Record<SequenceStyle, number>> = {
    impact: 1.12, odyssee: 0.76, vlog: 0.88, carnet: 0.98, temoignage: 0.9, cinema: 1,
  };
  const sz = size * (MUL[mode] ?? 1);
  return (
    <div style={{ position: 'absolute', left: 70, right: 70, top, textAlign: 'center', zIndex: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: mode === 'vlog' ? '14px 14px' : '10px 24px' }}>
        {words.map((w, i) => {
          const delay = startDelay + i * (mode === 'impact' ? 4 : 5);
          const s = spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.7 } });
          const vis = frame >= delay;
          const isAcc = acc.has(strip(w));
          const kind = isAcc ? (chipIndex++ % 2 === 0 ? 'accent' : 'grad') : 'plain';
          const base: React.CSSProperties = {
            fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800,
            fontSize: sz, lineHeight: 1.12, letterSpacing: '-0.5px',
            display: 'inline-block', opacity: vis ? Math.min(1, s * 3) : 0,
            transform: `scale(${vis ? Math.max(0.3, s) : 0.3}) rotate(${(1 - Math.min(1, s)) * (i % 2 ? 3 : -3)}deg)`,
            textShadow: '0 6px 30px rgba(0,0,0,0.55)',
          };
          if (mode === 'cinema' || mode === 'temoignage') {
            return (
              <span key={i} style={{
                ...base, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: 'italic', fontWeight: 500,
                letterSpacing: '0px', color: isAcc ? brand.accent : '#F2EDE4',
                transform: `translateY(${(1 - Math.min(1, s)) * 30}px)`,
              }}>{w}</span>
            );
          }
          if (mode === 'impact') {
            // Coup de poing : uppercase serré, blanc pur / accent — pas de rotation
            const snap = Math.min(1, s * 1.6);
            return (
              <span key={i} style={{
                ...base, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-2px',
                color: isAcc ? brand.accent : '#ffffff',
                transform: `scale(${vis ? 1.5 - 0.5 * snap : 1.5})`,
                opacity: vis ? snap : 0,
                textShadow: '0 10px 44px rgba(0,0,0,0.7)',
              }}>{w}</span>
            );
          }
          if (mode === 'odyssee') {
            // Grandiose : fin, espacé, monte en fondu
            return (
              <span key={i} style={{
                ...base, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.28em',
                color: isAcc ? brand.accent : '#EAF0FB',
                transform: `translateY(${(1 - Math.min(1, s)) * 26}px)`,
              }}>{w}</span>
            );
          }
          if (mode === 'vlog') {
            // Stickers : chaque mot sur son étiquette, légèrement de travers
            const rot = ((i % 3) - 1) * 2.5;
            return (
              <span key={i} style={{
                ...base, fontWeight: 800, fontSize: sz,
                color: isAcc ? inkOn(brand.accent) : '#101418',
                background: isAcc ? brand.accent : '#ffffff',
                padding: '4px 22px', borderRadius: 14,
                transform: `${base.transform} rotate(${rot}deg)`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
                textShadow: 'none',
              }}>{w}</span>
            );
          }
          if (mode === 'carnet') {
            // Manuscrit : encre sombre, mots-clés surlignés au marqueur
            return (
              <span key={i} style={{
                ...base, fontFamily: "CarnetScript, 'Segoe Print', 'Comic Sans MS', cursive",
                fontWeight: 700, letterSpacing: '0px', color: PAPER_INK,
                background: isAcc ? `linear-gradient(transparent 52%, ${brand.accent}88 52%)` : 'none',
                padding: isAcc ? '0 8px' : 0,
                textShadow: 'none',
                transform: `${base.transform} rotate(${((i % 5) - 2) * 0.8}deg)`,
              }}>{w}</span>
            );
          }
          if ((mode === 'editorial' || mode === 'conseils') && isAcc) {
            return (
              <span key={i} style={{
                ...base, color: inkOn(brand.accent), background: brand.accent, padding: '2px 22px',
              }}>{w}</span>
            );
          }
          if (mode === 'editorial' || mode === 'conseils') {
            return <span key={i} style={{ ...base, color: '#EAF0FB' }}>{w}</span>;
          }
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

// ---- chip "CONSEIL N°X" (style conseils) ----
const TipChip: React.FC<{ brand: Brand; n: number; top: string }> = ({ brand, n, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 4, fps, config: { damping: 13, mass: 0.7 } });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, textAlign: 'center', zIndex: 7 }}>
      <span style={{
        display: 'inline-block', fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800, fontSize: 33,
        letterSpacing: '0.14em', color: inkOn(brand.accent), background: brand.accent,
        padding: '8px 30px', transform: `skewX(-8deg) scale(${Math.max(0.3, s)})`,
        opacity: Math.min(1, s * 2),
      }}>CONSEIL N°{String(n).padStart(2, '0')}</span>
    </div>
  );
};

// ---- 5 étoiles (style témoignage) ----
const Etoiles: React.FC<{ brand: Brand; top: string }> = ({ brand, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, textAlign: 'center', zIndex: 7, display: 'flex', justifyContent: 'center', gap: 14 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const s = spring({ frame: frame - 4 - i * 3, fps, config: { damping: 10, mass: 0.6 } });
        return (
          <span key={i} style={{
            fontSize: 52, color: brand.accent, display: 'inline-block',
            transform: `scale(${Math.max(0.2, s)}) rotate(${(1 - Math.min(1, s)) * -18}deg)`,
            opacity: Math.min(1, s * 2), textShadow: '0 6px 26px rgba(0,0,0,0.5)',
          }}>★</span>
        );
      })}
    </div>
  );
};

// ---- signature du témoin (— Sophie, cliente) ----
const Signature: React.FC<{ label: string; top: string }> = ({ label, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  return (
    <div style={{
      position: 'absolute', left: 70, right: 70, top, textAlign: 'center', zIndex: 6,
      fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 34, fontStyle: 'italic',
      color: 'rgba(242,237,228,0.72)', opacity: Math.min(1, s * 2),
      transform: `translateY(${(1 - s) * 20}px)`,
    }}>— {label}</div>
  );
};

// ---- plan TYPO : plein écran typographique ----
const SegTypo: React.FC<{
  seg: SequenceSegment; brand: Brand; durFrames: number; last: boolean; mode?: SequenceStyle; planNo?: number;
}> = ({ seg, brand, durFrames, last, mode, planNo = -1 }) => {
  const temoin = mode === 'temoignage';
  return (
    <Coquille durFrames={durFrames} last={last}>
      {temoin && (
        <>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '17%', textAlign: 'center',
            fontFamily: "Georgia, serif", fontSize: 220, lineHeight: 0.6, color: brand.accent, opacity: 0.5, zIndex: 5,
          }}>“</div>
          <Etoiles brand={brand} top="26%" />
        </>
      )}
      {mode === 'conseils' && planNo >= 1 && <TipChip brand={brand} n={planNo} top="27%" />}
      <Karaoke texte={seg.texte} accents={seg.accents || []} brand={brand}
        size={mode === 'cinema' ? 96 : 108} top={temoin ? '38%' : mode === 'conseils' && planNo >= 1 ? '40%' : '38%'} mode={mode} />
      {temoin && seg.label && <Signature label={seg.label} top="70%" />}
    </Coquille>
  );
};

// ---- plan IMAGE : cadre borné + RÉVÉLATION variable (le piment du template) ----
// Le cadre ne bouge pas (le texte ne passe jamais sur l'image) ; c'est la façon
// dont l'image apparaît DANS le cadre qui change : carte, lamelles, portes,
// stores, iris. Le STYLE change l'habillage du cadre : polaroid, caméra vlog,
// plein cadre brutal, perspective 3D…
const SegImage: React.FC<{
  seg: SequenceSegment; brand: Brand; durFrames: number; last: boolean; mode?: SequenceStyle; imgNo?: number; planNo?: number;
}> = ({ seg, brand, durFrames, last, mode, imgNo = 0, planNo = -1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 2, fps, config: { damping: 14, mass: 0.8 } });
  const p = interpolate(frame, [0, durFrames], [0, 1]);
  const rv = interpolate(frame, [3, Math.round(1.4 * fps)], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  let kScale = 1, kx = 0;
  const amp = mode === 'odyssee' ? 1.8 : 1; // Odyssée traverse l'image plus fort
  if (seg.effet === 'zoomIn') kScale = 1 + 0.09 * amp * p;
  else if (seg.effet === 'zoomOut') kScale = 1 + 0.09 * amp - 0.09 * amp * p;
  else if (seg.effet === 'panRight') { kScale = 1.12; kx = (-40 + 80 * p) * amp; }
  else if (seg.effet === 'panLeft') { kScale = 1.12; kx = (40 - 80 * p) * amp; }
  else kScale = 1 + 0.06 * amp * p;

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

  // ---- habillage du CADRE, par style ----
  const wobble = mode === 'vlog' ? Math.sin(frame / 9) * 0.5 : 0;                       // caméra à la main
  const wobbleY = mode === 'vlog' ? Math.sin(frame / 7 + 2) * 3 : 0;
  const tilt = seg.tilt ?? (mode === 'carnet' ? (imgNo % 2 === 0 ? -3.5 : 3.5) : 0);
  const radius = mode === 'impact' ? 0 : mode === 'vlog' ? 36 : mode === 'carnet' ? 4 : 26;
  const bordure = mode === 'impact' ? `3px solid ${brand.accent}` : '1px solid rgba(255,255,255,0.12)';
  const persp = mode === 'odyssee';
  const rotX = persp ? interpolate(Math.min(1, enter), [0, 1], [16, 5]) : 0;
  const badge = mode === 'avantapres' ? (seg.label || (imgNo % 2 === 0 ? 'AVANT' : 'APRÈS')) : null;
  // AVANT = badge sombre neutre ; tout le reste (APRÈS, RÉSULTAT…) = badge accent
  const badgeApres = badge ? !/avant|before/i.test(badge) : false;

  const cadre = (
    <div style={{
      position: 'absolute', left: 60, right: 60, top: 400, height: 780,
      borderRadius: radius, overflow: mode === 'carnet' ? 'visible' : 'hidden',
      border: mode === 'carnet' ? 'none' : bordure,
      boxShadow: mode === 'carnet' ? '0 34px 70px rgba(60,40,20,0.35)' : '0 50px 130px rgba(0,0,0,0.6)',
      transform: `rotate(${tilt + wobble}deg) translateY(${(1 - enter) * 160 + wobbleY}px)${persp ? ` rotateX(${rotX}deg)` : ''}`,
      opacity: Math.min(1, enter * 2),
      background: mode === 'carnet' ? '#fdfbf6' : 'rgba(0,0,0,0.25)',
      padding: mode === 'carnet' ? '20px 20px 96px' : 0,
    }}>
      <div style={{ position: 'absolute', inset: mode === 'carnet' ? '20px 20px 96px' : 0, overflow: 'hidden', borderRadius: mode === 'carnet' ? 2 : radius }}>
        {contenu}
      </div>
      {mode === 'carnet' && (
        <>
          {/* scotch */}
          <div style={{ position: 'absolute', top: -16, left: 64, width: 150, height: 42, background: 'rgba(240,230,200,0.75)',
            transform: 'rotate(-6deg)', boxShadow: '0 3px 8px rgba(60,40,20,0.2)' }} />
          <div style={{ position: 'absolute', top: -16, right: 64, width: 150, height: 42, background: 'rgba(240,230,200,0.75)',
            transform: 'rotate(5deg)', boxShadow: '0 3px 8px rgba(60,40,20,0.2)' }} />
        </>
      )}
      {mode === 'vlog' && (
        <>
          {/* coins caméra */}
          {([{ t: 14, l: 14, bt: '3px solid #fff', bl: '3px solid #fff' }, { t: 14, r: 14, bt: '3px solid #fff', br: '3px solid #fff' },
            { b: 14, l: 14, bb: '3px solid #fff', bl: '3px solid #fff' }, { b: 14, r: 14, bb: '3px solid #fff', br: '3px solid #fff' }] as Array<Record<string, number | string | undefined>>).map((c, i) => (
            <div key={i} style={{
              position: 'absolute', width: 44, height: 44, opacity: 0.85,
              top: c.t, left: c.l, right: c.r, bottom: c.b,
              borderTop: c.bt, borderLeft: c.bl, borderRight: c.br, borderBottom: c.bb,
            } as React.CSSProperties} />
          ))}
        </>
      )}
      {badge && (
        <div style={{
          position: 'absolute', top: 22, left: 22, zIndex: 4,
          fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800, fontSize: 36, letterSpacing: '0.1em',
          padding: '8px 26px', transform: 'skewX(-8deg)',
          background: badgeApres ? brand.accent : 'rgba(10,14,24,0.85)',
          color: badgeApres ? inkOn(brand.accent) : '#fff',
          border: badgeApres ? 'none' : '2px solid rgba(255,255,255,0.5)',
        }}>{badge.toUpperCase()}</div>
      )}
    </div>
  );

  return (
    <Coquille durFrames={durFrames} last={last}>
      {mode === 'conseils' && planNo >= 1 && <TipChip brand={brand} n={planNo} top="12%" />}
      {persp ? <AbsoluteFill style={{ perspective: 1400 }}>{cadre}</AbsoluteFill> : cadre}
      <Karaoke texte={seg.texte} accents={seg.accents || []} brand={brand} size={mode === 'cinema' ? 78 : 88} top="67%" mode={mode} />
    </Coquille>
  );
};

// ---- plan CTA : offre + bandeau bas ----
const SegCta: React.FC<{ seg: SequenceSegment; brand: Brand; durFrames: number; last?: boolean; mode?: SequenceStyle }> = ({ seg, brand, durFrames, mode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bar = spring({ frame: frame - Math.round(durFrames * 0.4), fps, config: { damping: 200 } });
  const ink = inkOn(brand.accent);
  return (
    <Coquille durFrames={durFrames} last>
      <Karaoke texte={seg.texte} accents={seg.accents || []} brand={brand} size={mode === 'cinema' ? 108 : 124} top="34%" mode={mode} />
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

const Habillage: React.FC<{ style: SequenceStyle; brand: Brand; segCount: number; startsFrames: number[] }> = ({ style, brand, segCount, startsFrames }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (style === 'cinema') {
    return (
      <>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 92, background: '#070707', zIndex: 41 }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 92, background: '#070707', zIndex: 41 }} />
        <AbsoluteFill style={{ boxShadow: 'inset 0 0 240px rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: 40 }} />
      </>
    );
  }
  if (style === 'editorial') {
    const n = Math.min(segCount, 1 + Math.floor((frame / durationInFrames) * segCount));
    return (
      <>
        <div style={{ position: 'absolute', inset: 26, border: '1px solid rgba(242,239,230,0.22)', pointerEvents: 'none', zIndex: 41 }} />
        <div style={{ position: 'absolute', top: 54, right: 66, fontFamily: 'Sora, Inter, sans-serif', fontWeight: 700, fontSize: 21,
          letterSpacing: '0.2em', color: 'rgba(242,239,230,0.6)', zIndex: 42, fontVariantNumeric: 'tabular-nums' }}>
          N°{String(n).padStart(2, '0')}
        </div>
      </>
    );
  }
  if (style === 'impact') {
    // Flash blanc bref à chaque coupe (signature du style)
    let flash = 0;
    for (const f0 of startsFrames) {
      if (f0 > 0 && frame >= f0 && frame <= f0 + 4) flash = Math.max(flash, 0.8 * (1 - (frame - f0) / 4));
    }
    return (
      <>
        {flash > 0.01 && <AbsoluteFill style={{ background: '#ffffff', opacity: flash, zIndex: 44, pointerEvents: 'none' }} />}
        <AbsoluteFill style={{ boxShadow: 'inset 0 0 200px rgba(0,0,0,0.6)', pointerEvents: 'none', zIndex: 40 }} />
      </>
    );
  }
  if (style === 'vlog') {
    const on = Math.floor(frame / 22) % 2 === 0;
    return (
      <div style={{ position: 'absolute', top: 130, right: 66, zIndex: 42, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#ff3b30', opacity: on ? 1 : 0.25 }} />
        <span style={{ fontFamily: 'Sora, Inter, sans-serif', fontWeight: 700, fontSize: 24, letterSpacing: '0.22em', color: '#fff', opacity: 0.85 }}>REC</span>
      </div>
    );
  }
  if (style === 'odyssee') {
    return <AbsoluteFill style={{ boxShadow: 'inset 0 0 300px rgba(0,0,10,0.55)', pointerEvents: 'none', zIndex: 40 }} />;
  }
  return null;
};

// ---- musique de fond : volume posé, fondu d'entrée court et fondu de sortie ----
const Bgm: React.FC<{ src: string }> = ({ src }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const VOL = 0.3;
  return (
    <Audio
      src={src}
      loop
      volume={(f) => {
        const fadeIn = interpolate(f, [0, Math.round(0.6 * fps)], [0, VOL], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const fadeOut = interpolate(f, [durationInFrames - Math.round(1.4 * fps), durationInFrames], [VOL, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return Math.min(fadeIn, fadeOut);
      }}
    />
  );
};

export const ReelSequence: React.FC<Props> = ({ brand, segments, style = 'signature', musique = null }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const segs = (segments || []).filter((s) => s && s.texte);
  const papier = surPapier(style);

  // départs cumulés (secondes) — sert aux Sequence ET au punch global
  const starts: number[] = [];
  let t = 0;
  for (const s of segs) { starts.push(t); t += Math.max(1.2, Math.min(6, s.dur || 3)); }
  const startsFrames = starts.map((st) => Math.round(st * fps));

  // numérotation des plans : ordre parmi les images (avant/après), ordre hors-CTA (conseils)
  const imgNos: number[] = []; const planNos: number[] = [];
  let ic = 0, pc = 0;
  for (const s of segs) {
    imgNos.push(s.type === 'image' ? ic++ : -1);
    planNos.push(s.type !== 'cta' ? pc++ : -1);
  }

  // zoom punch global au début de chaque plan (signature du montage)
  let punch = 1;
  const punchAmp = style === 'impact' ? 0.09 : style === 'odyssee' ? 0.07 : 0.05;
  for (const st of starts) {
    const f0 = st * fps;
    if (st > 0 && frame > f0) punch += punchAmp * Math.exp(-((frame - f0) / fps) * 5.5);
  }

  return (
    <AbsoluteFill style={{ background: papier ? PAPER : style === 'impact' ? '#05060a' : (brand.fond || '#020617'), overflow: 'hidden' }}>
      {musique ? <Bgm src={musique} /> : null}
      <Fond brand={brand} style={style} />
      <AbsoluteFill style={{ transform: `scale(${punch})`, transformOrigin: 'center 46%' }}>
        {segs.map((seg, i) => {
          const durS = Math.max(1.2, Math.min(6, seg.dur || 3));
          const last = i === segs.length - 1;
          const durFrames = Math.round((durS + (last ? 0 : XFADE)) * fps);
          const from = Math.round(starts[i] * fps);
          return (
            <Sequence key={i} from={from} durationInFrames={durFrames}>
              {seg.type === 'image'
                ? <SegImage seg={seg} brand={brand} durFrames={durFrames} last={last} mode={style} imgNo={imgNos[i]} planNo={planNos[i]} />
                : seg.type === 'cta'
                  ? <SegCta seg={seg} brand={brand} durFrames={durFrames} last={last} mode={style} />
                  : <SegTypo seg={seg} brand={brand} durFrames={durFrames} last={last} mode={style} planNo={planNos[i]} />}
            </Sequence>
          );
        })}
      </AbsoluteFill>
      <Habillage style={style} brand={brand} segCount={segs.length} startsFrames={startsFrames} />
      {/* bandeau haut permanent : identité du client */}
      <div style={{
        position: 'absolute', top: 56, left: 60, right: 60, zIndex: 8,
        display: 'flex', alignItems: 'center', gap: 18,
      }}>
        <LogoMark brand={brand} size={48} />
        <span style={{
          fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800, fontSize: 28,
          letterSpacing: '0.18em', color: papier ? PAPER_INK : '#EAF0FB', textTransform: 'uppercase',
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
