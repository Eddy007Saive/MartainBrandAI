import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CircleHelp, X, Plus } from 'lucide-react';

/**
 * Champs de la fiche de marque.
 *
 * Trois partis pris qui expliquent le reste :
 *  - l'aide est repliée sous un bouton « ? » : sur une fiche qu'on relit vingt fois,
 *    une consigne affichée en continu devient du bruit, mais elle doit s'ouvrir au
 *    clavier et au doigt (une info-bulle au survol n'existe pas sur mobile) ;
 *  - chaque champ a un vrai nom (label relié), lu par les lecteurs d'écran ;
 *  - les piliers, accroches et appels à l'action sont stockés en lignes : on les
 *    affiche donc comme une liste, pas comme un pavé de texte où l'utilisateur doit
 *    deviner le format attendu.
 */

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70';
const CADRE = 'w-full rounded-[10px] bg-slate-950/55 border border-slate-700/70 text-slate-100 '
  + 'text-[13.5px] font-inter px-3 py-2 outline-none resize-none overflow-hidden '
  + 'placeholder:text-slate-500 '
  + 'transition-[border-color,box-shadow,background-color] duration-150 ease-out-strong '
  + 'hover:border-slate-600 focus:border-[#8A6CFF] focus:bg-slate-950/80 '
  + 'focus:shadow-[0_0_0_3px_rgba(138,108,255,0.2)]';

// Rempli : une coche (et un mot pour les lecteurs d'écran), pas seulement une couleur.
const Etat = ({ rempli }) => {
  const { t } = useTranslation();
  return rempli
    ? <span className="w-4 h-4 rounded-full bg-[#3AFFA3]/15 grid place-items-center flex-shrink-0">
        <Check className="w-2.5 h-2.5 text-[#3AFFA3]" aria-hidden="true" />
        <span className="sr-only">{t('params.marque.renseigne')}</span>
      </span>
    : <span className="w-4 h-4 rounded-full border border-slate-600 flex-shrink-0" aria-hidden="true" />;
};

function Etiquette({ id, label, hint, rempli, droite, essentiel, hintId, aideOuverte, basculerAide }) {
  const { t } = useTranslation();
  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Etat rempli={rempli} />
        <label htmlFor={id} className="text-[13.5px] font-medium text-slate-100 font-inter">{label}</label>
        {essentiel && (
          <span className="text-[11px] font-semibold text-[#c9c1ff] bg-[#8A6CFF]/15 border border-[#8A6CFF]/30 rounded-full px-2 py-px font-inter">
            {t('params.marque.essentiel')}
          </span>
        )}
        {droite && <span className="text-[12px] text-slate-400 font-inter tabular-nums">· {droite}</span>}
        {hint && (
          <button type="button" onClick={basculerAide} aria-expanded={aideOuverte} aria-controls={hintId}
            aria-label={t(aideOuverte ? 'params.marque.aideMasquer' : 'params.marque.aideVoir', { champ: label })}
            className={`ml-auto sm:ml-0 w-6 h-6 grid place-items-center rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] ${FOCUS}`}>
            <CircleHelp className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {hint && aideOuverte && (
        <p id={hintId} className="mt-1 ml-6 text-[12.5px] leading-relaxed text-slate-300 font-inter max-w-[62ch] whitespace-pre-line">{hint}</p>
      )}
    </div>
  );
}

/** Champ texte. La hauteur suit le contenu : une poignée de redimensionnement
 *  laissée à l'utilisateur casse le rythme vertical de la page. */
export function ChampMarque({ label, name, value, onChange, hint, placeholder,
                             lignes = 3, multi = true, essentiel = false, ariaLabel }) {
  const ref = useRef(null);
  const id = useId();
  const hintId = `${id}-aide`;
  const [aide, setAide] = useState(false);
  const v = value || '';

  useEffect(() => {
    const z = ref.current;
    if (!z || !multi) return;
    z.style.height = 'auto';
    z.style.height = `${z.scrollHeight}px`;
  }, [v, multi]);

  const commun = {
    id, value: v, placeholder,
    onChange: (e) => onChange(name, e.target.value),
    className: CADRE,
    'data-testid': `field-${name}`,
    'aria-label': label ? undefined : ariaLabel,
    'aria-describedby': hint && aide ? hintId : undefined,
    'aria-required': essentiel || undefined,
  };

  return (
    <div className="group/champ">
      {label && <Etiquette id={id} label={label} hint={hint} rempli={!!v.trim()} essentiel={essentiel}
        hintId={hintId} aideOuverte={aide} basculerAide={() => setAide((a) => !a)} />}
      {multi ? <textarea ref={ref} rows={lignes} {...commun} /> : <input {...commun} />}
      {/* Le compteur n'apparaît qu'à la saisie : utile quand on écrit, bruit le
          reste du temps. En hauteur nulle pour ne pas décaler la mise en page. */}
      <div className="h-0 flex justify-end" aria-hidden="true">
        <span className="mt-1 text-[11px] text-slate-400 font-inter tabular-nums opacity-0
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
  const { t } = useTranslation();
  const id = useId();
  const hintId = `${id}-aide`;
  const [aide, setAide] = useState(false);
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
      <Etiquette id={`${id}-0`} label={label} hint={hint} rempli={pleines > 0}
        droite={pleines ? `${pleines}` : ''} hintId={hintId} aideOuverte={aide} basculerAide={() => setAide((a) => !a)} />
      <div className="flex flex-col gap-[7px]">
        {rendu.map((ligne, i) => (
          <div key={i} className="flex items-center gap-2.5 group/ligne">
            <span aria-hidden="true"
              className="w-[19px] h-[19px] flex-shrink-0 rounded-md bg-white/[0.06] text-slate-300
                         text-[10.5px] font-semibold grid place-items-center tabular-nums
                         transition-colors duration-200 ease-out-strong
                         group-focus-within/ligne:bg-[#8A6CFF]/25 group-focus-within/ligne:text-white">
              {i + 1}
            </span>
            <input
              id={i === 0 ? `${id}-0` : undefined}
              data-ligne={`${name}-${i}`}
              data-testid={`field-${name}-${i}`}
              aria-label={`${label} ${i + 1}`}
              aria-describedby={hint && aide ? hintId : undefined}
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
            <button type="button" onClick={() => { retirer(i); focusLigne(Math.max(0, i - 1)); }}
              aria-label={t('params.marque.retirerLigne', { champ: label, n: i + 1 })}
              className={`w-[28px] h-[28px] flex-shrink-0 grid place-items-center rounded-md text-slate-400
                         sm:opacity-0 group-hover/ligne:opacity-100 group-focus-within/ligne:opacity-100 focus-visible:opacity-100
                         hover:text-red-300 hover:bg-red-400/10 active:scale-90
                         transition-[opacity,color,background-color,transform] [transition-duration:130ms] ease-out-strong ${FOCUS}`}>
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => { inserer(rendu.length - 1); focusLigne(rendu.length); }}
        data-testid={`add-${name}`}
        className={`mt-2.5 ml-[29px] inline-flex items-center gap-1.5 rounded-[9px] border border-dashed border-slate-600
                   text-slate-300 text-[12.5px] font-inter px-3 py-1.5 active:scale-[0.97]
                   hover:border-[#8A6CFF] hover:text-white
                   transition-[border-color,color,transform] duration-150 ease-out-strong ${FOCUS}`}>
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />{ajouter?.label}
      </button>
    </div>
  );
}
