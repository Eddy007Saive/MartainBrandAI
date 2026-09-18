import { useCallback, useRef, useState } from 'react';

/**
 * État du projet de montage avec historique (annuler / rétablir).
 *
 * `setProjet(maj)` : `maj` est un objet ou une fonction (projet) => projet. Chaque appel
 * ajoute une entrée d'historique, sauf `{ historique: false }` (glisser en cours : on ne
 * veut pas une entrée par pixel — l'appelant appelle `figer()` au relâchement).
 */
const MAX_HISTORIQUE = 80;

export default function useProjet(initial = null) {
  const [projet, setProjetBrut] = useState(initial);
  const passe = useRef([]);
  const futur = useRef([]);
  const [, forcer] = useState(0);
  const enCours = useRef(null); // état avant un glisser, à figer au relâchement

  const setProjet = useCallback((maj, opts = {}) => {
    setProjetBrut((prev) => {
      const suivant = typeof maj === 'function' ? maj(prev) : maj;
      if (suivant === prev) return prev;
      if (opts.historique === false) {
        if (enCours.current === null) enCours.current = prev;
      } else {
        passe.current.push(enCours.current ?? prev);
        enCours.current = null;
        if (passe.current.length > MAX_HISTORIQUE) passe.current.shift();
        futur.current = [];
      }
      return suivant;
    });
    forcer((n) => n + 1);
  }, []);

  /** Fin d'un glisser : l'état d'avant entre dans l'historique en une seule fois. */
  const figer = useCallback(() => {
    if (enCours.current === null) return;
    passe.current.push(enCours.current);
    enCours.current = null;
    if (passe.current.length > MAX_HISTORIQUE) passe.current.shift();
    futur.current = [];
    forcer((n) => n + 1);
  }, []);

  const charger = useCallback((p) => {
    passe.current = []; futur.current = []; enCours.current = null;
    setProjetBrut(p);
    forcer((n) => n + 1);
  }, []);

  const annuler = useCallback(() => {
    setProjetBrut((prev) => {
      if (!passe.current.length) return prev;
      futur.current.push(prev);
      return passe.current.pop();
    });
    forcer((n) => n + 1);
  }, []);

  const retablir = useCallback(() => {
    setProjetBrut((prev) => {
      if (!futur.current.length) return prev;
      passe.current.push(prev);
      return futur.current.pop();
    });
    forcer((n) => n + 1);
  }, []);

  return {
    projet, setProjet, figer, charger, annuler, retablir,
    peutAnnuler: passe.current.length > 0, peutRetablir: futur.current.length > 0,
  };
}
