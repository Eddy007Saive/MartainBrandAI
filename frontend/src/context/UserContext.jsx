import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';
import { getToken, removeToken } from '../lib/auth';

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
      const response = await api.get('/users/me');
      setUser(response.data);
    } catch (error) {
      console.error('Error fetching user:', error);
      removeToken();
    } finally {
      setLoading(false);
    }
  };

  const updateUser = (newData) => {
    setUser(prev => ({ ...prev, ...newData }));
  };

  const logout = () => {
    removeToken();
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
