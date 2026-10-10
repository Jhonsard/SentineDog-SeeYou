import React, { useEffect, useState, useRef } from "react";
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

interface AttackPoint {
  time: string;        // "HH:MM"
  attack_count: number; // moyenne d'occurrences d'attaques par minute (données réelles)
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
            Attaques/min
          </span>
          <span className="font-bold text-[#e1e2ec]">{Number(p.value).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export const TrafficAttackChart: React.FC = () => {
  const [data, setData] = useState<AttackPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { token } = useAuth();
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.ALERTS.STATS_HISTORY);
        if (response.ok) {
          const raw = await response.json();
          const adapted: AttackPoint[] = Array.isArray(raw)
            ? raw.map((item: any) => ({
                time: item.time,
                attack_count: item["Moyenne d'Attaques"] ?? item.attack_count ?? 0,
              }))
            : [];
          setData(adapted);
        }
      } catch (error) {
        console.error("Erreur d'historique:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    const ws = new WebSocket(API_ENDPOINTS.WEBSOCKET.ALERTS);
    ws.onopen = () => {
      if (tokenRef.current) {
        ws.send(JSON.stringify({ token: tokenRef.current }));
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

        setData((prev) => {
          const next = [...prev];
          const idx = next.findIndex((p) => p.time === currentTime);
          if (idx !== -1) {
            next[idx] = { ...next[idx], attack_count: next[idx].attack_count + 1 };
          } else {
            next.push({ time: currentTime, attack_count: 1 });
          }
          next.sort((a, b) => a.time.localeCompare(b.time));
          if (next.length > 60) next.shift();
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
      title="Évolution des attaques"
      subtitle="Moyenne réelle d'occurrences d'attaques par minute (3 dernières heures)"
      icon={<Activity className="h-4 w-4" />}
      accent="critical"
      actions={
        <div className="hidden items-center gap-3 font-data-mono text-[10px] sm:flex">
          <span className="flex items-center gap-1.5 text-critical-soft">
            <span className="h-2.5 w-2.5 rounded-sm border border-critical bg-critical/40" /> Attaques / min
          </span>
        </div>
      }
      contentClassName="p-3"
    >
      {loading ? (
        <div className="flex h-[300px] items-center justify-center">
          <p className="animate-pulse font-data-mono text-xs text-[#8c909f]">
            Calcul de l'évolution temporelle des attaques...
          </p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center">
          <p className="font-data-mono text-xs text-[#8c909f]">
            Aucune attaque enregistrée. Armez le moteur de capture pour collecter des données.
          </p>
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
              <defs>
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
