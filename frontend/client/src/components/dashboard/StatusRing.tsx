import * as React from "react";
import { useId } from "react";

export interface StatusRingProps {
  /** Percentage 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  /** Stroke token color. */
  color?: string;
  trackColor?: string;
  /** Optional center value override (e.g. show absolute count). */
  centerValue?: string;
}

/**
 * CyberObserve DS glowing status ring.
 * SVG donut with gradient stroke + soft outer glow (feGaussianBlur),
 * animated dash on mount. Used for health / capacity telemetry.
 */
export function StatusRing({
  value,
  size = 132,
  stroke = 10,
  label,
  sublabel,
  color = "#22c55e",
  trackColor = "rgba(66,71,84,0.35)",
  centerValue,
}: StatusRingProps) {
  const gradId = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const dash = (clamped / 100) * c;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? "status"} ${clamped}%`}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.85} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
          <filter id={`${gradId}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

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
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter={`url(#${gradId}-glow)`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-data-mono text-2xl font-bold leading-none text-[#e1e2ec]">
          {centerValue ?? `${Math.round(clamped)}%`}
        </span>
        {label && (
          <span className="mt-1 font-ui text-[10px] font-semibold uppercase tracking-widest text-[#c2c6d6]">
            {label}
          </span>
        )}
        {sublabel && <span className="font-data-mono text-[9px] text-[#8c909f]">{sublabel}</span>}
      </div>
    </div>
  );
}
