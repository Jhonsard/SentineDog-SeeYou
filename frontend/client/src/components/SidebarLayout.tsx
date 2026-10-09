import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutDashboard, ShieldX, Terminal, RefreshCw, Activity, ShieldAlert, Gavel, Zap, Shield, Globe, Network, Server, Settings as SettingsIcon, Menu, X, User as UserIcon, Server as ServerIcon, Brain, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import MetricCardsGrid from './MetricCardsGrid';
import { TrafficAttackChart } from './TrafficAttackChart';
import { AlertFeed } from './AlertFeed';
import { EngineHealthPanel } from './dashboard/EngineHealthPanel';
import { NetworkTrafficView } from './dashboard/NetworkTrafficView';
import { EndpointSecurityView } from './dashboard/EndpointSecurityView';
import { Alert, AttackAverageData, SnifferStats } from './types';
import BannedHosts from './BannedHosts';
import ThreatIntel from '../pages/ThreatIntel';
import NetworkLogs from '../pages/NetworkLogs';
import Assets from '../pages/Assets';
import Settings from '../pages/Settings';
import UserProfile from '../pages/UserProfile';
import NodesManagement from '../pages/NodesManagement';
import { useAuth } from '../contexts/AuthContext';
import { useAI } from '../contexts/AIContext';
import { API_ENDPOINTS } from '../config';

export function SidebarLayout() {
  const { token } = useAuth();
  const { 
    aiModeEnabled, 
    aiTrained: contextAiTrained, 
    isBusy: aiBusy, 
    isLoading: aiLoading,
    fetchStatus: loadAiStatus, 
    toggleAiMode 
  } = useAI();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  
  // --- ÉTATS GLOBALISÉS ET SYNCHRONISÉS ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [dashboardView, setDashboardView] = useState<"overview" | "network" | "endpoint">("overview");
  const [currentTab, setCurrentTab] = useState<"dashboard" | "blacklist" | "threat-intel" | "network-logs" | "assets" | "settings" | "profile" | "nodes">("dashboard");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [history, setHistory] = useState<AttackAverageData[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [stats, setStats] = useState<SnifferStats>({
    pps: 42500,
    network_load: '780 Mbps',
    checksum_errors: 0,
    total_alerts: 2842,
    active_critical: 14,
    blocked_hosts: 156,
    avg_events_min: 12.8
  });
  const [showBanModal, setShowBanModal] = useState<{ id: number; ip: string; reason: string } | null>(null);

  // --- CHARGEMENT INITIAL DE L'HISTORIQUE PERMANENT ---
  useEffect(() => {
    const fetchAlertsHistory = async () => {
      if (!token) return;
      
      try {
        const response = await fetch(`${API_ENDPOINTS.ALERTS.HISTORY}?limit=100`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        });

        if (response.ok) {
          const data = await response.json();
          setAlerts(data);
        } else {
          console.error("Échec de synchronisation avec l'historique permanent de la BDD.");
        }
      } catch (error) {
        console.error("Erreur réseau lors du chargement de l'historique permanent:", error);
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
          // Adapter le format de données si nécessaire
          const adaptedData = data.map((item: any) => ({
            time: item.time,
            normal_count: 0, // À adapter selon le backend
            attack_count: item["Moyenne d'Attaques"] || 0
          }));
          setHistory(adaptedData);
        } else {
          // Injection de données mockées fidèles à l'historique du SOC de l'ULPGL
          setHistory([
            { time: "09:00", normal_count: 45, attack_count: 5 },
            { time: "09:05", normal_count: 55, attack_count: 12 },
            { time: "09:10", normal_count: 48, attack_count: 8 },
            { time: "09:15", normal_count: 62, attack_count: 22 },
            { time: "09:20", normal_count: 50, attack_count: 15 },
          ]);
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
            const exists = prevAlerts.some(alt => alt.id === newAlert.id);
            if (exists) return prevAlerts;
            
            // On limite à 100 éléments au premier plan pour maintenir les performances fluides
            return [newAlert, ...prevAlerts].slice(0, 100);
          });
          
          // Mise à jour incrémentale des indicateurs de charge réseau
          setStats(prev => ({
            ...prev,
            total_alerts: prev.total_alerts + 1,
            active_critical: newAlert.severity === 'critique' || newAlert.severity === 'tres_critique' 
              ? prev.active_critical + 1 
              : prev.active_critical,
            pps: (newAlert as any).pps || prev.pps
          }));
        } catch (e) {
          console.error("Erreur de parsing du paquet WebSocket:", e);
        }
      };

      wsRef.current.onclose = (event) => {
        setWsConnected(false);
        clearInterval(heartbeatInterval);
        
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
  const handleValidateBlock = useCallback(async (alertId: number, sourceIp: string) => {
    if (!token) {
      toast.error("Opération refusée : session administrateur manquante.");
      return;
    }

    try {
      const response = await fetch(`${API_ENDPOINTS.ALERTS.VALIDATE_BLOCK(alertId)}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Succès IPS : ${data.message}`);
        setAlerts((prevAlerts) =>
          prevAlerts.map((alt) =>
            alt.id === alertId 
              ? { ...alt, is_blocked: true, validated_by_admin: true, is_manual_block: true } 
              : alt
          )
        );
        setStats(prev => ({ ...prev, blocked_hosts: prev.blocked_hosts + 1 }));
      } else {
        toast.error(`Erreur IPS : ${data.detail || "Le pare-feu a rejeté la commande."}`);
      }
    } catch (error) {
      toast.error("Échec critique : le contrôleur de filtrage est injoignable.");
    }
  }, [token]);

  // --- HANDLERS ACTIONS DIRECTES SUR LE PARE-FEU RUTA (KERNEL INTERFACE) ---
  const handleOpenBanModal = async (alertId: number, ip: string) => {
    // Recherche du contexte du paquet pour documenter la justification du ban
    const targetAlert = alerts.find(a => a.id === alertId);
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
            (a: any) => a.severity === "critique" || a.severity === "tres_critique"
          ).length;
          const blocked = data.filter((a: any) => a.is_blocked).length;
          setStats((prev) => ({
            ...prev,
            total_alerts: total,
            active_critical: critical,
            blocked_hosts: blocked || prev.blocked_hosts,
          }));
        }
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

  return (
    <div className="flex min-h-screen bg-void text-[#e1e2ec] antialiased grid-bg">
      
      {/* ================= BARRE LATÉRALE DE GAUCHE : IDENTITÉ ULPGL SOC ================= */}
      <aside className={`border-r border-[#1d2027] bg-[#0c0e12] flex flex-col justify-between shrink-0 font-mono transition-all duration-300 ${
        isSidebarOpen ? 'w-64 px-4 py-6' : 'w-16 px-2 py-6'
      }`}>
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <Terminal className="h-5 w-5 text-[#4d8eff] shrink-0" />
              {isSidebarOpen && (
                <span className="text-xs font-bold tracking-widest text-[#e1e2ec] uppercase">ULPGL_SOC v1.0</span>
              )}
            </div>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="flex items-center justify-center p-1 rounded-sm transition-all hover:bg-[#1d2027] text-[#c2c6d6]"
            >
              {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => { setCurrentTab("dashboard"); setDashboardView("overview"); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-medium transition-all ${
                currentTab === "dashboard"
                  ? "bg-[#4d8eff]/10 text-[#4d8eff] border border-[#4d8eff]/20"
                  : "text-[#c2c6d6] hover:bg-[#1d2027] hover:text-white border border-transparent"
              }`}
            >
              <Activity className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span>Console Principale (SOC)</span>}
            </button>

            <button
              onClick={() => setCurrentTab("threat-intel")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-medium transition-all ${
                currentTab === "threat-intel"
                  ? "bg-[#f97316]/10 text-[#f97316] border border-[#f97316]/20"
                  : "text-[#c2c6d6] hover:bg-[#1d2027] hover:text-white border border-transparent"
              }`}
            >
              <Globe className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span>Threat Intel</span>}
            </button>

            <button
              onClick={() => setCurrentTab("network-logs")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-medium transition-all ${
                currentTab === "network-logs"
                  ? "bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20"
                  : "text-[#c2c6d6] hover:bg-[#1d2027] hover:text-white border border-transparent"
              }`}
            >
              <Network className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span>Network Logs</span>}
            </button>

            <button
              onClick={() => setCurrentTab("assets")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-medium transition-all ${
                currentTab === "assets"
                  ? "bg-[#06b6d4]/10 text-[#06b6d4] border border-[#06b6d4]/20"
                  : "text-[#c2c6d6] hover:bg-[#1d2027] hover:text-white border border-transparent"
              }`}
            >
              <Server className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span>Assets</span>}
            </button>

            <button
              onClick={() => setCurrentTab("blacklist")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-medium transition-all ${
                currentTab === "blacklist"
                  ? "bg-[#ffb4ab]/10 text-[#ffb4ab] border border-[#ffb4ab]/20"
                  : "text-[#c2c6d6] hover:bg-[#1d2027] hover:text-white border border-transparent"
              }`}
            >
              <ShieldX className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span>Hôtes Bloqués (Kernel)</span>}
            </button>

            <button
              onClick={() => setCurrentTab("profile")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-medium transition-all ${
                currentTab === "profile"
                  ? "bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20"
                  : "text-[#c2c6d6] hover:bg-[#1d2027] hover:text-white border border-transparent"
              }`}
            >
              <UserIcon className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span>Profile</span>}
            </button>

            <button
              onClick={() => setCurrentTab("nodes")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-medium transition-all ${
                currentTab === "nodes"
                  ? "bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20"
                  : "text-[#c2c6d6] hover:bg-[#1d2027] hover:text-white border border-transparent"
              }`}
            >
              <ServerIcon className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span>Nodes Management</span>}
            </button>

            <button
              onClick={() => setCurrentTab("settings")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-medium transition-all ${
                currentTab === "settings"
                  ? "bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/20"
                  : "text-[#c2c6d6] hover:bg-[#1d2027] hover:text-white border border-transparent"
              }`}
            >
              <SettingsIcon className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span>Settings</span>}
            </button>
          </nav>
        </div>

        <div className="border-t border-[#1d2027] pt-4 px-2">
          {isSidebarOpen && (
            <div className="text-[10px] text-[#8c909f]">
              Système de Prévention Intelligente
            </div>
          )}
        </div>
      </aside>

      {/* ================= CONTENEUR CENTRAL & FLUX DASHBOARD ================= */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* TOPBAR — glassmorphic, mission-control header */}
        <header className="glass flex justify-between items-center border-b border-edge px-6 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-ui font-bold tracking-wide text-[#e1e2ec]">MONITEUR GLOBAL DU SYSTÈME</h1>
            <div className="h-4 w-px bg-edge"></div>
            <div className="flex items-center gap-1.5 text-[11px] text-secure font-data-mono">
              <span className={`h-1.5 w-1.5 rounded-full ${wsConnected ? "bg-secure animate-pulse" : "bg-zinc-600"}`} />
              Pipeline Live : {wsConnected ? "STREAMING ACTIF" : "IDLE"}
            </div>
          </div>
          
          <div className="flex items-center gap-6 font-data-mono text-[11px] text-[#c2c6d6]">
            <div>PPS: <span className="text-info-soft font-bold">{stats.pps.toLocaleString()}</span></div>
            <div>CHARGE: <span className="text-info-soft font-bold">{stats.network_load}</span></div>

{/* AGENT IA — statut live + bascule rapide */}
            <button
              onClick={() => toggleAiMode()}
              disabled={aiBusy || aiLoading}
              title="Activer / désactiver le mode Agent IA"
              className="flex items-center gap-2 rounded-md border border-edge bg-surface-2/60 px-2.5 py-1.5 font-data-mono text-[11px] text-[#c2c6d6] transition-colors hover:border-info/40 hover:text-info-soft disabled:opacity-60"
            >
              <Brain className="h-3.5 w-3.5 text-purple-400" />
              Agent IA
              <span className={`h-2 w-2 rounded-full ${aiModeEnabled ? (contextAiTrained ? "bg-secure animate-pulse" : "bg-warning") : "bg-zinc-600"}`} />
              <span className={aiModeEnabled ? "text-secure-soft font-bold" : "text-[#8c909f]"}>{aiModeEnabled ? "ACTIF" : "INACTIF"}</span>
              {aiBusy && <Loader2 className="h-3 w-3 animate-spin" />}
            </button>

            {/* MOTEUR D'INTERCEPTION */}
            <div className="flex gap-3 ml-4">
              <button 
                onClick={() => setIsMonitoring(true)} 
                disabled={isMonitoring} 
                className="bg-secure hover:bg-secure/85 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-sans font-medium px-3 py-1.5 rounded-sm transition-colors flex items-center gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" /> Start Sniffer
              </button>
              <button 
                onClick={() => setIsMonitoring(false)} 
                disabled={!isMonitoring} 
                className="bg-critical hover:bg-critical/85 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-sans font-medium px-3 py-1.5 rounded-sm transition-colors flex items-center gap-1.5"
              >
                <Shield className="h-3.5 w-3.5" /> Stop Engine
              </button>
            </div>
          </div>
        </header>

        {/* TOP SELECTION RIBBON — sub-dashboards (client-side, no route change) */}
        {currentTab === "dashboard" && (
          <nav className="flex items-center gap-1 border-b border-edge bg-surface-1/50 px-4 py-2 shrink-0">
            {([
              { id: "overview", label: "Global Overview" },
              { id: "network", label: "Network Traffic" },
              { id: "endpoint", label: "Endpoint Security" },
            ] as const).map((v) => (
              <button
                key={v.id}
                onClick={() => setDashboardView(v.id)}
                className={`font-ui text-xs font-medium px-3 py-1.5 rounded-sm transition-all ${
                  dashboardView === v.id
                    ? "bg-info/10 text-info-soft border border-info/30"
                    : "text-[#8c909f] hover:text-[#e1e2ec] hover:bg-surface-2 border border-transparent"
                }`}
              >
                {v.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-3 font-data-mono text-[10px] text-[#8c909f]">
              <button
                onClick={refreshWidgets}
                disabled={refreshing}
                className="flex items-center gap-1.5 rounded-md border border-edge bg-surface-2/60 px-2 py-1 text-[#c2c6d6] transition-colors hover:border-info/40 hover:text-info-soft disabled:opacity-60"
                title="Rafraîchir les widgets"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </button>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-secure animate-pulse" />
                ULPGL-GOMA
              </span>
            </div>
          </nav>
        )}

        {/* AFFICHAGE CONDITIONNEL DES ONGLETS */}
        {currentTab === "blacklist" ? (
            <BannedHosts />
        ) : currentTab === "threat-intel" ? (
            <ThreatIntel />
        ) : currentTab === "network-logs" ? (
            <NetworkLogs />
        ) : currentTab === "assets" ? (
            <Assets />
        ) : currentTab === "profile" ? (
            <UserProfile />
        ) : currentTab === "nodes" ? (
            <NodesManagement />
        ) : currentTab === "settings" ? (
            <Settings />
        ) : (
          <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
            {dashboardView === "overview" && (
              <>
                {/* GRILLE DES COMPOSANTS KPI CARD */}
                <MetricCardsGrid stats={stats} />

                {/* GRILLE DU MILIEU : TÉLÉMÉTRIE + MOTEUR SNORT */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 items-stretch">
                  <div className="xl:col-span-2 flex flex-col">
                    <TrafficAttackChart />
                  </div>
                  <div className="xl:col-span-1 flex flex-col">
                    <EngineHealthPanel stats={stats} health={94} />
                  </div>
                </div>

                {/* FLUX DE CONSOLE D'INTERCEPTION DU BAS */}
                <AlertFeed
                  alerts={alerts}
                  wsConnected={wsConnected}
                  onValidateBlock={handleOpenBanModal}
                />
              </>
            )}

            {dashboardView === "network" && <NetworkTrafficView />}
            {dashboardView === "endpoint" && <EndpointSecurityView />}
          </main>
        )}
      </div>

      {/* ================= DIALOGUE / MODAL DE CONFIRMATION DE BAN RUTA ================= */}
      {showBanModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#10131a] border border-[#ffb4ab]/30 p-6 rounded-sm max-w-md w-full shadow-2xl font-mono">
            <h3 className="text-sm font-bold text-[#ffb4ab] flex items-center gap-2 uppercase tracking-wider mb-4">
              <Gavel className="h-4 w-4" />
              Confirmation Règle Pare-Feu
            </h3>
            <p className="text-xs text-[#c2c6d6] mb-4 leading-relaxed">
              Vous allez injecter une règle restrictive définitive de type <span className="text-[#ffb4ab] font-bold">DROP</span> dans la configuration réseau de l'ULPGL pour bloquer l'hôte suivant :
            </p>
            <div className="bg-[#0c0e12] p-3 border border-[#1d2027] rounded-sm text-xs font-bold text-[#4d8eff] mb-4">
              IP CIBLE : {showBanModal.ip}
            </div>
            <p className="text-[11px] text-[#8c909f] mb-4 italic">
              {showBanModal.reason}
            </p>
            <div className="flex justify-end gap-3 text-xs font-sans font-semibold">
              <button 
                onClick={() => setShowBanModal(null)}
                className="px-4 py-2 bg-[#1d2027] text-[#e1e2ec] hover:bg-[#282d37] transition-colors rounded-sm"
              >
                Annuler
              </button>
              <button 
                onClick={confirmBanHost}
                className="px-4 py-2 bg-[#ba1a1a] text-white hover:bg-[#93000a] transition-colors rounded-sm font-bold uppercase tracking-wide"
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
