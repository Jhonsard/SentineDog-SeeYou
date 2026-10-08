import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Calendar, Filter, RefreshCw, ShieldX, ShieldCheck, Activity, Clock, User, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "@/config";

interface LogEntry {
  id: number;
  timestamp: string;
  source_ip: string;
  destination_ip?: string;
  source_port?: number;
  destination_port?: number;
  protocol?: string;
  alert_type?: string;
  description?: string;
  is_blocked?: boolean;
  is_manual_block?: boolean;
  validated_by_admin?: boolean;
  severity?: string;
  action?: string;
  username?: string;
}

interface BannedHost {
  id: number;
  source_ip: string;
  alert_type: string;
  timestamp_block: string;
  reason?: string;
}

export default function LogsManagement() {
  const { token } = useAuth();
  const [selectedLogType, setSelectedLogType] = useState<"connections" | "blocked" | "unblocked" | "all">("all");
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split('T')[0]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [bannedHosts, setBannedHosts] = useState<BannedHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Charger les données depuis le backend
  const fetchLogs = async () => {
    if (!token) {
      toast.error("Session admin manquante. Veuillez vous reconnecter.");
      return;
    }

    setLoading(true);
    try {
      // Récupérer l'historique des alertes
      const historyResponse = await fetch(API_ENDPOINTS.ALERTS.HISTORY, {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        
        // Transformer les données en format de log
        const formattedLogs: LogEntry[] = historyData.map((alert: any) => ({
          id: alert.id,
          timestamp: alert.timestamp,
          source_ip: alert.source_ip,
          destination_ip: alert.destination_ip,
          source_port: alert.source_port,
          destination_port: alert.destination_port,
          protocol: alert.protocol,
          alert_type: alert.alert_type,
          description: alert.description,
          is_blocked: alert.is_blocked,
          is_manual_block: alert.is_manual_block,
          validated_by_admin: alert.validated_by_admin,
          severity: alert.severity,
          action: alert.is_blocked ? "BLOCKED" : "DETECTED"
        }));

        setLogs(formattedLogs);
      }

      // Récupérer les hôtes bannis
      const bannedResponse = await fetch(API_ENDPOINTS.ALERTS.BANNED_HOSTS, {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (bannedResponse.ok) {
        const bannedData = await bannedResponse.json();
        setBannedHosts(bannedData);
      }

      toast.success("Logs chargés avec succès");
    } catch (error) {
      toast.error("Erreur lors du chargement des logs");
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Filtrer les logs selon le type et la date
  const filteredLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp).toISOString().split('T')[0];
    const matchesDate = logDate === dateFilter;
    const matchesSearch = searchTerm === "" || 
                         log.source_ip.includes(searchTerm) ||
                         (log.alert_type && log.alert_type.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (log.description && log.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesDate || !matchesSearch) return false;

    switch (selectedLogType) {
      case "connections":
        return true; // Toutes les connexions
      case "blocked":
        return log.is_blocked === true;
      case "unblocked":
        return log.is_blocked === false;
      default:
        return true;
    }
  });

  // Générer le fichier log
  const generateLogFile = (logType: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    let logContent = "";
    let filename = "";

    const header = `================================================================================
                    ULPGL SECURITY CONSOLE - LOG FILE
================================================================================
Generated: ${new Date().toLocaleString('fr-FR')}
Log Type: ${logType.toUpperCase()}
Date Filter: ${dateFilter}
Total Entries: ${filteredLogs.length}
================================================================================
`;

    switch (logType) {
      case "connections":
        filename = `connections_${timestamp}.log`;
        logContent = header + `
DAILY CONNECTION LOGS
====================

${filteredLogs.map(log => {
  const date = new Date(log.timestamp).toLocaleString('fr-FR');
  return `[${date}] ${log.action} | IP: ${log.source_ip} | Protocol: ${log.protocol || 'N/A'} | Port: ${log.source_port || 'N/A'} | Type: ${log.alert_type || 'N/A'} | Severity: ${log.severity || 'N/A'} | Description: ${log.description || 'N/A'}`;
}).join('\n')}

================================================================================
END OF CONNECTION LOGS
================================================================================
`;
        break;

      case "blocked":
        filename = `blocked_ips_${timestamp}.log`;
        const blockedLogs = filteredLogs.filter(log => log.is_blocked === true);
        logContent = header + `
BLOCKED IP ADDRESSES LOG
========================

${blockedLogs.map(log => {
  const date = new Date(log.timestamp).toLocaleString('fr-FR');
  return `[${date}] BLOCKED | IP: ${log.source_ip} | Alert Type: ${log.alert_type || 'N/A'} | Manual Block: ${log.is_manual_block ? 'Yes' : 'No'} | Validated by Admin: ${log.validated_by_admin ? 'Yes' : 'No'} | Reason: ${log.description || 'Security Alert'}`;
}).join('\n')}

================================================================================
END OF BLOCKED IPS LOG
================================================================================
`;
        break;

      case "unblocked":
        filename = `unblocked_ips_${timestamp}.log`;
        const unblockedLogs = filteredLogs.filter(log => log.is_blocked === false);
        logContent = header + `
UNBLOCKED IP ADDRESSES LOG
==========================

${unblockedLogs.map(log => {
  const date = new Date(log.timestamp).toLocaleString('fr-FR');
  return `[${date}] DETECTED | IP: ${log.source_ip} | Alert Type: ${log.alert_type || 'N/A'} | Severity: ${log.severity || 'N/A'} | Description: ${log.description || 'N/A'}`;
}).join('\n')}

================================================================================
END OF UNBLOCKED IPS LOG
================================================================================
`;
        break;

      case "all":
        filename = `complete_log_${timestamp}.log`;
        logContent = header + `
COMPLETE SYSTEM LOG
===================

${filteredLogs.map(log => {
  const date = new Date(log.timestamp).toLocaleString('fr-FR');
  return `[${date}] ${log.action} | IP: ${log.source_ip} | Dest IP: ${log.destination_ip || 'N/A'} | Protocol: ${log.protocol || 'N/A'} | Src Port: ${log.source_port || 'N/A'} | Dest Port: ${log.destination_port || 'N/A'} | Type: ${log.alert_type || 'N/A'} | Severity: ${log.severity || 'N/A'} | Blocked: ${log.is_blocked ? 'Yes' : 'No'} | Manual: ${log.is_manual_block ? 'Yes' : 'No'} | Validated: ${log.validated_by_admin ? 'Yes' : 'No'} | Description: ${log.description || 'N/A'}`;
}).join('\n')}

================================================================================
END OF COMPLETE LOG
================================================================================
`;
        break;
    }

    // Créer et télécharger le fichier
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Fichier ${filename} généré et téléchargé`);
  };

  // Générer un fichier CSV
  const generateCSVFile = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `security_logs_${timestamp}.csv`;

    const headers = ["Timestamp", "Source IP", "Destination IP", "Source Port", "Destination Port", "Protocol", "Alert Type", "Severity", "Action", "Blocked", "Manual Block", "Validated", "Description"];
    
    const csvContent = [
      headers.join(","),
      ...filteredLogs.map(log => [
        `"${new Date(log.timestamp).toLocaleString('fr-FR')}"`,
        `"${log.source_ip}"`,
        `"${log.destination_ip || 'N/A'}"`,
        log.source_port || 'N/A',
        log.destination_port || 'N/A',
        `"${log.protocol || 'N/A'}"`,
        `"${log.alert_type || 'N/A'}"`,
        `"${log.severity || 'N/A'}"`,
        `"${log.action || 'N/A'}"`,
        log.is_blocked ? 'Yes' : 'No',
        log.is_manual_block ? 'Yes' : 'No',
        log.validated_by_admin ? 'Yes' : 'No',
        `"${(log.description || 'N/A').replace(/"/g, '""')}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Fichier CSV ${filename} généré et téléchargé`);
  };

  const getSeverityColor = (severity?: string) => {
    if (!severity) return "text-zinc-500";
    switch (severity.toLowerCase()) {
      case "critical": case "tres_critique": return "text-red-500 bg-red-500/10 border-red-500/20";
      case "high": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      case "low": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "normal": case "info": return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      default: return "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 font-sans-serif h-screen overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-cyan-500" />
          <div>
            <h1 className="text-xl font-bold text-white">Logs Management</h1>
            <p className="text-xs text-zinc-500">Génération et exportation des fichiers de logs système</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400 flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" /> Total Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{logs.length}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400 flex items-center gap-2">
              <ShieldX className="h-4 w-4 text-red-500" /> Blocked IPs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{logs.filter(l => l.is_blocked).length}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Unblocked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{logs.filter(l => !l.is_blocked).length}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400 flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" /> Today's Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">{filteredLogs.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Export */}
      <Card className="bg-zinc-950/40 border-zinc-900 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
            <Filter className="h-4 w-4 text-cyan-500" /> Filters & Export
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            Filtrer les logs et exporter les fichiers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Date Filter</Label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Log Type</Label>
              <select
                value={selectedLogType}
                onChange={(e) => setSelectedLogType(e.target.value as any)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
              >
                <option value="all">All Logs</option>
                <option value="connections">Daily Connections</option>
                <option value="blocked">Blocked IPs</option>
                <option value="unblocked">Unblocked IPs</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="IP, type, description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-white text-sm pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Export Format</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => generateLogFile(selectedLogType)}
                >
                  <Download className="h-4 w-4" /> LOG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={generateCSVFile}
                >
                  <Download className="h-4 w-4" /> CSV
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="bg-zinc-950/40 border-zinc-900">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-500" /> Log Entries
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            Affichage de {filteredLogs.length} entrée(s) pour le {dateFilter}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400 text-xs">Timestamp</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Source IP</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Destination IP</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Protocol</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Alert Type</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Severity</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Action</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-zinc-500 py-8">
                      Aucune log trouvée pour les filtres sélectionnés
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-900/50">
                      <TableCell className="text-white text-xs">
                        {new Date(log.timestamp).toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell className="text-white text-xs font-mono">{log.source_ip}</TableCell>
                      <TableCell className="text-zinc-400 text-xs font-mono">{log.destination_ip || 'N/A'}</TableCell>
                      <TableCell className="text-zinc-400 text-xs">{log.protocol || 'N/A'}</TableCell>
                      <TableCell className="text-zinc-400 text-xs">{log.alert_type || 'N/A'}</TableCell>
                      <TableCell className="text-xs">
                        <span className={`px-2 py-1 rounded border ${getSeverityColor(log.severity)}`}>
                          {log.severity || 'N/A'}
                        </span>
                      </TableCell>
                      <TableCell className="text-zinc-400 text-xs">{log.action || 'DETECTED'}</TableCell>
                      <TableCell className="text-xs">
                        {log.is_blocked ? (
                          <span className="text-red-500 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded">BLOCKED</span>
                        ) : (
                          <span className="text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">DETECTED</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
