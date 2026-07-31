import React from 'react';
import {
  AbsoluteFill, Img, interpolate, spring,
  useCurrentFrame, useVideoConfig, Sequence,
} from 'remotion';

type Brand = {
  nom: string;
  principale: string;
  accent: string;
  fond: string;
  logo?: string | null;
};

type Props = {
  brand: Brand;
  hook: string;
  contexte: string;
  points: string[];
  lecon: string;
  cta: string;
};

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

const Word: React.FC<{ children: React.ReactNode; delay: number; accent: boolean; brand: Brand }> =
  ({ children, delay, accent, brand }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
    return (
      <span style={{
        display: 'inline-block', marginRight: 22, opacity: s,
        filter: `blur(${(1 - s) * 12}px)`, transform: `translateY(${(1 - s) * 60}px)`,
        background: accent ? `linear-gradient(135deg, ${brand.principale}, ${brand.accent})` : undefined,
        WebkitBackgroundClip: accent ? 'text' : undefined,
        color: accent ? 'transparent' : '#fff',
      }}>
        {children}
      </span>
    );
  };

// Un point plein écran : numéro géant + texte, entrée spring + sortie en fondu
const PointScreen: React.FC<{ texte: string; num: number; brand: Brand; dur: number }> =
  ({ texte, num, brand, dur }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const inS = spring({ frame, fps, config: { damping: 18, mass: 0.9 } });
    const out = interpolate(frame, [dur - 14, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 80px', opacity: out }}>
        <div style={{
          fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 210, lineHeight: 1,
          background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
          WebkitBackgroundClip: 'text', color: 'transparent',
          opacity: 0.9, transform: `translateX(${(1 - inS) * -80}px)`,
        }}>
          {String(num).padStart(2, '0')}
        </div>
        <div style={{
          fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 64, lineHeight: 1.25,
          color: '#fff', marginTop: 34, maxWidth: 880,
          opacity: inS, transform: `translateY(${(1 - inS) * 50}px)`,
        }}>
          {texte}
        </div>
        <div style={{
          width: 140, height: 8, borderRadius: 99, marginTop: 44,
          background: brand.accent, boxShadow: `0 0 24px ${brand.accent}`,
          transform: `scaleX(${inS})`, transformOrigin: 'left',
        }} />
      </AbsoluteFill>
    );
  };

export const ReelLong: React.FC<Props> = ({ brand, hook, contexte, points, lecon, cta }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const glow = interpolate(Math.sin(frame / 22), [-1, 1], [0.5, 1]);

  const hookWords = hook.split(' ');
  const accentFrom = Math.max(1, Math.ceil(hookWords.length * 0.55));
  const pts = points.slice(0, 3);
  const PT_DUR = 100; // ~3,3 s par point
  const ptsStart = 250;
  const leconStart = ptsStart + pts.length * PT_DUR;   // 550 pour 3 points
  const outroStart = leconStart + 70;                  // 620
  const leconS = spring({ frame: frame - leconStart, fps, config: { damping: 200 } });
  const outroS = spring({ frame: frame - outroStart, fps, config: { damping: 200 } });
  const ctxS = spring({ frame: frame - 150, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: brand.fond || '#0a0a12', overflow: 'hidden' }}>
      <AbsoluteFill style={{
        background: `radial-gradient(720px 720px at 50% 30%, ${brand.principale}33, transparent 70%)`,
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

      {/* ACTE 1 — hook mot à mot (0 → 5 s) */}
      <Sequence from={10} durationInFrames={140}>
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 80px' }}>
          <div style={{
            fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 86,
            lineHeight: 1.16, letterSpacing: '-0.02em', maxWidth: 920,
            opacity: interpolate(frame, [136, 150], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            {hookWords.map((w, i) => (
              <Word key={i} delay={10 + i * 7} accent={i >= accentFrom} brand={brand}>{w}</Word>
            ))}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* ACTE 2 — le contexte (5 → 8,3 s) */}
      <Sequence from={150} durationInFrames={100}>
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 90px' }}>
          <div style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 52, lineHeight: 1.5,
            color: '#dbe2ee', maxWidth: 880,
            opacity: Math.min(ctxS, interpolate(frame, [236, 250], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })),
            transform: `translateY(${(1 - ctxS) * 40}px)`,
          }}>
            {contexte}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* ACTE 3 — chaque preuve en plein écran (~3,3 s chacune) */}
      {pts.map((p, i) => (
        <Sequence key={i} from={ptsStart + i * PT_DUR} durationInFrames={PT_DUR}>
          <PointScreen texte={p} num={i + 1} brand={brand} dur={PT_DUR} />
        </Sequence>
      ))}

      {/* ACTE 4 — la leçon en citation (18,3 → 20,6 s) */}
      <Sequence from={leconStart} durationInFrames={70 + 40}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 90px' }}>
          <div style={{
            fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 180, lineHeight: 0.6,
            color: brand.accent, opacity: leconS * 0.85,
          }}>
            «
          </div>
          <div style={{
            fontFamily: 'Sora, sans-serif', fontWeight: 700, fontStyle: 'italic', fontSize: 60,
            lineHeight: 1.35, color: '#fff', textAlign: 'center', maxWidth: 860, marginTop: 26,
            opacity: leconS * interpolate(frame, [outroStart - 8, outroStart + 6], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            transform: `scale(${0.92 + leconS * 0.08})`,
          }}>
            {lecon}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* ACTE 5 — outro CTA */}
      <Sequence from={outroStart}>
        <AbsoluteFill style={{
          background: brand.fond || '#0a0a12',
          justifyContent: 'center', alignItems: 'center', gap: 34, opacity: outroS,
        }}>
          <div style={{ transform: `scale(${outroS})` }}><LogoMark brand={brand} size={200} /></div>
          <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 76, color: '#fff' }}>{brand.nom}</div>
          <div style={{
            fontFamily: 'Inter, sans-serif', fontSize: 44, fontWeight: 600, color: '#fff',
            background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
            borderRadius: 99, padding: '26px 54px', boxShadow: `0 20px 60px ${brand.principale}66`,
          }}>
            {cta}
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
