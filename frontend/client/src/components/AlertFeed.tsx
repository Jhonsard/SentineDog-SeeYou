import { Fragment, useState, useMemo, memo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Filter,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useLogsDisplay } from "@/hooks/useLogsDisplay";
import { useExpandableLogs } from "@/hooks/useExpandableLogs";
import { normalizeSeverity, severityLabel, severityRowClass } from "@/lib/logs";
import { cn } from "@/lib/utils";
import { LogsDisplayToggle } from "@/components/logs/LogsDisplayToggle";
import { SeverityBadge } from "@/components/logs/SeverityBadge";
import { LogDetailGrid } from "@/components/logs/LogDetailGrid";

interface ExtendedAlert {
  id: number;
  source_ip: string;
  destination_ip: string;
  source_port?: number | null;
  destination_port?: number | null;
  protocol: string;
  alert_type: string;
  description: string;
  is_blocked: boolean;
  is_manual_block: boolean;
  validated_by_admin: boolean;
  severity: "normal" | "warning" | "critique" | "tres_critique";
  event_count: number;
  timestamp: string;
}

interface AlertFeedProps {
  alerts: ExtendedAlert[];
  wsConnected: boolean;
  onValidateBlock: (alertId: number, sourceIp: string) => void; // Aligné avec l'appel de SidebarLayout
}

function AlertFeedComponent({
  alerts,
  wsConnected,
  onValidateBlock,
}: AlertFeedProps) {
  const [wiresharkFilter, setWiresharkFilter] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedProtocol, setSelectedProtocol] = useState<string>("all");
  const [sortByDate, setSortByDate] = useState<"desc" | "asc">("desc");

  const filteredAlerts = useMemo(() => {
    return alerts
      .filter((alert) => {
        if (alert.is_blocked) return false;

        const query = wiresharkFilter.toLowerCase().trim();
        const matchesWireshark =
          query === "" ||
          alert.source_ip.includes(query) ||
          alert.destination_ip.includes(query) ||
          alert.protocol.toLowerCase().includes(query) ||
          alert.alert_type.toLowerCase().includes(query) ||
          alert.description.toLowerCase().includes(query);

        const matchesSeverity =
          selectedSeverity === "all" ||
          alert.severity?.toLowerCase() === selectedSeverity;

        const matchesProtocol =
          selectedProtocol === "all" ||
          alert.protocol?.toUpperCase() === selectedProtocol;

        return matchesWireshark && matchesSeverity && matchesProtocol;
      })
      .sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return sortByDate === "desc" ? dateB - dateA : dateA - dateB;
      });
  }, [alerts, wiresharkFilter, selectedSeverity, selectedProtocol, sortByDate]);

  const { mode, setMode } = useLogsDisplay();
  const { isOpen, toggle, close } = useExpandableLogs(
    filteredAlerts.map((alert) => String(alert.id)),
    true,
  );

  return (
    <Card className="border-border shadow-none bg-card rounded-md">
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 gap-4">
        <div>
          <CardTitle className="text-xs font-mono tracking-wider text-foreground uppercase font-bold flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-foreground animate-pulse motion-reduce:animate-none" />
            Console d'Interception d'Anomalies (Flux Direct ULPGL)
          </CardTitle>
          <CardDescription className="text-muted-foreground font-mono text-[11px] mt-1">
            Analyse comportementale et filtrage de paquets en temps réel.
          </CardDescription>
        </div>
        {wsConnected && (
          <div className="flex items-center gap-2 font-mono text-[10px] text-foreground bg-muted border border-border px-2 py-1 rounded-md self-start md:self-auto">
            <RefreshCw className="h-3 w-3 animate-spin motion-reduce:animate-none" />{" "}
            LIVE_ENG_CONNECTED
          </div>
        )}
      </CardHeader>

      <div className="px-6 py-3 bg-muted border-b border-border font-mono text-xs">
        <div className="flex items-center gap-2 bg-background border border-border rounded-md px-2.5 py-1.5 focus-within:border-primary/50 transition-all">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={wiresharkFilter}
            onChange={(e) => setWiresharkFilter(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-foreground font-mono text-xs"
            placeholder="Filtre à la Wireshark... (Ex: tcp, 192.168, scan)"
          />
          {wiresharkFilter && (
            <button
              onClick={() => setWiresharkFilter("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="h-4 w-[1px] bg-border mx-1" />

          <div className="bg-background border border-border rounded-md px-1.5 py-0.5 flex items-center">
            <button
              onClick={() => {
                if (showAdvanced) {
                  setSelectedSeverity("all");
                  setSelectedProtocol("all");
                }
                setShowAdvanced(!showAdvanced);
              }}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-sans font-medium transition-colors ${showAdvanced ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <SlidersHorizontal className="h-3 w-3" /> More...
            </button>
          </div>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 pt-3 border-t border-border animate-in fade-in duration-200 motion-reduce:animate-none">
            <div>
              <label className="block text-muted-foreground mb-1 uppercase font-bold text-[10px]">
                Sévérité (Expression)
              </label>
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-2 py-1.5 text-foreground focus:outline-none focus:border-foreground"
              >
                <option value="all">Toutes</option>
                <option value="normal">Normal</option>
                <option value="warning">Warning</option>
                <option value="critique">Critique</option>
                <option value="tres_critique">Très critique</option>
              </select>
            </div>
            <div>
              <label className="block text-muted-foreground mb-1 uppercase font-bold text-[10px]">
                Protocole (IP.proto)
              </label>
              <select
                value={selectedProtocol}
                onChange={(e) => setSelectedProtocol(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-2 py-1.5 text-foreground focus:outline-none focus:border-foreground"
              >
                <option value="all">Tous (TCP/UDP/ICMP)</option>
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="ICMP">ICMP</option>
              </select>
            </div>
            <div>
              <label className="block text-muted-foreground mb-1 uppercase font-bold text-[10px]">
                Tri Chronologique
              </label>
              <select
                value={sortByDate}
                onChange={(e) =>
                  setSortByDate(e.target.value as "desc" | "asc")
                }
                className="w-full bg-background border border-border rounded-sm px-2 py-1.5 text-foreground focus:outline-none focus:border-foreground"
              >
                <option value="desc">Plus récent en premier</option>
                <option value="asc">Plus ancien en premier</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <CardContent className="pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <LogsDisplayToggle value={mode} onChange={setMode} />
        </div>
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader className="bg-muted border-b border-border text-[10px] font-mono uppercase">
              <TableRow className="hover:bg-muted border-border">
                <TableHead className="w-10">
                  <span className="sr-only">Détails</span>
                </TableHead>
                <TableHead className="w-[60px] pl-2">ID</TableHead>
                <TableHead className="w-[100px]">Horodatage</TableHead>
                <TableHead>Type d'alerte</TableHead>
                <TableHead>Source IP</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead className="w-[60px]">Proto</TableHead>
                <TableHead className="w-[80px] text-center">
                  Occurrences
                </TableHead>
                <TableHead>Sévérité</TableHead>
                <TableHead className="text-right pr-4">Action IPS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAlerts.length === 0 ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell
                    colSpan={10}
                    className="h-32 text-center text-muted-foreground font-mono text-xs italic"
                  >
                    Aucun paquet ne correspond au filtre de display spécifié.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAlerts.map((alert) => {
                  const id = String(alert.id);
                  const open = isOpen(id);
                  const level = normalizeSeverity(alert.severity);

                  return (
                    <Fragment key={alert.id}>
                      <TableRow
                        id={`log-${id}`}
                        className={cn(
                          "border-b border-border/40 font-mono text-xs",
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
                            aria-label={`Détails de l'alerte ${id}`}
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
                        <TableCell className="font-bold pl-2">
                          #{alert.id}
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </TableCell>
                        <TableCell className="font-sans font-semibold">
                          {alert.alert_type}
                        </TableCell>
                        <TableCell className="font-bold">
                          {alert.source_ip}
                        </TableCell>
                        <TableCell>
                          {alert.destination_ip}:{alert.destination_port || "*"}
                        </TableCell>
                        <TableCell>
                          <span className="rounded-sm border border-current px-1.5 py-0.5 text-[10px]">
                            {alert.protocol}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-bold text-xs">
                          {alert.event_count || 1}
                        </TableCell>
                        <TableCell className="text-xs">
                          <SeverityBadge severity={alert.severity} />
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          {alert.is_blocked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold">
                              <ShieldAlert
                                className="h-3 w-3"
                                aria-hidden="true"
                              />{" "}
                              DROPPED (OS)
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] font-sans font-bold uppercase rounded-sm"
                              onClick={() =>
                                onValidateBlock(alert.id, alert.source_ip)
                              }
                            >
                              Bannir Hôte
                            </Button>
                          )}
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
                                { label: "ID", value: `#${alert.id}` },
                                {
                                  label: "Horodatage",
                                  value: new Date(
                                    alert.timestamp,
                                  ).toLocaleString("fr-FR"),
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
                                  label: "Sévérité (source)",
                                  value: alert.severity,
                                },
                                {
                                  label: "Niveau affiché",
                                  value: severityLabel(level),
                                },
                                {
                                  label: "Bloqué",
                                  value: alert.is_blocked ? "Oui" : "Non",
                                },
                                {
                                  label: "Blocage manuel",
                                  value: alert.is_manual_block ? "Oui" : "Non",
                                },
                                {
                                  label: "Validé par l'admin",
                                  value: alert.validated_by_admin
                                    ? "Oui"
                                    : "Non",
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
  );
}

export const AlertFeed = memo(AlertFeedComponent);
