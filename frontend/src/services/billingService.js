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
};
