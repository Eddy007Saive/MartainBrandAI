import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { userService } from '../services/userService';
import { useUser } from './UserContext';

/**
 * Où en est le compte dans ses premiers pas (profil → réseau → carte → sujets →
 * post → validation). L'état vient du serveur (GET /users/me/demarrage), calculé
 * depuis les données : la visite guidée, la carte « Premiers pas » de l'Accueil et
 * le Studio lisent la même chose. Rafraîchi à chaque changement de page, au retour
 * sur l'onglet, quand l'utilisateur change (enregistrement, connexion réseau), sur
 * l'événement `postorico:demarrage` (garde serveur) et toutes les 20 s tant que le
 * parcours n'est pas terminé.
 */
const DemarrageContext = createContext(null);

export function DemarrageProvider({ children }) {
  const { user } = useUser();
  const location = useLocation();
  const [etat, setEtat] = useState(null);
  const [chargement, setChargement] = useState(true);
  // « Reprendre le démarrage » depuis l'Accueil : réaffiche la visite même si
  // l'utilisateur avait cliqué « Plus tard ».
  const [visiteForcee, setVisiteForcee] = useState(false);
  const enCours = useRef(false);
  const debounce = useRef(null);

  // force === true : contourne le cache serveur (20 s) — utilisé juste après une
  // action (événement `postorico:demarrage`, bouton « C'est fait, vérifier »).
  const rafraichir = useCallback(async (force) => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      const d = await userService.demarrage(force === true);
      setEtat(d);
    } catch (e) { /* silencieux : l'état précédent reste affiché */ } finally {
      enCours.current = false;
      setChargement(false);
    }
  }, []);

  // Changement de page ou de section (?s=) -> l'étape courante peut avoir changé.
  useEffect(() => { rafraichir(); }, [location.pathname, location.search, rafraichir]);

  // L'objet user change à chaque frappe dans Paramètres (état local) : on attend
  // une accalmie avant de redemander l'état au serveur.
  useEffect(() => {
    if (!user?.telegram_id) return undefined;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(rafraichir, 1500);
    return () => clearTimeout(debounce.current);
  }, [user, rafraichir]);

  useEffect(() => {
    const onFocus = () => rafraichir();
    const onAction = () => rafraichir(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener('postorico:demarrage', onAction);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('postorico:demarrage', onAction);
    };
  }, [rafraichir]);

  useEffect(() => {
    if (!etat || etat.termine) return undefined;
    const t = setInterval(() => rafraichir(), 20000);
    return () => clearInterval(t);
  }, [etat, rafraichir]);

  return (
    <DemarrageContext.Provider value={{ etat, chargement, rafraichir, visiteForcee, setVisiteForcee }}>
      {children}
    </DemarrageContext.Provider>
  );
}

const VIDE = { etat: null, chargement: false, rafraichir: () => {}, visiteForcee: false, setVisiteForcee: () => {} };

export function useDemarrage() {
  return useContext(DemarrageContext) || VIDE;
}
