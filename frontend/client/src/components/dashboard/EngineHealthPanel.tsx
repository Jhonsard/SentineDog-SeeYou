import * as React from "react";
import { Cpu, Play, ShieldCheck, ShieldOff, Square } from "lucide-react";
import { Panel } from "./Panel";
import { StatusRing } from "./StatusRing";
import { Button } from "@/components/ui/button";

interface EngineHealthPanelProps {
  stats: {
    pps: number;
    network_load: string;
    checksum_errors: number;
  };
  health?: number;
  /** Contrôles du moteur, déplacés de la topbar vers ce panneau (D8). */
  isMonitoring?: boolean;
  onStart?: () => void;
  onStop?: () => void;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-muted py-2.5">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="font-data-mono text-[10px] font-semibold text-foreground">
        {value}
      </dd>
    </div>
  );
}

/**
 * Panneau « Moteur IPS » : état de protection, efficacité et métriques réelles.
 * Les commandes Start/Stop restent fonctionnelles et sont regroupées ici.
 */
export function EngineHealthPanel({
  stats,
  health = 0,
  isMonitoring = false,
  onStart,
  onStop,
}: EngineHealthPanelProps) {
  return (
    <Panel className="flex flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-[18px] py-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-foreground" aria-hidden="true" />
            <h3 className="text-[13px] font-semibold text-foreground">
              Moteur IPS
            </h3>
          </div>
          <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
            État de protection Snort
          </p>
        </div>
        <span
          className={
            isMonitoring
              ? "inline-flex items-center gap-1.5 rounded-md bg-foreground px-2 py-1.5 text-[11px] font-semibold text-background"
              : "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11px] font-semibold text-foreground"
          }
        >
          {isMonitoring ? (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isMonitoring ? "Actif" : "À l'arrêt"}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <StatusRing
          value={health}
          size={150}
          stroke={8}
          strokeLinecap="square"
          centerValue={`${Math.round(health)}%`}
          label="Efficacité"
        />
      </div>

      <dl className="px-[18px]">
        <StatRow
          label="Paquets / seconde"
          value={stats.pps.toLocaleString("fr-FR")}
        />
        <StatRow label="Charge réseau" value={stats.network_load} />
        <StatRow
          label="Erreurs de checksum"
          value={stats.checksum_errors.toLocaleString("fr-FR")}
        />
      </dl>

      {(onStart || onStop) && (
        <div className="grid gap-2 px-[18px] py-[18px]">
          <Button
            type="button"
            onClick={onStart}
            disabled={isMonitoring || !onStart}
            className="w-full justify-between"
          >
            <span className="inline-flex items-center gap-2">
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Démarrer le sniffer
            </span>
            <span aria-hidden="true">→</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onStop}
            disabled={!isMonitoring || !onStop}
            className="w-full justify-between"
          >
            <span className="inline-flex items-center gap-2">
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              Arrêter le moteur
            </span>
          </Button>
        </div>
      )}
    </Panel>
  );
}
