import { useCallback, useRef, useState } from 'react';

/**
 * État du projet de montage avec historique (annuler / rétablir).
 *
 * `setProjet(maj)` : `maj` est un objet ou une fonction (projet) => projet. Chaque appel
 * ajoute une entrée d'historique, sauf `{ historique: false }` (glisser en cours : on ne
 * veut pas une entrée par pixel — l'appelant appelle `figer()` au relâchement).
 *
 * Chaque entrée garde aussi la sélection du moment (idée reprise d'OpenCut, licence MIT) :
 * annuler une suppression resélectionne le plan revenu, au lieu de laisser une sélection vide.
 * `selection` = { lire: () => ids, ecrire: (ids) => void }, facultatif.
 */
const MAX_HISTORIQUE = 80;

export default function useProjet(initial = null, selection = null) {
  const [projet, setProjetBrut] = useState(initial);
  const courant = useRef(projet); // projet affiché, lu par annuler/rétablir hors des updaters
  courant.current = projet;
  const passe = useRef([]);   // [{ projet, sel }]
  const futur = useRef([]);
  const [, forcer] = useState(0);
  const enCours = useRef(null); // { projet, sel } avant un glisser, à figer au relâchement
  const sel = useRef(selection);
  sel.current = selection;
  const lireSel = () => sel.current?.lire?.() ?? [];
  const ecrireSel = (ids) => sel.current?.ecrire?.(ids);

  const empiler = (entree) => {
    passe.current.push(entree);
    if (passe.current.length > MAX_HISTORIQUE) passe.current.shift();
    futur.current = [];
  };

  const setProjet = useCallback((maj, opts = {}) => {
    const selAvant = lireSel();
    setProjetBrut((prev) => {
      const suivant = typeof maj === 'function' ? maj(prev) : maj;
      if (suivant === prev) return prev;
      if (opts.historique === false) {
        if (enCours.current === null) enCours.current = { projet: prev, sel: selAvant };
      } else {
        empiler(enCours.current ?? { projet: prev, sel: selAvant });
        enCours.current = null;
      }
      return suivant;
    });
    forcer((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fin d'un glisser : l'état d'avant entre dans l'historique en une seule fois. */
  const figer = useCallback(() => {
    if (enCours.current === null) return;
    empiler(enCours.current);
    enCours.current = null;
    forcer((n) => n + 1);
  }, []);

  const charger = useCallback((p) => {
    passe.current = []; futur.current = []; enCours.current = null;
    setProjetBrut(p);
    forcer((n) => n + 1);
  }, []);

  // L'entrée restaurée porte la sélection de son moment ; l'état quitté part dans l'autre pile
  // avec la sélection actuelle. Tout se fait hors d'un updater : React (StrictMode) peut en
  // exécuter un deux fois, ce qui empilerait deux fois la même entrée.
  const annuler = useCallback(() => {
    const entree = passe.current.pop();
    if (!entree) return;
    const selActuelle = lireSel();
    futur.current.push({ projet: courant.current, sel: selActuelle });
    setProjetBrut(entree.projet);
    ecrireSel(entree.sel);
    forcer((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retablir = useCallback(() => {
    const entree = futur.current.pop();
    if (!entree) return;
    const selActuelle = lireSel();
    passe.current.push({ projet: courant.current, sel: selActuelle });
    setProjetBrut(entree.projet);
    ecrireSel(entree.sel);
    forcer((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    projet, setProjet, figer, charger, annuler, retablir,
    peutAnnuler: passe.current.length > 0, peutRetablir: futur.current.length > 0,
  };
}
