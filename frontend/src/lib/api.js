import axios from 'axios';
import { toast } from 'sonner';
import { getToken, logout } from './auth';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Un 401 sur une TENTATIVE de connexion = mauvais identifiants (attendu) :
    // on laisse le composant afficher le toast, sans recharger la page (sinon champs vidés).
    const url = error.config?.url || '';
    const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/admin-login');
    if (error.response?.status === 401 && !isAuthAttempt) {
      logout();  // session expirée -> efface localStorage + stockage natif (Preferences)
      window.location.href = '/login';
    } else if (error.response?.status === 402) {
      // Crédits épuisés -> paywall : toast actionnable vers l'abonnement
      toast.error(error.response?.data?.detail || 'Crédits épuisés.', {
        action: { label: 'Passer Pro', onClick: () => { window.location.href = '/dashboard/parametres'; } },
        duration: 8000,
      });
      error.__handled = true;  // évite le double-toast côté composant
    }
    return Promise.reject(error);
  }
);

export default api;
