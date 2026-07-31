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
  points: string[];
  cta: string;
};

// Pastille logo : image du client si dispo, sinon initiale sur dégradé de marque
const LogoMark: React.FC<{ brand: Brand; size: number }> = ({ brand, size }) => {
  if (brand.logo) {
    return (
      <Img
        src={brand.logo}
        style={{ width: size, height: size, borderRadius: size / 4, objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size / 4,
        background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800,
        fontSize: size * 0.5, color: '#fff',
      }}
    >
      {(brand.nom || 'P')[0].toUpperCase()}
    </div>
  );
};

// Mot par mot : blur + translateY + opacity pilotés par une spring
const Word: React.FC<{
  children: React.ReactNode; delay: number; accent: boolean; brand: Brand;
}> = ({ children, delay, accent, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <span
      style={{
        display: 'inline-block',
        marginRight: 22,
        opacity: s,
        filter: `blur(${(1 - s) * 12}px)`,
        transform: `translateY(${(1 - s) * 60}px)`,
        background: accent ? `linear-gradient(135deg, ${brand.principale}, ${brand.accent})` : undefined,
        WebkitBackgroundClip: accent ? 'text' : undefined,
        color: accent ? 'transparent' : '#fff',
      }}
    >
      {children}
    </span>
  );
};

// Carte "preuve" qui glisse depuis la droite
const Point: React.FC<{ texte: string; index: number; brand: Brand }> = ({ texte, index, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - index * 12, fps, config: { damping: 16, mass: 0.8 } });
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 26,
        opacity: s, transform: `translateX(${(1 - s) * 120}px)`,
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 26, padding: '38px 44px',
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: 99, background: brand.accent,
        boxShadow: `0 0 30px ${brand.accent}`, flexShrink: 0,
      }} />
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 46, fontWeight: 600, color: '#f2f4f9' }}>
        {texte}
      </div>
    </div>
  );
};

export const ReelBrand: React.FC<Props> = ({ brand, hook, points, cta }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const glow = interpolate(Math.sin(frame / 22), [-1, 1], [0.5, 1]);
  const outroStart = 185;
  const outroS = spring({ frame: frame - outroStart, fps, config: { damping: 200 } });

  const hookWords = hook.split(' ');
  // Les ~40 % de mots de fin passent en dégradé de marque (la « chute » du hook)
  const accentFrom = Math.max(1, Math.ceil(hookWords.length * 0.55));

  return (
    <AbsoluteFill style={{ background: brand.fond || '#0a0a12', overflow: 'hidden' }}>
      {/* halo ambiance en couleur principale */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(720px 720px at 50% 30%, ${brand.principale}33, transparent 70%)`,
          opacity: glow,
        }}
      />

      {/* barre de progression du reel */}
      <div style={{
        position: 'absolute', top: 0, left: 0, height: 12,
        width: `${(frame / durationInFrames) * 100}%`,
        background: `linear-gradient(90deg, ${brand.principale}, ${brand.accent})`,
      }} />

      {/* logo + nom de marque */}
      <div style={{ position: 'absolute', top: 64, left: 64, display: 'flex', alignItems: 'center', gap: 22 }}>
        <LogoMark brand={brand} size={84} />
        <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 44, color: '#fff' }}>
          {brand.nom}
        </div>
      </div>

      {/* ACTE 1 — le hook mot à mot */}
      <Sequence from={10} durationInFrames={110}>
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 80px' }}>
          <div style={{
            fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 88,
            lineHeight: 1.16, letterSpacing: '-0.02em', maxWidth: 920,
          }}>
            {hookWords.map((w, i) => (
              <Word key={i} delay={i * 7} accent={i >= accentFrom} brand={brand}>{w}</Word>
            ))}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* ACTE 2 — les preuves qui glissent */}
      <Sequence from={110} durationInFrames={90}>
        <AbsoluteFill style={{ justifyContent: 'center', gap: 34, padding: '0 80px' }}>
          {points.slice(0, 4).map((p, i) => <Point key={i} texte={p} index={i} brand={brand} />)}
        </AbsoluteFill>
      </Sequence>

      {/* ACTE 3 — outro CTA */}
      <Sequence from={outroStart}>
        <AbsoluteFill style={{
          background: brand.fond || '#0a0a12',
          justifyContent: 'center', alignItems: 'center', gap: 34, opacity: outroS,
        }}>
          <div style={{ transform: `scale(${outroS})` }}>
            <LogoMark brand={brand} size={200} />
          </div>
          <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 76, color: '#fff' }}>
            {brand.nom}
          </div>
          <div style={{
            fontFamily: 'Inter, sans-serif', fontSize: 44, fontWeight: 600, color: '#fff',
            background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
            borderRadius: 99, padding: '26px 54px',
            boxShadow: `0 20px 60px ${brand.principale}66`,
          }}>
            {cta}
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
