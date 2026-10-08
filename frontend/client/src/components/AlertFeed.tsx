import { useState, useMemo, memo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, RefreshCw, Filter, SlidersHorizontal, X } from "lucide-react";

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

function AlertFeedComponent({ alerts, wsConnected, onValidateBlock }: AlertFeedProps) {
  const [wiresharkFilter, setWiresharkFilter] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedProtocol, setSelectedProtocol] = useState<string>("all");
  const [sortByDate, setSortByDate] = useState<'desc' | 'asc'>("desc");

  const filteredAlerts = useMemo(() => {
    return alerts
      .filter((alert) => {
        if (alert.is_blocked) return false;

        const query = wiresharkFilter.toLowerCase().trim();
        const matchesWireshark = query === "" || 
          alert.source_ip.includes(query) ||
          alert.destination_ip.includes(query) ||
          alert.protocol.toLowerCase().includes(query) ||
          alert.alert_type.toLowerCase().includes(query) ||
          alert.description.toLowerCase().includes(query);

        const matchesSeverity =
          selectedSeverity === "all" || alert.severity?.toLowerCase() === selectedSeverity;

        const matchesProtocol =
          selectedProtocol === "all" || alert.protocol?.toUpperCase() === selectedProtocol;

        return matchesWireshark && matchesSeverity && matchesProtocol;
      })
      .sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return sortByDate === "desc" ? dateB - dateA : dateA - dateB;
      });
  }, [alerts, wiresharkFilter, selectedSeverity, selectedProtocol, sortByDate]);

  return (
    <Card className="border-[#1d2027] shadow-2xl bg-[#0c0e12]/80 backdrop-blur-md rounded-sm">
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-[#1d2027] pb-4 gap-4">
        <div>
          <CardTitle className="text-xs font-mono tracking-wider text-[#e1e2ec] uppercase font-bold flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#ffb4ab] animate-pulse" />
            Console d'Interception d'Anomalies (Flux Direct ULPGL)
          </CardTitle>
          <CardDescription className="text-[#8c909f] font-mono text-[11px] mt-1">
            Analyse comportementale et filtrage de paquets en temps réel.
          </CardDescription>
        </div>
        {wsConnected && (
          <div className="flex items-center gap-2 font-mono text-[10px] text-[#4d8eff] bg-[#4d8eff]/10 border border-[#4d8eff]/20 px-2 py-1 rounded-sm self-start md:self-auto">
            <RefreshCw className="h-3 w-3 animate-spin" /> LIVE_ENG_CONNECTED
          </div>
        )}
      </CardHeader>

      <div className="px-6 py-3 bg-[#10131a] border-b border-[#1d2027] font-mono text-xs">
        <div className="flex items-center gap-2 bg-[#0c0e12] border border-[#1d2027] rounded-sm px-2.5 py-1.5 focus-within:border-[#4d8eff]/50 transition-all">
          <Filter className="h-3.5 w-3.5 text-[#8c909f]" />
          <input
            type="text"
            value={wiresharkFilter}
            onChange={(e) => setWiresharkFilter(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-[#e1e2ec] font-mono text-xs"
            placeholder="Filtre à la Wireshark... (Ex: tcp, 192.168, scan)"
          />
          {wiresharkFilter && (
            <button onClick={() => setWiresharkFilter("")} className="text-[#8c909f] hover:text-[#e1e2ec]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="h-4 w-[1px] bg-[#1d2027] mx-1" />
          
          <div className="bg-[#10131a] border border-[#1d2027] rounded-sm px-1.5 py-0.5 flex items-center shadow-inner">
            <button 
              onClick={() => {
                if (showAdvanced) {
                  setSelectedSeverity("all");
                  setSelectedProtocol("all");
                }
                setShowAdvanced(!showAdvanced);
              }} 
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-sans font-medium transition-colors ${showAdvanced ? "bg-[#1d2027] text-white" : "text-[#8c909f] hover:text-[#e1e2ec]"}`}
            >
              <SlidersHorizontal className="h-3 w-3" /> More...
            </button>
          </div>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 pt-3 border-t border-[#1d2027] animate-in fade-in duration-200">
            <div>
              <label className="block text-[#8c909f] mb-1 uppercase font-bold text-[10px]">Sévérité (Expression)</label>
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="w-full bg-[#0c0e12] border border-[#1d2027] rounded-sm px-2 py-1.5 text-[#e1e2ec] focus:outline-none focus:border-[#424754]"
              >
                <option value="all">Toutes</option>
                <option value="normal">🟢 Normal</option>
                <option value="warning">🟡 Warning</option>
                <option value="critique">🔴 Critique</option>
                <option value="tres_critique">🟣 Très Critique</option>
              </select>
            </div>
            <div>
              <label className="block text-[#8c909f] mb-1 uppercase font-bold text-[10px]">Protocole (IP.proto)</label>
              <select
                value={selectedProtocol}
                onChange={(e) => setSelectedProtocol(e.target.value)}
                className="w-full bg-[#0c0e12] border border-[#1d2027] rounded-sm px-2 py-1.5 text-[#e1e2ec] focus:outline-none focus:border-[#424754]"
              >
                <option value="all">Tous (TCP/UDP/ICMP)</option>
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="ICMP">ICMP</option>
              </select>
            </div>
            <div>
              <label className="block text-[#8c909f] mb-1 uppercase font-bold text-[10px]">Tri Chronologique</label>
              <select
                value={sortByDate}
                onChange={(e) => setSortByDate(e.target.value as 'desc' | 'asc')}
                className="w-full bg-[#0c0e12] border border-[#1d2027] rounded-sm px-2 py-1.5 text-[#e1e2ec] focus:outline-none focus:border-[#424754]"
              >
                <option value="desc">Plus récent en premier</option>
                <option value="asc">Plus ancien en premier</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <CardContent className="pt-4">
        <div className="rounded-sm border border-[#1d2027] bg-[#0c0e12]/60 overflow-hidden">
          <Table>
            <TableHeader className="bg-[#10131a] border-b border-[#1d2027] text-[10px] font-mono uppercase">
              <TableRow className="hover:bg-transparent border-[#1d2027]">
                <TableHead className="w-[60px] text-[#8c909f] pl-4">ID</TableHead>
                <TableHead className="text-[#8c909f] w-[100px]">Horodatage</TableHead>
                <TableHead className="text-[#8c909f]">Type d'Alerte</TableHead>
                <TableHead className="text-[#8c909f]">Source IP</TableHead>
                <TableHead className="text-[#8c909f]">Destination</TableHead>
                <TableHead className="text-[#8c909f] w-[60px]">Proto</TableHead>
                <TableHead className="text-[#8c909f] text-center w-[80px]">Occurrences</TableHead>
                <TableHead className="text-[#8c909f]">Sévérité</TableHead>
                <TableHead className="text-right text-[#8c909f] pr-4">Action IPS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAlerts.length === 0 ? (
                <TableRow className="hover:bg-transparent border-[#1d2027]">
                  <TableCell colSpan={9} className="h-32 text-center text-[#8c909f] font-mono text-xs italic">
                    Aucun paquet ne correspond au filtre de display spécifié.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAlerts.map((alert) => (
                  <TableRow key={alert.id} className="hover:bg-[#10131a]/50 border-b border-[#1d2027]/40 transition-colors font-mono text-xs group">
                    <TableCell className="font-bold text-[#8c909f] pl-4">#{alert.id}</TableCell>
                    <TableCell className="text-[#c2c6d6]">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="font-sans font-semibold text-[#e1e2ec] group-hover:text-white">
                      {alert.alert_type}
                    </TableCell>
                    <TableCell className="text-[#4d8eff] font-bold">{alert.source_ip}</TableCell>
                    <TableCell className="text-[#c2c6d6]">
                      {alert.destination_ip}:{alert.destination_port || "*"}
                    </TableCell>
                    <TableCell>
                      <span className="px-1.5 py-0.5 rounded-sm bg-[#10131a] border border-[#1d2027] text-[#c2c6d6] text-[10px]">
                        {alert.protocol}
                      </span>
                    </TableCell>
                    
                    <TableCell className="text-center font-bold text-amber-400 text-xs bg-amber-500/5">
                      {alert.event_count || 1}
                    </TableCell>

                    <TableCell>
                      {(() => {
                        const severity = alert.severity?.toLowerCase();
                        if (severity === "tres_critique") {
                          return (
                            <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-none font-bold text-[9px] font-mono uppercase rounded-sm">
                              💀 TRES CRITIQUE
                            </Badge>
                          );
                        } else if (severity === "critique" || severity === "critical" || severity === "high") {
                          return (
                            <Badge className="bg-[#ba1a1a]/20 text-[#ffb4ab] border border-[#ba1a1a]/40 shadow-none font-bold text-[9px] font-mono uppercase rounded-sm">
                              🔥 CRITICAL
                            </Badge>
                          );
                        } else if (severity === "warning" || severity === "medium" || severity === "moyen") {
                          return (
                            <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-none font-bold text-[9px] font-mono uppercase rounded-sm">
                              ⚠️ WARNING
                            </Badge>
                          );
                        } else {
                          return (
                            <Badge className="bg-[#10131a] text-[#8c909f] border border-[#1d2027] shadow-none font-bold text-[9px] font-mono uppercase rounded-sm">
                              ℹ️ INFO
                            </Badge>
                          );
                        }
                      })()}
                    </TableCell>
                    
                    <TableCell className="text-right pr-4">
                      {alert.is_blocked ? (
                        <span className="inline-flex items-center gap-1 text-[#ffb4ab] bg-[#ba1a1a]/10 px-2 py-0.5 rounded-sm border border-[#ba1a1a]/20 text-[10px] font-bold">
                          <ShieldAlert className="h-3 w-3" /> DROPPED (OS)
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 border-[#ffb4ab]/30 text-[#ffb4ab] hover:bg-[#ba1a1a] hover:text-white text-[10px] font-sans font-bold uppercase transition-all rounded-sm"
                          onClick={() => onValidateBlock(alert.id, alert.source_ip)}
                        >
                          Bannir Hôte
                        </Button>
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
  );
}

export const AlertFeed = memo(AlertFeedComponent); 
