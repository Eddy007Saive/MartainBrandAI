import api from '../lib/api';
import { getAdminToken } from '../lib/auth';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const adminHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getAdminToken()}`,
});

const adminFetch = async (endpoint, options = {}) => {
  const response = await fetch(`${API_URL}/api${endpoint}`, {
    ...options,
    headers: { ...adminHeaders(), ...options.headers },
  });
  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  return response.json();
};

export const adminService = {
  getStats: () => adminFetch('/admin/stats'),

  getUsers: (filter = 'all', q = '') =>
    adminFetch(`/admin/users?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}`),

  setCredits: (telegramId, amount, mode = 'set') =>
    adminFetch(`/admin/users/${telegramId}/credits`, { method: 'PATCH', body: JSON.stringify({ amount, mode }) }),

  setPlan: (telegramId, plan, reset_credits = true) =>
    adminFetch(`/admin/users/${telegramId}/plan`, { method: 'PATCH', body: JSON.stringify({ plan, reset_credits }) }),

  sendPush: (title, body, telegramId = null) =>
    adminFetch('/admin/push', { method: 'POST', body: JSON.stringify({ title, body, telegram_id: telegramId }) }),

  getSystem: () => adminFetch('/admin/system'),
  refreshAnalytics: () => adminFetch('/admin/analytics/refresh', { method: 'POST' }),
  resetMonthlyCredits: () => adminFetch('/admin/credits/reset-monthly', { method: 'POST' }),

  getUser: (telegramId) => adminFetch(`/admin/users/${telegramId}`),

  getUserContenus: (telegramId) => adminFetch(`/admin/users/${telegramId}/contenus`),

  activateUser: (telegramId) =>
    adminFetch(`/admin/users/${telegramId}/activate`, { method: 'PATCH' }),

  deactivateUser: (telegramId) =>
    adminFetch(`/admin/users/${telegramId}/deactivate`, { method: 'PATCH' }),

  deleteUser: (telegramId) =>
    adminFetch(`/admin/users/${telegramId}`, { method: 'DELETE' }),

  getActivity: (limit = 50) => adminFetch(`/admin/activity?limit=${limit}`),

  exportCSV: async () => {
    const response = await fetch(`${API_URL}/api/admin/export/users`, {
      headers: { Authorization: `Bearer ${getAdminToken()}` },
    });
    return response.blob();
  },

  // Avatar management
  getAvatars: () => adminFetch('/admin/avatars'),

  updateAvatar: (telegramId, data) =>
    adminFetch(`/admin/avatars/${telegramId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteAvatar: (telegramId) =>
    adminFetch(`/admin/avatars/${telegramId}`, { method: 'DELETE' }),

  // Offres & quotas (paramétrable)
  getQuotaConfig: () => adminFetch('/admin/quota-config'),
  updatePlan: (id, data) => adminFetch(`/admin/plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updatePlanQuota: (id, data) => adminFetch(`/admin/plan-quotas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createPlanQuota: (data) => adminFetch('/admin/plan-quotas', { method: 'POST', body: JSON.stringify(data) }),
  updatePack: (id, data) => adminFetch(`/admin/credit-packs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createPack: (data) => adminFetch('/admin/credit-packs', { method: 'POST', body: JSON.stringify(data) }),
  deletePack: (id) => adminFetch(`/admin/credit-packs/${id}`, { method: 'DELETE' }),
};
