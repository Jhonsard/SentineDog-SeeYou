import React from "react";
import { ShieldAlert, ShieldX, Activity, Zap } from "lucide-react";
import { KpiCard } from "./dashboard/KpiCard";

interface MetricCardsGridProps {
  stats: {
    total_alerts: number;
    active_critical: number;
    blocked_hosts: number;
    avg_events_min: number;
  };
}

/** Deterministic 24h trend so the sparkline is stable across renders. */
const trends = {
  total: [38, 42, 40, 47, 45, 52, 49, 58, 55, 61, 64, 59, 66, 71, 68, 74, 79, 76, 82, 88],
  critical: [2, 3, 1, 4, 3, 6, 5, 4, 7, 6, 9, 8, 7, 11, 9, 13, 10, 12, 14, 14],
  blocked: [120, 122, 121, 125, 128, 127, 131, 130, 134, 136, 138, 140, 142, 145, 147, 149, 150, 153, 155, 156],
  events: [9.1, 9.4, 9.2, 10.1, 10.4, 10.2, 11.0, 11.3, 11.1, 11.8, 12.0, 11.9, 12.4, 12.6, 12.3, 12.9, 12.7, 12.8, 12.8, 12.8],
};

const MetricCardsGrid: React.FC<MetricCardsGridProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Total Alerts"
        value={stats.total_alerts.toLocaleString()}
        icon={<Activity className="h-4 w-4" />}
        accent="info"
        delta={{ text: "+12.4% vs 24h", direction: "up", tone: "neutral" }}
        spark={trends.total}
        footnote="Aggregated across all sensors"
        menuItems={[{ label: "Export CSV" }, { label: "Inspect" }, { label: "Mute", destructive: true }]}
      />
      <KpiCard
        label="Active Critical"
        value={stats.active_critical}
        icon={<ShieldAlert className="h-4 w-4" />}
        accent="critical"
        delta={{ text: "Requires intervention", direction: "up", tone: "bad" }}
        spark={trends.critical}
        footnote="Open P1 / P2 incidents"
      />
      <KpiCard
        label="Blocked Hosts"
        value={stats.blocked_hosts}
        icon={<ShieldX className="h-4 w-4" />}
        accent="secure"
        delta={{ text: "+42 policy enforced", direction: "up", tone: "good" }}
        spark={trends.blocked}
        footnote="Netfilter blackhole active"
      />
      <KpiCard
        label="Avg Events / min"
        value={stats.avg_events_min.toFixed(1)}
        unit="k"
        icon={<Zap className="h-4 w-4" />}
        accent="warning"
        delta={{ text: "Normal load", direction: "flat", tone: "neutral" }}
        spark={trends.events}
        footnote="Steady-state ingestion"
      />
    </div>
  );
};

export default MetricCardsGrid;
