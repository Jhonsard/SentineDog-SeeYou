export interface Alert {
  id: number;
  timestamp: string;
  alert_type: string;          // Ex: "DDoS Attack", "Port Scanning"
  description: string;
  source_ip: string;
  destination_ip: string;
  source_port?: number | null;
  destination_port?: number | null;
  protocol: string;            // Ex: "TCP", "UDP", "ICMP"
  severity: "normal" | "warning" | "critique" | "tres_critique";
  event_count: number;         // Nombre d'occurrences (agrégation)
  pps: number;                 // Reçu via WS pour mettre à jour les KPIs globaux
  is_blocked: boolean;         // Pour savoir si Netfilter/Iptables l'a banni
  is_manual_block: boolean;
  validated_by_admin: boolean;
}

export interface AttackAverageData {
  time: string;                // Ex: "09:15"
  normal_count: number;        // Ligne verte du graphe
  attack_count: number;        // Ligne rouge du graphe
}

export interface SnifferStats {
  pps: number;
  network_load: string;
  checksum_errors: number;
  total_alerts: number;
  active_critical: number;
  blocked_hosts: number;
  avg_events_min: number;
}
