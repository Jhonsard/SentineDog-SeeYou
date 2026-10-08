import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 heure en millisecondes

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("jwt_token"));
  const [, setLocation] = useLocation();
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  const login = (newToken: string) => {
    localStorage.setItem("jwt_token", newToken);
    setToken(newToken);
    setLastActivity(Date.now());
    setLocation("/");
  };

  const logout = () => {
    localStorage.removeItem("jwt_token");
    setToken(null);
    setLocation("/login");
  };

  // Mettre à jour l'activité utilisateur
  const updateActivity = () => {
    setLastActivity(Date.now());
  };

  // Vérifier l'inactivité et déconnecter si nécessaire
  useEffect(() => {
    if (!token) return;

    const checkInactivity = () => {
      const now = Date.now();
      const inactiveTime = now - lastActivity;
      
      if (inactiveTime >= INACTIVITY_TIMEOUT) {
        logout();
      }
    };

    const interval = setInterval(checkInactivity, 60000); // Vérifier toutes les minutes

    return () => clearInterval(interval);
  }, [token, lastActivity]);

  // Écouter les événements d'activité utilisateur
  useEffect(() => {
    if (!token) return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      updateActivity();
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth doit être utilisé au sein d'un AuthProvider");
  return context;
}
