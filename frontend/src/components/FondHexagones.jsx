/**
 * Le fond d'hexagones flottants des pages marketing.
 *
 * Même forme, même violet et même mint que la page de connexion, le décor des
 * clips et le bas de l'accueil : c'est la forme de la marque, pas une
 * décoration de plus. On ne va pas en inventer une seconde par page.
 *
 * Posé UNE fois dans MarketingLayout, il vaut pour toutes les pages qui
 * partagent ce cadre — fonctionnalités, tarifs, FAQ, blog, pages légales.
 * Fixe (`position:fixed`, via la CSS de `.lp .hexbg`) : les hexagones dérivent
 * doucement sur place pendant que le contenu défile par-dessus.
 *
 * Contours seuls, jamais pleins : un aplat attirerait l'œil, or c'est un fond.
 * Positions, tailles et durées toutes différentes, sinon les huit battent à
 * l'unisson et l'on voit la mécanique.
 */
const HEXAGONES = [
  { x: '5%',  y: '14%', t: 110, d: 27, r: -8,  c: 'v', o: 0.16 },
  { x: '88%', y: '10%', t: 74,  d: 22, r: 10,  c: 'm', o: 0.14 },
  { x: '18%', y: '58%', t: 52,  d: 19, r: 6,   c: 'v', o: 0.11 },
  { x: '70%', y: '40%', t: 92,  d: 30, r: -12, c: 'm', o: 0.13 },
  { x: '40%', y: '82%', t: 46,  d: 24, r: 14,  c: 'v', o: 0.10 },
  { x: '93%', y: '70%', t: 60,  d: 20, r: -5,  c: 'm', o: 0.12 },
  { x: '30%', y: '30%', t: 34,  d: 26, r: 18,  c: 'v', o: 0.09 },
  { x: '60%', y: '92%', t: 66,  d: 18, r: -10, c: 'm', o: 0.11 },
];

export default function FondHexagones() {
  return (
    <span className="hexbg" aria-hidden="true">
      {HEXAGONES.map((g, i) => (
        <svg key={i} className={g.c} viewBox="0 0 100 112"
          width={g.t} height={g.t * 1.12}
          style={{
            left: g.x, top: g.y, opacity: g.o,
            animationDuration: `${g.d}s`, animationDelay: `${-i * 3}s`,
            '--r': `${g.r}deg`,
          }}>
          <polygon points="25,2 75,2 99,56 75,110 25,110 1,56" fill="none"
            stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      ))}
    </span>
  );
}
