import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  Activity,
  Globe,
  Building,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { API_ENDPOINTS } from "../config";

interface Campus {
  id: number;
  name: string;
  location: string;
  description: string;
  departments: Department[];
}

interface Department {
  id: number;
  campus_id: number;
  name: string;
  description: string;
  nodes: Node[];
}

interface Node {
  id: number;
  department_id: number;
  name: string;
  hostname: string;
  ip_address: string;
  port: number;
  connection_type: string;
  status: string;
  total_packets: number;
  total_alerts: number;
  network_load: number;
  last_seen: string;
  last_check: string;
}

export default function NodesManagement() {
  const [hierarchy, setHierarchy] = useState<Campus[]>([]);
  const [aggregatedStats, setAggregatedStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCampus, setSelectedCampus] = useState<number | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<number | null>(
    null,
  );
  const [showAddNode, setShowAddNode] = useState(false);

  const fetchHierarchy = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("jwt_token");
      const response = await fetch(API_ENDPOINTS.NODES.HIERARCHY, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setHierarchy(data.campuses || []);
      }
    } catch (error) {
      console.error("Error fetching hierarchy:", error);
      toast.error("Error loading nodes hierarchy");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAggregatedStats = async () => {
    try {
      const token = localStorage.getItem("jwt_token");
      const response = await fetch(API_ENDPOINTS.NODES.STATS_AGGREGATED, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAggregatedStats(data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const checkAllNodes = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("jwt_token");
      const response = await fetch(API_ENDPOINTS.NODES.CHECK_ALL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Checked ${data.total_checked} nodes`);
        await fetchHierarchy();
        await fetchAggregatedStats();
      }
    } catch (error) {
      console.error("Error checking nodes:", error);
      toast.error("Error checking nodes");
    } finally {
      setIsLoading(false);
    }
  };

  const checkNodeStatus = async (nodeId: number) => {
    try {
      const token = localStorage.getItem("jwt_token");
      const response = await fetch(API_ENDPOINTS.NODES.CHECK(nodeId), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Node ${nodeId} status: ${data.status}`);
        await fetchHierarchy();
      }
    } catch (error) {
      console.error("Error checking node:", error);
      toast.error("Error checking node");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online":
        return <CheckCircle className="h-4 w-4" aria-hidden="true" />;
      case "offline":
        return <XCircle className="h-4 w-4" aria-hidden="true" />;
      case "error":
        return <AlertCircle className="h-4 w-4" aria-hidden="true" />;
      default:
        return <WifiOff className="h-4 w-4" aria-hidden="true" />;
    }
  };

  const STATUS_LABEL: Record<string, string> = {
    online: "En ligne",
    offline: "Hors ligne",
    error: "Erreur",
  };

  useEffect(() => {
    fetchHierarchy();
    fetchAggregatedStats();
  }, []);

  const filteredNodes = hierarchy.flatMap((campus) =>
    campus.departments.flatMap((dept) =>
      dept.nodes.map((node) => ({
        ...node,
        campus_name: campus.name,
        department_name: dept.name,
      })),
    ),
  );

  return (
    <div className="container mx-auto px-4 py-8 font-ui flex flex-col">
      <div className="flex flex-col gap-4 mb-6 shrink-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Server className="h-6 w-6 text-foreground" />
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Nodes Management
            </h1>
            <p className="text-xs text-muted-foreground">
              Gestion multi-nœuds pour la surveillance distribuée
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={fetchHierarchy}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`}
            />{" "}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={checkAllNodes}
            disabled={isLoading}
          >
            <Activity className="h-4 w-4" /> Check All
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setShowAddNode(true)}
          >
            <Plus className="h-4 w-4" /> Add Node
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6 shrink-0">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Total Nodes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {aggregatedStats?.total_nodes || 0}
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
                {aggregatedStats?.online_nodes || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Offline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {aggregatedStats?.offline_nodes || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Total Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {aggregatedStats?.total_alerts || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Avg Load
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {aggregatedStats?.average_network_load || 0} Mbps
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Hierarchy View */}
        <div className="space-y-6">
          {hierarchy.map((campus) => (
            <Card key={campus.id} className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Globe className="h-4 w-4 text-foreground" /> {campus.name}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-3 w-3" /> {campus.location}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {campus.departments.map((department) => (
                    <div
                      key={department.id}
                      className="border-l-2 border-border pl-4"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Building className="h-4 w-4 text-foreground" />
                        <h3 className="text-sm font-medium text-foreground">
                          {department.name}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          ({department.nodes.length} nodes)
                        </span>
                      </div>

                      {department.nodes.length > 0 && (
                        <div className="overflow-y-auto max-h-[400px] custom-scrollbar">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-border sticky top-0 bg-muted z-10">
                                <TableHead className="text-muted-foreground">
                                  Node
                                </TableHead>
                                <TableHead className="text-muted-foreground">
                                  IP Address
                                </TableHead>
                                <TableHead className="text-muted-foreground">
                                  Connection
                                </TableHead>
                                <TableHead className="text-muted-foreground">
                                  Status
                                </TableHead>
                                <TableHead className="text-muted-foreground">
                                  Load
                                </TableHead>
                                <TableHead className="text-muted-foreground">
                                  Alerts
                                </TableHead>
                                <TableHead className="text-muted-foreground">
                                  Last Seen
                                </TableHead>
                                <TableHead className="text-muted-foreground">
                                  Actions
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {department.nodes.map((node) => (
                                <TableRow
                                  key={node.id}
                                  className="border-border hover:bg-muted/40"
                                >
                                  <TableCell className="text-foreground text-xs font-medium">
                                    {node.name}
                                  </TableCell>
                                  <TableCell className="text-foreground font-mono text-xs">
                                    {node.ip_address}:{node.port}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-xs uppercase">
                                    {node.connection_type}
                                  </TableCell>
                                  <TableCell className="flex items-center gap-2">
                                    {getStatusIcon(node.status)}
                                    <span className="text-xs">
                                      {STATUS_LABEL[node.status] ?? node.status}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-foreground text-xs">
                                    {node.network_load || 0} Mbps
                                  </TableCell>
                                  <TableCell className="text-foreground text-xs font-medium">
                                    {node.total_alerts}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-xs">
                                    {node.last_seen
                                      ? new Date(
                                          node.last_seen,
                                        ).toLocaleString()
                                      : "Never"}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="gap-1"
                                      onClick={() => checkNodeStatus(node.id)}
                                    >
                                      <RefreshCw className="h-3 w-3" /> Check
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
