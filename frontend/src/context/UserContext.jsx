import { createContext, useContext, useState, useEffect } from 'react';
import { userService } from '../services/userService';
import { getToken, logout as clearAuth } from '../lib/auth';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await userService.getMe();
      setUser(data);
    } catch (error) {
      // NE PAS déconnecter sur une erreur réseau / serveur transitoire (sinon l'app mobile
      // perd la session à chaque réouverture). Le token n'est effacé que sur un vrai 401
      // (déjà géré globalement par l'intercepteur api). Ici on garde le token et on réessaiera.
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = (newData) => {
    setUser(prev => ({ ...prev, ...newData }));
  };

  const logout = () => {
    clearAuth();
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, setUser, updateUser, logout, loading, refetchUser: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
