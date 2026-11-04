import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock,
  Download,
  Eye,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { Panel } from "@/components/dashboard/Panel";
import type { Alert } from "@/components/types";
import {
  normalizeSeverity,
  severityLabel,
  type SeverityLevel,
} from "@/lib/logs";

type AlertStatus = "À traiter" | "Validée" | "Bloquée";
type SeverityFilter = "all" | SeverityLevel | "unknown";
type StatusFilter = "all" | AlertStatus;

const PAGE_SIZE = 8;

function statusOf(alert: Alert): AlertStatus {
  if (alert.is_blocked) return "Bloquée";
  if (alert.validated_by_admin) return "Validée";
  return "À traiter";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR");
}

function SeverityBadge({ level }: { level: SeverityLevel | null }) {
  const Icon =
    level === "critique"
      ? ShieldX
      : level === "warning"
        ? AlertTriangle
        : level === "normal"
          ? ShieldCheck
          : CircleHelp;

  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {severityLabel(level)}
    </span>
  );
}

function StatusBadge({ status }: { status: AlertStatus }) {
  const Icon =
    status === "Bloquée" ? ShieldX : status === "Validée" ? ShieldCheck : Clock;

  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {status}
    </span>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <Panel className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-data-mono text-2xl font-semibold leading-none text-foreground">
          {value}
        </p>
        <p className="mt-1 truncate text-[10px] text-muted-foreground">
          {note}
        </p>
      </div>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-muted text-foreground">
        {icon}
      </span>
    </Panel>
  );
}

function StatusFilterButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className="ml-1 font-data-mono">{count}</span>
    </button>
  );
}

interface AlertsProps {
  alerts: Alert[];
  onValidateBlock: (alertId: number, sourceIp: string) => void;
}

export default function Alerts({ alerts, onValidateBlock }: AlertsProps) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setPage(1);
  }, [query, severity, status]);

  useEffect(() => {
    function closeDetail(event: KeyboardEvent) {
      if (event.key === "Escape") setExpandedId(null);
    }
    window.addEventListener("keydown", closeDetail);
    return () => window.removeEventListener("keydown", closeDetail);
  }, []);

  const enriched = useMemo(
    () =>
      alerts.map((alert) => ({
        alert,
        level: normalizeSeverity(alert.severity),
        status: statusOf(alert),
      })),
    [alerts],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return enriched.filter(({ alert, level, status: alertStatus }) => {
      const haystack =
        `${alert.id} ${alert.source_ip} ${alert.destination_ip} ${alert.alert_type} ${alert.description} ${alert.protocol}`.toLowerCase();
      const matchesQuery = needle === "" || haystack.includes(needle);
      const matchesSeverity =
        severity === "all" ||
        (severity === "unknown" ? level === null : level === severity);
      const matchesStatus = status === "all" || alertStatus === status;
      return matchesQuery && matchesSeverity && matchesStatus;
    });
  }, [enriched, query, severity, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  const total = enriched.length;
  const criticalCount = enriched.filter(
    (item) => item.level === "critique",
  ).length;
  const blockedCount = enriched.filter(
    (item) => item.status === "Bloquée",
  ).length;
  const validatedCount = enriched.filter(
    (item) => item.status === "Validée",
  ).length;
  const pendingCount = enriched.filter(
    (item) => item.status === "À traiter",
  ).length;
  const filtersActive =
    query.trim() !== "" || severity !== "all" || status !== "all";

  const resetFilters = () => {
    setQuery("");
    setSeverity("all");
    setStatus("all");
  };

  const exportCsv = () => {
    const header = [
      "ID",
      "Horodatage",
      "Sévérité",
      "Statut",
      "Type",
      "Source",
      "Destination",
      "Protocole",
      "Description",
      "Occurrences",
      "Bloquée",
      "Validée",
    ];
    const rows = filtered.map(({ alert, level, status: alertStatus }) => [
      alert.id,
      formatDate(alert.timestamp),
      severityLabel(level),
      alertStatus,
      alert.alert_type ?? "",
      alert.source_ip ?? "",
      alert.destination_ip ?? "",
      alert.protocol ?? "",
      alert.description ?? "",
      alert.event_count ?? "",
      alert.is_blocked ? "Oui" : "Non",
      alert.validated_by_admin ? "Oui" : "Non",
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(";"),
      )
      .join("\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alertes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:px-[30px] lg:py-[28px]">
      {/* En-tête de page */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Centre de détection
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Alertes de sécurité
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Analysez, qualifiez et traitez les événements détectés par Snort.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 self-start rounded-[4px] border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:self-auto"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter CSV
        </button>
      </div>

      {/* Cartes de synthèse */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={<Bell className="h-4 w-4" aria-hidden="true" />}
          label="Alertes totales"
          value={total}
          note="Historique + flux temps réel"
        />
        <SummaryCard
          icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
          label="Critiques"
          value={criticalCount}
          note="Sévérité normalisée"
        />
        <SummaryCard
          icon={<ShieldX className="h-4 w-4" aria-hidden="true" />}
          label="Bloquées"
          value={blockedCount}
          note="Règle pare-feu active"
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          label="À traiter"
          value={pendingCount}
          note="En attente de décision"
        />
      </div>

      {/* Filtres */}
      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 rounded-sm border border-input bg-background px-3 py-1.5 lg:max-w-md lg:flex-1">
          <Search
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher par ID, IP, type, description..."
            aria-label="Rechercher une alerte"
            className="w-full border-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            Sévérité
            <select
              value={severity}
              onChange={(event) =>
                setSeverity(event.target.value as SeverityFilter)
              }
              className="rounded-sm border border-input bg-background px-2 py-1 text-[11px] text-foreground"
            >
              <option value="all">Toutes</option>
              <option value="critique">Critique</option>
              <option value="warning">Info / Warning</option>
              <option value="normal">Normal</option>
              <option value="unknown">Non classé</option>
            </select>
          </label>

          <div
            role="group"
            aria-label="Filtrer par statut"
            className="flex flex-wrap items-center gap-0.5 rounded-sm border border-border bg-background p-0.5"
          >
            <StatusFilterButton
              active={status === "all"}
              label="Toutes"
              count={total}
              onClick={() => setStatus("all")}
            />
            <StatusFilterButton
              active={status === "À traiter"}
              label="À traiter"
              count={pendingCount}
              onClick={() => setStatus("À traiter")}
            />
            <StatusFilterButton
              active={status === "Validée"}
              label="Validée"
              count={validatedCount}
              onClick={() => setStatus("Validée")}
            />
            <StatusFilterButton
              active={status === "Bloquée"}
              label="Bloquée"
              count={blockedCount}
              onClick={() => setStatus("Bloquée")}
            />
          </div>

          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-sm px-2 py-1 text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[900px] border-collapse text-[11px]"
            aria-label="Alertes de sécurité"
          >
            <thead>
              <tr className="border-b border-border bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Horodatage</th>
                <th className="px-3 py-2 text-left">Sévérité</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Source → Destination</th>
                <th className="px-3 py-2 text-left">Protocole</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {visible.length === 0 ? (
                <tr className="border-border">
                  <td
                    colSpan={9}
                    className="h-24 text-center font-data-mono text-xs italic text-muted-foreground"
                  >
                    Aucune alerte ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                visible.map(({ alert, level, status: alertStatus }) => {
                  const expanded = expandedId === alert.id;
                  return (
                    <Fragment key={alert.id}>
                      <tr className="transition-colors hover:bg-muted/50">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(expanded ? null : alert.id)
                            }
                            aria-expanded={expanded}
                            aria-controls={`alert-detail-${alert.id}`}
                            aria-label={`${expanded ? "Replier" : "Déplier"} l'alerte ${alert.id}`}
                            className="grid h-6 w-6 place-items-center rounded-sm border border-border text-foreground transition-colors hover:bg-muted"
                          >
                            {expanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-data-mono text-foreground">
                          #{alert.id}
                        </td>
                        <td className="px-3 py-2 text-secondary-foreground">
                          {formatDate(alert.timestamp)}
                        </td>
                        <td className="px-3 py-2">
                          <SeverityBadge level={level} />
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {alert.alert_type || "—"}
                        </td>
                        <td className="px-3 py-2 font-data-mono text-secondary-foreground">
                          {alert.source_ip} → {alert.destination_ip}
                        </td>
                        <td className="px-3 py-2 text-secondary-foreground">
                          {alert.protocol || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={alertStatus} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(expanded ? null : alert.id)
                              }
                              aria-expanded={expanded}
                              aria-controls={`alert-detail-${alert.id}`}
                              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] font-bold uppercase text-foreground transition-colors hover:bg-muted"
                            >
                              <Eye className="h-3 w-3" aria-hidden="true" />
                              {expanded ? "Fermer" : "Analyser"}
                            </button>
                            {alert.is_blocked ? (
                              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                                Hôte bloqué
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  onValidateBlock(alert.id, alert.source_ip)
                                }
                                aria-label={`Bloquer l'hôte ${alert.source_ip}`}
                                className="rounded-sm border border-border px-2 py-1 text-[10px] font-bold uppercase text-foreground transition-colors hover:bg-muted"
                              >
                                Bloquer
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                        <tr
                          id={`alert-detail-${alert.id}`}
                          className="bg-muted/30"
                        >
                          <td colSpan={9} className="px-4 py-3">
                            <div className="mb-3">
                              <h3 className="text-xs font-semibold text-foreground">
                                Analyse de l'alerte #{alert.id}
                              </h3>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {alert.alert_type || "Type inconnu"} ·{" "}
                                {alert.protocol || "protocole inconnu"} ·{" "}
                                {severityLabel(level)} ·{" "}
                                {alert.event_count ?? 0} occurrence(s)
                              </p>
                            </div>
                            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Source
                                </dt>
                                <dd className="mt-0.5 font-data-mono text-xs text-foreground">
                                  {alert.source_ip || "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Destination
                                </dt>
                                <dd className="mt-0.5 font-data-mono text-xs text-foreground">
                                  {alert.destination_ip || "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Ports
                                </dt>
                                <dd className="mt-0.5 font-data-mono text-xs text-foreground">
                                  {alert.source_port ?? "—"} →{" "}
                                  {alert.destination_port ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Protocole
                                </dt>
                                <dd className="mt-0.5 text-xs text-foreground">
                                  {alert.protocol || "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Occurrences
                                </dt>
                                <dd className="mt-0.5 font-data-mono text-xs text-foreground">
                                  {alert.event_count ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Bloquée
                                </dt>
                                <dd className="mt-0.5 text-xs text-foreground">
                                  {alert.is_blocked ? "Oui" : "Non"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Validation admin
                                </dt>
                                <dd className="mt-0.5 text-xs text-foreground">
                                  {alert.validated_by_admin ? "Oui" : "Non"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Type
                                </dt>
                                <dd className="mt-0.5 text-xs text-foreground">
                                  {alert.alert_type || "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Blocage manuel
                                </dt>
                                <dd className="mt-0.5 text-xs text-foreground">
                                  {alert.is_manual_block ? "Oui" : "Non"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  PPS
                                </dt>
                                <dd className="mt-0.5 font-data-mono text-xs text-foreground">
                                  {alert.pps ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Sévérité brute
                                </dt>
                                <dd className="mt-0.5 font-data-mono text-xs text-foreground">
                                  {alert.severity || "—"}
                                </dd>
                              </div>
                              <div className="sm:col-span-2 lg:col-span-4">
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Description
                                </dt>
                                <dd className="mt-0.5 text-xs text-foreground">
                                  {alert.description || "—"}
                                </dd>
                              </div>
                            </dl>
                            {!alert.is_blocked && (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onValidateBlock(alert.id, alert.source_ip)
                                  }
                                  className="rounded-sm border border-border px-2 py-1 text-[10px] font-bold uppercase text-foreground transition-colors hover:bg-muted"
                                >
                                  Bloquer l'hôte {alert.source_ip}
                                </button>
                              </div>
                            )}
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

        <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            {filtered.length === 0
              ? "Aucune alerte"
              : `Affichage de ${start + 1} à ${Math.min(
                  start + PAGE_SIZE,
                  filtered.length,
                )} sur ${filtered.length} alerte(s)`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              className="rounded-sm border border-border px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              Précédent
            </button>
            <span className="font-data-mono text-[11px] text-muted-foreground">
              Page {currentPage} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={currentPage === pageCount}
              className="rounded-sm border border-border px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
