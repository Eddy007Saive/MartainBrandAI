const TOKEN_KEY = 'token';
const ADMIN_TOKEN_KEY = 'adminToken';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

export const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY);
export const setAdminToken = (token) => localStorage.setItem(ADMIN_TOKEN_KEY, token);
export const removeAdminToken = () => localStorage.removeItem(ADMIN_TOKEN_KEY);

export const isAuthenticated = () => !!getToken();
export const isAdminAuthenticated = () => !!getAdminToken();

export const logout = () => {
  removeToken();
  removeAdminToken();
};
