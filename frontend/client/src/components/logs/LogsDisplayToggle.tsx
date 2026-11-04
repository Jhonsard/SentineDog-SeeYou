import { useId } from "react";
import type { LogDisplayMode } from "@/lib/logs";

interface LogsDisplayToggleProps {
  value: LogDisplayMode;
  onChange: (mode: LogDisplayMode) => void;
  className?: string;
}

const OPTIONS: { value: LogDisplayMode; label: string }[] = [
  { value: "default", label: "Par défaut" },
  { value: "severity", label: "Coloration par sévérité" },
];

/**
 * Sélecteur d'affichage identique au-dessus de chaque tableau de logs.
 * Boutons radio natifs : opérables au clavier et au lecteur d'écran.
 */
export function LogsDisplayToggle({
  value,
  onChange,
  className = "",
}: LogsDisplayToggleProps) {
  const name = useId();

  return (
    <fieldset className={`flex flex-wrap items-center gap-2 ${className}`}>
      <legend className="sr-only">Affichage des lignes de logs</legend>
      <span
        aria-hidden="true"
        className="text-[10px] font-bold uppercase tracking-wider opacity-70"
      >
        Affichage
      </span>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                selected ? "border-foreground bg-muted" : "border-border"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="h-4 w-4 accent-[var(--foreground)]"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
