import * as React from "react";

export interface StatusRingProps {
  /** Percentage 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  /** Couleur de tracé ; par défaut la couleur de texte du thème. */
  color?: string;
  trackColor?: string;
  /** Optional center value override (e.g. show absolute count). */
  centerValue?: string;
  /** Style des extrémités de l'arc (maquette SeeYou : `square`). */
  strokeLinecap?: "butt" | "round" | "square";
}

/**
 * Anneau de statut SentineDog.
 * Donut SVG plat, sans dégradé ni halo. Le libellé et la valeur restent
 * lisibles indépendamment de la couleur. Aucune animation.
 */
export function StatusRing({
  value,
  size = 132,
  stroke = 10,
  label,
  sublabel,
  color = "var(--foreground)",
  trackColor = "var(--muted)",
  centerValue,
  strokeLinecap = "round",
}: StatusRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const dash = (clamped / 100) * c;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ?? "statut"} ${clamped}%`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap={strokeLinecap}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-data-mono text-[23px] font-semibold leading-none text-foreground">
          {centerValue ?? `${Math.round(clamped)}%`}
        </span>
        {label && (
          <span className="mt-1 font-ui text-[10px] text-muted-foreground">
            {label}
          </span>
        )}
        {sublabel && (
          <span className="font-data-mono text-[9px] text-muted-foreground">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
