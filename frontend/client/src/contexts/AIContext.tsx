import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { API_ENDPOINTS } from "@/config";

interface AIStatus {
  model_loaded: boolean;
  model_version: string | null;
  model_path: string;
  is_trained: boolean;
  fallback_count: number;
  observation_version: string;
  features_count: number;
  total_decisions: number;
  ai_mode_enabled: boolean;
  rl_manual_mode: boolean;
  rl_manual_mode_learning_enabled: boolean;
}

interface AIContextType {
  status: AIStatus | null;
  aiModeEnabled: boolean;
  aiTrained: boolean;
  rlManualMode: boolean;
  rlManualLearningEnabled: boolean;
  isLoading: boolean;
  isBusy: boolean;
  fetchStatus: () => Promise<void>;
  toggleAiMode: (enabled?: boolean) => Promise<void>;
  toggleRlManualMode: (enabled?: boolean) => Promise<void>;
  toggleRlLearning: (enabled?: boolean) => Promise<void>;
  reloadModel: () => Promise<void>;
  testDecision: (ip: string) => Promise<any>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const fetchStatus = useCallback(async () => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      setStatus(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(API_ENDPOINTS.AI.STATUS, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else if (res.status === 401) {
        setStatus(null);
      }
    } catch (e) {
      console.error("AI status fetch failed:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyMode = useCallback(async (patch: Partial<AIStatus>) => {
    setIsBusy(true);
    try {
      const token = localStorage.getItem("jwt_token");
      const res = await fetch(API_ENDPOINTS.AI.MODE, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        return true;
      } else {
        console.error("AI mode update failed:", await res.json().catch(() => ({})));
        return false;
      }
    } catch (e) {
      console.error("AI mode update error:", e);
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const toggleAiMode = useCallback(async (enabled?: boolean) => {
    const target = enabled ?? !status?.ai_mode_enabled;
    await applyMode({ ai_mode_enabled: target });
  }, [status, applyMode]);

  const toggleRlManualMode = useCallback(async (enabled?: boolean) => {
    const target = enabled ?? !status?.rl_manual_mode;
    await applyMode({ rl_manual_mode: target });
  }, [status, applyMode]);

  const toggleRlLearning = useCallback(async (enabled?: boolean) => {
    const target = enabled ?? !status?.rl_manual_mode_learning_enabled;
    await applyMode({ rl_manual_mode_learning_enabled: target });
  }, [status, applyMode]);

  const reloadModel = useCallback(async () => {
    setIsBusy(true);
    try {
      const token = localStorage.getItem("jwt_token");
      const res = await fetch(API_ENDPOINTS.AI.RELOAD, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (e) {
      console.error("AI reload failed:", e);
    } finally {
      setIsBusy(false);
    }
  }, [fetchStatus]);

  const testDecision = useCallback(async (ip: string) => {
    try {
      const token = localStorage.getItem("jwt_token");
      const res = await fetch(API_ENDPOINTS.AI.DECIDE, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ip, context: {} }),
      });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (e) {
      console.error("AI test decision failed:", e);
      return null;
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Refetch when token changes (login/logout)
  useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem("jwt_token");
      if (token) {
        fetchStatus();
      } else {
        setStatus(null);
        setIsLoading(false);
      }
    };
    
    // Initial check
    checkToken();
    
    // Listen for storage changes (login/logout in another tab)
    window.addEventListener("storage", checkToken);
    return () => window.removeEventListener("storage", checkToken);
  }, [fetchStatus]);

  return (
    <AIContext.Provider
      value={{
        status,
        aiModeEnabled: status?.ai_mode_enabled ?? false,
        aiTrained: status?.is_trained ?? false,
        rlManualMode: status?.rl_manual_mode ?? false,
        rlManualLearningEnabled: status?.rl_manual_mode_learning_enabled ?? false,
        isLoading,
        isBusy,
        fetchStatus,
        toggleAiMode,
        toggleRlManualMode,
        toggleRlLearning,
        reloadModel,
        testDecision,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) throw new Error("useAI doit être utilisé au sein d'un AIProvider");
  return context;
}