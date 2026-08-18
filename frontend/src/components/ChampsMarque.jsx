import { useEffect, useRef } from 'react';
import { Info, X, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

/**
 * Champs de la fiche de marque.
 *
 * Deux partis pris qui expliquent le reste :
 *  - l'aide vit dans une info-bulle, jamais dans un paragraphe permanent. Sur
 *    une fiche qu'on relit vingt fois, une consigne affichée en continu devient
 *    du bruit ;
 *  - les piliers, accroches et appels à l'action sont stockés en lignes : on
 *    les affiche donc comme une liste, pas comme un pavé de texte où
 *    l'utilisateur doit deviner le format attendu.
 */

const CADRE = 'w-full rounded-[10px] bg-slate-950/55 border border-slate-800 text-slate-200 '
  + 'text-[13.5px] font-inter px-3 py-2 outline-none resize-none overflow-hidden '
  + 'placeholder:text-slate-700 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] '
  + 'transition-[border-color,box-shadow,background-color] duration-150 ease-out-strong '
  + 'hover:border-slate-700 focus:border-[#5B6CFF] focus:bg-slate-950/80 '
  + 'focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),0_0_0_3px_rgba(91,108,255,0.15)]';

function Aide({ texte }) {
  if (!texte) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-slate-600 hover:text-slate-300 cursor-help transition-colors
                           duration-150 flex-shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top"
          className="max-w-[260px] bg-slate-800 border border-slate-700 text-slate-200 text-[11.5px]
                     leading-relaxed whitespace-pre-line">
          {texte}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Un point qui s'allume : repérer les trous d'un coup d'œil, sans lire.
const Point = ({ rempli }) => (
  <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 transition-[background-color,box-shadow]
                    duration-200 ease-out-strong
                    ${rempli ? 'bg-[#3AFFA3] shadow-[0_0_0_3px_rgba(58,255,163,0.12)]' : 'bg-slate-600'}`} />
);

const Etiquette = ({ label, hint, rempli, droite }) => (
  <div className="flex items-center gap-1.5 mb-1.5">
    <Point rempli={rempli} />
    <label className="text-[13px] font-medium text-slate-200 font-inter">{label}</label>
    <Aide texte={hint} />
    {droite && <span className="ml-auto text-[11.5px] text-slate-600 font-inter tabular-nums">{droite}</span>}
  </div>
);

/** Champ texte. La hauteur suit le contenu : une poignée de redimensionnement
 *  laissée à l'utilisateur casse le rythme vertical de la page. */
export function ChampMarque({ label, name, value, onChange, hint, placeholder,
                             lignes = 3, multi = true }) {
  const ref = useRef(null);
  const v = value || '';

  useEffect(() => {
    const z = ref.current;
    if (!z || !multi) return;
    z.style.height = 'auto';
    z.style.height = `${z.scrollHeight}px`;
  }, [v, multi]);

  return (
    <div className="group/champ">
      {label && <Etiquette label={label} hint={hint} rempli={!!v.trim()} />}
      {multi ? (
        <textarea ref={ref} rows={lignes} value={v} placeholder={placeholder}
          onChange={(e) => onChange(name, e.target.value)}
          className={CADRE} data-testid={`field-${name}`} />
      ) : (
        <input value={v} placeholder={placeholder}
          onChange={(e) => onChange(name, e.target.value)}
          className={CADRE} data-testid={`field-${name}`} />
      )}
      {/* Le compteur n'apparaît qu'à la saisie : utile quand on écrit, bruit le
          reste du temps. En hauteur nulle pour ne pas décaler la mise en page. */}
      <div className="h-0 flex justify-end">
        <span className="mt-1 text-[11px] text-slate-600 font-inter tabular-nums opacity-0
                         group-focus-within/champ:opacity-100 transition-opacity duration-150 ease-out-strong">
          {v.length}
        </span>
      </div>
    </div>
  );
}

/** Liste éditable. La valeur reste une chaîne à lignes : le stockage ne change
 *  pas, seule la saisie change. */
export function ChampListe({ label, name, value, onChange, hint, placeholders, ajouter }) {
  // Les exemples viennent des traductions : si la clé venait à manquer, i18next
  // renvoie la clé elle-même, et indexer une chaîne donnerait des lettres.
  const exemples = Array.isArray(placeholders) ? placeholders : [];
  // Une ligne vide finale est conservée pendant l'édition, sinon le champ
  // disparaît sous les doigts dès qu'on efface.
  const lignes = (value || '').split('\n');
  const rendu = lignes.length ? lignes : [''];
  const pleines = rendu.filter((l) => l.trim()).length;

  const ecrire = (suivantes) => onChange(name, suivantes.join('\n'));

  const modifier = (i, texte) => {
    const s = [...rendu]; s[i] = texte; ecrire(s);
  };
  const inserer = (i) => {
    const s = [...rendu]; s.splice(i + 1, 0, ''); ecrire(s);
  };
  const retirer = (i) => {
    const s = rendu.filter((_, k) => k !== i);
    ecrire(s.length ? s : ['']);
  };

  const focusLigne = (i) => requestAnimationFrame(() => {
    const champ = document.querySelector(`[data-ligne="${name}-${i}"]`);
    if (!champ) return;
    champ.focus();
    champ.setSelectionRange(champ.value.length, champ.value.length);
  });

  return (
    <div>
      <Etiquette label={label} hint={hint} rempli={pleines > 0}
        droite={pleines ? `${pleines}` : ''} />
      <div className="flex flex-col gap-[7px]">
        {rendu.map((ligne, i) => (
          <div key={i} className="flex items-center gap-2.5 group/ligne">
            <span className="w-[19px] h-[19px] flex-shrink-0 rounded-md bg-white/[0.05] text-slate-500
                             text-[10.5px] font-semibold grid place-items-center tabular-nums
                             transition-colors duration-200 ease-out-strong
                             group-focus-within/ligne:bg-[#5B6CFF]/20 group-focus-within/ligne:text-[#c7cdff]">
              {i + 1}
            </span>
            <input
              data-ligne={`${name}-${i}`}
              data-testid={`field-${name}-${i}`}
              value={ligne}
              placeholder={exemples[i] || ''}
              onChange={(e) => modifier(i, e.target.value)}
              onKeyDown={(e) => {
                // Entrée ouvre la ligne suivante, retour arrière sur une ligne
                // vide la supprime : on remplit tout sans lâcher le clavier.
                if (e.key === 'Enter') { e.preventDefault(); inserer(i); focusLigne(i + 1); }
                if (e.key === 'Backspace' && !ligne && rendu.length > 1) {
                  e.preventDefault(); retirer(i); focusLigne(Math.max(0, i - 1));
                }
              }}
              className={CADRE} />
            <button type="button" onClick={() => retirer(i)} tabIndex={-1}
              title={ajouter?.retirer}
              className="w-[26px] h-[26px] flex-shrink-0 grid place-items-center rounded-md text-slate-600
                         opacity-0 group-hover/ligne:opacity-100 group-focus-within/ligne:opacity-100
                         hover:text-red-300 hover:bg-red-400/10 active:scale-90
                         transition-[opacity,color,background-color,transform] [transition-duration:130ms] ease-out-strong">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => inserer(rendu.length - 1)}
        data-testid={`add-${name}`}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-[9px] border border-dashed border-slate-700
                   text-slate-400 text-[12.5px] font-inter px-3 py-1.5 active:scale-[0.97]
                   hover:border-[#5B6CFF] hover:text-white
                   transition-[border-color,color,transform] duration-150 ease-out-strong">
        <Plus className="w-3.5 h-3.5" />{ajouter?.label}
      </button>
    </div>
  );
}
