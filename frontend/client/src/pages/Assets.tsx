import { useState, useEffect } from "react";
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
  Server,
  Database,
  Globe,
  Search,
  Plus,
  Edit,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  Circle,
  Loader2,
} from "lucide-react";
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
  const [assets, setAssets] = useState<Asset[]>([]);

  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [defaultDeptId, setDefaultDeptId] = useState<number>(1);
  const authHeaders = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const loadAssets = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.NODES.LIST, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("bad status");
      const nodes: any[] = await res.json();
      if (Array.isArray(nodes) && nodes.length) {
        const mapped: Asset[] = nodes.map((n) => {
          const status: Asset["status"] =
            n.status === "offline"
              ? "offline"
              : n.status === "online"
                ? "online"
                : "warning";
          const criticality: Asset["criticality"] =
            status === "offline"
              ? "critical"
              : status === "warning"
                ? "high"
                : "medium";
          const scan = n.last_check || n.last_seen;
          const last_scan = scan
            ? String(scan).replace("T", " ").slice(0, 19)
            : "—";
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
          const dres = await fetch(API_ENDPOINTS.NODES.DEPARTMENTS, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (dres.ok) {
            const depts = await dres.json();
            if (Array.isArray(depts) && depts.length)
              setDefaultDeptId(depts[0].id);
          }
        } catch {
          /* departments are optional for display */
        }
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
        body: JSON.stringify({
          department_id: defaultDeptId,
          name,
          hostname: name,
          ip_address: ip,
          port: 22,
          connection_type: "ssh",
        }),
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
    if (!window.confirm(`Supprimer définitivement l'actif « ${asset.name} » ?`))
      return;
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
      const res = await fetch(API_ENDPOINTS.NODES.CHECK_ALL, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch =
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.ip_address.includes(searchTerm);
    const matchesType = typeFilter === "all" || asset.type === typeFilter;
    const matchesStatus =
      statusFilter === "all" || asset.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "server":
        return <Server className="h-4 w-4" />;
      case "database":
        return <Database className="h-4 w-4" />;
      case "network":
        return <Globe className="h-4 w-4" />;
      default:
        return <Server className="h-4 w-4" />;
    }
  };

  const STATUS_META: Record<
    Asset["status"],
    { label: string; Icon: typeof ShieldCheck }
  > = {
    online: { label: "En ligne", Icon: ShieldCheck },
    warning: { label: "Alerte", Icon: AlertTriangle },
    offline: { label: "Hors ligne", Icon: ShieldX },
  };

  const CRITICALITY_META: Record<
    Asset["criticality"],
    { label: string; Icon: typeof ShieldCheck }
  > = {
    critical: { label: "Critique", Icon: ShieldAlert },
    high: { label: "Élevée", Icon: AlertTriangle },
    medium: { label: "Moyenne", Icon: Circle },
    low: { label: "Faible", Icon: ShieldCheck },
  };
  return (
    <div className="container mx-auto px-4 py-8 font-ui">
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Server className="h-6 w-6 text-foreground" />
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Assets Management
            </h1>
            <p className="text-xs text-muted-foreground">
              Inventaire et surveillance des actifs réseau
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
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleAddAsset}
          >
            <Plus className="h-4 w-4" /> Add Asset
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleScanAll}
          >
            <ShieldCheck className="h-4 w-4" /> Scan All
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {assets.length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Online
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {assets.filter((a) => a.status === "online").length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Vulnerabilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {assets.reduce((a, b) => a + b.vulnerabilities, 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Critical Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {assets.filter((a) => a.criticality === "critical").length}
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
                placeholder="Search assets by name or IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-card border border-input rounded-md pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full bg-card border border-input rounded-md px-4 py-2 text-sm text-foreground focus:outline-none focus:border-foreground sm:w-auto"
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
              className="w-full bg-card border border-input rounded-md px-4 py-2 text-sm text-foreground focus:outline-none focus:border-foreground sm:w-auto"
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
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-y-auto max-h-[600px] custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="border-border sticky top-0 bg-muted z-10">
                  <TableHead className="text-muted-foreground">
                    Asset Name
                  </TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">
                    IP Address
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    Criticality
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    Vulnerabilities
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    Last Scan
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssets.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground font-mono text-xs italic"
                    >
                      Aucun actif disponible pour le moment. Les actifs seront
                      affichés ici dès qu'ils seront détectés par le sniffer.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAssets.map((asset) => (
                    <TableRow
                      key={asset.id}
                      className="border-border hover:bg-muted/40"
                    >
                      <TableCell className="text-foreground text-xs font-medium">
                        {asset.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs flex items-center gap-2">
                        {getTypeIcon(asset.type)} {asset.type}
                      </TableCell>
                      <TableCell className="text-foreground font-mono text-xs">
                        {asset.ip_address}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          const { label, Icon } = STATUS_META[asset.status];
                          return (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <Icon
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />{" "}
                              {label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {(() => {
                          const { label, Icon } =
                            CRITICALITY_META[asset.criticality];
                          return (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <Icon
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />{" "}
                              {label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {asset.vulnerabilities > 0 ? (
                          <span className="flex items-center gap-1 text-foreground">
                            <AlertTriangle
                              className="h-3 w-3"
                              aria-hidden="true"
                            />{" "}
                            {asset.vulnerabilities}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {asset.last_scan}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleEditAsset(asset)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-foreground hover:underline"
                            onClick={() => handleDeleteAsset(asset)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
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
  );
}
