import api from '../lib/api';

export const billingService = {
  // Crée une session de paiement Stripe pour un plan ('pro' | 'business') et redirige.
  // essai=true : parcours d'inscription — la carte est saisie, rien n'est prélevé,
  // et Stripe déclenche lui-même le premier paiement au 14e jour.
  checkout: async (plan, essai = false) => {
    const { data } = await api.post('/billing/checkout', { plan, essai });
    if (data?.url) window.location.href = data.url;
    return data;
  },
  // Ouvre le portail client Stripe (gérer/annuler l'abonnement)
  // La résiliation se fait CHEZ NOUS, plus dans le portail Stripe : le portail
  // emmène le client hors de l'application, où l'on ne peut ni lui demander
  // pourquoi il part, ni lui proposer autre chose.
  resilier: (raison, commentaire) =>
    api.post('/billing/resilier', { raison, commentaire }).then((r) => r.data),
  pause: (mois, raison, commentaire) =>
    api.post('/billing/pause', { mois, raison, commentaire }).then((r) => r.data),
  reprendre: () => api.post('/billing/reprendre').then((r) => r.data),

  portal: async () => {
    const { data } = await api.post('/billing/portal');
    if (data?.url) window.location.href = data.url;
    return data;
  },
  // Resync de l'abonnement (au retour du paiement / si webhook manqué)
  sync: () => api.post('/billing/sync').then((r) => r.data),
  // Packs de rachat (par type) + achat one-time Stripe
  getPacks: (action_type) =>
    api.get('/billing/packs', { params: action_type ? { action_type } : {} }).then((r) => r.data),
  // Lien de paiement du Pack Fondations, genere pour un client precis apres le
  // rendez-vous. Le code de l'apporteur d'affaires part en metadata.
  lienPack: async (payload) => {
    const { data } = await api.post('/billing/admin/lien-pack', payload);
    return data;
  },

  packCheckout: async (pack_id) => {
    const { data } = await api.post('/billing/pack-checkout', { pack_id });
    if (data?.url) window.location.href = data.url;
    return data;
  },
  // Factures Stripe du compte (date, montant, statut, PDF)
  invoices: () => api.get('/billing/invoices').then((r) => r.data),
};
