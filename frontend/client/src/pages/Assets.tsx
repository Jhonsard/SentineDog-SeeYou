import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Server, Database, Globe, Search, Plus, Edit, Trash2, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "../config";

interface Asset {
  id: string;
  name: string;
  type: "server" | "database" | "network" | "application";
  ip_address: string;
  status: "online" | "offline" | "warning";
  last_scan: string;
  vulnerabilities: number;
  criticality: "low" | "medium" | "high" | "critical";
}

export default function Assets() {
  const [assets, setAssets] = useState<Asset[]>([
    {
      id: "AST-001",
      name: "Web Server Production",
      type: "server",
      ip_address: "192.168.1.10",
      status: "online",
      last_scan: "2024-01-22 14:30:00",
      vulnerabilities: 2,
      criticality: "high"
    },
    {
      id: "AST-002",
      name: "Database Primary",
      type: "database",
      ip_address: "192.168.1.20",
      status: "online",
      last_scan: "2024-01-22 14:25:00",
      vulnerabilities: 0,
      criticality: "critical"
    },
    {
      id: "AST-003",
      name: "Load Balancer",
      type: "network",
      ip_address: "192.168.1.5",
      status: "warning",
      last_scan: "2024-01-22 14:20:00",
      vulnerabilities: 5,
      criticality: "high"
    },
    {
      id: "AST-004",
      name: "API Gateway",
      type: "application",
      ip_address: "192.168.1.15",
      status: "online",
      last_scan: "2024-01-22 14:15:00",
      vulnerabilities: 1,
      criticality: "medium"
    },
    {
      id: "AST-005",
      name: "Backup Server",
      type: "server",
      ip_address: "192.168.1.30",
      status: "offline",
      last_scan: "2024-01-22 10:00:00",
      vulnerabilities: 3,
      criticality: "low"
    }
  ]);

  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [defaultDeptId, setDefaultDeptId] = useState<number>(1);
  const authHeaders = () => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });

  const loadAssets = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.NODES.LIST, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("bad status");
      const nodes: any[] = await res.json();
      if (Array.isArray(nodes) && nodes.length) {
        const mapped: Asset[] = nodes.map((n) => {
          const status: Asset["status"] = n.status === "offline" ? "offline" : n.status === "online" ? "online" : "warning";
          const criticality: Asset["criticality"] = status === "offline" ? "critical" : status === "warning" ? "high" : "medium";
          const scan = n.last_check || n.last_seen;
          const last_scan = scan ? String(scan).replace("T", " ").slice(0, 19) : "—";
          return {
            id: String(n.id),
            name: n.name,
            type: "server",
            ip_address: n.ip_address,
            status,
            last_scan,
            vulnerabilities: Math.min(9, n.total_alerts ?? 0),
            criticality,
          };
        });
        setAssets(mapped);
        setDefaultDeptId(nodes[0]?.department_id ?? 1);
        try {
          const dres = await fetch(API_ENDPOINTS.NODES.DEPARTMENTS, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (dres.ok) {
            const depts = await dres.json();
            if (Array.isArray(depts) && depts.length) setDefaultDeptId(depts[0].id);
          }
        } catch { /* departments are optional for display */ }
      }
    } catch {
      toast.error("Backend Assets (nœuds) indisponible pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAsset = async () => {
    const name = window.prompt("Nom du nouvel actif (nœud) :");
    if (!name) return;
    const ip = window.prompt("Adresse IP :", "192.168.1.0");
    if (!ip) return;
    try {
      const res = await fetch(API_ENDPOINTS.NODES.CREATE, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ department_id: defaultDeptId, name, hostname: name, ip_address: ip, port: 22, connection_type: "ssh" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Actif créé (nœud ajouté au parc).");
      loadAssets();
    } catch {
      toast.error("Échec de la création de l'actif.");
    }
  };

  const handleEditAsset = async (asset: Asset) => {
    const name = window.prompt("Renommer l'actif :", asset.name);
    if (!name) return;
    try {
      const res = await fetch(API_ENDPOINTS.NODES.UPDATE(Number(asset.id)), {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      toast.success("Actif mis à jour.");
      loadAssets();
    } catch {
      toast.error("Échec de la mise à jour de l'actif.");
    }
  };

  const handleDeleteAsset = async (asset: Asset) => {
    if (!window.confirm(`Supprimer définitivement l'actif « ${asset.name} » ?`)) return;
    try {
      const res = await fetch(API_ENDPOINTS.NODES.DELETE(Number(asset.id)), {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      toast.success("Actif supprimé.");
      loadAssets();
    } catch {
      toast.error("Échec de la suppression de l'actif.");
    }
  };

  const handleScanAll = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.NODES.CHECK_ALL, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error();
      toast.success("Inspection de tous les nœuds déclenchée.");
    } catch {
      toast.error("Échec du scan global des nœuds.");
    }
  };

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         asset.ip_address.includes(searchTerm);
    const matchesType = typeFilter === "all" || asset.type === typeFilter;
    const matchesStatus = statusFilter === "all" || asset.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "server": return <Server className="h-4 w-4" />;
      case "database": return <Database className="h-4 w-4" />;
      case "network": return <Globe className="h-4 w-4" />;
      default: return <Server className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "offline": return "text-red-500 bg-red-500/10 border-red-500/20";
      case "warning": return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      default: return "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  const getCriticalityColor = (criticality: string) => {
    switch (criticality) {
      case "critical": return "text-red-500";
      case "high": return "text-orange-500";
      case "medium": return "text-yellow-500";
      case "low": return "text-emerald-500";
      default: return "text-zinc-400";
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 font-sans-serif">
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Server className="h-6 w-6 text-cyan-500" />
          <div>
            <h1 className="text-xl font-bold text-white">Assets Management</h1>
            <p className="text-xs text-zinc-500">Inventaire et surveillance des actifs réseau</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {loading && (
            <span className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={handleAddAsset}>
            <Plus className="h-4 w-4" /> Add Asset
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleScanAll}>
            <ShieldCheck className="h-4 w-4" /> Scan All
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{assets.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{assets.filter(a => a.status === "online").length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Vulnerabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{assets.reduce((a, b) => a + b.vulnerabilities, 0)}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-400">Critical Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{assets.filter(a => a.criticality === "critical").length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-zinc-950/40 border-zinc-900 mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search assets by name or IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-10 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:border-zinc-700 sm:w-auto"
            >
              <option value="all">All Types</option>
              <option value="server">Server</option>
              <option value="database">Database</option>
              <option value="network">Network</option>
              <option value="application">Application</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:border-zinc-700 sm:w-auto"
            >
              <option value="all">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="warning">Warning</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Assets Table */}
      <Card className="bg-zinc-950/40 border-zinc-900">
        <CardContent className="p-0">
          <div className="overflow-y-auto max-h-[600px] custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-900 sticky top-0 bg-zinc-950/40 z-10">
                  <TableHead className="text-zinc-500">Asset Name</TableHead>
                  <TableHead className="text-zinc-500">Type</TableHead>
                  <TableHead className="text-zinc-500">IP Address</TableHead>
                  <TableHead className="text-zinc-500">Status</TableHead>
                  <TableHead className="text-zinc-500">Criticality</TableHead>
                  <TableHead className="text-zinc-500">Vulnerabilities</TableHead>
                  <TableHead className="text-zinc-500">Last Scan</TableHead>
                  <TableHead className="text-zinc-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {filteredAssets.map((asset) => (
                <TableRow key={asset.id} className="border-zinc-900/40 hover:bg-zinc-900/20">
                  <TableCell className="text-white text-xs font-medium">{asset.name}</TableCell>
                  <TableCell className="text-zinc-400 text-xs flex items-center gap-2">
                    {getTypeIcon(asset.type)} {asset.type}
                  </TableCell>
                  <TableCell className="text-white font-mono text-xs">{asset.ip_address}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(asset.status)}`}>
                      {asset.status.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className={`text-xs font-medium ${getCriticalityColor(asset.criticality)}`}>
                    {asset.criticality.toUpperCase()}
                  </TableCell>
                  <TableCell className="text-white text-xs">
                    {asset.vulnerabilities > 0 ? (
                      <span className="flex items-center gap-1 text-orange-500">
                        <AlertTriangle className="h-3 w-3" /> {asset.vulnerabilities}
                      </span>
                    ) : (
                      <span className="text-emerald-500">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-xs">{asset.last_scan}</TableCell>
                  <TableCell className="text-zinc-400 text-xs">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEditAsset(asset)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-400" onClick={() => handleDeleteAsset(asset)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
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
