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

  getUsers: (filter = 'all') => adminFetch(`/admin/users?filter=${filter}`),

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
};
