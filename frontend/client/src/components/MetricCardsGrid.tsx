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

/**
 * KPIs calculés exclusivement à partir des données réelles du backend
 * (historique des alertes + état du moteur). Aucune valeur de démonstration.
 */
const MetricCardsGrid: React.FC<MetricCardsGridProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Alertes totales"
        value={stats.total_alerts.toLocaleString()}
        icon={<Activity className="h-4 w-4" />}
        accent="info"
      />
      <KpiCard
        label="Critiques actives"
        value={stats.active_critical}
        icon={<ShieldAlert className="h-4 w-4" />}
        accent="critical"
      />
      <KpiCard
        label="Hôtes bloqués"
        value={stats.blocked_hosts}
        icon={<ShieldX className="h-4 w-4" />}
        accent="secure"
      />
      <KpiCard
        label="Événements / min"
        value={stats.avg_events_min.toFixed(1)}
        icon={<Zap className="h-4 w-4" />}
        accent="warning"
      />
    </div>
  );
};

export default MetricCardsGrid;
