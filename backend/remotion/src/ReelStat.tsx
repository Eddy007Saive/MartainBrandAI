import React from 'react';
import {
  AbsoluteFill, Img, interpolate, spring,
  useCurrentFrame, useVideoConfig, Sequence,
} from 'remotion';

/*
  Template « Gros chiffres » — adapte des composants libres reactvideoeditor
  (stat-counter, starfield, text-highlight) au systeme de marque Postorico :
  chaque point devient un ecran plein avec son chiffre geant qui compte.
  10 s (300 frames) · 1080x1920 · props identiques a ReelBrand.
*/

type Brand = {
  nom: string; principale: string; accent: string; fond: string; logo?: string | null;
};
type Props = { brand: Brand; hook: string; points: string[]; cta: string };

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

// Particules qui derivent du centre vers l'exterieur (starfield deterministe, teinte accent)
const Particles: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cx = width / 2, cy = height / 2;
  const stars = Array.from({ length: 70 }, (_, i) => {
    const angle = ((i * 137.508) % 360) * (Math.PI / 180);
    const seedR = ((i * 31 + 17) % 50) / 50;
    const speed = 0.5 + ((i * 7 + 3) % 10) / 10;
    const size0 = 2 + ((i * 13 + 5) % 4);
    const cycle = fps * 6;
    const p = ((frame * speed + i * 21) % cycle) / cycle;
    const radius = seedR * 40 + p * Math.max(cx, cy) * 1.15;
    return {
      key: i,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 1.4,
      size: size0 * (1 + p * 1.6),
      opacity: Math.min(p * 4, 1) * Math.max(1 - p, 0.15) * 0.55,
      tinted: i % 3 === 0,
    };
  });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {stars.map((s) => (
        <div key={s.key} style={{
          position: 'absolute', left: s.x, top: s.y, width: s.size, height: s.size,
          borderRadius: '50%', backgroundColor: s.tinted ? accent : '#ffffff',
          opacity: s.opacity, transform: 'translate(-50%,-50%)',
        }} />
      ))}
    </AbsoluteFill>
  );
};

// Extrait le premier nombre d'un point ("97 % des clients…" -> {n:97, suffix:'%', reste:'des clients…'})
const parseStat = (texte: string) => {
  const m = texte.match(/(\d+(?:[.,]\d+)?)\s*(%|×|x(?=\s|$)|h\b|€|k€|j\b|min\b)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (Number.isNaN(n)) return null;
  return { n, suffix: (m[2] || '').replace(/^x$/i, '×'), decimales: /[.,]\d/.test(m[1]) ? 1 : 0 };
};

// Un ecran stat : chiffre geant qui compte + le point complet dessous + trait accent
const StatScreen: React.FC<{ texte: string; brand: Brand; dur: number }> = ({ texte, brand, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 13, stiffness: 110 } });
  const out = interpolate(frame, [dur - 12, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const stat = parseStat(texte);
  const count = stat
    ? interpolate(frame, [6, Math.min(42, dur - 20)], [0, stat.n], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : null;
  // balayage surligneur derriere le texte (text-highlight)
  const sweep = interpolate(frame, [14, 40], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px', opacity: out, textAlign: 'center' }}>
      {stat && count !== null ? (
        <div style={{
          fontFamily: 'Sora, sans-serif', fontWeight: 800, lineHeight: 1,
          fontSize: 300, letterSpacing: '-0.03em',
          background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
          WebkitBackgroundClip: 'text', color: 'transparent',
          transform: `scale(${0.6 + inS * 0.4})`,
          filter: `drop-shadow(0 0 60px ${brand.principale}55)`,
        }}>
          {stat.decimales ? count.toFixed(1).replace('.', ',') : Math.round(count)}
          <span style={{ fontSize: 170 }}>{stat.suffix}</span>
        </div>
      ) : null}
      <div style={{
        fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: stat ? 54 : 72,
        lineHeight: 1.3, color: '#fff', maxWidth: 880, marginTop: stat ? 40 : 0,
        opacity: inS, transform: `translateY(${(1 - inS) * 44}px)`,
        backgroundImage: `linear-gradient(${brand.accent}33, ${brand.accent}33)`,
        backgroundRepeat: 'no-repeat', backgroundSize: `${sweep}% 38%`, backgroundPosition: '0 88%',
      }}>
        {texte}
      </div>
    </AbsoluteFill>
  );
};

export const ReelStat: React.FC<Props> = ({ brand, hook, points, cta }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const glow = interpolate(Math.sin(frame / 20), [-1, 1], [0.45, 0.95]);

  const pts = points.slice(0, 3);
  const HOOK_DUR = 78;
  const PT_DUR = 62;
  const outroStart = HOOK_DUR + pts.length * PT_DUR;  // 264 pour 3 points
  const hookS = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 90 } });
  const outroS = spring({ frame: frame - outroStart, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: brand.fond || '#0a0a12', overflow: 'hidden' }}>
      <Particles accent={brand.accent} />
      <AbsoluteFill style={{
        background: `radial-gradient(760px 760px at 50% 34%, ${brand.principale}2e, transparent 70%)`,
        opacity: glow,
      }} />

      <div style={{
        position: 'absolute', top: 0, left: 0, height: 12,
        width: `${(frame / durationInFrames) * 100}%`,
        background: `linear-gradient(90deg, ${brand.principale}, ${brand.accent})`, zIndex: 5,
      }} />
      <div style={{ position: 'absolute', top: 64, left: 64, display: 'flex', alignItems: 'center', gap: 22, zIndex: 5 }}>
        <LogoMark brand={brand} size={84} />
        <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 44, color: '#fff' }}>{brand.nom}</div>
      </div>

      {/* HOOK : gros titre avec balayage surligneur */}
      <Sequence from={0} durationInFrames={HOOK_DUR}>
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 80px' }}>
          <div style={{
            fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 88, lineHeight: 1.15,
            letterSpacing: '-0.02em', color: '#fff', maxWidth: 900,
            opacity: Math.min(hookS, interpolate(frame, [HOOK_DUR - 12, HOOK_DUR], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })),
            transform: `translateY(${(1 - hookS) * 60}px)`,
            backgroundImage: `linear-gradient(${brand.principale}40, ${brand.principale}40)`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${interpolate(frame, [16, 50], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}% 42%`,
            backgroundPosition: '0 92%',
          }}>
            {hook}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* UN ECRAN PAR POINT : chiffre geant qui compte */}
      {pts.map((p, i) => (
        <Sequence key={i} from={HOOK_DUR + i * PT_DUR} durationInFrames={PT_DUR}>
          <StatScreen texte={p} brand={brand} dur={PT_DUR} />
        </Sequence>
      ))}

      {/* OUTRO CTA */}
      <Sequence from={outroStart}>
        <AbsoluteFill style={{
          background: brand.fond || '#0a0a12',
          justifyContent: 'center', alignItems: 'center', gap: 32, opacity: outroS,
        }}>
          <div style={{ transform: `scale(${outroS})` }}><LogoMark brand={brand} size={190} /></div>
          <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 72, color: '#fff' }}>{brand.nom}</div>
          <div style={{
            fontFamily: 'Inter, sans-serif', fontSize: 42, fontWeight: 600, color: '#fff',
            background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
            borderRadius: 99, padding: '24px 50px', boxShadow: `0 20px 60px ${brand.principale}66`,
          }}>
            {cta}
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
