import api from '../lib/api';

export const billingService = {
  // Crée une session de paiement Stripe pour un plan ('pro' | 'business') et redirige
  checkout: async (plan) => {
    const { data } = await api.post('/billing/checkout', { plan });
    if (data?.url) window.location.href = data.url;
    return data;
  },
  // Ouvre le portail client Stripe (gérer/annuler l'abonnement)
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
  packCheckout: async (pack_id) => {
    const { data } = await api.post('/billing/pack-checkout', { pack_id });
    if (data?.url) window.location.href = data.url;
    return data;
  },
};
