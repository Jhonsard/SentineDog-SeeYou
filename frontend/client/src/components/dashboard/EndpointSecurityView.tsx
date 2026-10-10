import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, Bug, ScanLine, Laptop, ServerCog, Cpu } from "lucide-react";
import { Widget } from "./Widget";
import { KpiCard } from "./KpiCard";
import { StatusRing } from "./StatusRing";
import { useAuth } from "../../contexts/AuthContext";
import { API_ENDPOINTS } from "../../config";

interface NodeRow {
  id: number;
  name: string;
  hostname: string;
  ip_address: string;
  connection_type: string;
  status: string;
  total_alerts: number;
  last_seen: string | null;
}

/**
 * Vue "Sécurité des Endpoints" alimentée exclusivement par /nodes/nodes et
 * /nodes/stats/aggregated. Aucune donnée fictive.
 */
export function EndpointSecurityView() {
  const { token } = useAuth();
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const load = async () => {
      setLoading(true);
      try {
        const [nodesRes, statsRes] = await Promise.all([
          fetch(API_ENDPOINTS.NODES.LIST, { headers }),
          fetch(API_ENDPOINTS.NODES.STATS_AGGREGATED, { headers }),
        ]);
        if (nodesRes.ok) {
          const data = await nodesRes.json();
          setNodes(Array.isArray(data) ? data : []);
        }
        if (statsRes.ok) {
          setStats(await statsRes.json());
        }
      } catch (error) {
        console.error("Erreur de chargement des endpoints:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const online = nodes.filter((n) => n.status === "online").length;
  const offline = nodes.filter((n) => n.status === "offline").length;
  const degraded = nodes.length - online - offline;
  const onlinePct = nodes.length ? Math.round((online / nodes.length) * 100) : 0;

  const connectionTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes) counts[n.connection_type || "ssh"] = (counts[n.connection_type || "ssh"] ?? 0) + 1;
    const total = nodes.length || 1;
    const palette = ["#4d8eff", "#adc6ff", "#ffb361", "#ff5a5a"];
    return Object.entries(counts).map(([name, v], i) => ({
      name: name.toUpperCase(),
      pct: Math.round((v / total) * 100),
      color: palette[i % palette.length],
    }));
  }, [nodes]);

  const statusStyle: Record<string, string> = {
    online: "text-secure-soft",
    degraded: "text-warning-soft",
    offline: "text-critical-soft",
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Nœuds surveillés" value={nodes.length} icon={<ShieldCheck className="h-4 w-4" />} accent="secure" />
        <KpiCard label="En ligne" value={online} icon={<ScanLine className="h-4 w-4" />} accent="info" />
        <KpiCard label="Hors ligne" value={offline} icon={<ShieldAlert className="h-4 w-4" />} accent="critical" />
        <KpiCard label="Alertes (parc)" value={stats?.total_alerts ?? 0} icon={<Bug className="h-4 w-4" />} accent="warning" />
      </div>

      <div className="col-span-12 xl:col-span-4">
        <Widget title="Posture du parc" subtitle="Santé des nœuds de surveillance" icon={<Cpu className="h-4 w-4" />} accent="secure">
          <div className="flex flex-col items-center gap-4">
            <StatusRing value={onlinePct} size={148} stroke={11} color="#22c55e" label="En ligne" sublabel={`${nodes.length} nœud(x)`} />
            <div className="grid w-full grid-cols-3 gap-2 text-center font-data-mono text-[10px]">
              <div className="rounded-md border border-edge bg-surface-2/60 py-2">
                <div className="text-secure-soft text-base font-bold">{online}</div>
                <div className="text-[#8c909f]">Online</div>
              </div>
              <div className="rounded-md border border-edge bg-surface-2/60 py-2">
                <div className="text-warning-soft text-base font-bold">{degraded}</div>
                <div className="text-[#8c909f]">Inconnu</div>
              </div>
              <div className="rounded-md border border-edge bg-surface-2/60 py-2">
                <div className="text-critical-soft text-base font-bold">{offline}</div>
                <div className="text-[#8c909f]">Offline</div>
              </div>
            </div>
          </div>
        </Widget>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <Widget title="Registre des nœuds" subtitle="Capteurs déclarés" icon={<Laptop className="h-4 w-4" />} accent="info" contentClassName="p-0">
          {loading ? (
            <div className="px-4 py-6 text-center font-data-mono text-[11px] text-[#8c909f]">Chargement…</div>
          ) : nodes.length === 0 ? (
            <div className="px-4 py-6 text-center font-data-mono text-[11px] italic text-[#8c909f]">
              Aucun nœud déclaré. Ajoutez un nœud dans « Nodes Management ».
            </div>
          ) : (
            <ul className="divide-y divide-edge/40 font-data-mono text-[11px]">
              {nodes.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-surface-2/50">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${n.status === "online" ? "bg-secure" : n.status === "offline" ? "bg-critical" : "bg-warning"}`} />
                    <div className="min-w-0">
                      <div className="truncate text-[#e1e2ec]">{n.name}</div>
                      <div className="truncate text-[9px] text-[#8c909f]">{n.ip_address}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[10px] uppercase ${statusStyle[n.status] ?? "text-[#8c909f]"}`}>{n.status}</div>
                    <div className="text-[9px] text-[#8c909f]">{n.last_seen ? new Date(n.last_seen).toLocaleTimeString() : "—"}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <Widget title="Type de connexion" subtitle="Moyens d'accès aux nœuds" icon={<ServerCog className="h-4 w-4" />} accent="warning">
          <div className="space-y-4">
            {connectionTypes.length === 0 ? (
              <p className="font-data-mono text-[11px] text-[#8c909f]">Aucun nœud déclaré.</p>
            ) : (
              connectionTypes.map((o) => (
                <div key={o.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-data-sans-serif text-[11px]">
                    <span className="text-[#c2c6d6]">{o.name}</span>
                    <span className="font-bold" style={{ color: o.color }}>{o.pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full" style={{ width: `${o.pct}%`, background: o.color }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Widget>
      </div>
    </div>
  );
}
