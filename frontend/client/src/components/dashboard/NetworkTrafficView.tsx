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
import { Network, ArrowDownUp, Radio, AlertTriangle, Globe2 } from "lucide-react";
import { Widget } from "./Widget";
import { KpiCard } from "./KpiCard";
import { Sparkline } from "./Sparkline";

const bandwidth = [
  { t: "09:00", inbound: 420, outbound: 280 },
  { t: "09:05", inbound: 510, outbound: 310 },
  { t: "09:10", inbound: 470, outbound: 290 },
  { t: "09:15", inbound: 680, outbound: 360 },
  { t: "09:20", inbound: 590, outbound: 340 },
  { t: "09:25", inbound: 720, outbound: 410 },
  { t: "09:30", inbound: 640, outbound: 380 },
  { t: "09:35", inbound: 810, outbound: 460 },
  { t: "09:40", inbound: 760, outbound: 420 },
  { t: "09:45", inbound: 880, outbound: 510 },
];

const protocols = [
  { name: "TCP", pct: 64, color: "#4d8eff" },
  { name: "UDP", pct: 21, color: "#adc6ff" },
  { name: "ICMP", pct: 9, color: "#ffb361" },
  { name: "Other", pct: 6, color: "#ff5a5a" },
];

const conversations = [
  { src: "192.168.14.22", dst: "10.0.2.15", bytes: "1.8 GB", risk: "critical" },
  { src: "45.128.232.11", dst: "192.168.1.5", bytes: "942 MB", risk: "warning" },
  { src: "172.16.0.4", dst: "192.168.1.1", bytes: "512 MB", risk: "warning" },
  { src: "10.20.44.112", dst: "192.168.1.9", bytes: "318 MB", risk: "critical" },
  { src: "192.168.1.30", dst: "8.8.8.8", bytes: "204 MB", risk: "info" },
];

const riskColor: Record<string, string> = {
  critical: "text-critical-soft bg-critical/10 border-critical/25",
  warning: "text-warning-soft bg-warning/10 border-warning/25",
  info: "text-info-soft bg-info/10 border-info/25",
};

export function NetworkTrafficView() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Throughput"
          value="7.8"
          unit="Gbps"
          icon={<Network className="h-4 w-4" />}
          accent="info"
          delta={{ text: "+4.2% vs 1h", direction: "up", tone: "neutral" }}
          spark={[3.9, 4.2, 4.1, 4.6, 5.0, 5.4, 5.2, 6.1, 6.8, 7.2, 7.5, 7.8]}
          footnote="Aggregate edge ingress/egress"
        />
        <KpiCard
          label="Packets / sec"
          value="128.4"
          unit="k"
          icon={<ArrowDownUp className="h-4 w-4" />}
          accent="warning"
          delta={{ text: "Burst detected", direction: "up", tone: "bad" }}
          spark={[82, 88, 91, 96, 102, 99, 110, 118, 121, 124, 127, 128]}
          footnote="L3/L4 forwarding rate"
        />
        <KpiCard
          label="Top Talker"
          value="192.168"
          unit=".14.22"
          icon={<Radio className="h-4 w-4" />}
          accent="critical"
          delta={{ text: "Anomalous volume", direction: "up", tone: "bad" }}
          spark={[4, 6, 5, 9, 12, 18, 22, 30, 41, 55, 72, 88]}
          footnote="1.8 GB in last 15 min"
        />
        <KpiCard
          label="Retransmits"
          value="0.4"
          unit="%"
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="secure"
          delta={{ text: "Within SLA", direction: "down", tone: "good" }}
          spark={[1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.6, 0.5, 0.5, 0.4, 0.4, 0.4]}
          footnote="TCP reliability index"
        />
      </div>

      <div className="col-span-12 xl:col-span-8">
        <Widget
          title="Bandwidth Utilization"
          subtitle="Inbound vs outbound throughput (Gbps)"
          icon={<ArrowDownUp className="h-4 w-4" />}
          accent="info"
          menuItems={[{ label: "Last 15 min" }, { label: "Last 24h" }, { label: "Export" }]}
          contentClassName="p-3"
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bandwidth} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="bwIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4d8eff" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#4d8eff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bwOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#adc6ff" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#adc6ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(66,71,84,0.45)" vertical={false} />
                <XAxis dataKey="t" stroke="#6b7280" tick={{ fill: "#8c909f", fontSize: 10, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: "rgba(66,71,84,0.45)" }} />
                <YAxis stroke="#6b7280" tick={{ fill: "#8c909f", fontSize: 10, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip cursor={{ stroke: "#424754", strokeDasharray: "4 4" }} contentStyle={{ background: "#1c2b3c", border: "1px solid #424754", borderRadius: 6, fontFamily: "JetBrains Mono", fontSize: 11 }} labelStyle={{ color: "#8c909f" }} itemStyle={{ color: "#e1e2ec" }} />
                <Area type="monotone" dataKey="inbound" stroke="#4d8eff" strokeWidth={2} fill="url(#bwIn)" dot={false} />
                <Area type="monotone" dataKey="outbound" stroke="#adc6ff" strokeWidth={2} fill="url(#bwOut)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Widget>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <Widget title="Protocol Distribution" subtitle="Layer-4 mix (last hour)" icon={<Globe2 className="h-4 w-4" />} accent="warning">
          <div className="space-y-4">
            {protocols.map((p) => (
              <div key={p.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-data-mono text-[11px]">
                  <span className="text-[#c2c6d6]">{p.name}</span>
                  <span className="font-bold" style={{ color: p.color }}>{p.pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: p.color }} />
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Sparkline data={[40, 52, 48, 61, 70, 64, 78, 85, 80, 92]} color="#4d8eff" width={260} height={40} className="w-full" />
            </div>
          </div>
        </Widget>
      </div>

      <div className="col-span-12">
        <Widget title="Top Conversations" subtitle="Highest-volume flows under inspection" icon={<Radio className="h-4 w-4" />} accent="critical" menuItems={[{ label: "Export CSV" }, { label: "Block range", destructive: true }]} contentClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-data-sans-serif text-[11px]">
              <thead>
                <tr className="border-b border-edge bg-surface-2 text-[10px] uppercase tracking-wider text-[#8c909f]">
                  <th className="px-4 py-2 text-left">Source</th>
                  <th className="px-4 py-2 text-left">Destination</th>
                  <th className="px-4 py-2 text-right">Volume</th>
                  <th className="px-4 py-2 text-left">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/40">
                {conversations.map((c, i) => (
                  <tr key={i} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-4 py-2 text-info-soft">{c.src}</td>
                    <td className="px-4 py-2 text-[#c2c6d6]">{c.dst}</td>
                    <td className="px-4 py-2 text-right text-[#e1e2ec]">{c.bytes}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-md border px-1.5 py-0.5 text-[9px] uppercase ${riskColor[c.risk]}`}>{c.risk}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Widget>
      </div>
    </div>
  );
}
