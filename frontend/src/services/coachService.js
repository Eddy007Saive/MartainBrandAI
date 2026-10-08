import api from '../lib/api';

// Rico Coach : plan d'action du mois + diagnostic qui l'a produit + courbe des mois complets
export const coachService = {
  ecran: () => api.get('/coach').then((r) => r.data),
};

export default coachService;
