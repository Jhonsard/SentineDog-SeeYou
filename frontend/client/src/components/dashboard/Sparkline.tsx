import * as React from "react";

export interface SparklineProps {
  data: number[];
  /** Couleur de tracé ; par défaut la couleur de texte du thème. */
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Remplit l'aire sous la courbe avec la même couleur, en faible opacité. */
  fill?: boolean;
  /** Affiche un marqueur statique sur le point le plus récent. */
  showDot?: boolean;
  className?: string;
}

/**
 * Sparkline SentineDog.
 * SVG pur, sans dépendance : polyligne lissée, aire plate en faible opacité,
 * marqueur statique. Aucune couleur hors charte, aucune animation.
 */
export function Sparkline({
  data,
  color = "var(--foreground)",
  width = 120,
  height = 36,
  strokeWidth = 1.5,
  fill = true,
  showDot = true,
  className,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <svg
        className={className}
        width={width}
        height={height}
        aria-hidden="true"
      />
    );
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

  // Courbe lissée Catmull-Rom -> bézier cubique.
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
      aria-label="Tendance"
    >
      {fill && (
        <path d={areaPath} fill={color} fillOpacity={0.12} stroke="none" />
      )}

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
          <circle cx={lastX} cy={lastY} r={3.2} fill={color} opacity={0.25} />
          <circle cx={lastX} cy={lastY} r={1.8} fill={color} />
        </>
      )}
    </svg>
  );
}
