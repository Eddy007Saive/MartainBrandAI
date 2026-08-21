/**
 * L'hexagone flottant du décor.
 *
 * Tracé en SVG et non découpé au clip-path : découper la BORDURE d'un
 * rectangle en hexagone n'en laisse que deux traits au centre.
 *
 * Partagé par l'affiche d'authentification et la page introuvable — deux
 * décors qui doivent se ressembler, donc une seule source.
 */
export default function Hexagone({ cls, delai }) {
  return (
    <svg viewBox="0 0 100 112" preserveAspectRatio="none" aria-hidden="true"
      style={{ animationDelay: delai }}
      className={`absolute opacity-60 animate-flotter motion-reduce:animate-none
                  pointer-events-none ${cls}`}>
      <polygon points="25,2 75,2 99,56 75,110 25,110 1,56" fill="none"
        stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
