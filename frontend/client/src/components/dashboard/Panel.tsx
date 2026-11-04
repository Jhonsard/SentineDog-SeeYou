import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Panneau plat de la maquette SeeYou : bordure 1 px, fond carte, rayon 4 px,
 * aucune ombre. Conteneur commun aux modules de la vue d'ensemble.
 */
export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-md border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
