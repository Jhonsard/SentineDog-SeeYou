import { Fragment, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShieldAlert,
  Globe,
  AlertTriangle,
  Search,
  Filter,
  Download,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "../config";
import { useLogsDisplay } from "@/hooks/useLogsDisplay";
import { useExpandableLogs } from "@/hooks/useExpandableLogs";
import { normalizeSeverity, severityLabel, severityRowClass } from "@/lib/logs";
import { cn } from "@/lib/utils";
import { LogsDisplayToggle } from "@/components/logs/LogsDisplayToggle";
import { SeverityBadge } from "@/components/logs/SeverityBadge";
import { LogDetailGrid } from "@/components/logs/LogDetailGrid";

interface Threat {
  id: string;
  threat_type: string;
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  first_seen: string;
  last_seen: string;
  description: string;
  indicators: string[];
}

export default function ThreatIntel() {
  const { token } = useAuth();
  const [threats, setThreats] = useState<Threat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadThreats = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.ALERTS.HISTORY + "?limit=100", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("bad status");
      const alerts: any[] = await res.json();
      if (Array.isArray(alerts) && alerts.length > 0) {
        const sevMap: Record<string, Threat["severity"]> = {
          tres_critique: "critical",
          critique: "critical",
          warning: "high",
          normal: "low",
        };
        const confMap: Record<string, number> = {
          critical: 95,
          high: 84,
          medium: 72,
          low: 60,
        };
        const mapped: Threat[] = alerts.map((a) => {
          const severity = sevMap[String(a.severity).toLowerCase()] ?? "medium";
          const day = (
            a.timestamp
              ? new Date(a.timestamp).toISOString()
              : new Date().toISOString()
          ).slice(0, 10);
          return {
            id: `THREAT-${a.id}`,
            threat_type: a.alert_type ?? "Unknown",
            source: a.source_ip ?? "SOC Sensor",
            severity,
            confidence: confMap[severity],
            first_seen: day,
            last_seen: day,
            description: a.description ?? "",
            indicators: [a.source_ip, a.destination_ip].filter(
              Boolean,
            ) as string[],
          };
        });
        setThreats(mapped);
      }
    } catch {
      toast.error("Backend Threat indisponible pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThreats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const filteredThreats = threats.filter((threat) => {
    const matchesSearch =
      threat.threat_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      threat.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity =
      severityFilter === "all" ||
      normalizeSeverity(threat.severity) === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const { mode, setMode } = useLogsDisplay();
  const { isOpen, toggle, close } = useExpandableLogs(
    filteredThreats.map((threat) => threat.id),
    !loading,
  );

  return (
    <div className="container mx-auto px-4 py-8 font-ui">
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-foreground" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Threat</h1>
            <p className="text-xs text-muted-foreground">
              Menaces cybernétiques mondiales
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {loading && (
            <span className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />{" "}
              Chargement…
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={loadThreats}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
            />{" "}
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Threats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {threats.length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Critical
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {threats.filter((t) => t.severity === "critical").length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              High Severity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {threats.filter((t) => t.severity === "high").length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Avg Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {threats.length
                ? Math.round(
                    threats.reduce((a, b) => a + b.confidence, 0) /
                      threats.length,
                  )
                : 0}
              %
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search threats..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-card border border-input rounded-md pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground"
              />
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-card border border-input rounded-md px-4 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            >
              <option value="all">Toutes les sévérités</option>
              <option value="critique">Critique</option>
              <option value="warning">Info / Warning</option>
              <option value="normal">Normal</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Threats Table */}
      <Card className="border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <LogsDisplayToggle value={mode} onChange={setMode} />
        </div>
        <CardContent className="p-0">
          <div className="overflow-y-auto max-h-[600px] custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="border-border sticky top-0 bg-muted z-10 hover:bg-muted">
                  <TableHead className="w-10">
                    <span className="sr-only">Détails</span>
                  </TableHead>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Type de menace</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Sévérité</TableHead>
                  <TableHead className="text-xs">Confiance</TableHead>
                  <TableHead className="text-xs">Dernière détection</TableHead>
                  <TableHead className="text-xs">Indicateurs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredThreats.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center font-mono text-xs italic opacity-80"
                    >
                      Aucune menace disponible pour le moment.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredThreats.map((threat) => {
                    const open = isOpen(threat.id);
                    const level = normalizeSeverity(threat.severity);

                    return (
                      <Fragment key={threat.id}>
                        <TableRow
                          id={`log-${threat.id}`}
                          className={cn(
                            "border-border",
                            severityRowClass(level, mode),
                          )}
                        >
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => toggle(threat.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") close(threat.id);
                              }}
                              aria-expanded={open}
                              aria-controls={`log-detail-${threat.id}`}
                              aria-label={`Détails de la menace ${threat.id}`}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:underline"
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
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {threat.id}
                          </TableCell>
                          <TableCell className="text-xs">
                            {threat.threat_type}
                          </TableCell>
                          <TableCell className="text-xs opacity-80">
                            <span className="flex items-center gap-2">
                              <Globe className="h-3 w-3" aria-hidden="true" />{" "}
                              {threat.source}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <SeverityBadge severity={threat.severity} />
                          </TableCell>
                          <TableCell className="text-xs">
                            {threat.confidence}%
                          </TableCell>
                          <TableCell className="text-xs opacity-80">
                            {threat.last_seen}
                          </TableCell>
                          <TableCell className="text-xs opacity-80">
                            <div className="flex flex-col gap-1">
                              {threat.indicators.map((indicator, idx) => (
                                <span key={idx} className="font-mono">
                                  {indicator}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>

                        {open && (
                          <TableRow
                            id={`log-detail-${threat.id}`}
                            className="border-border bg-muted/40 text-foreground hover:bg-muted/40"
                          >
                            <TableCell colSpan={8} className="py-3">
                              <LogDetailGrid
                                items={[
                                  { label: "ID", value: threat.id },
                                  {
                                    label: "Type de menace",
                                    value: threat.threat_type,
                                  },
                                  { label: "Source", value: threat.source },
                                  {
                                    label: "Sévérité (source)",
                                    value: threat.severity,
                                  },
                                  {
                                    label: "Niveau affiché",
                                    value: severityLabel(level),
                                  },
                                  {
                                    label: "Confiance",
                                    value: `${threat.confidence}%`,
                                  },
                                  {
                                    label: "Première détection",
                                    value: threat.first_seen,
                                  },
                                  {
                                    label: "Dernière détection",
                                    value: threat.last_seen,
                                  },
                                  {
                                    label: "Description",
                                    value: threat.description,
                                  },
                                  {
                                    label: "Indicateurs",
                                    value: threat.indicators.join(", "),
                                  },
                                ]}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
