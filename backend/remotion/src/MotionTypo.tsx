import React from 'react';
import {
  AbsoluteFill, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';

// Typo cinétique (format « Motion ») : la phrase du post devient une suite de plans de texte
// animé, aux couleurs du client. Un même moule pour toutes les marques ; les plans, mots
// accentués et effets sont écrits par Claude (reel_service._script_motion).

export type MotionBrand = {
  nom: string; principale: string; accent: string; fond: string; logo?: string | null; police?: string | null;
};
export type MotionEffet = 'revele' | 'barre' | 'surligne' | 'geant' | 'machine';
export type MotionPlan = { texte: string; accents?: string[]; effet?: MotionEffet; dur?: number };
type Props = { brand: MotionBrand; plans: MotionPlan[]; cta: string };

const FPS = 30;
const DUR_CTA = 3.2;
export const dureePlan = (p: MotionPlan) => Math.max(1.6, Math.min(4.5, p.dur ?? 2.6));
export const dureeMotion = (plans: MotionPlan[]) =>
  (plans || []).reduce((s, p) => s + dureePlan(p), 0) + DUR_CTA;

const police = (b: MotionBrand) => `${b.police ? `'${b.police}', ` : ''}Sora, Inter, sans-serif`;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}%€$]/gu, '');
const estAccent = (mot: string, accents: string[] = []) => accents.some((a) => a.split(/\s+/).some((x) => norm(x) && norm(x) === norm(mot)));

// Fond : couleur du client + deux halos qui dérivent lentement + grain de lignes fines
const Fond: React.FC<{ brand: MotionBrand }> = ({ brand }) => {
  const f = useCurrentFrame();
  const dx = Math.sin(f / 70) * 90; const dy = Math.cos(f / 85) * 70;
  return (
    <AbsoluteFill style={{ background: brand.fond || '#020617', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', left: -260 + dx, top: -240 + dy,
        background: brand.principale, filter: 'blur(160px)', opacity: 0.45 }} />
      <div style={{ position: 'absolute', width: 800, height: 800, borderRadius: '50%', right: -260 - dx, bottom: -200 - dy,
        background: brand.accent, filter: 'blur(170px)', opacity: 0.22 }} />
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 2px, transparent 2px 6px)' }} />
    </AbsoluteFill>
  );
};

const Mot: React.FC<{ mot: string; i: number; accent: boolean; brand: MotionBrand; effet: MotionEffet; nb: number; dur: number }> =
({ mot, i, accent, brand, effet, nb, dur }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const pas = effet === 'machine' ? 3 : 5;
  const d0 = i * pas;
  const s = spring({ frame: f - d0, fps, config: { damping: 200 } });
  const grad = `linear-gradient(120deg, ${brand.principale}, ${brand.accent})`;
  const finTexte = (nb - 1) * pas + 18;
  // Barré : un trait couleur accent traverse les mots accentués après l'apparition
  const barre = effet === 'barre' && accent
    ? interpolate(f, [finTexte, finTexte + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }) : 0;
  // Surligné : un bloc de marqueur glisse derrière les mots accentués
  const surl = effet === 'surligne' && accent
    ? interpolate(f, [finTexte - 6, finTexte + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }) : 0;
  const sortie = interpolate(f, [dur * FPS - 10, dur * FPS], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const machine = effet === 'machine';
  return (
    <span style={{
      display: 'inline-block', position: 'relative', margin: '0 18px 6px 0',
      opacity: (machine ? (f >= d0 ? 1 : 0) : s) * sortie,
      filter: machine ? undefined : `blur(${(1 - s) * 14}px)`,
      transform: machine ? undefined : `translateY(${(1 - s) * 70}px)`,
    }}>
      {surl > 0 && <span style={{ position: 'absolute', left: -10, right: -10, top: '18%', bottom: '8%', borderRadius: 10,
        background: brand.accent, opacity: 0.9, transform: `scaleX(${surl})`, transformOrigin: 'left', zIndex: 0 }} />}
      <span style={{
        position: 'relative', zIndex: 1,
        ...(accent && effet !== 'surligne'
          ? { background: grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
          : { color: surl > 0 ? (brand.fond || '#020617') : '#fff' }),
      }}>{mot}</span>
      {barre > 0 && <span style={{ position: 'absolute', left: -6, right: -6, top: '52%', height: 14, borderRadius: 7,
        background: '#ff4d6d', transform: `scaleX(${barre})`, transformOrigin: 'left' }} />}
    </span>
  );
};

const Plan: React.FC<{ plan: MotionPlan; brand: MotionBrand }> = ({ plan, brand }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const effet: MotionEffet = plan.effet || 'revele';
  const dur = dureePlan(plan);
  const mots = (plan.texte || '').split(/\s+/).filter(Boolean);
  if (effet === 'geant') {
    // Un mot (ou très court groupe) géant qui s'impose puis respire, le reste en petit dessous
    // L'expression accentuée ENTIÈRE devient géante (« 2 h », « 30 jours »), pas son seul premier mot.
    const texte = plan.texte || '';
    const acc = (plan.accents || []).find((a) => a && texte.toLowerCase().includes(a.toLowerCase()));
    let cle = mots.find((m) => estAccent(m, plan.accents)) || mots[0] || '';
    let reste = mots.filter((m) => m !== cle).join(' ');
    if (acc) {
      const i = texte.toLowerCase().indexOf(acc.toLowerCase());
      cle = texte.slice(i, i + acc.length);
      reste = (texte.slice(0, i) + ' ' + texte.slice(i + acc.length)).replace(/\s+/g, ' ').trim();
    }
    const s = spring({ frame: f, fps, config: { damping: 12, mass: 0.7 } });
    const souffle = 1 + Math.sin(f / 9) * 0.015;
    const sortie = interpolate(f, [dur * fps - 10, dur * fps], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const taille = Math.min(420, Math.max(150, 1700 / Math.max(3, cle.replace(/\s/g, '').length + 1)));
    return (
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 70, opacity: sortie, textAlign: 'center' }}>
        <div style={{ fontFamily: police(brand), fontWeight: 900, fontSize: taille, lineHeight: 0.95, letterSpacing: '-0.05em',
          transform: `scale(${(0.4 + 0.6 * s) * souffle})`, background: `linear-gradient(120deg, ${brand.principale}, ${brand.accent})`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{cle}</div>
        {reste && <div style={{ fontFamily: police(brand), fontWeight: 700, fontSize: 64, color: '#fff', marginTop: 40,
          opacity: interpolate(f, [10, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{reste}</div>}
      </AbsoluteFill>
    );
  }
  const long = (plan.texte || '').length;
  const taille = long > 70 ? 82 : long > 45 ? 100 : long > 25 ? 122 : 146;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 80px' }}>
      <div style={{ fontFamily: police(brand), fontWeight: 800, fontSize: taille, lineHeight: 1.08, letterSpacing: '-0.035em',
        textAlign: 'center', display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
        {mots.map((m, i) => (
          <Mot key={i} mot={m} i={i} nb={mots.length} accent={estAccent(m, plan.accents)} brand={brand} effet={effet} dur={dur} />
        ))}
        {effet === 'machine' && (
          <span style={{ display: 'inline-block', width: 10, height: taille * 0.9, background: brand.accent, marginLeft: 6,
            opacity: Math.floor(f / 8) % 2 ? 0 : 1 }} />
        )}
      </div>
    </AbsoluteFill>
  );
};

const Fin: React.FC<{ brand: MotionBrand; cta: string }> = ({ brand, cta }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 14 } });
  const s2 = spring({ frame: f - 10, fps, config: { damping: 200 } });
  const taille = 220;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 60 }}>
      <div style={{ transform: `scale(${0.5 + 0.5 * s}) rotate(${(1 - s) * -12}deg)` }}>
        {brand.logo
          ? <Img src={brand.logo} style={{ width: taille, height: taille, borderRadius: 52, objectFit: 'cover', boxShadow: `0 30px 90px ${brand.principale}88` }} />
          : <div style={{ width: taille, height: taille, borderRadius: 52, background: `linear-gradient(135deg, ${brand.principale}, ${brand.accent})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: police(brand), fontWeight: 900, fontSize: 120, color: '#fff' }}>
              {(brand.nom || 'P')[0].toUpperCase()}</div>}
      </div>
      <div style={{ fontFamily: police(brand), fontWeight: 800, fontSize: 84, color: '#fff', opacity: s2, transform: `translateY(${(1 - s2) * 40}px)`, textAlign: 'center', padding: '0 60px' }}>
        {brand.nom}
      </div>
      {cta && <div style={{ fontFamily: police(brand), fontWeight: 700, fontSize: 52, color: brand.fond || '#020617', background: brand.accent,
        borderRadius: 999, padding: '26px 56px', opacity: s2, transform: `scale(${0.85 + 0.15 * s2})`, textAlign: 'center', maxWidth: 900 }}>{cta}</div>}
    </AbsoluteFill>
  );
};

export const MotionTypo: React.FC<Props> = ({ brand, plans, cta }) => {
  let debut = 0;
  const seqs = (plans || []).map((p, i) => {
    const dur = Math.round(dureePlan(p) * FPS);
    const el = <Sequence key={i} from={debut} durationInFrames={dur}><Plan plan={p} brand={brand} /></Sequence>;
    debut += dur;
    return el;
  });
  return (
    <AbsoluteFill>
      <Fond brand={brand} />
      {seqs}
      <Sequence from={debut} durationInFrames={Math.round(DUR_CTA * FPS)}><Fin brand={brand} cta={cta} /></Sequence>
    </AbsoluteFill>
  );
};
