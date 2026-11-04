import { BarChart3 } from "lucide-react";
import NetworkLogs from "./NetworkLogs";

interface LogsHubProps {
  onOpenReports: () => void;
}

export default function LogsHub({ onOpenReports }: LogsHubProps) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 p-4 pb-0 sm:p-6 sm:pb-0 lg:px-[30px] lg:pt-[28px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Journaux & audit
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">
              Journaux
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Flux réseau et alertes interceptées.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenReports}
            className="inline-flex items-center gap-2 self-start rounded-[4px] border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted sm:self-auto"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Ouvrir les rapports
          </button>
        </div>
      </div>

      <NetworkLogs />
    </div>
  );
}
