import React from "react";
import { Activity, Eye, Network, ShieldX } from "lucide-react";
import { KpiCard } from "./dashboard/KpiCard";

interface MetricCardsGridProps {
  stats: {
    total_alerts: number;
    active_critical: number;
    blocked_hosts: number;
    avg_events_min: number;
  };
  /** État du flux temps réel, utilisé pour la carte « Capteurs actifs ». */
  wsConnected?: boolean;
}

/**
 * Grille KPI de la vue d'ensemble. Toutes les valeurs viennent du backend :
 * aucun compteur de capteurs ni tendance n'est inventé.
 */
const MetricCardsGrid: React.FC<MetricCardsGridProps> = ({
  stats,
  wsConnected = false,
}) => {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 min-[1100px]:grid-cols-4">
      <KpiCard
        label="Alertes détectées"
        value={stats.total_alerts.toLocaleString("fr-FR")}
        icon={<Activity className="h-4 w-4" aria-hidden="true" />}
        footnote="Depuis le début de la session"
      />
      <KpiCard
        label="Menaces bloquées"
        value={stats.blocked_hosts.toLocaleString("fr-FR")}
        icon={<ShieldX className="h-4 w-4" aria-hidden="true" />}
        footnote="Netfilter actif"
      />
      <KpiCard
        label="Incidents ouverts"
        value={stats.active_critical.toLocaleString("fr-FR")}
        icon={<Eye className="h-4 w-4" aria-hidden="true" />}
        footnote="Critiques à examiner"
      />
      <KpiCard
        label="Capteurs actifs"
        value={wsConnected ? "Flux actif" : "Inactif"}
        icon={<Network className="h-4 w-4" aria-hidden="true" />}
        footnote={wsConnected ? "Temps réel connecté" : "Temps réel interrompu"}
      />
    </div>
  );
};

export default MetricCardsGrid;
