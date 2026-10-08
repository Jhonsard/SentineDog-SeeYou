import { ShieldAlert, ShieldCheck, Terminal, AlertTriangle } from "lucide-react";

// Structure d'une alerte (Type TypeScript)
export interface NetworkAlert {
  id: string;
  timestamp: string;
  anomaly_type: string;
  source_ip: string;
  dest_ip: string;
  protocol: string;
  severity: "critical" | "warning" | "info";
  action_taken: "blocked" | "detected";
}

interface AlertFeedProps {
  alerts: NetworkAlert[];
}

export function AlertFeed({ alerts }: AlertFeedProps) {
  // Gestionnaire de couleurs selon la sévérité
  const severityStyles = {
    critical: "bg-red-500/10 text-red-400 border-red-500/30",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    info: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  };

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 backdrop-blur-md shadow-2xl p-5 w-full">
      {/* En-tête de la carte */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-zinc-400" />
          <h2 className="text-sm font-mono tracking-wider text-white uppercase font-bold">
            Flux d'Alertes Temps Réel (IDS/IPS)
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">Live Engine</span>
        </div>
      </div>

      {/* Conteneur défilant du tableau */}
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-900 text-zinc-500 text-[11px] font-mono uppercase tracking-wider">
              <th className="pb-3 pl-2">Horodatage</th>
              <th className="pb-3">Type d'Anomalie</th>
              <th className="pb-3">Source → Destination</th>
              <th className="pb-3">Protocole</th>
              <th className="pb-3">Sévérité</th>
              <th className="pb-3 pr-2 text-right">Action IPS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/40 font-mono text-xs">
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-zinc-600 italic">
                  Aucune anomalie détectée sur le réseau de l'ULPGL. Écoute passive...
                </td>
              </tr>
            ) : (
              alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-zinc-900/30 transition-colors group">
                  {/* Horodatage */}
                  <td className="py-3 pl-2 text-zinc-500 font-medium">{alert.timestamp}</td>
                  
                  {/* Type d'Anomalie */}
                  <td className="py-3 text-zinc-200 font-semibold group-hover:text-white">
                    {alert.anomaly_type}
                  </td>
                  
                  {/* Source -> Destination */}
                  <td className="py-3 text-zinc-400">
                    <span className="text-zinc-300">{alert.source_ip}</span>
                    <span className="text-zinc-600 mx-1">→</span>
                    <span className="text-zinc-400">{alert.dest_ip}</span>
                  </td>
                  
                  {/* Protocole */}
                  <td className="py-3">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px]">
                      {alert.protocol}
                    </span>
                  </td>
                  
                  {/* Badge Sévérité */}
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase ${severityStyles[alert.severity]}`}>
                      {alert.severity === 'critical' ? '🔥 Critical' : alert.severity === 'warning' ? '⚠️ Warning' : 'ℹ️ Info'}
                    </span>
                  </td>
                  
                  {/* Action Prise */}
                  <td className="py-3 pr-2 text-right">
                    {alert.action_taken === "blocked" ? (
                      <span className="inline-flex items-center gap-1 text-red-500 bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10 text-[10px] font-bold">
                        <ShieldAlert className="h-3 w-3" /> DROPPED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 text-[10px] font-bold">
                        <ShieldCheck className="h-3 w-3" /> ALERTED
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
