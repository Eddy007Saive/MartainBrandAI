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
    // Une action réussie (sujets générés, post enregistré, validation, réseau
    // connecté) peut faire avancer le démarrage guidé : on le prévient tout de
    // suite plutôt que d'attendre son prochain sondage.
    const methode = (response.config?.method || 'get').toLowerCase();
    const url = response.config?.url || '';
    if (methode !== 'get' && /\/(agent|contenus|brouillons|video|late|users\/me)(\/|$|\?)/.test(url)) {
      try { window.dispatchEvent(new CustomEvent('postorico:demarrage')); } catch (e) { /* ignore */ }
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
    } else if (error.response?.status === 400
               && ['profil_incomplet', 'reconnexion_requise'].includes(error.response?.data?.detail?.raison)) {
      // Gardes serveur du démarrage : profil de marque minimum manquant, ou aucun
      // réseau reconnecté après une suspension pour impayé. On ramène le détail à
      // sa chaîne (les appelants lisent `detail`), on prévient la visite guidée
      // (qui se cale sur l'étape concernée) et on propose le raccourci.
      const d = error.response.data.detail;
      const reseau = d.raison === 'reconnexion_requise';
      const message = d.message || 'Complète ton profil de marque avant de générer.';
      error.response.data.detail = message;
      window.dispatchEvent(new CustomEvent('postorico:demarrage', { detail: d }));
      toast.error(message, {
        action: {
          label: reseau ? 'Reconnecter' : 'Compléter',
          onClick: () => { window.location.href = reseau ? '/dashboard/parametres?s=connections' : '/dashboard/parametres?s=marque'; },
        },
        duration: 8000,
      });
      error.__handled = true;
    } else if (error.response?.status === 402) {
      // Le serveur refuse une génération. Deux refus très différents vivent
      // derrière ce même code, et les confondre serait grossier :
      //
      //   no_subscription -> ce compte n'a jamais donné sa carte. C'est le
      //     moment du parcours en libre-service : il vient de cliquer sur
      //     « générer », il a compris ce que le produit fait, et c'est là
      //     qu'on lui demande sa carte. Un toast serait une porte fermée ;
      //     on ouvre le mur, qui explique et propose.
      //
      //   quota / not_in_plan -> il est bien client, il a simplement épuisé
      //     ses résultats du mois. Un toast suffit, l'interrompre plein écran
      //     serait vexant.
      //
      // Le détail arrive en objet { raison, message } depuis les points de
      // génération. On le ramène ensuite à sa chaîne : tout le code appelant
      // qui lit `detail` continue de fonctionner sans être touché.
      const brut = error.response?.data?.detail;
      const raison = typeof brut === 'object' ? brut?.raison : null;
      const message = (typeof brut === 'object' ? brut?.message : brut) || 'Génération indisponible.';
      if (error.response?.data) error.response.data.detail = message;

      if (['no_subscription', 'canceled', 'expired', 'impaye', 'suspendu'].includes(raison)) {
        // canceled : ex-abonné (résilié) — le mur affiche un message différent (pas
        // de nouvel essai gratuit promis). impaye / suspendu : le dernier prélèvement
        // a échoué (cran 1) ou les réseaux ont été déconnectés (J+10) — le mur ouvre
        // le portail Stripe pour mettre la carte à jour, pas un nouveau checkout.
        window.dispatchEvent(new CustomEvent('postorico:mur-paiement', { detail: { message, raison } }));
      } else {
        toast.error(message, {
          action: { label: 'Voir mon offre', onClick: () => { window.location.href = '/dashboard/parametres?s=abonnement'; } },
          duration: 8000,
        });
      }
      error.__handled = true;  // évite le double-toast côté composant
    }
    return Promise.reject(error);
  }
);

export default api;
