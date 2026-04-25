import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('lyceum_token');
    if (!token) { setLoading(false); return; }

    auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('lyceum_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, user } = await auth.login({ email, password });
    localStorage.setItem('lyceum_token', token);
    setUser(user);
    return user;
  }

  async function register(email, password, full_name) {
    const { token, user } = await auth.register({ email, password, full_name });
    localStorage.setItem('lyceum_token', token);
    setUser(user);
    return user;
  }

  function logout() {
    localStorage.removeItem('lyceum_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
