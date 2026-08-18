import { useEffect } from 'react';

// Capture du code de parrainage. On le garde en localStorage plutôt qu'en
// cookie : le front et l'API ne sont pas sur le même domaine, un cookie tiers
// se fait bloquer par la plupart des navigateurs.
const CLE = 'postorico_ref';
const JOURS = 30; // fenêtre d'attribution, alignée sur le backend

const valide = (code) => /^[A-Z]{2,6}[0-9A-Z]{3,8}$/.test(code || '');

/** Lit ?ref= dans l'URL et le mémorise. À monter une fois, au niveau de l'app. */
export function useAffiliateRef() {
  useEffect(() => {
    const code = (new URLSearchParams(window.location.search).get('ref') || '')
      .trim().toUpperCase();
    if (!valide(code)) return;
    try {
      // Le premier parrain gagne : on n'écrase pas une attribution en cours.
      const actuel = JSON.parse(localStorage.getItem(CLE) || 'null');
      if (actuel && actuel.expire > Date.now()) return;
      localStorage.setItem(CLE, JSON.stringify({
        code, expire: Date.now() + JOURS * 86400000,
      }));
    } catch { /* mode privé, stockage refusé : tant pis, pas d'attribution */ }
  }, []);
}

/** Le code encore valable, ou null. À joindre au formulaire d'inscription. */
export function lireAffiliateRef() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) || 'null');
    if (!v || v.expire < Date.now()) return null;
    return v.code;
  } catch {
    return null;
  }
}
