import * as React from "react";
import { useId } from "react";

export interface SparklineProps {
  data: number[];
  /** Stroke token color, e.g. "#4d8eff" or "var(--info)". */
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Render the soft area fill beneath the line. */
  fill?: boolean;
  /** Render a pulsing marker on the most recent point. */
  showDot?: boolean;
  className?: string;
}

/**
 * CyberObserve DS sparkline.
 * Pure, self-contained SVG — no inline style strings, no external deps.
 * Builds a smoothed polyline + optional gradient area + live edge dot.
 */
export function Sparkline({
  data,
  color = "#4d8eff",
  width = 120,
  height = 36,
  strokeWidth = 1.5,
  fill = true,
  showDot = true,
  className,
}: SparklineProps) {
  const gradId = useId();

  if (!data || data.length < 2) {
    return <svg className={className} width={width} height={height} aria-hidden="true" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = strokeWidth + 1;
  const innerH = height - pad * 2;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = pad + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  // Smooth Catmull-Rom -> cubic bézier path for a polished telemetry curve.
  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
    const [x0, y0] = points[i - 1];
    const [x1, y1] = p;
    const cx = (x0 + x1) / 2;
    return `${acc} C ${cx.toFixed(2)} ${y0.toFixed(2)}, ${cx.toFixed(2)} ${y1.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }, "");

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="trend sparkline"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {fill && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}

      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {showDot && (
        <>
          <circle cx={lastX} cy={lastY} r={3.2} fill={color} opacity={0.25}>
            <animate attributeName="r" values="2.4;5;2.4" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.35;0;0.35" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx={lastX} cy={lastY} r={1.8} fill={color} />
        </>
      )}
    </svg>
  );
}
