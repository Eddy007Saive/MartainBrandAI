import React from 'react';
import {
  AbsoluteFill, Img, staticFile, interpolate, spring,
  useCurrentFrame, useVideoConfig, Sequence,
} from 'remotion';

/*
  Template « Affiche » — la pub premium animee (layout valide par Martin) :
  logo -> titre avec mot accent colore -> sous-titre -> carte 3 arguments a icones
  -> bandeau stat + CTA. L'image du client (mascotte/photo/produit) vit a droite,
  fondue dans le fond sombre, avec un tres lent zoom.
  11 s (330 frames) · 1080x1920.

  Marquage des accents : les segments entre [crochets] sont colores.
  ex. "Ton business merite mieux que le [silence.]"
*/

type Brand = { nom: string; principale: string; accent: string; fond: string; logo?: string | null };
type Feature = { icon: 'bolt' | 'star' | 'shield'; texte: string; sous: string };
type Props = {
  brand: Brand;
  headline: string;
  sub: string;            // \n = saut de ligne
  features: Feature[];
  stat: string;
  cta: string;
  image?: string | null;  // URL http(s) ou fichier de public/
};

const EASE_SPRING = { damping: 16, stiffness: 90 };

// Rend un texte en colorant les segments [marques]
const Marked: React.FC<{ texte: string; color: string }> = ({ texte, color }) => (
  <>
    {texte.split(/(\[[^\]]+\])/g).map((part, i) =>
      part.startsWith('[') && part.endsWith(']')
        ? <span key={i} style={{ color }}>{part.slice(1, -1)}</span>
        : <React.Fragment key={i}>{part}</React.Fragment>
    )}
  </>
);

const ICONS: Record<Feature['icon'], string> = {
  bolt: 'M13 2 3 14h7l-1 8 10-12h-7l1-8z',
  star: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z',
  shield: 'M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3zm-1.2 13.5 5.4-5.4-1.4-1.4-4 4-1.8-1.8-1.4 1.4 3.2 3.2z',
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

export const ReelAffiche: React.FC<Props> = ({ brand, headline, sub, features, stat, cta, image }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const imgSrc = image ? (image.startsWith('http') ? image : staticFile(image)) : null;
  const kenBurns = interpolate(frame, [0, durationInFrames], [1.08, 1.0]);
  const imgIn = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: 'clamp' });

  const logoS = spring({ frame, fps, config: EASE_SPRING });
  const lignes = headline.split('\n');
  const subS = spring({ frame: frame - 70, fps, config: EASE_SPRING });
  const barS = spring({ frame: frame - 58, fps, config: { damping: 200 } });
  const cardS = spring({ frame: frame - 92, fps, config: EASE_SPRING });
  const statS = spring({ frame: frame - 205, fps, config: EASE_SPRING });
  const ctaS = spring({ frame: frame - 218, fps, config: { damping: 12, stiffness: 120 } });
  const pulse = 1 + Math.sin(Math.max(0, frame - 240) / 9) * 0.022;

  const featColors = [brand.principale, brand.accent, brand.principale];

  return (
    <AbsoluteFill style={{ background: brand.fond || '#0a0a12', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
      {/* halos discrets */}
      <AbsoluteFill style={{ background: `radial-gradient(700px 700px at 85% 30%, ${brand.principale}22, transparent 70%)` }} />

      {/* image client a droite, fondue dans le fond + lent zoom */}
      {imgSrc && (
        <div style={{
          position: 'absolute', right: 0, top: '13%', width: '78%', height: '58%',
          opacity: imgIn,
          WebkitMaskImage: 'linear-gradient(to left, #000 55%, transparent 96%), linear-gradient(to top, transparent 0%, #000 14%, #000 86%, transparent 100%)',
          WebkitMaskComposite: 'source-in' as never,
          maskImage: 'linear-gradient(to left, #000 55%, transparent 96%)',
        }}>
          <Img src={imgSrc} style={{
            width: '100%', height: '100%', objectFit: 'cover', objectPosition: '72% 30%',
            transform: `scale(${kenBurns})`,
          }} />
        </div>
      )}
      {/* voile gauche pour la lisibilite du texte */}
      <AbsoluteFill style={{ background: `linear-gradient(100deg, ${brand.fond || '#0a0a12'} 34%, transparent 72%)` }} />

      {/* Colonne flexible : plus aucun chevauchement possible, quelle que soit la longueur des textes */}
      <AbsoluteFill style={{ padding: '150px 64px 96px', display: 'flex', flexDirection: 'column' }}>

      {/* titre : lignes en cascade, mot accent colore — taille adaptee a la longueur */}
      <div>
        {lignes.map((l, i) => {
          const s = spring({ frame: frame - (14 + i * 9), fps, config: EASE_SPRING });
          const fontSize = headline.length > 70 ? 78 : headline.length > 48 ? 90 : 104;
          return (
            <div key={i} style={{
              fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize, lineHeight: 1.12,
              letterSpacing: '-0.02em', color: '#fff',
              opacity: s, transform: `translateY(${(1 - s) * 54}px)`, filter: `blur(${(1 - s) * 10}px)`,
            }}>
              <Marked texte={l} color={brand.principale} />
            </div>
          );
        })}
        {/* petit trait accent */}
        <div style={{
          width: 92, height: 10, borderRadius: 99, background: brand.accent, marginTop: 30,
          transform: `scaleX(${barS})`, transformOrigin: 'left',
          boxShadow: `0 0 24px ${brand.accent}88`,
        }} />
        {/* sous-titre */}
        <div style={{
          marginTop: 34, fontSize: 44, lineHeight: 1.45, color: '#dbe2ee', fontWeight: 500,
          opacity: subS, transform: `translateY(${(1 - subS) * 36}px)`,
        }}>
          {sub.split('\n').map((l, i) => <div key={i}><Marked texte={l} color={brand.accent} /></div>)}
        </div>
      </div>

      {/* carte des 3 arguments */}
      <div style={{
        marginTop: 48, width: 660,
        border: `2px solid ${brand.principale}55`, borderRadius: 34,
        background: 'rgba(8,10,20,.62)', backdropFilter: 'blur(8px)',
        padding: '6px 0',
        opacity: cardS, transform: `translateY(${(1 - cardS) * 60}px)`,
      }}>
        {features.slice(0, 3).map((f, i) => {
          const s = spring({ frame: frame - (108 + i * 20), fps, config: EASE_SPRING });
          const iconS = spring({ frame: frame - (114 + i * 20), fps, config: { damping: 10, stiffness: 160 } });
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 26, padding: '26px 36px',
              borderTop: i ? '1px solid rgba(255,255,255,.08)' : 'none',
              opacity: s, transform: `translateX(${(1 - s) * -46}px)`,
            }}>
              <svg width="52" height="52" viewBox="0 0 24 24" style={{ transform: `scale(${iconS})`, flexShrink: 0 }}>
                <path d={ICONS[f.icon] || ICONS.bolt} fill="none" stroke={featColors[i % 3]} strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
              <div>
                <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 39, color: '#fff' }}>
                  <Marked texte={f.texte} color={featColors[i % 3]} />
                </div>
                {f.sous ? <div style={{ fontSize: 30, color: '#8ea0bd', marginTop: 5 }}>{f.sous}</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* bandeau bas : stat + CTA — pousse en bas de colonne */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{
          fontSize: 44, fontWeight: 600, color: '#fff', lineHeight: 1.4,
          opacity: statS, transform: `translateY(${(1 - statS) * 36}px)`,
        }}>
          <Marked texte={stat} color={brand.accent} />
        </div>
        <div style={{
          marginTop: 44, display: 'flex', justifyContent: 'center',
          opacity: ctaS, transform: `translateY(${(1 - ctaS) * 60}px) scale(${pulse})`,
        }}>
          <div style={{
            fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 46, color: '#06281c',
            background: brand.accent, borderRadius: 999, padding: '34px 78px',
            boxShadow: `0 24px 70px ${brand.accent}55`,
            display: 'flex', alignItems: 'center', gap: 22,
            position: 'relative', overflow: 'hidden',
          }}>
            {/* brillance : bande blanche inclinee qui balaie le bouton toutes les ~2,5 s */}
            <div style={{
              position: 'absolute', top: '-30%', height: '160%', width: '34%',
              left: `${interpolate(((Math.max(0, frame - 236)) % 75) / 75, [0, 1], [-60, 190])}%`,
              background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,.65) 50%, transparent 100%)',
              transform: 'skewX(-18deg)', pointerEvents: 'none',
            }} />
            <span style={{ position: 'relative' }}>{cta}</span>
            <span style={{ position: 'relative', transform: `translateX(${Math.sin(frame / 12) * 5}px)`, display: 'inline-block' }}>→</span>
          </div>
        </div>
      </div>

      </AbsoluteFill>
    </AbsoluteFill>
  );
};
