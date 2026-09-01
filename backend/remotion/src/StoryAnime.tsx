import React from 'react';
import {
  AbsoluteFill, Img, interpolate,
  useCurrentFrame,
} from 'remotion';

/*
  Story animee — 5 s (150 frames) · 1080x1920 · meme forme Brand que les Reels.
  Premier gabarit anime (les 11 modeles statiques Playwright restent inchanges).
  Aucune « apparition » : accroche/sous-titre/CTA sont visibles des la frame 0,
  jamais de fade-in ni de slide-in — Instagram affiche deja natal que c'est une
  story, un kicker « Story » dans l'image serait redondant (meme logique que
  les gabarits statiques, cf. story_service.py). Seuls des mouvements CONTINUS
  habillent la composition deja en place : fond qui respire (deux nappes qui
  derivent), mot-cle (ou toute l'accroche si aucun mot n'est designe) en
  degrade mouvant, CTA en relief avec reflet + flottaison + un passage de
  lumiere — direction validee en amont via deux prototypes CSS interactifs.
  Lue une seule fois (pas de boucle : une story se regarde une fois).
*/

type Brand = {
  nom: string; principale: string; accent: string; fond: string; logo?: string | null;
};
type Props = { brand: Brand; accroche: string; motAccent?: string; sous: string; cta: string };

// Deux nappes de couleur qui derivent lentement, sans boucle brutale (sinus continu)
const Aurora: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const dx1 = interpolate(Math.sin(frame / 55), [-1, 1], [-6, 10]);
  const dy1 = interpolate(Math.cos(frame / 70), [-1, 1], [-8, 4]);
  const dx2 = interpolate(Math.sin(frame / 65 + 2), [-1, 1], [-10, 6]);
  const dy2 = interpolate(Math.cos(frame / 50 + 1), [-1, 1], [-4, 8]);
  return (
    <>
      <div style={{
        position: 'absolute', left: `${-20 + dx1}%`, top: `${-25 + dy1}%`, width: '75%', aspectRatio: '1',
        borderRadius: '50%', filter: 'blur(120px)', opacity: 0.55, mixBlendMode: 'screen',
        background: `radial-gradient(closest-side, ${brand.principale}, transparent 70%)`,
      }} />
      <div style={{
        position: 'absolute', right: `${-24 + dx2}%`, bottom: `${-28 + dy2}%`, width: '80%', aspectRatio: '1',
        borderRadius: '50%', filter: 'blur(120px)', opacity: 0.55, mixBlendMode: 'screen',
        background: `radial-gradient(closest-side, ${brand.accent}, transparent 70%)`,
      }} />
    </>
  );
};

const LogoOrInitiale: React.FC<{ brand: Brand }> = ({ brand }) => {
  if (brand.logo) return <Img src={brand.logo} style={{ height: 40, width: 'auto', display: 'block' }} />;
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
      fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 18, color: '#fff',
    }}>
      {(brand.nom || '?')[0].toUpperCase()}
    </div>
  );
};

export const StoryAnime: React.FC<Props> = ({ brand, accroche, motAccent, sous, cta }) => {
  const frame = useCurrentFrame();

  // Rien n'« apparaît » : accroche, sous-titre et CTA sont visibles dès la
  // frame 0 (pas de fade-in / translateY d'entrée). Seuls des mouvements
  // continus habillent une composition déjà en place : aurore qui dérive,
  // flottaison du CTA, et deux passages de lumière (mot-clé, bouton).
  const shinePos = interpolate(frame, [8, 66], [-40, 140], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ctaFloat = Math.sin(frame / 22) * 3;
  const ctaSheen = interpolate(frame, [30, 74], [-40, 140], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const accentText = motAccent && accroche.includes(motAccent) ? motAccent : accroche;
  const [before, after] = motAccent && accroche.includes(motAccent)
    ? accroche.split(motAccent)
    : ['', ''];

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: `linear-gradient(165deg, ${brand.fond || '#0b1020'}, #050810)` }}>
      <Aurora brand={brand} />

      <AbsoluteFill style={{ padding: '11% 9% 12%', display: 'flex', flexDirection: 'column' }}>
        {/* Accroche + sous-titre, centres verticalement dans l'espace restant — visibles
            dès la frame 0, seul le degrade du mot-cle bouge (voir shinePos) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
          <div style={{
            fontFamily: 'Sora, sans-serif', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.01em',
            fontSize: 78, color: '#fff', maxWidth: '94%',
          }}>
            {before}
            <span style={{
              backgroundImage: `linear-gradient(100deg, ${brand.accent} 20%, #ffffff 45%, ${brand.principale} 60%, ${brand.accent} 80%)`,
              backgroundSize: '250% 100%', backgroundPositionX: `${shinePos}%`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              filter: `drop-shadow(0 0 30px ${brand.accent}55)`,
            }}>
              {accentText}
            </span>
            {after}
          </div>
          {sous ? (
            <div style={{
              fontFamily: 'Inter, sans-serif', fontSize: 40, lineHeight: 1.5, color: 'rgba(255,255,255,.66)',
              maxWidth: '92%',
            }}>
              {sous}
            </div>
          ) : null}
        </div>

        {/* CTA en relief : reflet spéculaire fixe (haut), ombre colorée, un sweep, flottaison légère */}
        {cta ? (
          <div style={{
            position: 'relative', alignSelf: 'flex-start',
            transform: `translateY(${ctaFloat}px)`, transformOrigin: 'left center',
          }}>
            <div style={{
              position: 'relative', overflow: 'hidden', borderRadius: 999, padding: '30px 52px',
              fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 38, color: '#06170f',
              background: `linear-gradient(180deg, ${brand.accent}, ${brand.principale})`,
              boxShadow: `0 1.5px 0 rgba(255,255,255,.6) inset, 0 -6px 14px rgba(0,0,0,.25) inset, 0 22px 44px -16px ${brand.accent}aa`,
            }}>
              {/* reflet spéculaire haut, fixe */}
              <div style={{
                position: 'absolute', left: '8%', right: '34%', top: '10%', height: '34%', borderRadius: 999,
                background: 'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,0))', pointerEvents: 'none',
              }} />
              {/* sweep : une seule traversee */}
              <div style={{
                position: 'absolute', top: '-60%', bottom: '-60%', left: `${ctaSheen}%`, width: '22%',
                background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.85), transparent)',
                transform: 'skewX(-18deg)', pointerEvents: 'none',
              }} />
              {cta}
            </div>
          </div>
        ) : null}

        <div style={{ position: 'absolute', bottom: '5%', left: '9%', display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoOrInitiale brand={brand} />
          <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 26, color: '#fff' }}>{brand.nom}</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
