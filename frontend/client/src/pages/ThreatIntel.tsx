import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, Globe, AlertTriangle, Search, Filter, Download, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "../config";

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
  const [threats, setThreats] = useState<Threat[]>([
    {
      id: "THREAT-001",
      threat_type: "APT Campaign",
      source: "MITRE ATT&CK",
      severity: "critical",
      confidence: 95,
      first_seen: "2024-01-15",
      last_seen: "2024-01-20",
      description: "Advanced Persistent Threat targeting financial institutions",
      indicators: ["192.168.1.100", "malicious-domain.com"]
    },
    {
      id: "THREAT-002",
      threat_type: "Ransomware",
      source: "CISA",
      severity: "high",
      confidence: 88,
      first_seen: "2024-01-18",
      last_seen: "2024-01-19",
      description: "New ransomware variant targeting healthcare sector",
      indicators: ["10.0.0.50", "ransomware-c2.net"]
    },
    {
      id: "THREAT-003",
      threat_type: "DDoS Botnet",
      source: "ShadowServer",
      severity: "medium",
      confidence: 72,
      first_seen: "2024-01-10",
      last_seen: "2024-01-22",
      description: "Mirai botnet variant active in Eastern Europe",
      indicators: ["203.0.113.0/24"]
    }
  ]);
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
        const confMap: Record<string, number> = { critical: 95, high: 84, medium: 72, low: 60 };
        const mapped: Threat[] = alerts.map((a) => {
          const severity = sevMap[String(a.severity).toLowerCase()] ?? "medium";
          const day = (a.timestamp ? new Date(a.timestamp).toISOString() : new Date().toISOString()).slice(0, 10);
          return {
            id: `THREAT-${a.id}`,
            threat_type: a.alert_type ?? "Unknown",
            source: a.source_ip ?? "SOC Sensor",
            severity,
            confidence: confMap[severity],
            first_seen: day,
            last_seen: day,
            description: a.description ?? "",
            indicators: [a.source_ip, a.destination_ip].filter(Boolean) as string[],
          };
        });
        setThreats(mapped);
      }
    } catch {
      toast.error("Backend Threat Intelligence indisponible — données de démonstration.");
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

  const filteredThreats = threats.filter(threat => {
    const matchesSearch = threat.threat_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         threat.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = severityFilter === "all" || threat.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-500 bg-red-500/10 border-red-500/20";
      case "high": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      case "low": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      default: return "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 font-sans-serif">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-red-500" />
          <div>
            <h1 className="text-xl font-bold text-white">Threat Intelligence</h1>
            <p className="text-xs text-zinc-500">Menaces cybernétiques mondiales et indicateurs de compromission</p>
          </div>
        </div>
        <div className="flex gap-2">
          {loading && (
            <span className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={loadThreats} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Total Threats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{threats.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{threats.filter(t => t.severity === "critical").length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">High Severity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{threats.filter(t => t.severity === "high").length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Avg Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">{Math.round(threats.reduce((a, b) => a + b.confidence, 0) / threats.length)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-950/40 border-zinc-900 mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search threats..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-10 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              />
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Threats Table */}
      <Card className="bg-zinc-950/40 border-zinc-900">
        <CardContent className="p-0">
          <div className="overflow-y-auto max-h-[600px] custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-900 sticky top-0 bg-zinc-950/40 z-10">
                  <TableHead className="text-zinc-500">ID</TableHead>
                  <TableHead className="text-zinc-500">Threat Type</TableHead>
                  <TableHead className="text-zinc-500">Source</TableHead>
                  <TableHead className="text-zinc-500">Severity</TableHead>
                  <TableHead className="text-zinc-500">Confidence</TableHead>
                  <TableHead className="text-zinc-500">Last Seen</TableHead>
                  <TableHead className="text-zinc-500">Indicators</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {filteredThreats.map((threat) => (
                <TableRow key={threat.id} className="border-zinc-900/40 hover:bg-zinc-900/20">
                  <TableCell className="text-white font-mono text-xs">{threat.id}</TableCell>
                  <TableCell className="text-white text-xs">{threat.threat_type}</TableCell>
                  <TableCell className="text-zinc-400 text-xs flex items-center gap-2">
                    <Globe className="h-3 w-3" /> {threat.source}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(threat.severity)}`}>
                      {threat.severity.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className="text-white text-xs">{threat.confidence}%</TableCell>
                  <TableCell className="text-zinc-400 text-xs">{threat.last_seen}</TableCell>
                  <TableCell className="text-zinc-400 text-xs">
                    <div className="flex flex-col gap-1">
                      {threat.indicators.map((indicator, idx) => (
                        <span key={idx} className="font-mono">{indicator}</span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
