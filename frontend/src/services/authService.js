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
  login: (email, password) =>
    api.post('/auth/login', { email, password }).then(r => exigerSession(r.data)),

  register: (payload) =>
    api.post('/auth/register', payload).then(r => exigerSession(r.data)),

  adminLogin: (email, password) =>
    api.post('/auth/admin-login', { email, password }).then(r => exigerSession(r.data)),

  forgotPassword: (email) =>
    api.post('/auth/forgot-password', { email }).then(r => r.data),

  resetPassword: (token, password) =>
    api.post('/auth/reset-password', { token, password }).then(r => r.data),
};
