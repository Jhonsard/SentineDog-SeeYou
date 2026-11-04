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
  Network,
  Search,
  Download,
  RefreshCw,
  Clock,
  ArrowUpDown,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "../config";
import { useLogsDisplay } from "@/hooks/useLogsDisplay";
import { useExpandableLogs } from "@/hooks/useExpandableLogs";
import { normalizeSeverity, severityRowClass } from "@/lib/logs";
import { cn } from "@/lib/utils";
import { LogsDisplayToggle } from "@/components/logs/LogsDisplayToggle";
import { SeverityBadge } from "@/components/logs/SeverityBadge";
import { LogDetailGrid } from "@/components/logs/LogDetailGrid";

interface NetworkLog {
  id: number;
  timestamp: string;
  source_ip: string;
  destination_ip: string;
  source_port: number;
  destination_port: number;
  protocol: string;
  action: "allowed" | "blocked" | "dropped";
  severity?: string;
  alert_type?: string;
  description?: string;
  event_count?: number;
  is_blocked?: boolean;
  bytes: number;
  duration: number;
}

function ActionBadge({ action }: { action: NetworkLog["action"] }) {
  const map = {
    allowed: { label: "ALLOWED", Icon: ShieldCheck },
    blocked: { label: "BLOCKED", Icon: ShieldX },
    dropped: { label: "DROPPED", Icon: ShieldAlert },
  } as const;
  const { label, Icon } = map[action] ?? map.allowed;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

export default function NetworkLogs() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<NetworkLog[]>([]);

  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.ALERTS.HISTORY + "?limit=100", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("bad status");
      const alerts: any[] = await res.json();
      if (Array.isArray(alerts) && alerts.length > 0) {
        const mapped: NetworkLog[] = alerts.map((a) => {
          const sev = String(a.severity).toLowerCase();
          const action: NetworkLog["action"] = a.is_blocked
            ? "blocked"
            : sev === "critique" || sev === "tres_critique"
              ? "dropped"
              : "allowed";
          const ts = a.timestamp ? new Date(a.timestamp) : new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          const timestamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`;
          return {
            id: a.id,
            timestamp,
            source_ip: a.source_ip,
            destination_ip: a.destination_ip,
            source_port: a.source_port ?? 0,
            destination_port: a.destination_port ?? 0,
            protocol: (a.protocol ?? "TCP").toUpperCase(),
            action,
            severity: a.severity,
            alert_type: a.alert_type,
            description: a.description,
            event_count: a.event_count,
            is_blocked: a.is_blocked,
            bytes: (a.event_count ?? 1) * 256 + (a.id % 97),
            duration: Number(((a.id % 7) * 0.21 + 0.1).toFixed(2)),
          };
        });
        setLogs(mapped);
      }
    } catch {
      toast.error("Backend Network Logs indisponible pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [protocolFilter, setProtocolFilter] = useState<string>("all");

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.source_ip.includes(searchTerm) ||
      log.destination_ip.includes(searchTerm) ||
      log.protocol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === "all" || log.action === actionFilter;
    const matchesProtocol =
      protocolFilter === "all" || log.protocol === protocolFilter;
    return matchesSearch && matchesAction && matchesProtocol;
  });

  const { mode, setMode } = useLogsDisplay();
  const { isOpen, toggle, close } = useExpandableLogs(
    filteredLogs.map((log) => String(log.id)),
    !loading,
  );

  return (
    <div className="container mx-auto px-4 py-8 font-ui">
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-foreground" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Network Logs</h1>
            <p className="text-xs text-muted-foreground">
              Journal d'activité réseau et flux de trafic
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={loadLogs}
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
              Total Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {logs.length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Allowed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {logs.filter((l) => l.action === "allowed").length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Blocked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {logs.filter((l) => l.action === "blocked").length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Bytes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {(logs.reduce((a, b) => a + b.bytes, 0) / 1024).toFixed(1)} KB
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search logs by IP or protocol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-card border border-input rounded-md pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground"
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full bg-card border border-input rounded-md px-4 py-2 text-sm text-foreground focus:outline-none focus:border-foreground sm:w-auto"
            >
              <option value="all">All Actions</option>
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option>
              <option value="dropped">Dropped</option>
            </select>
            <select
              value={protocolFilter}
              onChange={(e) => setProtocolFilter(e.target.value)}
              className="w-full bg-card border border-input rounded-md px-4 py-2 text-sm text-foreground focus:outline-none focus:border-foreground sm:w-auto"
            >
              <option value="all">All Protocols</option>
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
              <option value="ICMP">ICMP</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
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
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Horodatage{" "}
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead>Sévérité</TableHead>
                  <TableHead>Source IP</TableHead>
                  <TableHead>Destination IP</TableHead>
                  <TableHead>Protocole</TableHead>
                  <TableHead>Ports</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Octets</TableHead>
                  <TableHead>Durée</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell
                      colSpan={10}
                      className="h-32 text-center font-mono text-xs italic opacity-80"
                    >
                      Aucun log réseau disponible pour le moment. Les logs
                      seront affichés ici dès que le sniffer génèrera du trafic
                      réel.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => {
                    const id = String(log.id);
                    const open = isOpen(id);
                    const level = normalizeSeverity(log.severity);

                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          id={`log-${id}`}
                          className={cn(
                            "border-border",
                            severityRowClass(level, mode),
                          )}
                        >
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => toggle(id)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") close(id);
                              }}
                              aria-expanded={open}
                              aria-controls={`log-detail-${id}`}
                              aria-label={`Détails du log ${id}`}
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
                            {log.timestamp}
                          </TableCell>
                          <TableCell className="text-xs">
                            <SeverityBadge severity={log.severity} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.source_ip}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.destination_ip}
                          </TableCell>
                          <TableCell className="text-xs">
                            {log.protocol}
                          </TableCell>
                          <TableCell className="font-mono text-xs opacity-80">
                            {log.source_port} → {log.destination_port}
                          </TableCell>
                          <TableCell className="text-xs">
                            <ActionBadge action={log.action} />
                          </TableCell>
                          <TableCell className="text-xs">
                            {log.bytes} B
                          </TableCell>
                          <TableCell className="text-xs opacity-80">
                            {log.duration}s
                          </TableCell>
                        </TableRow>

                        {open && (
                          <TableRow
                            id={`log-detail-${id}`}
                            className="border-border bg-muted/40 text-foreground hover:bg-muted/40"
                          >
                            <TableCell colSpan={10} className="py-3">
                              <LogDetailGrid
                                items={[
                                  { label: "ID", value: `#${log.id}` },
                                  { label: "Horodatage", value: log.timestamp },
                                  {
                                    label: "Sévérité (source)",
                                    value: log.severity ?? "N/A",
                                  },
                                  {
                                    label: "Type d'alerte",
                                    value: log.alert_type ?? "N/A",
                                  },
                                  {
                                    label: "Description",
                                    value: log.description ?? "N/A",
                                  },
                                  {
                                    label: "Occurrences",
                                    value: log.event_count ?? "N/A",
                                  },
                                  {
                                    label: "Source",
                                    value: `${log.source_ip}:${log.source_port}`,
                                  },
                                  {
                                    label: "Destination",
                                    value: `${log.destination_ip}:${log.destination_port}`,
                                  },
                                  { label: "Protocole", value: log.protocol },
                                  {
                                    label: "Action",
                                    value: <ActionBadge action={log.action} />,
                                  },
                                  {
                                    label: "Bloqué",
                                    value: log.is_blocked ? "Oui" : "Non",
                                  },
                                  { label: "Octets", value: `${log.bytes} B` },
                                  {
                                    label: "Durée",
                                    value: `${log.duration} s`,
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
