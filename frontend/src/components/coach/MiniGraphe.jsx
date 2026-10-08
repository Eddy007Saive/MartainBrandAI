import { useState } from 'react';

/**
 * Petit graphique d'une seule série, une seule échelle (jamais deux axes) — Rico Coach.
 * type : 'aire' (courbe remplie), 'barres', 'ligne'. Survol : repère + bulle de valeur.
 * Le pic est étiqueté directement ; le dernier point (le mois analysé) est mis en avant.
 */
const W = 360;
const H = 120;
const G = 6;
const D = 6;
const HAUT = 14;
const BAS = 18;
const VIOLET = '#8A6CFF';

export default function MiniGraphe({ id, valeurs, etiquettes, type = 'aire', unite, depuisZero = true, fmt }) {
  const [survol, setSurvol] = useState(null);
  if (!valeurs.length) return null;
  const max = Math.max(...valeurs);
  const min = depuisZero ? 0 : Math.floor(Math.min(...valeurs) * 0.97);
  const pas = (W - G - D) / valeurs.length;
  const base = H - BAS;
  const x = (i) => G + pas * (i + 0.5);
  const y = (v) => HAUT + (base - HAUT) * (1 - (v - min) / (max - min || 1));
  const dernier = valeurs.length - 1;
  const pic = valeurs.indexOf(max);
  const pts = valeurs.map((v, i) => `${x(i)},${y(v)}`).join(' L');
  const largeur = Math.min(18, pas - 6);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto overflow-visible mt-2" role="img" aria-label={unite}>
        <defs>
          <linearGradient id={`${id}-f`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={VIOLET} stopOpacity="0.35" />
            <stop offset="1" stopColor={VIOLET} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5].map((f) => {
          const yy = HAUT + (base - HAUT) * (1 - f);
          return <line key={f} x1={G} x2={W - D} y1={yy} y2={yy} stroke="rgba(255,255,255,0.06)" />;
        })}
        {etiquettes.map((m, i) => (
          <text key={m + i} x={x(i)} y={H - 4} textAnchor="middle" className="fill-slate-500" style={{ font: '500 10px Inter, sans-serif' }}>{m}</text>
        ))}
        {type === 'barres'
          ? valeurs.map((v, i) => {
            const y0 = Math.min(y(v), base - 2);
            const r = Math.min(4, base - y0);
            const x0 = x(i) - largeur / 2;
            return (
              <path key={i} fill={i === dernier ? VIOLET : 'rgba(138,108,255,0.45)'}
                d={`M${x0},${base} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + largeur - r} Q${x0 + largeur},${y0} ${x0 + largeur},${y0 + r} V${base} Z`} />
            );
          })
          : (
            <>
              {type === 'aire' && <path d={`M${x(0)},${base} L${pts} L${x(dernier)},${base} Z`} fill={`url(#${id}-f)`} />}
              <path d={`M${pts}`} fill="none" stroke={VIOLET} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(dernier)} cy={y(valeurs[dernier])} r="4.5" fill={VIOLET} stroke="#0f172a" strokeWidth="2" />
            </>
          )}
        {pic !== dernier && type !== 'ligne' && max > 0 && (
          <text x={x(pic)} y={y(max) - 5} textAnchor="middle" className="fill-slate-100" style={{ font: '600 10px Inter, sans-serif' }}>{fmt(max)}</text>
        )}
        {survol !== null && (
          <>
            <line x1={x(survol)} x2={x(survol)} y1={HAUT} y2={base} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
            {type !== 'barres' && <circle cx={x(survol)} cy={y(valeurs[survol])} r="4" fill="#fff" />}
          </>
        )}
        {valeurs.map((_, i) => (
          <rect key={`z${i}`} x={x(i) - pas / 2} y={0} width={pas} height={H} fill="transparent"
            onMouseEnter={() => setSurvol(i)} onMouseLeave={() => setSurvol(null)} />
        ))}
      </svg>
      {survol !== null && (
        <div className="pointer-events-none absolute whitespace-nowrap rounded-lg border border-white/10 bg-[#0b1322] px-2.5 py-1.5 text-xs text-slate-100 shadow-xl"
          style={{ left: `${(x(survol) / W) * 100}%`, top: `${(y(valeurs[survol]) / H) * 100}%`, transform: 'translate(-50%, -115%)' }}>
          <span className="text-slate-500 mr-1.5">{etiquettes[survol]}</span>
          <b className="font-sora">{fmt(valeurs[survol])}</b> {unite}
        </div>
      )}
    </div>
  );
}
