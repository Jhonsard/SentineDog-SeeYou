import { useCallback, useEffect, useState } from "react";

/**
 * Gère les lignes de logs dépliées (plusieurs peuvent rester ouvertes) et
 * l'ouverture automatique via une ancre stable `#log-<id>`.
 */
export function useExpandableLogs(ids: string[], ready: boolean) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const idsKey = ids.join("|");

  const isOpen = useCallback((id: string) => openIds.has(id), [openIds]);

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const close = useCallback((id: string) => {
    setOpenIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Ancre `#log-<id>` : déplie la ligne et la fait défiler une fois les données prêtes.
  useEffect(() => {
    if (!ready) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#log-")) return;

    const id = decodeURIComponent(hash.slice(5));
    if (!idsKey.split("|").includes(id)) return;

    setOpenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const element = document.getElementById(`log-${id}`);
    if (element) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      element.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
  }, [ready, idsKey]);

  return { isOpen, toggle, close };
}
