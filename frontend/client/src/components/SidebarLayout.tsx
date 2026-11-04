import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  ShieldAlert,
  ShieldX,
  RefreshCw,
  Gavel,
  Globe,
  Network,
  Server,
  Settings as SettingsIcon,
  Menu,
  ChevronRight,
  FileText,
  Monitor,
  X,
} from "lucide-react";
import { toast } from "sonner";
import MetricCardsGrid from "./MetricCardsGrid";
import { TrafficAttackChart } from "./TrafficAttackChart";
import { AlertFeed } from "./AlertFeed";
import { EngineHealthPanel } from "./dashboard/EngineHealthPanel";
import { RecentAlertsPanel } from "./dashboard/RecentAlertsPanel";
import { AIPanel } from "./dashboard/AIPanel";
import { NetworkTrafficView } from "./dashboard/NetworkTrafficView";
import { EndpointSecurityView } from "./dashboard/EndpointSecurityView";
import { Alert, AttackAverageData, SnifferStats } from "./types";
import BannedHosts from "./BannedHosts";
import Alerts from "../pages/Alerts";
import Reports from "../pages/Reports";
import ThreatIntel from "../pages/ThreatIntel";
import LogsHub from "../pages/LogsHub";
import AssetsHub from "../pages/AssetsHub";
import Settings from "../pages/Settings";
import UserProfile from "../pages/UserProfile";
import { useAuth } from "../contexts/AuthContext";
import { useAI } from "../contexts/AIContext";
import { API_ENDPOINTS } from "../config";

type Tab =
  | "dashboard"
  | "alerts"
  | "reports"
  | "network"
  | "endpoint"
  | "blacklist"
  | "threat-intel"
  | "logs"
  | "assets"
  | "settings"
  | "profile"
  | "nodes";

const PAGE_TITLES: Record<Tab, string> = {
  dashboard: "Vue d'ensemble",
  alerts: "Alertes",
  reports: "Rapports",
  network: "Réseau",
  endpoint: "Terminaux",
  logs: "Journaux",
  blacklist: "Liste noire",
  "threat-intel": "Threat intelligence",
  assets: "Actifs",
  settings: "Paramètres",
  profile: "Profil",
  nodes: "Nœuds",
};

// État d'apparence conservé entre deux rechargements.
const SIDEBAR_KEY = "sidebar-open";
const ACTIVE_TAB_KEY = "active-tab";
const ROUTE_TABS: Tab[] = ["alerts", "reports", "logs", "nodes"];

function getStoredSidebarOpen() {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // Stockage indisponible : repli sur l'état ouvert.
  }
  return true;
}

function getStoredTab(): Tab | null {
  try {
    const stored = window.localStorage.getItem(ACTIVE_TAB_KEY);
    if (!stored || !(stored in PAGE_TITLES)) return null;
    const tab = stored as Tab;
    return ROUTE_TABS.includes(tab) ? null : tab;
  } catch {
    return null;
  }
}

function formatSyncTime() {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

interface SidebarNavItemProps {
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/**
 * Entrée de navigation de la sidebar latérale, conforme à la maquette :
 * pastille pleine (`bg-foreground text-background`) pour l'état actif (D7).
 * Repliée sur desktop, l'icône reste seule ; le libellé passe en `sr-only`
 * (toujours accessible), et reste visible dans le tiroir mobile.
 */
function SidebarNavItem({
  label,
  active,
  collapsed,
  onClick,
  children,
}: SidebarNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center gap-3 rounded-[4px] border px-[11px] py-2.5 text-left text-[13px] font-medium transition-colors ${
        collapsed ? "justify-start md:justify-center" : ""
      } ${
        active
          ? "border-transparent bg-foreground text-background"
          : "border-transparent text-sidebar-foreground hover:border-sidebar-border hover:text-foreground"
      }`}
    >
      {children}
      <span className={collapsed ? "md:sr-only" : ""}>{label}</span>
    </button>
  );
}

interface SidebarLayoutProps {
  initialTab?: Tab;
}

export function SidebarLayout({ initialTab }: SidebarLayoutProps) {
  const { token, logout } = useAuth();
  const { fetchStatus: loadAiStatus } = useAI();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  // --- ÉTATS GLOBALISÉS ET SYNCHRONISÉS ---
  const [isSidebarOpen, setIsSidebarOpen] =
    useState<boolean>(getStoredSidebarOpen);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<Tab>(
    () => initialTab ?? getStoredTab() ?? "dashboard",
  );
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [history, setHistory] = useState<AttackAverageData[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [stats, setStats] = useState<SnifferStats>({
    pps: 0,
    network_load: "0 Mbps",
    checksum_errors: 0,
    total_alerts: 0,
    active_critical: 0,
    blocked_hosts: 0,
    avg_events_min: 0,
  });
  const [showBanModal, setShowBanModal] = useState<{
    id: number;
    ip: string;
    reason: string;
  } | null>(null);

  // Persiste l'état d'apparence : sidebar repliée et onglet actif.
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, String(isSidebarOpen));
    } catch {
      // Stockage indisponible : état conservé en mémoire.
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    if (ROUTE_TABS.includes(currentTab)) return;
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, currentTab);
    } catch {
      // Stockage indisponible : état conservé en mémoire.
    }
  }, [currentTab]);

  // --- CHARGEMENT INITIAL DE L'HISTORIQUE PERMANENT ---
  useEffect(() => {
    const fetchAlertsHistory = async () => {
      if (!token) return;

      try {
        const response = await fetch(
          `${API_ENDPOINTS.ALERTS.HISTORY}?limit=100`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setAlerts(data);
          setLastSync(formatSyncTime());
        } else {
          console.error(
            "Échec de synchronisation avec l'historique permanent de la BDD.",
          );
        }
      } catch (error) {
        console.error(
          "Erreur réseau lors du chargement de l'historique permanent:",
          error,
        );
      }
    };

    fetchAlertsHistory();
  }, [token]);

  // --- RÉCUPÉRATION DE L'HISTORIQUE DES GRAPHES ---
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.ALERTS.STATS_HISTORY);
        if (res.ok) {
          const data = await res.json();
          const adaptedData = data.map((item: any) => ({
            time: item.time,
            normal_count: 0,
            attack_count: item["Moyenne d'Attaques"] || 0,
          }));
          setHistory(adaptedData);
        }
      } catch (e) {
        console.error("Failed to fetch history", e);
      }
    };

    fetchHistory();
  }, []);

  // --- PIPELINE DE STREAMING TEMPS RÉEL OPTIMISÉ ---
  useEffect(() => {
    const wsRef: { current: WebSocket | null } = { current: null };
    let reconnectTimeout: NodeJS.Timeout;
    let heartbeatInterval: NodeJS.Timeout;

    const connectWebSocket = () => {
      if (!isMonitoring) return;

      wsRef.current = new WebSocket(API_ENDPOINTS.WEBSOCKET.ALERTS);

      wsRef.current.onopen = () => {
        if (tokenRef.current) {
          wsRef.current?.send(JSON.stringify({ token: tokenRef.current }));
        }
        setWsConnected(true);
        toast.success("Canal de streaming réseau établi avec le sniffer.");

        heartbeatInterval = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send("ping");
          }
        }, 30000);
      };

      wsRef.current.onmessage = (event) => {
        if (event.data === "pong") return;

        try {
          const newAlert: Alert = JSON.parse(event.data);

          // Utilisation d'une mise à jour fonctionnelle pure
          setAlerts((prevAlerts) => {
            const exists = prevAlerts.some((alt) => alt.id === newAlert.id);
            if (exists) return prevAlerts;

            // On limite à 100 éléments au premier plan pour maintenir les performances fluides
            return [newAlert, ...prevAlerts].slice(0, 100);
          });

          // Mise à jour incrémentale des indicateurs de charge réseau
          setStats((prev) => ({
            ...prev,
            total_alerts: prev.total_alerts + 1,
            active_critical:
              newAlert.severity === "critique" ||
              newAlert.severity === "tres_critique"
                ? prev.active_critical + 1
                : prev.active_critical,
            pps: (newAlert as any).pps || prev.pps,
          }));
        } catch (e) {
          console.error("Erreur de parsing du paquet WebSocket:", e);
        }
      };

      wsRef.current.onclose = (event) => {
        setWsConnected(false);
        clearInterval(heartbeatInterval);

        // 1008 = violation de politique : le backend a rejeté le jeton (expiré/invalide).
        // Réessayer avec le même jeton ne peut pas aboutir, on termine la session.
        if (event.code === 1008) {
          toast.error("Session expirée : veuillez vous reconnecter.");
          logoutRef.current();
          return;
        }

        if (isMonitoring && !event.wasClean) {
          toast.info("Lien réseau perdu. Tentative de reconnexion dans 5s...");
          reconnectTimeout = setTimeout(() => {
            connectWebSocket();
          }, 5000);
        } else {
          toast.info("Flux temps réel suspendu.");
        }
      };
    };

    if (isMonitoring) {
      connectWebSocket();
    } else {
      if (wsRef.current) wsRef.current.close(1000, "Arrêt normal");
      setWsConnected(false);
    }

    return () => {
      if (wsRef.current) wsRef.current.close(1000, "Démontage");
      clearTimeout(reconnectTimeout);
      clearInterval(heartbeatInterval);
    };
  }, [isMonitoring, token]);

  // --- ACTIONNEUR AUTOMATISÉ IPS MÉMOÏSÉ ---
  const handleValidateBlock = useCallback(
    async (alertId: number, sourceIp: string) => {
      if (!token) {
        toast.error("Opération refusée : session administrateur manquante.");
        return;
      }

      try {
        const response = await fetch(
          `${API_ENDPOINTS.ALERTS.VALIDATE_BLOCK(alertId)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        const data = await response.json();

        if (response.ok) {
          toast.success(`Succès IPS : ${data.message}`);
          setAlerts((prevAlerts) =>
            prevAlerts.map((alt) =>
              alt.id === alertId
                ? {
                    ...alt,
                    is_blocked: true,
                    validated_by_admin: true,
                    is_manual_block: true,
                  }
                : alt,
            ),
          );
          setStats((prev) => ({
            ...prev,
            blocked_hosts: prev.blocked_hosts + 1,
          }));
        } else {
          toast.error(
            `Erreur IPS : ${data.detail || "Le pare-feu a rejeté la commande."}`,
          );
        }
      } catch (error) {
        toast.error(
          "Échec critique : le contrôleur de filtrage est injoignable.",
        );
      }
    },
    [token],
  );

  // --- HANDLERS ACTIONS DIRECTES SUR LE PARE-FEU RUTA (KERNEL INTERFACE) ---
  const handleOpenBanModal = async (alertId: number, ip: string) => {
    // Recherche du contexte du paquet pour documenter la justification du ban
    const targetAlert = alerts.find((a) => a.id === alertId);
    const reason = targetAlert
      ? `Interception d'une anomalie de type [${targetAlert.alert_type}] sur le protocole ${targetAlert.protocol}.`
      : "Activité malveillante répétée détectée par le moteur intelligent Snort.";

    setShowBanModal({ id: alertId, ip, reason });
  };

  const confirmBanHost = async () => {
    if (!showBanModal) return;

    // Utiliser le handler centralisé de validation de blocage
    await handleValidateBlock(showBanModal.id, showBanModal.ip);
    setShowBanModal(null);
  };

  // Rafraîchissement global des widgets du tableau de bord (KPIs) depuis le backend.
  const refreshWidgets = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.ALERTS.HISTORY}?limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const total = data.length;
          const critical = data.filter(
            (a: any) =>
              a.severity === "critique" || a.severity === "tres_critique",
          ).length;
          const blocked = data.filter((a: any) => a.is_blocked).length;
          setStats((prev) => ({
            ...prev,
            total_alerts: total,
            active_critical: critical,
            blocked_hosts: blocked || prev.blocked_hosts,
          }));
        }
        setLastSync(formatSyncTime());
      }
    } catch (error) {
      console.error("Échec du rafraîchissement des widgets:", error);
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  // Chargement initial du statut IA au montage et quand le token change
  useEffect(() => {
    if (token) {
      loadAiStatus();
    }
  }, [loadAiStatus, token]);

  const selectTab = (tab: Tab) => {
    setCurrentTab(tab);
    setIsMobileOpen(false);

    // /alerts est un vrai point d'entrée. On synchronise l'URL sans remonter
    // le shell : un remontage couperait le WebSocket et perdrait l'état
    // Start/Stop. Les autres onglets restent sous "/".
    if (typeof window !== "undefined") {
      const target =
        tab === "alerts"
          ? "/alerts"
          : tab === "reports"
            ? "/reports"
            : tab === "logs"
              ? "/logs"
              : tab === "nodes"
                ? "/nodes"
                : "/";
      if (window.location.pathname !== target) {
        window.history.replaceState({}, "", target);
      }
    }
  };

  // Navigation alignée sur la maquette. « Rapports » n'y figure pas :
  // la page est accessible depuis la page Journaux.
  const NAV_GROUPS: {
    title: string;
    items: {
      key: Tab;
      label: string;
      Icon: React.ComponentType<{ className?: string }>;
    }[];
  }[] = [
    {
      title: "Surveillance",
      items: [
        { key: "dashboard", label: "Vue d'ensemble", Icon: LayoutDashboard },
        { key: "alerts", label: "Alertes", Icon: ShieldAlert },
        { key: "network", label: "Réseau", Icon: Network },
        { key: "logs", label: "Journaux", Icon: FileText },
      ],
    },
    {
      title: "Protection",
      items: [
        { key: "blacklist", label: "Liste noire", Icon: ShieldX },
        { key: "threat-intel", label: "Threat intelligence", Icon: Globe },
        { key: "assets", label: "Actifs", Icon: Server },
        { key: "endpoint", label: "Terminaux", Icon: Monitor },
      ],
    },
    {
      title: "Administration",
      items: [{ key: "settings", label: "Paramètres", Icon: SettingsIcon }],
    },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      {/* Overlay mobile (ferme le tiroir au clic) */}
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Fermer la navigation"
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* ================= BARRE LATÉRALE : MAQUETTE 248 PX ================= */}
      <aside
        id="navigation-principale"
        aria-label="Navigation principale"
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 motion-reduce:transition-none md:static md:z-auto md:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${isSidebarOpen ? "md:w-[248px]" : "md:w-[68px]"}`}
      >
        {/* Marque */}
        <div
          className={`flex h-[74px] shrink-0 items-center border-b border-sidebar-border px-5 ${
            isSidebarOpen
              ? "gap-3"
              : "gap-1 md:flex-col md:justify-center md:gap-0.5 md:px-0"
          }`}
        >
          <img
            src="/Seeyou.webp"
            alt="SeeYou"
            className="h-[38px] w-[38px] shrink-0 rounded-[4px] border border-sidebar-border object-cover"
          />
          <div
            className={`flex min-w-0 flex-1 flex-col gap-px ${
              isSidebarOpen ? "" : "md:hidden"
            }`}
          >
            <strong className="truncate text-base font-semibold leading-tight">
              SeeYou
            </strong>
            <span className="text-[9px] font-semibold tracking-[0.14em]">
              SENTINEDOG SOC
            </span>
          </div>
          <button
            type="button"
            aria-label="Fermer la navigation"
            onClick={() => setIsMobileOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-[4px] border border-sidebar-border md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsSidebarOpen((value) => !value)}
            aria-label={
              isSidebarOpen ? "Replier la navigation" : "Déplier la navigation"
            }
            aria-expanded={isSidebarOpen}
            aria-controls="navigation-principale"
            title={
              isSidebarOpen ? "Replier la navigation" : "Déplier la navigation"
            }
            className={`hidden shrink-0 place-items-center rounded-[4px] border border-sidebar-border text-sidebar-foreground transition-colors hover:bg-background/60 md:grid ${
              isSidebarOpen ? "h-8 w-8" : "h-6 w-6"
            }`}
          >
            {isSidebarOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.title} className={index > 0 ? "mt-7" : ""}>
              <p
                className={`mb-2 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                  isSidebarOpen ? "" : "md:hidden"
                }`}
              >
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.key}
                    label={item.label}
                    active={
                      item.key === "assets"
                        ? currentTab === "assets" || currentTab === "nodes"
                        : item.key === "logs"
                          ? currentTab === "logs" || currentTab === "reports"
                          : currentTab === item.key
                    }
                    collapsed={!isSidebarOpen}
                    onClick={() => selectTab(item.key)}
                  >
                    <item.Icon className="h-[18px] w-[18px] shrink-0" />
                  </SidebarNavItem>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Carte utilisateur */}
        <div className="mt-auto border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={() => selectTab("profile")}
            aria-label="Consulter le profil"
            title={isSidebarOpen ? undefined : "Profil"}
            className={`grid w-full items-center gap-2.5 rounded-[4px] px-1 py-2 text-left transition-colors hover:bg-background/60 ${
              isSidebarOpen
                ? "grid-cols-[auto_1fr_auto]"
                : "grid-cols-[auto_1fr_auto] md:grid-cols-1 md:justify-items-center"
            }`}
          >
            <span className="grid h-[34px] w-[34px] place-items-center rounded-full border border-sidebar-border bg-background text-[11px] font-bold text-foreground">
              AS
            </span>
            <span
              className={`flex min-w-0 flex-col ${
                isSidebarOpen ? "" : "md:hidden"
              }`}
            >
              <strong className="truncate text-xs">Admin SOC</strong>
              <span className="truncate text-[10px]">ULPGL Goma</span>
            </span>
            <ChevronRight
              className={`h-4 w-4 ${isSidebarOpen ? "" : "md:hidden"}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </aside>

      {/* ================= CONTENEUR CENTRAL ================= */}
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar 74 px */}
        <header className="flex h-[74px] shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-[30px]">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Ouvrir la navigation"
              onClick={() => setIsMobileOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[4px] border border-border bg-background text-foreground md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-[-0.02em]">
                {PAGE_TITLES[currentTab]}
              </h1>
              <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">
                Centre des opérations de sécurité · ULPGL Goma
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <span className="hidden items-center gap-1.5 text-[11px] font-semibold sm:inline-flex">
              <span
                aria-hidden="true"
                className={`h-[7px] w-[7px] rounded-full border border-current ${
                  wsConnected
                    ? "bg-foreground text-foreground"
                    : "bg-muted-foreground text-muted-foreground"
                }`}
              />
              {wsConnected ? "Systèmes opérationnels" : "Flux interrompu"}
            </span>
            <button
              type="button"
              onClick={() => selectTab("profile")}
              aria-label="Consulter le profil"
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-[11px] font-bold text-foreground transition-colors hover:bg-muted"
            >
              AS
            </button>
          </div>
        </header>

        {/* Contenu */}
        <main className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1500px]">
            {currentTab === "alerts" ? (
              <Alerts alerts={alerts} onValidateBlock={handleOpenBanModal} />
            ) : currentTab === "reports" ? (
              <Reports alerts={alerts} onBackToLogs={() => selectTab("logs")} />
            ) : currentTab === "blacklist" ? (
              <BannedHosts />
            ) : currentTab === "threat-intel" ? (
              <ThreatIntel />
            ) : currentTab === "logs" ? (
              <LogsHub onOpenReports={() => selectTab("reports")} />
            ) : currentTab === "assets" ? (
              <AssetsHub key="assets-hub" initialSection="assets" />
            ) : currentTab === "profile" ? (
              <UserProfile />
            ) : currentTab === "nodes" ? (
              <AssetsHub key="nodes-hub" initialSection="nodes" />
            ) : currentTab === "settings" ? (
              <Settings />
            ) : currentTab === "network" ? (
              <div className="p-4 sm:p-6 lg:px-[30px] lg:py-[28px]">
                <NetworkTrafficView stats={stats} alerts={alerts} />
              </div>
            ) : currentTab === "endpoint" ? (
              <div className="p-4 sm:p-6 lg:px-[30px] lg:py-[28px]">
                <EndpointSecurityView />
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-6 lg:px-[30px] lg:py-[28px]">
                {/* EN-TÊTE DE LA VUE D'ENSEMBLE */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Situation actuelle
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">
                      Bonjour, équipe SOC
                    </h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {lastSync
                        ? `Dernière synchronisation à ${lastSync}`
                        : "Synchronisation en attente"}{" "}
                      ·{" "}
                      {wsConnected
                        ? "flux temps réel actif"
                        : "flux temps réel inactif"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshWidgets}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 self-start rounded-[4px] border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:self-auto"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
                    />
                    Rafraîchir
                  </button>
                </div>

                {/* GRILLE DES COMPOSANTS KPI CARD */}
                <MetricCardsGrid stats={stats} wsConnected={wsConnected} />

                {/* GRILLE DU MILIEU : TÉLÉMÉTRIE + MOTEUR SNORT */}
                <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-3">
                  <div className="flex flex-col xl:col-span-2">
                    <TrafficAttackChart />
                  </div>
                  <div className="flex flex-col xl:col-span-1">
                    <EngineHealthPanel
                      stats={stats}
                      health={94}
                      isMonitoring={isMonitoring}
                      onStart={() => setIsMonitoring(true)}
                      onStop={() => setIsMonitoring(false)}
                    />
                  </div>
                </div>

                {/* GRILLE BASSE : ALERTES RÉCENTES + AGENT IA (maquette) */}
                <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-3">
                  <div className="flex flex-col xl:col-span-2">
                    <RecentAlertsPanel
                      alerts={alerts}
                      onSeeAll={() => selectTab("alerts")}
                    />
                  </div>
                  <div className="flex flex-col xl:col-span-1">
                    <AIPanel />
                  </div>
                </div>

                {/* FLUX DE CONSOLE D'INTERCEPTION DU BAS */}
                <AlertFeed
                  alerts={alerts}
                  wsConnected={wsConnected}
                  onValidateBlock={handleOpenBanModal}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ================= DIALOGUE / MODAL DE CONFIRMATION DE BAN RUTA ================= */}
      {showBanModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border p-6 rounded-md max-w-md w-full shadow-2xl font-mono">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-wider mb-4">
              <Gavel className="h-4 w-4" />
              Confirmation Règle Pare-Feu
            </h3>
            <p className="text-xs text-secondary-foreground mb-4 leading-relaxed">
              Vous allez injecter une règle restrictive définitive de type{" "}
              <span className="text-foreground font-bold underline">DROP</span>{" "}
              dans la configuration réseau de l'ULPGL pour bloquer l'hôte
              suivant :
            </p>
            <div className="bg-background p-3 border border-border rounded-md text-xs font-bold text-foreground mb-4">
              IP CIBLE : {showBanModal.ip}
            </div>
            <p className="text-[11px] text-muted-foreground mb-4 italic">
              {showBanModal.reason}
            </p>
            <div className="flex justify-end gap-3 text-xs font-sans font-semibold">
              <button
                onClick={() => setShowBanModal(null)}
                className="px-4 py-2 bg-muted text-foreground hover:underline transition-colors rounded-md"
              >
                Annuler
              </button>
              <button
                onClick={confirmBanHost}
                className="px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 transition-colors rounded-md font-bold uppercase tracking-wide"
              >
                Bannir l'Hôte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
