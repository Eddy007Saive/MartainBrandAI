import api from '../lib/api';

export const authService = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }).then(r => r.data),

  register: (payload) =>
    api.post('/auth/register', payload).then(r => r.data),

  adminLogin: (password) =>
    api.post('/auth/admin-login', { password }).then(r => r.data),

  forgotPassword: (email) =>
    api.post('/auth/forgot-password', { email }).then(r => r.data),

  resetPassword: (token, password) =>
    api.post('/auth/reset-password', { token, password }).then(r => r.data),
};
