import { useEffect, useState } from "react";
import { LOGS_DISPLAY_KEY, type LogDisplayMode } from "@/lib/logs";

function readMode(): LogDisplayMode {
  try {
    return window.localStorage.getItem(LOGS_DISPLAY_KEY) === "severity"
      ? "severity"
      : "default";
  } catch {
    return "default";
  }
}

/**
 * Choix d'affichage des lignes de logs, partagé par toutes les vues.
 * Clé `logs-display`, valeurs `default` | `severity`, défaut `default`.
 */
export function useLogsDisplay() {
  const [mode, setMode] = useState<LogDisplayMode>(readMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOGS_DISPLAY_KEY, mode);
    } catch {
      // Stockage indisponible : l'affichage reste fonctionnel.
    }
  }, [mode]);

  return { mode, setMode };
}
