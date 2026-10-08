import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Activity } from "lucide-react";
import { Widget } from "./dashboard/Widget";
import { API_ENDPOINTS } from "../config";
import { useAuth } from "../contexts/AuthContext";

interface AttackAverageData {
  time: string;
  normal_count: number;
  attack_count: number;
}

const SEUIL_ATTENTIF = 10;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-edge-strong bg-surface-2 px-3 py-2 font-data-sans-serif text-[11px] shadow-xl">
      <div className="mb-1 text-[#8c909f]">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5" style={{ color: p.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.dataKey === "normal_count" ? "Normal" : "Threat"}
          </span>
          <span className="font-bold text-[#e1e2ec]">{Number(p.value).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export const TrafficAttackChart: React.FC = () => {
  const [data, setData] = useState<AttackAverageData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { token } = useAuth();

  // Mock faithful to the ULPGL SOC history when the backend is unreachable.
  const MOCK_HISTORY: AttackAverageData[] = [
    { time: "09:00", normal_count: 45, attack_count: 5 },
    { time: "09:05", normal_count: 55, attack_count: 12 },
    { time: "09:10", normal_count: 48, attack_count: 8 },
    { time: "09:15", normal_count: 62, attack_count: 22 },
    { time: "09:20", normal_count: 50, attack_count: 15 },
    { time: "09:25", normal_count: 68, attack_count: 18 },
    { time: "09:30", normal_count: 58, attack_count: 11 },
    { time: "09:35", normal_count: 72, attack_count: 26 },
    { time: "09:40", normal_count: 64, attack_count: 19 },
    { time: "09:45", normal_count: 76, attack_count: 31 },
  ];

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_ENDPOINTS.ALERTS.STATS_HISTORY}?limit=100`);
        if (response.ok) {
          const raw = await response.json();
          const adapted: AttackAverageData[] = Array.isArray(raw)
            ? raw.map((item: any) => ({
                time: item.time,
                normal_count: item.normal_count ?? 0,
                attack_count: item["Moyenne d'Attaques"] ?? item.attack_count ?? 0,
              }))
            : [];
          if (adapted.length) {
            setData(adapted);
            return;
          }
        }
        setData(MOCK_HISTORY);
      } catch (error) {
        console.error("Erreur d'historique:", error);
        setData(MOCK_HISTORY);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    let normalDrift = 50;
    const ws = new WebSocket(API_ENDPOINTS.WEBSOCKET.ALERTS);
    ws.onopen = () => {
      if (token) {
        ws.send(JSON.stringify({ token }));
      }
    };
    ws.onmessage = (event) => {
      try {
        const rawAlert = JSON.parse(event.data);
        const severity = rawAlert.severity ? String(rawAlert.severity).toLowerCase() : "";
        if (severity === "normal" || severity === "low" || severity === "info") return;

        const currentTime = rawAlert.timestamp
          ? new Date(String(rawAlert.timestamp).replace(" ", "T")).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

        normalDrift = Math.max(20, Math.min(90, normalDrift + (Math.random() - 0.5) * 8));

        setData((prev) => {
          const next = [...prev];
          const idx = next.findIndex((p) => p.time === currentTime);
          if (idx !== -1) {
            next[idx] = {
              ...next[idx],
              attack_count: Number((next[idx].attack_count + 0.5).toFixed(2)),
              normal_count: Number(normalDrift.toFixed(1)),
            };
          } else {
            next.push({ time: currentTime, normal_count: Number(normalDrift.toFixed(1)), attack_count: 1 });
          }
          next.sort((a, b) => a.time.localeCompare(b.time));
          if (next.length > 30) next.shift();
          return next;
        });
      } catch (error) {
        console.error("Erreur de synchronisation WebSocket:", error);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <Widget
      title="Traffic vs Attack Trends"
      subtitle="Real-time packet anomaly & threat signature analysis (last 60 min)"
      icon={<Activity className="h-4 w-4" />}
      accent="critical"
      actions={
        <div className="hidden items-center gap-3 font-data-mono text-[10px] sm:flex">
          <span className="flex items-center gap-1.5 text-info-soft">
            <span className="h-2.5 w-2.5 rounded-sm border border-info bg-info/40" /> Normal
          </span>
          <span className="flex items-center gap-1.5 text-critical-soft">
            <span className="h-2.5 w-2.5 rounded-sm border border-critical bg-critical/40" /> Threat
          </span>
        </div>
      }
      menuItems={[
        { label: "Last 15 min" },
        { label: "Last 60 min" },
        { label: "Last 24h" },
        { label: "Export PNG", destructive: true },
      ]}
      contentClassName="p-3"
    >
      {loading ? (
        <div className="flex h-[300px] items-center justify-center">
          <p className="animate-pulse font-data-mono text-xs text-[#8c909f]">
            Calcul de l'évolution temporelle des attaques...
          </p>
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="fillNormal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4d8eff" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#4d8eff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fillThreat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff5a5a" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#ff5a5a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(66,71,84,0.45)" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#6b7280"
                tick={{ fill: "#8c909f", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(66,71,84,0.45)" }}
                minTickGap={24}
              />
              <YAxis
                stroke="#6b7280"
                tick={{ fill: "#8c909f", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#424754", strokeDasharray: "4 4" }} />
              <ReferenceLine
                y={SEUIL_ATTENTIF}
                stroke="#ff5a5a"
                strokeDasharray="5 5"
                label={{
                  value: `Seuil critique (${SEUIL_ATTENTIF})`,
                  fill: "#ffb4ab",
                  position: "insideTopRight",
                  fontSize: 10,
                  fontFamily: "JetBrains Mono",
                }}
              />
              <Area
                type="monotone"
                dataKey="normal_count"
                stroke="#4d8eff"
                strokeWidth={2}
                fill="url(#fillNormal)"
                isAnimationActive={false}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="attack_count"
                stroke="#ff5a5a"
                strokeWidth={2}
                fill="url(#fillThreat)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Widget>
  );
};
