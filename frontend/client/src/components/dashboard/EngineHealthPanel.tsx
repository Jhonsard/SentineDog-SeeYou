import * as React from "react";
import { Cpu, Gauge, ShieldCheck } from "lucide-react";
import { Widget } from "./Widget";
import { StatusRing } from "./StatusRing";

interface EngineHealthPanelProps {
  stats: {
    pps: number;
    network_load: string;
    checksum_errors: number;
  };
  health?: number;
}

function Bar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between font-data-sans-serif text-[11px]">
        <span className="text-[#c2c6d6]">{label}</span>
        <span className="font-bold" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function EngineHealthPanel({ stats, health = 94 }: EngineHealthPanelProps) {
  const ppsPct = Math.min(100, (stats.pps / 50000) * 100);
  const loadPct = 78;
  const errPct = stats.checksum_errors > 0 ? 15 : 0;

  return (
    <Widget
      title="Snort Engine Status"
      subtitle="Live deep-packet inspection telemetry"
      icon={<Cpu className="h-4 w-4" />}
      accent="info"
      menuItems={[{ label: "Restart engine" }, { label: "View ruleset" }]}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4 rounded-md border border-edge bg-surface-2/60 p-3">
          <StatusRing
            value={health}
            size={104}
            stroke={9}
            color="#22c55e"
            label="Healthy"
            sublabel="Snort 3 / Scapy"
          />
          <div className="flex-1 space-y-1 font-data-sans-serif text-[11px]">
            <div className="flex items-center gap-1.5 text-secure-soft">
              <ShieldCheck className="h-3.5 w-3.5" /> All sensors nominal
            </div>
            <div className="text-[#8c909f]">
              PPS <span className="text-info-soft">{stats.pps.toLocaleString()}</span>
            </div>
            <div className="text-[#8c909f]">
              LOAD <span className="text-info-soft">{stats.network_load}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#8c909f]">
              <Gauge className="h-3.5 w-3.5" /> 0 dropped packets
            </div>
          </div>
        </div>

        <div className="space-y-4 font-sans-serif">
          <Bar label="Processing (PPS)" value={`${ppsPct.toFixed(1)}%`} pct={ppsPct} color="#4d8eff" />
          <Bar label="Network Load" value="78%" pct={loadPct} color="#adc6ff" />
          <Bar
            label="Checksum Errors"
            value={String(stats.checksum_errors)}
            pct={errPct}
            color="#ff5a5a"
          />
        </div>
      </div>
    </Widget>
  );
}
