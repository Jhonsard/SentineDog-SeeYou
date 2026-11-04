import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Panel } from "./Panel";
import { cn } from "@/lib/utils";

export type KpiAccent = "info" | "critical" | "warning" | "secure";

export interface KpiDelta {
  text: string;
  direction: "up" | "down" | "flat";
  tone: "good" | "bad" | "neutral";
}

export interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  /** Conservé pour compatibilité : la maquette est monochrome. */
  accent?: KpiAccent;
  delta?: KpiDelta;
  /** Conservé pour compatibilité ; la maquette n'affiche pas de sparkline. */
  spark?: number[];
  footnote?: string;
  menuItems?: { label: string; onSelect?: () => void }[];
}

/**
 * Carte KPI SeeYou : icône encadrée, libellé, valeur mono, pied avec détail.
 * Aucune couleur d'accent : la hiérarchie repose sur la typographie et la bordure.
 */
export function KpiCard({
  label,
  value,
  unit,
  icon,
  delta,
  footnote,
}: KpiCardProps) {
  const DeltaIcon =
    delta?.direction === "up"
      ? ArrowUpRight
      : delta?.direction === "down"
        ? ArrowDownRight
        : Minus;

  return (
    <Panel className="p-[17px]">
      <div className="flex items-center gap-2.5 text-[11px] font-semibold text-foreground">
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md border border-border bg-muted">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>

      <div className="my-5 flex items-baseline gap-1 font-data-mono text-[29px] font-semibold leading-none tracking-tight text-foreground">
        <span className="truncate">{value}</span>
        {unit && (
          <span className="text-xs font-medium text-muted-foreground">
            {unit}
          </span>
        )}
      </div>

      {(delta || footnote) && (
        <div className="flex items-center justify-between gap-2 border-t border-muted pt-[11px]">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-semibold",
                delta.tone === "neutral"
                  ? "text-muted-foreground"
                  : "text-foreground",
              )}
            >
              <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {delta.text}
            </span>
          ) : (
            <span />
          )}
          {footnote && (
            <span className="truncate text-[11px] text-muted-foreground">
              {footnote}
            </span>
          )}
        </div>
      )}
    </Panel>
  );
}
