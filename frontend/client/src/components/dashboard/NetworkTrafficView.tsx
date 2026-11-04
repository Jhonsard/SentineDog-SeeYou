import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Network,
  ArrowDownUp,
  Radio,
  AlertTriangle,
  Globe2,
} from "lucide-react";
import { Widget } from "./Widget";
import { KpiCard } from "./KpiCard";
import { API_ENDPOINTS } from "@/config";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeSeverity, severityLabel } from "@/lib/logs";
import type { Alert, SnifferStats } from "../types";

interface BandwidthData {
  t: string;
  inbound: number;
  outbound: number;
}
interface ProtocolData {
  name: string;
  pct: number;
  count: number;
}
interface ConversationData {
  src: string;
  dst: string;
  protocol: string;
  count: number;
  severity: string;
}

const numberFormat = new Intl.NumberFormat("fr-FR");

interface NetworkTrafficViewProps {
  stats: SnifferStats;
  alerts: Alert[];
}

export function NetworkTrafficView({ stats, alerts }: NetworkTrafficViewProps) {
  const { token } = useAuth();
  const [bandwidth, setBandwidth] = React.useState<BandwidthData[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(API_ENDPOINTS.ALERTS.STATS_HISTORY, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const raw = await res.json();
          const adapted: BandwidthData[] = Array.isArray(raw)
            ? raw.map((item: any) => ({
                t: item.time,
                inbound: item["Moyenne d'Attaques"] || 0,
                outbound: item.normal_count || 0,
              }))
            : [];
          setBandwidth(adapted);
        }
      } catch (e) {
        console.error("Erreur lors du chargement du trafic:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const kpis = [
    {
      label: "Charge réseau",
      value: stats.network_load || "—",
      icon: <Network className="h-4 w-4" aria-hidden="true" />,
      footnote: "Mesure renvoyée par le sniffer",
    },
    {
      label: "Paquets / s",
      value: numberFormat.format(stats.pps),
      icon: <Radio className="h-4 w-4" aria-hidden="true" />,
      footnote: "Débit instantané",
    },
    {
      label: "Erreurs de checksum",
      value: numberFormat.format(stats.checksum_errors),
      icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
      footnote: "Paquets corrompus",
    },
    {
      label: "Événements / min",
      value: numberFormat.format(stats.avg_events_min),
      icon: <Globe2 className="h-4 w-4" aria-hidden="true" />,
      footnote: "Moyenne glissante",
    },
  ];

  const protocols = React.useMemo<ProtocolData[]>(() => {
    const counts = new Map<string, number>();
    for (const alert of alerts) {
      const protocol = alert.protocol || "Inconnu";
      counts.set(protocol, (counts.get(protocol) ?? 0) + 1);
    }
    const total = alerts.length;
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({
        name,
        count,
        pct: total ? Math.round((count / total) * 100) : 0,
      }));
  }, [alerts]);

  const conversations = React.useMemo<ConversationData[]>(() => {
    const flows = new Map<string, ConversationData>();
    for (const alert of alerts) {
      const key = `${alert.source_ip}|${alert.destination_ip}|${alert.protocol}`;
      const current = flows.get(key);
      if (current) {
        current.count += alert.event_count || 1;
      } else {
        flows.set(key, {
          src: alert.source_ip,
          dst: alert.destination_ip,
          protocol: alert.protocol,
          count: alert.event_count || 1,
          severity: alert.severity,
        });
      }
    }
    return Array.from(flows.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [alerts]);

  const lastPoint = bandwidth[bandwidth.length - 1]?.t;
  const seriesReady = !loading && bandwidth.length > 0;
  const seriesUnavailable = !loading && bandwidth.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête de page */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Observabilité réseau
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Trafic réseau
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Supervision des flux, protocoles et capteurs en temps réel.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
          <span
            aria-hidden="true"
            className={`h-[7px] w-[7px] rounded-full border border-current ${
              seriesReady
                ? "bg-foreground text-foreground"
                : "bg-muted-foreground text-muted-foreground"
            }`}
          />
          <span className="flex flex-col">
            <strong>Série STATS_HISTORY</strong>
            <span className="text-[10px] font-normal text-muted-foreground">
              {loading
                ? "Chargement de la série..."
                : lastPoint
                  ? `Dernier point : ${lastPoint}`
                  : "Aucune série disponible"}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              icon={kpi.icon}
              footnote={kpi.footnote}
            />
          ))}
        </div>

        <div className="col-span-12 xl:col-span-8">
          <Widget
            title="Activité réseau"
            subtitle="Attaques et trafic normal — série STATS_HISTORY"
            icon={<ArrowDownUp className="h-4 w-4" />}
            hideMenu
            actions={
              <div className="hidden items-center gap-4 font-data-mono text-[10px] text-foreground sm:flex">
                <span className="flex items-center gap-2">
                  <svg width="20" height="8" aria-hidden="true">
                    <line
                      x1="0"
                      y1="4"
                      x2="20"
                      y2="4"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                  Attaques
                </span>
                <span className="flex items-center gap-2">
                  <svg width="20" height="8" aria-hidden="true">
                    <line
                      x1="0"
                      y1="4"
                      x2="20"
                      y2="4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray="6 3"
                    />
                  </svg>
                  Normal
                </span>
              </div>
            }
            contentClassName="p-3"
          >
            {loading ? (
              <div className="flex h-[280px] items-center justify-center text-center font-data-mono text-xs italic text-muted-foreground">
                Chargement de la série...
              </div>
            ) : seriesUnavailable ? (
              <div className="flex h-[280px] items-center justify-center text-center font-data-mono text-xs italic text-muted-foreground">
                Aucune série réseau disponible pour le moment.
              </div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={bandwidth}
                    margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <pattern
                        id="bwOutHatch"
                        width="6"
                        height="6"
                        patternUnits="userSpaceOnUse"
                        patternTransform="rotate(45)"
                      >
                        <line
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="6"
                          stroke="var(--foreground)"
                          strokeWidth="1"
                          strokeOpacity="0.35"
                        />
                      </pattern>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--foreground)"
                      strokeOpacity={0.2}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="t"
                      tick={{
                        fill: "var(--foreground)",
                        fontSize: 10,
                        fontFamily: "JetBrains Mono",
                      }}
                      tickLine={false}
                      axisLine={{
                        stroke: "var(--foreground)",
                        strokeOpacity: 0.2,
                      }}
                    />
                    <YAxis
                      tick={{
                        fill: "var(--foreground)",
                        fontSize: 10,
                        fontFamily: "JetBrains Mono",
                      }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      cursor={{
                        stroke: "var(--foreground)",
                        strokeOpacity: 0.4,
                        strokeDasharray: "4 4",
                      }}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontFamily: "JetBrains Mono",
                        fontSize: 11,
                      }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                      itemStyle={{ color: "var(--foreground)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="inbound"
                      name="Attaques"
                      stroke="var(--foreground)"
                      strokeWidth={1.5}
                      fill="var(--foreground)"
                      fillOpacity={0.08}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="outbound"
                      name="Normal"
                      stroke="var(--foreground)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      fill="url(#bwOutHatch)"
                      fillOpacity={0.9}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Widget>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <Widget
            title="Répartition par protocole"
            subtitle="Alertes réelles par protocole"
            icon={<Globe2 className="h-4 w-4" />}
            hideMenu
          >
            <div className="space-y-4">
              {protocols.length === 0 ? (
                <div className="py-4 text-center font-data-mono text-xs italic text-muted-foreground">
                  Aucune alerte chargée pour le moment.
                </div>
              ) : (
                protocols.map((protocol) => (
                  <div key={protocol.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between font-data-mono text-[11px]">
                      <span className="text-secondary-foreground">
                        {protocol.name}
                      </span>
                      <span className="font-bold text-foreground">
                        {protocol.count} · {protocol.pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground"
                        style={{ width: `${protocol.pct}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Widget>
        </div>

        <div className="col-span-12">
          <Widget
            title="Principaux flux"
            subtitle="Couples source → destination issus des alertes"
            icon={<Radio className="h-4 w-4" />}
            hideMenu
            contentClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse font-data-sans-serif text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 text-left">Source</th>
                    <th className="px-4 py-2 text-left">Destination</th>
                    <th className="px-4 py-2 text-left">Protocole</th>
                    <th className="px-4 py-2 text-right">Événements</th>
                    <th className="px-4 py-2 text-left">Sévérité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {conversations.length === 0 ? (
                    <tr className="border-border">
                      <td
                        colSpan={5}
                        className="h-24 text-center font-data-mono text-xs italic text-muted-foreground"
                      >
                        Aucun flux disponible pour le moment.
                      </td>
                    </tr>
                  ) : (
                    conversations.map((conversation) => (
                      <tr
                        key={`${conversation.src}-${conversation.dst}-${conversation.protocol}`}
                        className="transition-colors hover:bg-muted/50"
                      >
                        <td className="px-4 py-2 text-foreground">
                          {conversation.src}
                        </td>
                        <td className="px-4 py-2 text-secondary-foreground">
                          {conversation.dst}
                        </td>
                        <td className="px-4 py-2 text-secondary-foreground">
                          {conversation.protocol}
                        </td>
                        <td className="px-4 py-2 text-right font-data-mono text-foreground">
                          {numberFormat.format(conversation.count)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
                            {severityLabel(
                              normalizeSeverity(conversation.severity),
                            )}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Widget>
        </div>
      </div>
    </div>
  );
}
