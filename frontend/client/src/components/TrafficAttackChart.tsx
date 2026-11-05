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
import { Panel } from "./dashboard/Panel";
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
    <div className="rounded-md border border-border bg-card px-3 py-2 font-data-mono text-[11px]">
      <div className="mb-1 text-muted-foreground">{label}</div>
      {payload.map((p: any) => {
        const isThreat = p.dataKey === "attack_count";
        return (
          <div
            key={p.dataKey}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-2 text-foreground">
              <svg width="20" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="20"
                  y2="4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={isThreat ? "6 3" : undefined}
                />
              </svg>
              {isThreat ? "Threat" : "Normal"}
            </span>
            <span className="font-bold text-foreground">
              {Number(p.value).toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const TrafficAttackChart: React.FC = () => {
  const [data, setData] = useState<AttackAverageData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { token } = useAuth();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(
          `${API_ENDPOINTS.ALERTS.STATS_HISTORY}?limit=100`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (response.ok) {
          const raw = await response.json();
          const adapted: AttackAverageData[] = Array.isArray(raw)
            ? raw.map((item: any) => ({
                time: item.time,
                normal_count: item.normal_count ?? 0,
                attack_count:
                  item["Moyenne d'Attaques"] ?? item.attack_count ?? 0,
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
      if (token) {
        ws.send(JSON.stringify({ token: token }));
      }
    };
    ws.onmessage = (event) => {
      try {
        const rawAlert = JSON.parse(event.data);
        const severity = rawAlert.severity
          ? String(rawAlert.severity).toLowerCase()
          : "";
        if (severity === "normal" || severity === "low" || severity === "info")
          return;

        const currentTime = rawAlert.timestamp
          ? new Date(
              String(rawAlert.timestamp).replace(" ", "T"),
            ).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            });

        setData((prev) => {
          const next = [...prev];
          const idx = next.findIndex((p) => p.time === currentTime);
          if (idx !== -1) {
            next[idx] = {
              ...next[idx],
              attack_count: next[idx].attack_count + 1,
            };
          } else {
            // Le WebSocket ne fournit que les alertes : le trafic normal reprend
            // la dernière valeur réelle de l'historique, sans valeur inventée.
            const lastNormal =
              next.length > 0 ? next[next.length - 1].normal_count : 0;
            next.push({
              time: currentTime,
              normal_count: lastNormal,
              attack_count: 1,
            });
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

  const totalAlertEvents = data.reduce(
    (sum, point) => sum + (Number(point.attack_count) || 0),
    0,
  );

  return (
    <Panel className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-[18px] py-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-foreground" aria-hidden="true" />
            <h3 className="text-[13px] font-semibold text-foreground">
              Activité des menaces
            </h3>
          </div>
          <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
            Alertes détectées et tendance des attaques
          </p>
        </div>

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
            Normal
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
            Threat
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2 px-5 pb-1 pl-[54px] pt-[18px]">
        <div className="flex items-baseline gap-1.5">
          <span className="font-data-mono text-[23px] font-semibold text-foreground">
            {Math.round(totalAlertEvents).toLocaleString("fr-FR")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            alertes cumulées
          </span>
        </div>
        <span className="font-data-mono text-[10px] text-muted-foreground">
          {data.length} points
        </span>
      </div>

      <div className="flex-1 px-3 pb-3">
        {loading ? (
          <div className="flex h-[300px] items-center justify-center">
            <p className="animate-pulse motion-reduce:animate-none font-data-mono text-xs text-muted-foreground">
              Calcul de l'évolution temporelle des attaques...
            </p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center">
            <p className="font-data-mono text-xs text-muted-foreground italic">
              Aucune donnée d'attaque disponible pour le moment. Les données
              seront affichées ici dès qu'elles seront générées.
            </p>
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
              >
                <defs>
                  <pattern
                    id="hatchThreat"
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
                  dataKey="time"
                  tick={{
                    fill: "var(--foreground)",
                    fontSize: 10,
                    fontFamily: "JetBrains Mono",
                  }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--foreground)", strokeOpacity: 0.2 }}
                  minTickGap={24}
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
                  content={<CustomTooltip />}
                  cursor={{
                    stroke: "var(--foreground)",
                    strokeOpacity: 0.4,
                    strokeDasharray: "4 4",
                  }}
                />
                <ReferenceLine
                  y={SEUIL_ATTENTIF}
                  stroke="var(--foreground)"
                  strokeOpacity={0.6}
                  strokeDasharray="5 5"
                  label={{
                    value: `Seuil critique (${SEUIL_ATTENTIF})`,
                    fill: "var(--foreground)",
                    position: "insideTopRight",
                    fontSize: 10,
                    fontFamily: "JetBrains Mono",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="normal_count"
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  fill="var(--foreground)"
                  fillOpacity={0.08}
                  isAnimationActive={false}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="attack_count"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  fill="url(#hatchThreat)"
                  fillOpacity={0.9}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Panel>
  );
};
