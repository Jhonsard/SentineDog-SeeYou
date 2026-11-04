import {
  AlertTriangle,
  CircleHelp,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  normalizeSeverity,
  severityLabel,
  type SeverityLevel,
} from "@/lib/logs";

const ICONS: Record<SeverityLevel, typeof ShieldAlert> = {
  critique: ShieldAlert,
  warning: AlertTriangle,
  normal: ShieldCheck,
};

interface SeverityBadgeProps {
  severity?: string | null;
}

/**
 * Sévérité en toutes lettres + icône, dans une colonne dédiée.
 * La couleur ne porte jamais l'information seule : le libellé et l'icône suffisent.
 */
export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const level = normalizeSeverity(severity);
  const Icon = level ? ICONS[level] : CircleHelp;

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      title={severity ?? undefined}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{severityLabel(level)}</span>
    </span>
  );
}
