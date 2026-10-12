import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 heure en millisecondes
const TOKEN_CHECK_INTERVAL = 30 * 1000; // Vérification de l'expiration toutes les 30 secondes

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Contrôle local de l'expiration d'un JWT (lecture du payload, sans vérifier la signature :
 * seule l'autorité de validation reste le backend).
 */
export function isTokenValid(token: string | null): boolean {
  if (!token) return false;

  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return false;

    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));

    // Sans champ `exp`, on laisse le backend trancher (il renverra 401 si besoin).
    if (typeof payload.exp !== "number") return true;

    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/** Récupère le jeton stocké en purgeant immédiatement tout jeton expiré ou illisible. */
function readStoredToken(): string | null {
  const stored = localStorage.getItem("jwt_token");
  if (!isTokenValid(stored)) {
    localStorage.removeItem("jwt_token");
    return null;
  }
  return stored;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
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

  // Purge des jetons expirés : au montage, puis périodiquement tant que l'onglet est ouvert.
  // Sans cela l'application se croit authentifiée avec un jeton mort et enchaîne les 401
  // (et les fermetures WebSocket 1008) jusqu'à la déconnexion par inactivité.
  useEffect(() => {
    if (!token) return;

    const checkExpiry = () => {
      if (!isTokenValid(token)) {
        toast.error("Session expirée. Veuillez vous reconnecter.");
        logout();
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, TOKEN_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [token]);

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
