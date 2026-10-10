import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Network, ArrowDownUp, Radio, AlertTriangle, Globe2 } from "lucide-react";
import { Widget } from "./Widget";
import { KpiCard } from "./KpiCard";
import { useAuth } from "../../contexts/AuthContext";
import { API_ENDPOINTS } from "../../config";

interface RawAlert {
  id: number;
  source_ip: string;
  destination_ip: string;
  protocol: string;
  severity: string;
  is_blocked: boolean;
  timestamp: string;
}

interface ActivityPoint {
  t: string;
  attacks: number;
}

const PROTOCOL_COLORS: Record<string, string> = {
  TCP: "#4d8eff",
  UDP: "#adc6ff",
  ICMP: "#ffb361",
  Other: "#ff5a5a",
};

/**
 * Vue "Trafic Réseau" alimentée exclusivement par les endpoints
 * /alerts/history et /alerts/stats/history. Aucune donnée fictive.
 */
export function NetworkTrafficView() {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<RawAlert[]>([]);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    const load = async () => {
      setLoading(true);
      try {
        const [histRes, statsRes] = await Promise.all([
          fetch(`${API_ENDPOINTS.ALERTS.HISTORY}?limit=500`, { headers }),
          fetch(API_ENDPOINTS.ALERTS.STATS_HISTORY, { headers }),
        ]);
        if (histRes.ok) {
          const data = await histRes.json();
          setAlerts(Array.isArray(data) ? data : []);
        }
        if (statsRes.ok) {
          const raw = await statsRes.json();
          setActivity(
            Array.isArray(raw)
              ? raw.map((item: any) => ({
                  t: item.time,
                  attacks: item["Moyenne d'Attaques"] ?? item.attack_count ?? 0,
                }))
              : [],
          );
        }
      } catch (error) {
        console.error("Erreur de chargement du trafic:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  const { protocols, conversations } = useMemo(() => {
    const protoCounts: Record<string, number> = { TCP: 0, UDP: 0, ICMP: 0, Other: 0 };
    const convMap = new Map<string, { src: string; dst: string; count: number; critical: number }>();

    for (const a of alerts) {
      const proto = (a.protocol || "Other").toUpperCase();
      protoCounts[proto] = (protoCounts[proto] ?? 0) + 1;
      if (!(proto in protoCounts)) protoCounts.Other += 1;

      const key = `${a.source_ip}→${a.destination_ip}`;
      const existing = convMap.get(key) ?? { src: a.source_ip, dst: a.destination_ip, count: 0, critical: 0 };
      existing.count += 1;
      if (a.severity === "critique" || a.severity === "tres_critique") existing.critical += 1;
      convMap.set(key, existing);
    }

    const totalProto = Object.values(protoCounts).reduce((acc, v) => acc + v, 0) || 1;
    const protocols = Object.entries(protoCounts)
      .filter(([, v]) => v > 0)
      .map(([name, v]) => ({ name, pct: Math.round((v / totalProto) * 100), color: PROTOCOL_COLORS[name] ?? "#8c909f" }));

    const conversations = Array.from(convMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((c) => ({ ...c, risk: c.critical > 0 ? "critical" : c.count > 5 ? "warning" : "info" }));

    return { protocols, conversations };
  }, [alerts]);

  const uniqueSources = new Set(alerts.map((a) => a.source_ip)).size;
  const uniqueDestinations = new Set(alerts.map((a) => a.destination_ip)).size;
  const blockedCount = alerts.filter((a) => a.is_blocked).length;

  const riskColor: Record<string, string> = {
    critical: "text-critical-soft bg-critical/10 border-critical/25",
    warning: "text-warning-soft bg-warning/10 border-warning/25",
    info: "text-info-soft bg-info/10 border-info/25",
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Alertes analysées" value={alerts.length} icon={<Network className="h-4 w-4" />} accent="info" />
        <KpiCard label="Sources uniques" value={uniqueSources} icon={<ArrowDownUp className="h-4 w-4" />} accent="warning" />
        <KpiCard label="Destinations uniques" value={uniqueDestinations} icon={<Radio className="h-4 w-4" />} accent="critical" />
        <KpiCard label="Hôtes bloqués" value={blockedCount} icon={<AlertTriangle className="h-4 w-4" />} accent="secure" />
      </div>

      <div className="col-span-12 xl:col-span-8">
        <Widget
          title="Activité d'attaques"
          subtitle="Moyenne d'occurrences d'attaques par minute"
          icon={<ArrowDownUp className="h-4 w-4" />}
          accent="info"
          contentClassName="p-3"
        >
          <div className="h-[280px] w-full">
            {loading ? (
              <div className="flex h-full items-center justify-center font-data-mono text-xs text-[#8c909f]">Chargement…</div>
            ) : activity.length === 0 ? (
              <div className="flex h-full items-center justify-center font-data-mono text-xs text-[#8c909f]">
                Aucune donnée d'activité disponible.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activity} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bwAtt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff5a5a" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#ff5a5a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(66,71,84,0.45)" vertical={false} />
                  <XAxis dataKey="t" stroke="#6b7280" tick={{ fill: "#8c909f", fontSize: 10, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: "rgba(66,71,84,0.45)" }} />
                  <YAxis stroke="#6b7280" tick={{ fill: "#8c909f", fontSize: 10, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip cursor={{ stroke: "#424754", strokeDasharray: "4 4" }} contentStyle={{ background: "#1c2b3c", border: "1px solid #424754", borderRadius: 6, fontFamily: "JetBrains Mono", fontSize: 11 }} labelStyle={{ color: "#8c909f" }} itemStyle={{ color: "#e1e2ec" }} />
                  <Area type="monotone" dataKey="attacks" stroke="#ff5a5a" strokeWidth={2} fill="url(#bwAtt)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Widget>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <Widget title="Répartition par protocole" subtitle="Mix L3/L4 des alertes enregistrées" icon={<Globe2 className="h-4 w-4" />} accent="warning">
          <div className="space-y-4">
            {protocols.length === 0 ? (
              <p className="font-data-mono text-[11px] text-[#8c909f]">Aucune alerte enregistrée.</p>
            ) : (
              protocols.map((p) => (
                <div key={p.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-data-mono text-[11px]">
                    <span className="text-[#c2c6d6]">{p.name}</span>
                    <span className="font-bold" style={{ color: p.color }}>{p.pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: p.color }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Widget>
      </div>

      <div className="col-span-12">
        <Widget title="Conversations les plus fréquentes" subtitle="Flux source → destination les plus détectés" icon={<Radio className="h-4 w-4" />} accent="critical" contentClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-data-sans-serif text-[11px]">
              <thead>
                <tr className="border-b border-edge bg-surface-2 text-[10px] uppercase tracking-wider text-[#8c909f]">
                  <th className="px-4 py-2 text-left">Source</th>
                  <th className="px-4 py-2 text-left">Destination</th>
                  <th className="px-4 py-2 text-right">Occurrences</th>
                  <th className="px-4 py-2 text-left">Risque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/40">
                {conversations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center font-data-mono text-[11px] italic text-[#8c909f]">
                      Aucune conversation détectée.
                    </td>
                  </tr>
                ) : (
                  conversations.map((c, i) => (
                    <tr key={i} className="transition-colors hover:bg-surface-2/50">
                      <td className="px-4 py-2 text-info-soft">{c.src}</td>
                      <td className="px-4 py-2 text-[#c2c6d6]">{c.dst}</td>
                      <td className="px-4 py-2 text-right text-[#e1e2ec]">{c.count}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-md border px-1.5 py-0.5 text-[9px] uppercase ${riskColor[c.risk]}`}>{c.risk}</span>
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
  );
}
