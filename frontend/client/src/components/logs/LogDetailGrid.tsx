import * as React from "react";

export interface LogDetailItem {
  label: string;
  value: React.ReactNode;
}

interface LogDetailGridProps {
  items: LogDetailItem[];
}

/**
 * Panneau de détail d'une ligne de log : toutes les informations déjà
 * chargées, sans nouvelle requête.
 */
export function LogDetailGrid({ items }: LogDetailGridProps) {
  const visible = items.filter(
    (item) =>
      item.value !== undefined && item.value !== null && item.value !== "",
  );

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 font-data-mono text-[11px] sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5">
          <dt className="text-[10px] uppercase tracking-wider opacity-70">
            {item.label}
          </dt>
          <dd className="break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
