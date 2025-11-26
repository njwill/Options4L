import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  nostrPubkey?: string | null;
  displayName: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
  authMethod?: 'nostr' | 'replit';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (signedEvent: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = async () => {
    try {
      // Try the unified user endpoint first (works for both auth methods)
      const response = await fetch('/api/auth/user', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
          return;
        }
      }
      
      // Fall back to NOSTR-specific endpoint
      const nostrResponse = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      
      if (nostrResponse.ok) {
        const data = await nostrResponse.json();
        if (data.user) {
          setUser({ ...data.user, authMethod: 'nostr' });
          return;
        }
      }
      
      setUser(null);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const login = async (signedEvent: any) => {
    const loginResponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ event: signedEvent }),
    });

    if (!loginResponse.ok) {
      const error = await loginResponse.json();
      throw new Error(error.error || 'Login failed');
    }

    const { user: newUser } = await loginResponse.json();
    setUser({ ...newUser, authMethod: 'nostr' });
  };

  const logout = async () => {
    // Try both logout endpoints (both use POST for CSRF protection)
    await Promise.all([
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {}),
      fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {}),
    ]);
    setUser(null);
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
