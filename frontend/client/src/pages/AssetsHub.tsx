import { useState } from "react";
import { Boxes, Server } from "lucide-react";
import Assets from "./Assets";
import NodesManagement from "./NodesManagement";

type AssetsSection = "assets" | "nodes";

interface AssetsHubProps {
  initialSection?: AssetsSection;
}

export default function AssetsHub({
  initialSection = "assets",
}: AssetsHubProps) {
  const [section, setSection] = useState<AssetsSection>(initialSection);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 p-4 pb-0 sm:p-6 sm:pb-0 lg:px-[30px] lg:pt-[28px]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Infrastructure
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Actifs & nœuds
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Inventaire des équipements et gestion des nœuds de surveillance.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sections des actifs"
          className="inline-flex w-fit flex-wrap items-center gap-0.5 rounded-sm border border-border bg-background p-0.5"
        >
          <button
            type="button"
            role="tab"
            id="assets-tab-assets"
            aria-selected={section === "assets"}
            aria-controls="assets-panel"
            onClick={() => setSection("assets")}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              section === "assets"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
            Actifs
          </button>
          <button
            type="button"
            role="tab"
            id="assets-tab-nodes"
            aria-selected={section === "nodes"}
            aria-controls="assets-panel"
            onClick={() => setSection("nodes")}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              section === "nodes"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Server className="h-3.5 w-3.5" aria-hidden="true" />
            Nœuds
          </button>
        </div>
      </div>

      <div
        role="tabpanel"
        id="assets-panel"
        aria-labelledby={
          section === "assets" ? "assets-tab-assets" : "assets-tab-nodes"
        }
      >
        {section === "assets" ? <Assets /> : <NodesManagement />}
      </div>
    </div>
  );
}
