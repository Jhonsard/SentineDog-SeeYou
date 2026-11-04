export type LogDisplayMode = "default" | "severity";

export const LOGS_DISPLAY_KEY = "logs-display";

export type SeverityLevel = "critique" | "warning" | "normal";

/**
 * Mapping validé : les 4 sévérités backend (et les valeurs héritées du front)
 * sont ramenées aux 3 niveaux d'affichage de la SPEC.
 * Une valeur inconnue renvoie `null` : aucune teinte n'est inventée.
 */
export function normalizeSeverity(raw: unknown): SeverityLevel | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  switch (value) {
    case "critique":
    case "tres_critique":
    case "critical":
    case "high":
      return "critique";
    case "warning":
    case "moyen":
    case "medium":
      return "warning";
    case "normal":
    case "low":
    case "info":
      return "normal";
    default:
      return null;
  }
}

export function severityLabel(level: SeverityLevel | null): string {
  switch (level) {
    case "critique":
      return "Critique";
    case "warning":
      return "Info / Warning";
    case "normal":
      return "Normal";
    default:
      return "Non classé";
  }
}

/**
 * Coloration de toute la ligne en mode « severity ».
 * Seule tolérance de couleur de la charte (SPEC §5.3) ; le texte de la ligne
 * est adapté pour garder un contraste ≥ 4,5:1.
 */
export function severityRowClass(
  level: SeverityLevel | null,
  mode: LogDisplayMode,
): string {
  if (mode !== "severity" || level === null) return "";

  switch (level) {
    case "critique":
      return "bg-[#b02323]! text-[#FFFFFF]! hover:bg-[#b02323]! dark:bg-[#3B0D0D]! dark:text-[#E0E0E0]! dark:hover:bg-[#3B0D0D]!";
    case "warning":
      return "bg-[#fcd6cc]! text-[#222526]! hover:bg-[#fcd6cc]! dark:bg-[#ebc1ae]! dark:text-[#000000]! dark:hover:bg-[#ebc1ae]!";
    case "normal":
      return "bg-[#ccebd2]! text-[#222526]! hover:bg-[#ccebd2]! dark:bg-[#8fcc9b]! dark:text-[#000000]! dark:hover:bg-[#8fcc9b]!";
  }
}
