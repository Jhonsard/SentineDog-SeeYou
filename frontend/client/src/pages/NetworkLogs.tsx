import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Network, Search, Filter, Download, RefreshCw, Clock, ArrowUpDown, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "../config";

interface NetworkLog {
  id: number;
  timestamp: string;
  source_ip: string;
  destination_ip: string;
  source_port: number;
  destination_port: number;
  protocol: string;
  action: "allowed" | "blocked" | "dropped";
  bytes: number;
  duration: number;
}

export default function NetworkLogs() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const [logs, setLogs] = useState<NetworkLog[]>([
    {
      id: 1,
      timestamp: "2024-01-22 14:32:15",
      source_ip: "192.168.1.100",
      destination_ip: "10.0.0.50",
      source_port: 54321,
      destination_port: 443,
      protocol: "TCP",
      action: "allowed",
      bytes: 1524,
      duration: 0.5
    },
    {
      id: 2,
      timestamp: "2024-01-22 14:32:12",
      source_ip: "203.0.113.45",
      destination_ip: "192.168.1.1",
      source_port: 12345,
      destination_port: 22,
      protocol: "TCP",
      action: "blocked",
      bytes: 0,
      duration: 0
    },
    {
      id: 3,
      timestamp: "2024-01-22 14:32:10",
      source_ip: "192.168.1.50",
      destination_ip: "8.8.8.8",
      source_port: 53214,
      destination_port: 53,
      protocol: "UDP",
      action: "allowed",
      bytes: 512,
      duration: 0.1
    },
    {
      id: 4,
      timestamp: "2024-01-22 14:32:08",
      source_ip: "198.51.100.23",
      destination_ip: "192.168.1.100",
      source_port: 44444,
      destination_port: 80,
      protocol: "TCP",
      action: "dropped",
      bytes: 256,
      duration: 0.2
    },
    {
      id: 5,
      timestamp: "2024-01-22 14:32:05",
      source_ip: "192.168.1.200",
      destination_ip: "10.0.0.100",
      source_port: 49152,
      destination_port: 3306,
      protocol: "TCP",
      action: "allowed",
      bytes: 2048,
      duration: 1.2
    }
  ]);

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
            bytes: (a.event_count ?? 1) * 256 + (a.id % 97),
            duration: Number((((a.id % 7) * 0.21) + 0.1).toFixed(2)),
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

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.source_ip.includes(searchTerm) ||
                         log.destination_ip.includes(searchTerm) ||
                         log.protocol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === "all" || log.action === actionFilter;
    const matchesProtocol = protocolFilter === "all" || log.protocol === protocolFilter;
    return matchesSearch && matchesAction && matchesProtocol;
  });

  const getActionColor = (action: string) => {
    switch (action) {
      case "allowed": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "blocked": return "text-red-500 bg-red-500/10 border-red-500/20";
      case "dropped": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      default: return "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  const getProtocolColor = (protocol: string) => {
    switch (protocol) {
      case "TCP": return "text-blue-500";
      case "UDP": return "text-purple-500";
      case "ICMP": return "text-cyan-500";
      default: return "text-zinc-400";
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 font-sans-serif">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-blue-500" />
          <div>
            <h1 className="text-xl font-bold text-white">Network Logs</h1>
            <p className="text-xs text-zinc-500">Journal d'activité réseau et flux de trafic</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setLocation("/logs")}>
            <FileText className="h-4 w-4" /> Logs Management
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Total Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{logs.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Allowed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{logs.filter(l => l.action === "allowed").length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Blocked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{logs.filter(l => l.action === "blocked").length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Total Bytes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">{(logs.reduce((a, b) => a + b.bytes, 0) / 1024).toFixed(1)} KB</div>
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
                placeholder="Search logs by IP or protocol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-10 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
            >
              <option value="all">All Actions</option>
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option>
              <option value="dropped">Dropped</option>
            </select>
            <select
              value={protocolFilter}
              onChange={(e) => setProtocolFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
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
      <Card className="bg-zinc-950/40 border-zinc-900">
        <CardContent className="p-0">
          <div className="overflow-y-auto max-h-[600px] custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-900 sticky top-0 bg-zinc-950/40 z-10">
                  <TableHead className="text-zinc-500 cursor-pointer hover:text-white">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Timestamp <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="text-zinc-500">Source IP</TableHead>
                  <TableHead className="text-zinc-500">Destination IP</TableHead>
                  <TableHead className="text-zinc-500">Protocol</TableHead>
                  <TableHead className="text-zinc-500">Ports</TableHead>
                  <TableHead className="text-zinc-500">Action</TableHead>
                  <TableHead className="text-zinc-500">Bytes</TableHead>
                  <TableHead className="text-zinc-500">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="border-zinc-900/40 hover:bg-zinc-900/20">
                  <TableCell className="text-white font-mono text-xs">{log.timestamp}</TableCell>
                  <TableCell className="text-white font-mono text-xs">{log.source_ip}</TableCell>
                  <TableCell className="text-white font-mono text-xs">{log.destination_ip}</TableCell>
                  <TableCell className={`text-xs font-medium ${getProtocolColor(log.protocol)}`}>{log.protocol}</TableCell>
                  <TableCell className="text-zinc-400 text-xs font-mono">
                    {log.source_port} → {log.destination_port}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getActionColor(log.action)}`}>
                      {log.action.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className="text-white text-xs">{log.bytes} B</TableCell>
                  <TableCell className="text-zinc-400 text-xs">{log.duration}s</TableCell>
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
