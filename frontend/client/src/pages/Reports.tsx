import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CircleHelp,
  Download,
  FileText,
  Globe,
  Printer,
  Search,
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

type Frequency = "Hebdomadaire" | "Mensuel";

interface Period {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  label: string;
}

interface Anomaly {
  name: string;
  category: string;
  occurrences: number;
  previous: number;
  severity: SeverityLevel | null;
  source: string;
  lastSeen: string;
}

interface SourceCount {
  source: string;
  count: number;
}

interface ReportSummary {
  totalOccurrences: number;
  previousOccurrences: number;
  signatures: number;
  sources: number;
  treatmentRate: number | null;
  pending: number;
}

interface ReportSections {
  summary: boolean;
  anomalies: boolean;
  sources: boolean;
  recommendations: boolean;
}

interface GeneratedReport {
  id: string;
  name: string;
  period: string;
  createdAt: string;
  sections: ReportSections;
  anomalies: Anomaly[];
  sources: SourceCount[];
  summary: ReportSummary;
  recommendations: string[];
  csv: string;
  sizeBytes: number;
}

interface ReportData {
  anomalies: Anomaly[];
  sources: SourceCount[];
  summary: ReportSummary;
}

const EMPTY_DATA: ReportData = {
  anomalies: [],
  sources: [],
  summary: {
    totalOccurrences: 0,
    previousOccurrences: 0,
    signatures: 0,
    sources: 0,
    treatmentRate: null,
    pending: 0,
  },
};

const numberFormat = new Intl.NumberFormat("fr-FR");

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  return `${(bytes / 1024).toFixed(1).replace(".", ",")} Ko`;
}

function buildPeriod(
  frequency: Frequency,
  referenceDate: string,
): Period | null {
  const date = new Date(`${referenceDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  if (frequency === "Mensuel") {
    const year = date.getFullYear();
    const month = date.getMonth();
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const previousStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const previousEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const monthLabel = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(date);
    return {
      start,
      end,
      previousStart,
      previousEnd,
      label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    };
  }

  const day = date.getDay() || 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const previousStart = new Date(start);
  previousStart.setDate(start.getDate() - 7);
  const previousEnd = new Date(end);
  previousEnd.setDate(end.getDate() - 7);
  const shortDate = (value: Date) =>
    new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
    }).format(value);
  return {
    start,
    end,
    previousStart,
    previousEnd,
    label: `Semaine du ${shortDate(start)} au ${shortDate(end)} ${end.getFullYear()}`,
  };
}

function inPeriod(value: string, start: Date, end: Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
}

function topKey(counts: Map<string, number>) {
  let best: string | null = null;
  let bestCount = -1;
  counts.forEach((count, key) => {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  });
  return best;
}

function highestSeverity(levels: SeverityLevel[]): SeverityLevel | null {
  const rank: Record<SeverityLevel, number> = {
    critique: 3,
    warning: 2,
    normal: 1,
  };
  let best: SeverityLevel | null = null;
  for (const level of levels) {
    if (best === null || rank[level] > rank[best]) {
      best = level;
    }
  }
  return best;
}

function groupAnomalies(alerts: Alert[]) {
  const groups = new Map<
    string,
    {
      occurrences: number;
      protocols: Map<string, number>;
      severities: SeverityLevel[];
      sources: Map<string, number>;
      lastSeen: string;
    }
  >();

  for (const alert of alerts) {
    const name = alert.alert_type || "Type inconnu";
    const group = groups.get(name) ?? {
      occurrences: 0,
      protocols: new Map<string, number>(),
      severities: [],
      sources: new Map<string, number>(),
      lastSeen: "",
    };
    group.occurrences += alert.event_count || 1;
    const protocol = alert.protocol || "—";
    group.protocols.set(protocol, (group.protocols.get(protocol) ?? 0) + 1);
    const level = normalizeSeverity(alert.severity);
    if (level) group.severities.push(level);
    group.sources.set(
      alert.source_ip,
      (group.sources.get(alert.source_ip) ?? 0) + 1,
    );
    if (
      alert.timestamp &&
      (!group.lastSeen ||
        new Date(alert.timestamp).getTime() >
          new Date(group.lastSeen).getTime())
    ) {
      group.lastSeen = alert.timestamp;
    }
    groups.set(name, group);
  }

  return Array.from(groups.entries()).map(([name, group]) => ({
    name,
    category: topKey(group.protocols) ?? "—",
    occurrences: group.occurrences,
    severity: highestSeverity(group.severities),
    source: topKey(group.sources) ?? "—",
    lastSeen: group.lastSeen,
  }));
}

function buildSourceCounts(alerts: Alert[]): SourceCount[] {
  const counts = new Map<string, number>();
  for (const alert of alerts) {
    const source = alert.source_ip || "—";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

function buildReportData(alerts: Alert[], period: Period | null): ReportData {
  if (!period) return EMPTY_DATA;

  const currentAlerts = alerts.filter((alert) =>
    inPeriod(alert.timestamp, period.start, period.end),
  );
  const previousAlerts = alerts.filter((alert) =>
    inPeriod(alert.timestamp, period.previousStart, period.previousEnd),
  );

  const currentGroups = groupAnomalies(currentAlerts);
  const previousGroups = groupAnomalies(previousAlerts);
  const previousByName = new Map(
    previousGroups.map((group) => [group.name, group.occurrences]),
  );

  const anomalies: Anomaly[] = currentGroups
    .map((group) => ({
      ...group,
      previous: previousByName.get(group.name) ?? 0,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  const sources = buildSourceCounts(currentAlerts);
  const totalOccurrences = currentGroups.reduce(
    (total, group) => total + group.occurrences,
    0,
  );
  const previousOccurrences = previousGroups.reduce(
    (total, group) => total + group.occurrences,
    0,
  );
  const processed = currentAlerts.filter(
    (alert) => alert.is_blocked || alert.validated_by_admin,
  ).length;

  return {
    anomalies,
    sources,
    summary: {
      totalOccurrences,
      previousOccurrences,
      signatures: currentGroups.length,
      sources: sources.length,
      treatmentRate: currentAlerts.length
        ? Math.round((processed / currentAlerts.length) * 100)
        : null,
      pending: currentAlerts.length - processed,
    },
  };
}

function buildRecommendations(data: ReportData) {
  const recommendations: string[] = [];
  const topAnomaly = data.anomalies[0];
  if (topAnomaly) {
    recommendations.push(
      `Surveiller en priorité « ${topAnomaly.name} » (${topAnomaly.occurrences} occurrence(s)).`,
    );
  }
  const topSource = data.sources[0];
  if (topSource) {
    recommendations.push(
      `Vérifier la source ${topSource.source} (${topSource.count} alerte(s)).`,
    );
  }
  if (data.summary.pending > 0) {
    recommendations.push(
      `Traiter les ${data.summary.pending} alerte(s) encore non qualifiée(s).`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Aucune anomalie sur la période : maintenir la surveillance.",
    );
  }
  return recommendations;
}

function buildCsv(
  periodLabel: string,
  frequency: Frequency,
  sections: ReportSections,
  data: ReportData,
  recommendations: string[],
) {
  const lines: string[][] = [
    ["Rapport SeeYou · Bilan SOC"],
    ["Période", periodLabel],
    ["Fréquence", frequency],
    [],
  ];

  if (sections.summary) {
    lines.push(["Résumé"]);
    lines.push([
      "Anomalies récurrentes",
      String(data.summary.totalOccurrences),
    ]);
    lines.push(["Signatures distinctes", String(data.summary.signatures)]);
    lines.push(["Sources concernées", String(data.summary.sources)]);
    lines.push([
      "Taux de traitement",
      data.summary.treatmentRate === null
        ? "—"
        : `${data.summary.treatmentRate} %`,
    ]);
    lines.push([]);
  }

  if (sections.anomalies) {
    lines.push(["Anomalies"]);
    lines.push([
      "Type",
      "Catégorie",
      "Occurrences",
      "Période précédente",
      "Sévérité",
      "Source",
      "Dernière observation",
    ]);
    data.anomalies.forEach((anomaly) => {
      lines.push([
        anomaly.name,
        anomaly.category,
        String(anomaly.occurrences),
        String(anomaly.previous),
        severityLabel(anomaly.severity),
        anomaly.source,
        formatDate(anomaly.lastSeen),
      ]);
    });
    lines.push([]);
  }

  if (sections.sources) {
    lines.push(["Sources"]);
    lines.push(["Adresse source", "Alertes"]);
    data.sources.forEach((source) => {
      lines.push([source.source, String(source.count)]);
    });
    lines.push([]);
  }

  if (sections.recommendations) {
    lines.push(["Recommandations"]);
    recommendations.forEach((recommendation) => {
      lines.push([recommendation]);
    });
  }

  return lines
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(";"),
    )
    .join("\n");
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

function SummaryCard({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <Panel className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 truncate font-data-mono text-2xl font-semibold leading-none text-foreground">
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

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface ReportsProps {
  alerts: Alert[];
  onBackToLogs: () => void;
}

export default function Reports({ alerts, onBackToLogs }: ReportsProps) {
  const [frequency, setFrequency] = useState<Frequency>("Hebdomadaire");
  const [referenceDate, setReferenceDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [sections, setSections] = useState<ReportSections>({
    summary: true,
    anomalies: true,
    sources: true,
    recommendations: true,
  });
  const [reports, setReports] = useState<GeneratedReport[]>(() => {
    try {
      const raw = sessionStorage.getItem("seeyou-reports");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [reportQuery, setReportQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem("seeyou-reports", JSON.stringify(reports));
    } catch {
      // Stockage indisponible : la liste reste en mémoire de composant.
    }
  }, [reports]);

  const period = useMemo(
    () => buildPeriod(frequency, referenceDate),
    [frequency, referenceDate],
  );
  const data = useMemo(() => buildReportData(alerts, period), [alerts, period]);
  const recommendations = useMemo(() => buildRecommendations(data), [data]);

  const change =
    data.summary.previousOccurrences > 0
      ? Math.round(
          ((data.summary.totalOccurrences - data.summary.previousOccurrences) /
            data.summary.previousOccurrences) *
            100,
        )
      : null;

  const periodLabel = period?.label ?? "Période non définie";

  const makeReport = (id: string): GeneratedReport => {
    const csv = buildCsv(
      periodLabel,
      frequency,
      sections,
      data,
      recommendations,
    );
    return {
      id,
      name: `Bilan ${frequency.toLowerCase()} · ${periodLabel}`,
      period: periodLabel,
      createdAt: new Date().toLocaleString("fr-FR"),
      sections,
      anomalies: data.anomalies,
      sources: data.sources,
      summary: data.summary,
      recommendations,
      csv,
      sizeBytes: new Blob([csv], { type: "text/csv" }).size,
    };
  };

  const nextReportId = () =>
    `RPT-${new Date().getFullYear()}-${String(reports.length + 1).padStart(
      3,
      "0",
    )}`;

  const generateReport = () => {
    if (!period) return;
    const report = makeReport(nextReportId());
    setReports((current) => [report, ...current]);
    setFeedback(`Le rapport ${report.id} a été généré.`);
  };

  const exportPdf = async (report: GeneratedReport) => {
    try {
      const { generateReportPdf } = await import("@/lib/reportPdf");
      generateReportPdf(report);
    } catch (error) {
      console.error("Erreur lors de la génération du PDF:", error);
      setFeedback("Impossible de générer le PDF. Réessayez.");
    }
  };

  const filteredReports = reports.filter((report) =>
    `${report.id} ${report.name} ${report.period}`
      .toLowerCase()
      .includes(reportQuery.toLowerCase()),
  );

  const toggleSection = (section: keyof ReportSections) => {
    setSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:px-[30px] lg:py-[28px]">
      {/* En-tête de page */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBackToLogs}
            className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Journaux
          </button>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Rapports & conformité
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Journaux et bilans
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Analysez la récurrence des anomalies et produisez vos bilans
            périodiques.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                buildCsv(
                  periodLabel,
                  frequency,
                  sections,
                  data,
                  recommendations,
                ),
                `bilan-${new Date().toISOString().slice(0, 10)}.csv`,
              )
            }
            disabled={!period}
            className="inline-flex items-center gap-2 rounded-[4px] border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter CSV
          </button>
          <button
            type="button"
            onClick={() => void exportPdf(makeReport("APERÇU"))}
            disabled={!period}
            className="inline-flex items-center gap-2 rounded-[4px] bg-foreground px-3 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Exporter PDF
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground"
        >
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{feedback}</span>
          <button
            type="button"
            aria-label="Masquer la confirmation"
            onClick={() => setFeedback(null)}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Masquer
          </button>
        </div>
      )}

      {/* Synthèse */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
          label="Anomalies récurrentes"
          value={numberFormat.format(data.summary.totalOccurrences)}
          note={
            change === null
              ? "Période précédente indisponible"
              : `${change >= 0 ? "+" : ""}${change} % vs période précédente`
          }
        />
        <SummaryCard
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          label="Signatures distinctes"
          value={data.summary.signatures}
          note="Types d'alerte distincts"
        />
        <SummaryCard
          icon={<Globe className="h-4 w-4" aria-hidden="true" />}
          label="Sources concernées"
          value={data.summary.sources}
          note="Adresses source distinctes"
        />
        <SummaryCard
          icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
          label="Taux de traitement"
          value={
            data.summary.treatmentRate === null
              ? "—"
              : `${data.summary.treatmentRate} %`
          }
          note="Alertes bloquées ou validées"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Constructeur */}
        <Panel className="flex flex-col p-4 xl:col-span-1">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <h3 className="text-[13px] font-semibold text-foreground">
              Générer un bilan
            </h3>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Configurez la période et le contenu du rapport.
          </p>

          <fieldset className="mt-4">
            <legend className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Fréquence
            </legend>
            <div className="mt-2 flex rounded-sm border border-border bg-background p-0.5">
              {(["Hebdomadaire", "Mensuel"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={frequency === option}
                  onClick={() => setFrequency(option)}
                  className={`flex-1 rounded-sm px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    frequency === option
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 flex flex-col gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Date de référence
            <input
              type="date"
              value={referenceDate}
              onChange={(event) => setReferenceDate(event.target.value)}
              className="rounded-sm border border-input bg-background px-2 py-1.5 font-data-mono text-[11px] font-normal tracking-normal text-foreground"
            />
          </label>

          <p className="mt-3 text-[11px] text-muted-foreground">
            Période analysée :{" "}
            <span className="font-semibold text-foreground">{periodLabel}</span>
          </p>

          <fieldset className="mt-4">
            <legend className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Sections
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ["summary", "Résumé"],
                  ["anomalies", "Anomalies"],
                  ["sources", "Sources"],
                  ["recommendations", "Recommandations"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-[11px] text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={sections[key]}
                    onChange={() => toggleSection(key)}
                    className="h-3.5 w-3.5 accent-foreground"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={generateReport}
            disabled={!period}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-[4px] bg-foreground px-3 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Générer le bilan
          </button>
        </Panel>

        {/* Anomalies */}
        <Panel className="overflow-hidden xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            <div>
              <h3 className="text-[13px] font-semibold text-foreground">
                Anomalies récurrentes
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Regroupement des alertes chargées par type
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[820px] border-collapse text-[11px]"
              aria-label="Anomalies récurrentes"
            >
              <thead>
                <tr className="border-b border-border bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Catégorie</th>
                  <th className="px-4 py-2 text-right">Occurrences</th>
                  <th className="px-4 py-2 text-right">Précédent</th>
                  <th className="px-4 py-2 text-right">Variation</th>
                  <th className="px-4 py-2 text-left">Sévérité</th>
                  <th className="px-4 py-2 text-left">Source</th>
                  <th className="px-4 py-2 text-left">Dernière obs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {data.anomalies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="h-24 text-center font-data-mono text-xs italic text-muted-foreground"
                    >
                      Aucune anomalie sur la période sélectionnée.
                    </td>
                  </tr>
                ) : (
                  data.anomalies.map((anomaly) => {
                    const variation =
                      anomaly.previous === 0
                        ? anomaly.occurrences > 0
                          ? "Nouveau"
                          : "—"
                        : `${anomaly.occurrences - anomaly.previous >= 0 ? "+" : ""}${Math.round(
                            ((anomaly.occurrences - anomaly.previous) /
                              anomaly.previous) *
                              100,
                          )} %`;
                    return (
                      <tr
                        key={anomaly.name}
                        className="transition-colors hover:bg-muted/50"
                      >
                        <td className="px-4 py-2 font-semibold text-foreground">
                          {anomaly.name}
                        </td>
                        <td className="px-4 py-2 text-secondary-foreground">
                          {anomaly.category}
                        </td>
                        <td className="px-4 py-2 text-right font-data-mono text-foreground">
                          {numberFormat.format(anomaly.occurrences)}
                        </td>
                        <td className="px-4 py-2 text-right font-data-mono text-muted-foreground">
                          {numberFormat.format(anomaly.previous)}
                        </td>
                        <td className="px-4 py-2 text-right font-data-mono text-foreground">
                          {variation}
                        </td>
                        <td className="px-4 py-2">
                          <SeverityBadge level={anomaly.severity} />
                        </td>
                        <td className="px-4 py-2 font-data-mono text-secondary-foreground">
                          {anomaly.source}
                        </td>
                        <td className="px-4 py-2 text-secondary-foreground">
                          {formatDate(anomaly.lastSeen)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Sources */}
        <Panel className="p-4 xl:col-span-1">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" aria-hidden="true" />
            <h3 className="text-[13px] font-semibold text-foreground">
              Sources concernées
            </h3>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Adresses source sur la période
          </p>
          <div className="mt-4 space-y-3">
            {data.sources.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground">—</p>
            ) : (
              data.sources.slice(0, 8).map((source) => {
                const max = data.sources[0]?.count || 1;
                return (
                  <div key={source.source} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between font-data-mono text-[11px]">
                      <span className="text-secondary-foreground">
                        {source.source}
                      </span>
                      <span className="font-bold text-foreground">
                        {numberFormat.format(source.count)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground"
                        style={{ width: `${(source.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        {/* Rapports générés */}
        <Panel className="overflow-hidden xl:col-span-2">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" aria-hidden="true" />
              <div>
                <h3 className="text-[13px] font-semibold text-foreground">
                  Bilans générés
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Historique de la session
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-sm border border-input bg-background px-2 py-1 sm:max-w-xs">
              <Search
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={reportQuery}
                onChange={(event) => setReportQuery(event.target.value)}
                placeholder="Rechercher un bilan..."
                aria-label="Rechercher un bilan"
                className="w-full border-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="divide-y divide-border/40">
            {filteredReports.length === 0 ? (
              <div className="px-4 py-10 text-center font-data-mono text-xs italic text-muted-foreground">
                Aucun bilan généré pour le moment.
              </div>
            ) : (
              filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-muted text-foreground">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {report.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {report.id} · {report.period} · {report.createdAt} ·{" "}
                        {formatBytes(report.sizeBytes)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        downloadCsv(report.csv, `${report.id}.csv`)
                      }
                      className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] font-bold uppercase text-foreground transition-colors hover:bg-muted"
                    >
                      <Download className="h-3 w-3" aria-hidden="true" />
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportPdf(report)}
                      className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] font-bold uppercase text-foreground transition-colors hover:bg-muted"
                    >
                      <Printer className="h-3 w-3" aria-hidden="true" />
                      PDF
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
