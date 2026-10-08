export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

// EXPANSION DES TYPES CONTRACTUELS POUR ALIGNEMENT BACKEND

export interface Alert {
  id: number;
  timestamp: string; // Transmis en ISO string par FastAPI datetime
  source_ip: string;
  destination_ip: string;
  source_port: number | null;
  destination_port: number | null;
  protocol: "TCP" | "UDP" | "ICMP" | string;
  alert_type: string;
  description: string;
  is_blocked: boolean;
  is_manual_block: boolean;
  validated_by_admin: boolean;
  severity: "normal" | "critique" | string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: "admin" | "user" | string;
  is_active: boolean;
}

export interface Token {
  access_token: string;
  token_type: string;
}
