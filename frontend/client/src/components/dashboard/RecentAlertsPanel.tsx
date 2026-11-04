import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Panel } from "./Panel";
import { SeverityBadge } from "../logs/SeverityBadge";
import { LogDetailGrid } from "../logs/LogDetailGrid";
import type { Alert } from "../types";

interface RecentAlertsPanelProps {
  alerts: Alert[];
  /** Ouvre la vue de logs complète. */
  onSeeAll: () => void;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp || "—";
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Table compacte « Alertes récentes » de la vue d'ensemble.
 * Données réelles, recherche locale et détail dépliable accessible.
 */
export function RecentAlertsPanel({
  alerts,
  onSeeAll,
}: RecentAlertsPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleAlerts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return alerts
      .filter((alert) => {
        if (!needle) return true;
        return `${alert.id} ${alert.source_ip} ${alert.destination_ip} ${alert.alert_type} ${alert.description}`
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, 8);
  }, [alerts, query]);

  return (
    <Panel className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[18px] py-4">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="h-4 w-4 text-foreground"
              aria-hidden="true"
            />
            <h3 className="text-[13px] font-semibold text-foreground">
              Alertes récentes
            </h3>
          </div>
          <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
            Événements nécessitant votre attention
          </p>
        </div>

        <label className="flex h-[34px] w-full items-center gap-2 rounded-md border border-border px-2.5 sm:w-[170px]">
          <span className="sr-only">Rechercher dans les alertes</span>
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher"
            className="w-full bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="bg-muted px-3 py-2.5 text-left text-[9px] uppercase tracking-wider">
                Heure
              </th>
              <th className="bg-muted px-3 py-2.5 text-left text-[9px] uppercase tracking-wider">
                Sévérité
              </th>
              <th className="bg-muted px-3 py-2.5 text-left text-[9px] uppercase tracking-wider">
                Source
              </th>
              <th className="bg-muted px-3 py-2.5 text-left text-[9px] uppercase tracking-wider">
                Signature
              </th>
              <th className="bg-muted px-3 py-2.5 text-left text-[9px] uppercase tracking-wider">
                Cible
              </th>
              <th className="w-10 bg-muted px-3 py-2.5">
                <span className="sr-only">Détails</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleAlerts.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-[11px] text-muted-foreground"
                >
                  Aucune alerte ne correspond à cette recherche.
                </td>
              </tr>
            ) : (
              visibleAlerts.map((alert) => {
                const id = String(alert.id);
                const open = expandedId === id;
                return (
                  <Fragment key={alert.id}>
                    <tr className="border-b border-muted">
                      <td className="px-3 py-2.5 font-data-mono">
                        {formatTime(alert.timestamp)}
                      </td>
                      <td className="px-3 py-2.5">
                        <SeverityBadge severity={alert.severity} />
                      </td>
                      <td className="px-3 py-2.5 font-data-mono">
                        {alert.source_ip}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2.5">
                        {alert.alert_type}
                      </td>
                      <td className="px-3 py-2.5 font-data-mono">
                        {alert.destination_ip}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : id)}
                          aria-expanded={open}
                          aria-controls={`recent-alert-detail-${id}`}
                          aria-label={`Détails de l'alerte ${id}`}
                          className="grid h-6 w-6 place-items-center rounded-sm text-foreground hover:underline"
                        >
                          {open ? (
                            <ChevronDown
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronRight
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr
                        id={`recent-alert-detail-${id}`}
                        className="border-b border-muted bg-muted/40"
                      >
                        <td colSpan={6} className="px-3 py-3">
                          <LogDetailGrid
                            items={[
                              { label: "ID", value: `#${alert.id}` },
                              {
                                label: "Horodatage",
                                value: new Date(alert.timestamp).toLocaleString(
                                  "fr-FR",
                                ),
                              },
                              {
                                label: "Type d'alerte",
                                value: alert.alert_type,
                              },
                              {
                                label: "Description",
                                value: alert.description,
                              },
                              {
                                label: "Source",
                                value: `${alert.source_ip}${alert.source_port ? `:${alert.source_port}` : ""}`,
                              },
                              {
                                label: "Destination",
                                value: `${alert.destination_ip}${alert.destination_port ? `:${alert.destination_port}` : ""}`,
                              },
                              { label: "Protocole", value: alert.protocol },
                              {
                                label: "Occurrences",
                                value: alert.event_count,
                              },
                              {
                                label: "Bloqué",
                                value: alert.is_blocked ? "Oui" : "Non",
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 px-[18px] py-3">
        <span className="text-[11px] text-muted-foreground">
          {visibleAlerts.length} alerte{visibleAlerts.length > 1 ? "s" : ""}{" "}
          affichée{visibleAlerts.length > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={onSeeAll}
          className="text-[11px] font-semibold text-foreground hover:underline"
        >
          Toutes les alertes <span aria-hidden="true">→</span>
        </button>
      </div>
    </Panel>
  );
}
