import api from '../lib/api';
import { jetonValide } from '../lib/auth';

/**
 * Le serveur a repondu 200 : cela ne suffit pas. Tant qu'on n'a pas un jeton
 * qui ressemble a un jeton, il n'y a pas de session — et l'appelant ne doit
 * surtout pas naviguer vers le tableau de bord.
 */
const exigerSession = (data) => {
  if (!data || !jetonValide(data.token)) {
    const err = new Error('reponse_sans_session');
    err.__reponseInvalide = true;
    throw err;
  }
  return data;
};

export const authService = {
  // Deux issues possibles : une session, ou « code_requis » (appareil inconnu / admin) :
  // le serveur a envoyé un code par email et rend un jeton d'attente.
  login: (email, password, appareil) =>
    api.post('/auth/login', { email, password, appareil: appareil || undefined })
      .then(r => (r.data?.code_requis ? r.data : exigerSession(r.data))),
  verifierCode: (jeton, code, confiance) =>
    api.post('/auth/code/verifier', { jeton, code, confiance }).then(r => exigerSession(r.data)),
  renvoyerCode: (jeton) =>
    api.post('/auth/code/renvoyer', { jeton }).then(r => r.data),

  register: (payload) =>
    api.post('/auth/register', payload).then(r => exigerSession(r.data)),

  // « Continuer avec Google » : le client OAuth vient du serveur (vide = pas de bouton),
  // puis le jeton d'accès obtenu dans le navigateur est échangé contre notre session.
  googleConfig: () => api.get('/auth/google/config').then(r => r.data),
  google: (payload) =>
    api.post('/auth/google', payload).then(r => exigerSession(r.data)),

  adminLogin: (email, password, appareil) =>
    api.post('/auth/admin-login', { email, password, appareil: appareil || undefined })
      .then(r => (r.data?.code_requis ? r.data : exigerSession(r.data))),

  forgotPassword: (email) =>
    api.post('/auth/forgot-password', { email }).then(r => r.data),

  resetPassword: (token, password) =>
    api.post('/auth/reset-password', { token, password }).then(r => r.data),
};
