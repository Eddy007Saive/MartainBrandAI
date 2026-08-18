import { useEffect, useState } from 'react';

/**
 * Attente longue racontée par Rico (10 s et plus).
 *
 * La mascotte change de pose au fil des étapes : elle lit, elle analyse, elle
 * présente. L'attente devient lisible au lieu d'être décorative.
 *
 * Le serveur ne renvoie aucun avancement — c'est un seul appel HTTP. Les étapes
 * sont donc calées sur le temps écoulé, comme dans Fabrication.jsx. D'où une
 * règle qu'on ne franchit pas : la DERNIÈRE étape reste « en cours » tant que
 * le composant est monté. On n'annonce jamais un résultat qui n'est pas arrivé.
 *
 * À réserver aux attentes de plus de dix secondes. Sur une action courte, une
 * mascotte donne l'impression que l'application rame alors qu'elle est rapide.
 */

const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_320,q_auto,f_auto/brand/rico';

export function ChargementRico({ etapes, hauteur = 168, className = '' }) {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    const it = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(it);
  }, []);

  // L'index s'arrête sur la dernière étape : elle ne se coche jamais toute seule.
  const courante = Math.min(
    etapes.length - 1,
    etapes.findIndex((e) => sec < e.jusqua) === -1 ? etapes.length - 1
      : etapes.findIndex((e) => sec < e.jusqua),
  );

  return (
    <div className={`flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 ${className}`}>
      <div className="relative w-full sm:w-[170px] flex-shrink-0 rounded-xl"
        style={{ height: hauteur, background: 'radial-gradient(ellipse at 50% 118%, rgba(91,108,255,.16), transparent 64%)' }}>
        {/* L'ombre de contact : sans elle, Rico flotte au-dessus du vide. */}
        <span className="absolute left-1/2 bottom-[22px] w-[74px] h-[9px] rounded-[50%] -translate-x-1/2
                         animate-respirer motion-reduce:animate-none"
          style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,.6), transparent 70%)' }} />
        {/* Toutes les poses sont montées et empilées : le changement est un
            fondu, pas un chargement — sinon on voit un trou à chaque étape. */}
        {etapes.map((e, i) => (
          <img key={e.pose} src={`${RICO}/${e.pose}.png`} alt="" aria-hidden="true"
            className="absolute left-1/2 bottom-[26px] -translate-x-1/2 transition-[opacity,filter]
                       duration-300 ease-out-strong"
            style={{
              height: hauteur - 46,
              opacity: i === courante ? 1 : 0,
              // Le flou pendant l'échange fond les deux images en une seule.
              // Sans lui, l'œil voit deux oiseaux se superposer.
              filter: `drop-shadow(0 10px 14px rgba(0,0,0,.55)) blur(${i === courante ? 0 : 3}px)`,
            }} />
        ))}
      </div>

      <div className="flex-1 min-w-0">
        {etapes.map((e, i) => {
          const etat = i < courante ? 'fait' : i === courante ? 'cours' : 'attente';
          return (
            <div key={e.pose}
              className={`flex items-center gap-3 py-1.5 transition-opacity duration-300 ease-out-strong
                          ${etat === 'attente' ? 'opacity-35' : 'opacity-100'}`}>
              <span className={`w-[17px] h-[17px] rounded-full flex-shrink-0 border-[1.5px] grid place-items-center
                                transition-colors duration-300 ease-out-strong
                                ${etat === 'fait' ? 'border-[#3AFFA3] bg-[#3AFFA3]/[0.14]'
                                  : etat === 'cours' ? 'border-[#5B6CFF]' : 'border-slate-600'}`}>
                {etat === 'fait' && (
                  <svg viewBox="0 0 24 24" className="w-[9px] h-[9px] text-[#3AFFA3]" fill="none"
                    stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {etat === 'cours' && (
                  <span className="w-[6px] h-[6px] rounded-full bg-[#5B6CFF] animate-pulse motion-reduce:animate-none" />
                )}
              </span>
              <span className="text-[13.5px] text-slate-200 font-inter">{e.texte}</span>
            </div>
          );
        })}
        {etapes[courante]?.parole && (
          <p className="text-[12.5px] text-slate-400 font-inter mt-3 min-h-[19px]">{etapes[courante].parole}</p>
        )}
      </div>
    </div>
  );
}

export default ChargementRico;
