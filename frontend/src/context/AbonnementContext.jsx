import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { agentService } from '../services/agentService';

/**
 * L'état d'abonnement du compte, lu une seule fois pour tout le tableau de bord.
 *
 * Depuis que l'essai passe par Stripe, un compte peut exister sans abonnement :
 * il suffit d'avoir refermé la page de paiement à l'inscription. Le serveur
 * refuse alors chaque action avec « no_subscription » — mais l'interface, elle,
 * continuait de présenter un tableau de bord complet où rien ne marchait, sans
 * jamais dire pourquoi. C'est le pire des deux mondes : on ne vend pas, et on
 * donne l'impression que le produit est cassé.
 *
 * Ce contexte porte cet état pour que la navigation, l'accueil et les jauges
 * disent tous la même chose, à partir d'un seul appel.
 */
const Contexte = createContext({ pret: false, usage: null, sansAbonnement: false, recharger: () => {} });

export function AbonnementProvider({ children }) {
  const [usage, setUsage] = useState(null);
  const [pret, setPret] = useState(false);

  const recharger = useCallback(() => {
    setPret(false);
    return agentService.usage()
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setPret(true));
  }, []);

  useEffect(() => { recharger(); }, [recharger]);

  const valeur = useMemo(() => ({
    pret,
    usage,
    // Tant que la réponse n'est pas là, on ne verrouille RIEN : verrouiller par
    // défaut ferait clignoter les cadenas à chaque chargement de page pour les
    // comptes parfaitement en règle.
    sansAbonnement: pret && !!usage && !usage.subscription,
    recharger,
  }), [pret, usage, recharger]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export const useAbonnement = () => useContext(Contexte);
