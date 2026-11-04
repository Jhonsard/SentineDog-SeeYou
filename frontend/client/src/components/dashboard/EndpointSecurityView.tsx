import * as React from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ScanLine,
  Laptop,
  ServerCog,
  Cpu,
} from "lucide-react";
import { Widget } from "./Widget";
import { KpiCard } from "./KpiCard";
import { StatusRing } from "./StatusRing";
import { Sparkline } from "./Sparkline";
import { API_ENDPOINTS } from "@/config";
import { useAuth } from "@/contexts/AuthContext";

interface AgentData {
  name: string;
  status: string;
  seen: string;
  ip: string;
}
interface OsDistData {
  name: string;
  pct: number;
  color: string;
}

const statusIcon: Record<string, React.ReactNode> = {
  online: <ShieldCheck className="h-3 w-3" aria-hidden="true" />,
  degraded: <ShieldAlert className="h-3 w-3" aria-hidden="true" />,
  offline: <ShieldX className="h-3 w-3" aria-hidden="true" />,
};

const statusLabel: Record<string, string> = {
  online: "En ligne",
  degraded: "Dégradé",
  offline: "Isolé",
};

export function EndpointSecurityView() {
  const { token } = useAuth();
  const [agents, setAgents] = React.useState<AgentData[]>([]);
  const [osDist, setOsDist] = React.useState<OsDistData[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(API_ENDPOINTS.NODES.HIERARCHY, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const raw = await res.json();
          const fetchedAgents: AgentData[] = Array.isArray(raw.nodes)
            ? raw.nodes.map((n: any) => ({
                name: n.name || n.hostname || "unknown",
                status: n.status || "unknown",
                seen: n.last_seen
                  ? new Date(n.last_seen).toLocaleTimeString("fr-FR")
                  : "Jamais",
                ip: n.ip_address || "0.0.0.0",
              }))
            : [];
          setAgents(fetchedAgents);
        }
      } catch (e) {
        console.error("Erreur lors du chargement des endpoints:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const hasData = agents.length > 0 || osDist.length > 0;
  const onlineCount = agents.filter((a) => a.status === "online").length;
  const degradedCount = agents.filter((a) => a.status === "degraded").length;
  const offlineCount = agents.filter((a) => a.status === "offline").length;
  const protectionRate = agents.length
    ? Math.round((onlineCount / agents.length) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête de page */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Sécurité des terminaux
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Terminaux
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Agents, posture et couverture des équipements protégés.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
          <span
            aria-hidden="true"
            className={`h-[7px] w-[7px] rounded-full border border-current ${
              loading || !hasData
                ? "bg-muted-foreground text-muted-foreground"
                : "bg-foreground text-foreground"
            }`}
          />
          <span className="flex flex-col">
            <strong>Registre des agents</strong>
            <span className="text-[10px] font-normal text-muted-foreground">
              {loading
                ? "Chargement..."
                : `${agents.length} agent(s) enregistré(s)`}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {loading ? (
          <div className="col-span-12 py-8 text-center text-muted-foreground font-data-mono text-xs italic">
            Chargement des endpoints...
          </div>
        ) : !hasData ? (
          <div className="col-span-12 py-8 text-center text-muted-foreground font-data-mono text-xs italic">
            Aucune donnée d'endpoint disponible pour le moment. Les données
            seront affichées ici dès qu'elles seront générées par le sniffer.
          </div>
        ) : (
          <>
            <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Agents en ligne"
                value={onlineCount}
                icon={<ShieldCheck className="h-4 w-4" />}
                footnote="Agents avec heartbeat"
              />
              <KpiCard
                label="Hôtes isolés"
                value={offlineCount}
                icon={<ShieldX className="h-4 w-4" />}
                footnote="Quarantaine réseau"
              />
              <KpiCard
                label="Agents dégradés"
                value={degradedCount}
                icon={<ShieldAlert className="h-4 w-4" />}
                footnote="Heartbeat dégradé"
              />
              <KpiCard
                label="Couverture en ligne"
                value={protectionRate}
                unit="%"
                icon={<ScanLine className="h-4 w-4" />}
                footnote="Part des agents en ligne"
              />
            </div>

            <div className="col-span-12 xl:col-span-4">
              <Widget
                title="Posture du parc"
                subtitle="Santé des équipements"
                icon={<Cpu className="h-4 w-4" />}
                accent="secure"
              >
                <div className="flex flex-col items-center gap-4">
                  <StatusRing
                    value={protectionRate}
                    size={148}
                    stroke={11}
                    label="Protégés"
                    sublabel={`${agents.length} équipements`}
                  />
                  <div className="grid w-full grid-cols-3 gap-2 text-center font-data-mono text-[10px]">
                    <div className="rounded-md border border-border bg-muted/60 py-2">
                      <div className="text-foreground text-base font-bold">
                        {onlineCount}
                      </div>
                      <div className="text-muted-foreground">En ligne</div>
                    </div>
                    <div className="rounded-md border border-border bg-muted/60 py-2">
                      <div className="text-foreground text-base font-bold">
                        {degradedCount}
                      </div>
                      <div className="text-muted-foreground">Dégradé</div>
                    </div>
                    <div className="rounded-md border border-border bg-muted/60 py-2">
                      <div className="text-foreground text-base font-bold">
                        {offlineCount}
                      </div>
                      <div className="text-muted-foreground">Isolé</div>
                    </div>
                  </div>
                  <div className="w-full">
                    <Sparkline
                      data={agents.map((a) => (a.status === "online" ? 1 : 0))}
                      color="var(--foreground)"
                      width={260}
                      height={38}
                      className="w-full"
                    />
                  </div>
                </div>
              </Widget>
            </div>

            <div className="col-span-12 xl:col-span-4">
              <Widget
                title="État des agents"
                subtitle="Registre des capteurs"
                icon={<Laptop className="h-4 w-4" />}
                accent="info"
                hideMenu
                contentClassName="p-0"
              >
                <ul className="divide-y divide-border/40 font-data-mono text-[11px]">
                  {agents.map((a) => (
                    <li
                      key={a.name}
                      className="flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-foreground">
                            {a.name}
                          </div>
                          <div className="truncate text-[9px] text-muted-foreground">
                            {a.ip}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1 text-[10px] uppercase text-foreground">
                          {statusIcon[a.status] ?? (
                            <ShieldAlert
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          )}
                          {statusLabel[a.status] ?? a.status}
                        </div>
                        <div className="text-[9px] text-muted-foreground">
                          {a.seen}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Widget>
            </div>

            <div className="col-span-12 xl:col-span-4">
              <Widget
                title="Répartition OS"
                subtitle="Base d'équipements protégés"
                icon={<ServerCog className="h-4 w-4" />}
                accent="warning"
              >
                <div className="space-y-4">
                  {osDist.length === 0 ? (
                    <div className="text-center text-muted-foreground font-data-mono text-xs italic py-4">
                      Aucune donnée OS disponible pour le moment.
                    </div>
                  ) : (
                    osDist.map((o) => (
                      <div key={o.name} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between font-data-mono text-[11px]">
                          <span className="text-secondary-foreground">
                            {o.name}
                          </span>
                          <span className="font-bold text-foreground">
                            {o.pct}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-foreground"
                            style={{ width: `${o.pct}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Widget>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
