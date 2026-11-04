import {
  Brain,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Panel } from "./Panel";
import { Button } from "@/components/ui/button";
import { useAI } from "@/contexts/AIContext";

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
 * Panneau « Agent IA » de la vue d'ensemble.
 * Branché sur AIContext : aucune métrique inventée, les champs absents
 * du backend restent affichés « — ».
 */
export function AIPanel() {
  const {
    status,
    aiModeEnabled,
    aiTrained,
    isLoading,
    isBusy,
    toggleAiMode,
    reloadModel,
  } = useAI();

  return (
    <Panel className="flex flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-[18px] py-4">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-foreground" aria-hidden="true" />
            <h3 className="text-[13px] font-semibold text-foreground">
              Agent IA
            </h3>
          </div>
          <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
            Modèle d'apprentissage RL
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          {aiModeEnabled ? (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span
            className={
              aiModeEnabled
                ? "h-1.5 w-1.5 rounded-full bg-foreground"
                : "h-1.5 w-1.5 rounded-full border border-muted-foreground"
            }
            aria-hidden="true"
          />
          {aiModeEnabled ? "En ligne" : "Hors ligne"}
        </span>
      </div>

      <div className="m-[18px] flex items-center gap-3 rounded-md border border-border bg-muted p-3.5">
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-md border border-border bg-background">
          <Brain className="h-6 w-6 text-foreground" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-[11px] text-foreground">
            {aiModeEnabled
              ? "Analyse autonome active"
              : "Analyse autonome inactive"}
          </strong>
          <span className="text-[9px] leading-relaxed text-muted-foreground">
            {aiTrained
              ? "Le modèle surveille le trafic en temps réel."
              : "Le modèle n'est pas encore entraîné ou chargé."}
          </span>
        </div>
      </div>

      <dl className="px-[18px]">
        <StatRow
          label="Décisions totales"
          value={
            status
              ? status.total_decisions.toLocaleString("fr-FR")
              : isLoading
                ? "…"
                : "—"
          }
        />
        <StatRow
          label="Replis (fallback)"
          value={
            status
              ? status.fallback_count.toLocaleString("fr-FR")
              : isLoading
                ? "…"
                : "—"
          }
        />
        <StatRow
          label="Version du modèle"
          value={status?.model_version ?? "—"}
        />
      </dl>

      <div className="mt-auto grid gap-2 px-[18px] py-[18px]">
        <Button
          type="button"
          onClick={() => toggleAiMode()}
          disabled={isBusy || isLoading}
          className="w-full justify-between"
        >
          <span className="inline-flex items-center gap-2">
            {isBusy && (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            )}
            {aiModeEnabled ? "Désactiver l'agent IA" : "Activer l'agent IA"}
          </span>
          <span aria-hidden="true">→</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => reloadModel()}
          disabled={isBusy || isLoading}
          className="w-full justify-between"
        >
          <span className="inline-flex items-center gap-2">
            <RefreshCw
              className={`h-3.5 w-3.5 ${isBusy ? "animate-spin motion-reduce:animate-none" : ""}`}
              aria-hidden="true"
            />
            Recharger le modèle
          </span>
        </Button>
      </div>
    </Panel>
  );
}
