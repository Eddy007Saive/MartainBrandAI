import React from 'react';
import {
  AbsoluteFill, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';

// Format « Motion » : la phrase du post devient une suite de plans animés, aux couleurs du
// client. Chaque plan = texte + effet typographique + icône dessinée trait par trait + décor
// géométrique en fond ; transitions variées et balayage de couleur entre les plans ; compteur
// quand le mot géant est un chiffre. Plans, accents, effets et icônes écrits par Claude
// (reel_service._script_motion). Un même moule pour toutes les marques.

export type MotionBrand = {
  nom: string; principale: string; accent: string; fond: string; logo?: string | null; police?: string | null;
};
export type MotionEffet = 'revele' | 'barre' | 'surligne' | 'geant' | 'machine';
export type MotionPlan = { texte: string; accents?: string[]; effet?: MotionEffet; dur?: number; icone?: string | null };
type Props = { brand: MotionBrand; plans: MotionPlan[]; cta: string };

const FPS = 30;
const DUR_CTA = 3.5;
// Durée plancher d'un Motion : 60 s, plan final compris. Si les plans écrits ne suffisent pas,
// chacun est allongé dans la même proportion (au plus ×2,5) : le rythme reste cohérent.
export const DUREE_MIN = 60;
const dureeBrute = (p: MotionPlan) => Math.max(1.8, Math.min(6, p.dur ?? 3));
export const dureesPlans = (plans: MotionPlan[]) => {
  const brutes = (plans || []).map(dureeBrute);
  const somme = brutes.reduce((a, b) => a + b, 0);
  const facteur = somme > 0 ? Math.min(2.5, Math.max(1, (DUREE_MIN - DUR_CTA) / somme)) : 1;
  return brutes.map((d) => d * facteur);
};
export const dureePlan = dureeBrute;
export const dureeMotion = (plans: MotionPlan[]) =>
  dureesPlans(plans).reduce((s, d) => s + d, 0) + DUR_CTA;

// Icônes au trait (grille 24×24), dessinées par stroke-dashoffset. Liste partagée avec le
// prompt (reel_service._ICONES_MOTION) : toute icône inconnue est ignorée.
export const ICONES: Record<string, string> = {
  fusee: 'M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-5-5 6-6zM9 10H5l3-3h4M14 15v4l3-3v-4M15 9h.01',
  horloge: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  cible: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  graphique: 'M3 3v18h18M7 15l4-4 3 3 6-7M16 7h4v4',
  eclair: 'M13 2 3 14h7l-1 8 10-12h-7l1-8z',
  coeur: 'M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6C19 16.5 12 21 12 21z',
  coche: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
  croix: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6',
  calendrier: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h3',
  message: 'M4 5h16v11H9l-5 4V5zM8 9h8M8 12h5',
  personne: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1-4 4-6 8-6s7 2 8 6',
  ampoule: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  argent: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15 8.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.3 0 3.2 6 1.8 6 5 0 1.4-1.3 2.4-3 2.4-1.4 0-2.6-.6-3.2-1.7M12 5.5v13',
  etoile: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  bouclier: 'M12 3l8 3v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3zM8.5 12l2.5 2.5 4.5-5',
  telephone: 'M7 3h10v18H7zM11 18h2',
  megaphone: 'M3 10v4h3l7 4V6l-7 4H3zM17 9a4 4 0 0 1 0 6M6 14l1 5h3',
  trophee: 'M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
};
const DECORS = ['anneaux', 'formes', 'grille', 'rayons'] as const;

const police = (b: MotionBrand) => `${b.police ? `'${b.police}', ` : ''}Sora, Inter, sans-serif`;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}%€$]/gu, '');
const estAccent = (mot: string, accents: string[] = []) => accents.some((a) => a.split(/\s+/).some((x) => norm(x) && norm(x) === norm(mot)));
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

// Fond : couleur du client + deux halos qui dérivent lentement + trame fine
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

// Décor géométrique propre à chaque plan (choisi par son rang), en filigrane derrière le texte
const Decor: React.FC<{ type: typeof DECORS[number]; brand: MotionBrand; dur: number }> = ({ type, brand, dur }) => {
  const f = useCurrentFrame();
  const fin = dur * FPS;
  const op = interpolate(f, [0, 10, fin - 8, fin], [0, 1, 1, 0], clamp);
  const c1 = brand.principale; const c2 = brand.accent;
  if (type === 'anneaux') {
    return (
      <AbsoluteFill style={{ opacity: op * 0.55, alignItems: 'center', justifyContent: 'center' }}>
        {[0, 1, 2, 3].map((i) => {
          const p = ((f + i * 18) % 72) / 72;
          return <div key={i} style={{ position: 'absolute', width: 300 + p * 1100, height: 300 + p * 1100, borderRadius: '50%',
            border: `3px solid ${i % 2 ? c2 : c1}`, opacity: 1 - p }} />;
        })}
      </AbsoluteFill>
    );
  }
  if (type === 'grille') {
    const pts = [];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x - 3.5, y - 6.5);
      const s = interpolate(f, [d * 2, d * 2 + 12], [0, 1], clamp);
      pts.push(<div key={`${x}-${y}`} style={{ position: 'absolute', left: 90 + x * 130, top: 110 + y * 130, width: 10, height: 10, borderRadius: 5,
        background: (x + y) % 3 ? c1 : c2, transform: `scale(${s})`, opacity: 0.5 }} />);
    }
    return <AbsoluteFill style={{ opacity: op }}>{pts}</AbsoluteFill>;
  }
  if (type === 'rayons') {
    return (
      <AbsoluteFill style={{ opacity: op * 0.35, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', width: 2400, height: 2400, transform: `rotate(${f * 0.4}deg)`,
          background: `repeating-conic-gradient(${c1}55 0deg 6deg, transparent 6deg 18deg)`,
          WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 60%)', maskImage: 'radial-gradient(circle, black 0%, transparent 60%)' }} />
      </AbsoluteFill>
    );
  }
  // formes : carrés, triangles et cercles au trait qui flottent et tournent
  const formes = [
    { x: 120, y: 260, t: 'carre', c: c1, r: 1 }, { x: 860, y: 340, t: 'cercle', c: c2, r: -1 },
    { x: 180, y: 1500, t: 'triangle', c: c2, r: 1 }, { x: 840, y: 1420, t: 'carre', c: c1, r: -1 },
    { x: 520, y: 180, t: 'triangle', c: c1, r: -1 }, { x: 560, y: 1660, t: 'cercle', c: c1, r: 1 },
  ];
  return (
    <AbsoluteFill style={{ opacity: op * 0.6 }}>
      {formes.map((fo, i) => {
        const s = spring({ frame: f - i * 3, fps: FPS, config: { damping: 12 } });
        const flot = Math.sin((f + i * 20) / 18) * 18;
        return (
          <svg key={i} viewBox="0 0 100 100" width={120} height={120}
            style={{ position: 'absolute', left: fo.x, top: fo.y + flot, transform: `scale(${s}) rotate(${f * fo.r * 1.2}deg)` }}>
            {fo.t === 'carre' && <rect x="15" y="15" width="70" height="70" rx="10" fill="none" stroke={fo.c} strokeWidth="6" />}
            {fo.t === 'cercle' && <circle cx="50" cy="50" r="36" fill="none" stroke={fo.c} strokeWidth="6" />}
            {fo.t === 'triangle' && <path d="M50 12 L88 82 L12 82 Z" fill="none" stroke={fo.c} strokeWidth="6" strokeLinejoin="round" />}
          </svg>
        );
      })}
    </AbsoluteFill>
  );
};

// Icône dessinée trait par trait, avec halo et pastille
const Icone: React.FC<{ nom: string; brand: MotionBrand; taille: number }> = ({ nom, brand, taille }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const d = ICONES[nom];
  if (!d) return null;
  const pop = spring({ frame: f, fps, config: { damping: 11, mass: 0.6 } });
  const trace = interpolate(f, [4, 26], [1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const halo = interpolate(f, [22, 40], [0.9, 0], clamp);
  const hs = interpolate(f, [22, 40], [1, 1.9], clamp);
  return (
    <div style={{ position: 'relative', width: taille, height: taille, marginBottom: 46, transform: `scale(${pop})` }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: taille * 0.3, border: `4px solid ${brand.accent}`, opacity: halo, transform: `scale(${hs})` }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: taille * 0.3, background: `linear-gradient(135deg, ${brand.principale}33, ${brand.accent}22)`,
        border: `2px solid ${brand.principale}88`, boxShadow: `0 20px 60px ${brand.principale}55` }} />
      <svg viewBox="0 0 24 24" width={taille * 0.62} height={taille * 0.62} style={{ position: 'absolute', left: taille * 0.19, top: taille * 0.19 }}>
        <defs><linearGradient id={`ig-${nom}`} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor={brand.principale} /><stop offset="1" stopColor={brand.accent} /></linearGradient></defs>
        <path d={d} pathLength={1} fill="none" stroke={`url(#ig-${nom})`} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={1} strokeDashoffset={trace} />
      </svg>
    </div>
  );
};

const Mot: React.FC<{ mot: string; i: number; accent: boolean; brand: MotionBrand; effet: MotionEffet; nb: number; dur: number }> =
({ mot, i, accent, brand, effet, nb, dur }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const pas = effet === 'machine' ? 3 : 5;
  const d0 = 6 + i * pas;
  const s = spring({ frame: f - d0, fps, config: { damping: 200 } });
  const grad = `linear-gradient(120deg, ${brand.principale}, ${brand.accent})`;
  const finTexte = 6 + (nb - 1) * pas + 18;
  const barre = effet === 'barre' && accent ? interpolate(f, [finTexte, finTexte + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }) : 0;
  const surl = effet === 'surligne' && accent ? interpolate(f, [finTexte - 6, finTexte + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }) : 0;
  // révélé : un trait fin souligne les mots accentués après l'apparition
  const souligne = effet === 'revele' && accent ? interpolate(f, [finTexte, finTexte + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }) : 0;
  const sortie = interpolate(f, [dur * FPS - 8, dur * FPS], [1, 0], clamp);
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
      {souligne > 0 && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -4, height: 8, borderRadius: 4,
        background: grad, transform: `scaleX(${souligne})`, transformOrigin: 'left' }} />}
    </span>
  );
};

// Chiffre qui compte jusqu'à sa valeur (« 8 mois » -> 0..8), conserve le suffixe
const Compteur: React.FC<{ texte: string }> = ({ texte }) => {
  const f = useCurrentFrame();
  const m = texte.match(/^(\D*)(\d+(?:[.,]\d+)?)(.*)$/);
  if (!m) return <>{texte}</>;
  const cible = parseFloat(m[2].replace(',', '.'));
  const dec = (m[2].split(/[.,]/)[1] || '').length;
  const v = interpolate(f, [2, 26], [0, cible], { ...clamp, easing: Easing.out(Easing.cubic) });
  const txt = dec ? v.toFixed(dec).replace('.', m[2].includes(',') ? ',' : '.') : String(Math.round(v));
  return <>{m[1]}{txt}{m[3]}</>;
};

const Plan: React.FC<{ plan: MotionPlan; brand: MotionBrand; rang: number; dur: number }> = ({ plan, brand, rang, dur }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const effet: MotionEffet = plan.effet || 'revele';
  const fin = dur * fps;
  const mots = (plan.texte || '').split(/\s+/).filter(Boolean);
  // Entrée du bloc : alterne glissement vertical, zoom et glissement latéral selon le rang
  const e = spring({ frame: f, fps, config: { damping: 18 } });
  const entree = [
    `translateY(${(1 - e) * 90}px)`,
    `scale(${0.82 + 0.18 * e})`,
    `translateX(${(1 - e) * 140}px)`,
  ][rang % 3];
  const sortie = interpolate(f, [fin - 8, fin], [1, 0], clamp);
  const icone = plan.icone && ICONES[plan.icone] ? plan.icone : null;

  let contenu: React.ReactNode;
  if (effet === 'geant') {
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
    const taille = Math.min(420, Math.max(150, 1700 / Math.max(3, cle.replace(/\s/g, '').length + 1)));
    contenu = (
      <>
        <div style={{ fontFamily: police(brand), fontWeight: 900, fontSize: taille, lineHeight: 0.95, letterSpacing: '-0.05em',
          transform: `scale(${(0.4 + 0.6 * s) * souffle})`, background: `linear-gradient(120deg, ${brand.principale}, ${brand.accent})`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}><Compteur texte={cle} /></div>
        {reste && <div style={{ fontFamily: police(brand), fontWeight: 700, fontSize: 64, color: '#fff', marginTop: 40,
          opacity: interpolate(f, [10, 24], [0, 1], clamp) }}>{reste}</div>}
      </>
    );
  } else {
    const long = (plan.texte || '').length;
    const taille = long > 70 ? 82 : long > 45 ? 100 : long > 25 ? 122 : 146;
    contenu = (
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
    );
  }
  return (
    <AbsoluteFill>
      <Decor type={DECORS[rang % DECORS.length]} brand={brand} dur={dur} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 80px', textAlign: 'center',
        transform: entree, opacity: sortie }}>
        {icone && effet !== 'geant' && <Icone nom={icone} brand={brand} taille={280} />}
        {contenu}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Balayage de couleur entre deux plans : une bande en biais traverse l'écran
const Balayage: React.FC<{ brand: MotionBrand; sens: number }> = ({ brand, sens }) => {
  const f = useCurrentFrame();
  const x = interpolate(f, [0, 12], [-1600, 1600], { ...clamp, easing: Easing.inOut(Easing.cubic) }) * sens;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: -400, left: 0, width: 520, height: 2800, transform: `translateX(${x + 280}px) rotate(14deg)`,
        background: `linear-gradient(90deg, transparent, ${brand.principale}cc, ${brand.accent}cc, transparent)`, filter: 'blur(6px)' }} />
    </AbsoluteFill>
  );
};

// Barre de progression : un segment par plan en haut de l'écran
const Progression: React.FC<{ durees: number[]; brand: MotionBrand }> = ({ durees, brand }) => {
  const f = useCurrentFrame();
  let t0 = 0;
  return (
    <div style={{ position: 'absolute', top: 70, left: 70, right: 70, display: 'flex', gap: 10 }}>
      {durees.map((d, i) => {
        const p = interpolate(f, [t0, t0 + d], [0, 1], clamp);
        t0 += d;
        return (
          <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,.14)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${p * 100}%`, background: `linear-gradient(90deg, ${brand.principale}, ${brand.accent})` }} />
          </div>
        );
      })}
    </div>
  );
};

const Fin: React.FC<{ brand: MotionBrand; cta: string }> = ({ brand, cta }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 14 } });
  const s2 = spring({ frame: f - 10, fps, config: { damping: 200 } });
  const pulse = 1 + Math.max(0, Math.sin((f - 30) / 6)) * 0.04;
  const taille = 220;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 60 }}>
      <Decor type="anneaux" brand={brand} dur={DUR_CTA + 1} />
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
        borderRadius: 999, padding: '26px 56px', opacity: s2, transform: `scale(${(0.85 + 0.15 * s2) * pulse})`, textAlign: 'center', maxWidth: 900,
        boxShadow: `0 20px 70px ${brand.accent}66` }}>{cta}</div>}
    </AbsoluteFill>
  );
};

export const MotionTypo: React.FC<Props> = ({ brand, plans, cta }) => {
  const secondes = dureesPlans(plans);
  const durees = secondes.map((d) => Math.round(d * FPS));
  let debut = 0;
  const seqs: React.ReactNode[] = [];
  (plans || []).forEach((p, i) => {
    seqs.push(<Sequence key={`p${i}`} from={debut} durationInFrames={durees[i]}><Plan plan={p} brand={brand} rang={i} dur={secondes[i]} /></Sequence>);
    debut += durees[i];
    seqs.push(<Sequence key={`b${i}`} from={debut - 6} durationInFrames={14}><Balayage brand={brand} sens={i % 2 ? -1 : 1} /></Sequence>);
  });
  const total = debut;
  return (
    <AbsoluteFill>
      <Fond brand={brand} />
      {seqs}
      <Sequence from={0} durationInFrames={total}><Progression durees={durees} brand={brand} /></Sequence>
      <Sequence from={total} durationInFrames={Math.round(DUR_CTA * FPS)}><Fin brand={brand} cta={cta} /></Sequence>
    </AbsoluteFill>
  );
};
