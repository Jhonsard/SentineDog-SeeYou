import * as React from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Widget, type WidgetMenuItem } from "./Widget";
import { Sparkline } from "./Sparkline";
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
  accent?: KpiAccent;
  delta?: KpiDelta;
  /** 24h trend series for the embedded sparkline. */
  spark: number[];
  footnote?: string;
  menuItems?: WidgetMenuItem[];
}

const accentBorder: Record<KpiAccent, string> = {
  info: "border-l-2 border-l-info",
  critical: "border-l-2 border-l-critical",
  warning: "border-l-2 border-l-warning",
  secure: "border-l-2 border-l-secure",
};

const accentText: Record<KpiAccent, string> = {
  info: "text-info",
  critical: "text-critical-soft",
  warning: "text-warning-soft",
  secure: "text-secure-soft",
};

const toneClass: Record<KpiDelta["tone"], string> = {
  good: "text-secure-soft bg-secure/10 border-secure/25",
  bad: "text-critical-soft bg-critical/10 border-critical/25",
  neutral: "text-[#c2c6d6] bg-surface-2 border-edge",
};

/**
 * CyberObserve DS performance metric card.
 * Standardized header + large mono headline + delta chip + 24h sparkline.
 */
export function KpiCard({
  label,
  value,
  unit,
  icon,
  accent = "info",
  delta,
  spark,
  footnote,
  menuItems,
}: KpiCardProps) {
  const DeltaIcon =
    delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;

  return (
    <Widget
      title={label}
      icon={icon}
      accent={accent}
      menuItems={menuItems}
      className={cn("min-h-[150px]", accentBorder[accent])}
      contentClassName="flex flex-col justify-between gap-3 p-4"
    >
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="font-data-sans-serif text-[30px] font-bold leading-none tracking-tight text-[#e1e2ec]">
            {value}
          </span>
          {unit && <span className="font-data-sans-serif text-xs text-[#8c909f]">{unit}</span>}
        </div>
        {delta && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-data-sans-serif text-[10px] font-medium",
              toneClass[delta.tone],
            )}
          >
            <DeltaIcon className="h-3 w-3" />
            {delta.text}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <Sparkline data={spark} color={`var(--${accent === "info" ? "info" : accent === "critical" ? "critical" : accent === "warning" ? "warning" : "secure"})`} width={150} height={34} className="w-full" />
      </div>

      {footnote && (
        <p className={cn("font-data-sans-serif text-[10px] leading-tight", accentText[accent])}>{footnote}</p>
      )}
    </Widget>
  );
}
