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
  (response) => {
    // Une reponse 200 qui contient du HTML n'est pas une reponse de l'API :
    // c'est le serveur du FRONT qui a repondu a sa place. Cela arrive des que
    // baseURL est relative — REACT_APP_BACKEND_URL absente donne
    // « undefined/api » — ou derriere un repli SPA (.htaccess, vercel).
    // Sans ce garde-fou, axios resout normalement et l'appelant croit avoir
    // recu des donnees.
    const type = response.headers?.['content-type'] || '';
    if (typeof response.data === 'string' && type.includes('text/html')) {
      const err = new Error('reponse_non_json');
      err.__reponseInvalide = true;
      err.config = response.config;
      return Promise.reject(err);
    }
    return response;
  },
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
