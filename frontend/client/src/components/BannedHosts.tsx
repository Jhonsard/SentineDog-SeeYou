import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Clock,
  Download,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Unlock,
  X,
} from "lucide-react";
import { Panel } from "@/components/dashboard/Panel";
import { API_ENDPOINTS } from "@/config";
import { useAuth } from "@/contexts/AuthContext";

interface BannedHost {
  id: number;
  source_ip: string;
  alert_type: string;
  timestamp_block: string | null;
  reason: string;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR");
}

function SummaryCard({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <Panel className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 truncate font-data-mono text-2xl font-semibold leading-none text-foreground">
          {value}
        </p>
        <p className="mt-1 truncate text-[10px] text-muted-foreground">
          {note}
        </p>
      </div>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-muted text-foreground">
        {icon}
      </span>
    </Panel>
  );
}

export default function BannedHosts() {
  const { token } = useAuth();
  const [hosts, setHosts] = useState<BannedHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [alertType, setAlertType] = useState("all");
  const [unbanTarget, setUnbanTarget] = useState<BannedHost | null>(null);
  const [unbanning, setUnbanning] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadHosts = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(API_ENDPOINTS.ALERTS.BANNED_HOSTS, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setHosts(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Erreur lors du chargement de la liste noire:", error);
          setLoadError("Impossible de charger le registre des hôtes bloqués.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadHosts();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  useEffect(() => {
    function closeDialog(event: KeyboardEvent) {
      if (event.key === "Escape") setUnbanTarget(null);
    }
    window.addEventListener("keydown", closeDialog);
    return () => window.removeEventListener("keydown", closeDialog);
  }, []);

  // Le backend renvoie une ligne par alerte bloquée : on regroupe par IP en
  // gardant l'alerte la plus récente, pour obtenir un registre lisible.
  const entries = useMemo(() => {
    const byIp = new Map<string, BannedHost>();
    for (const host of hosts) {
      const existing = byIp.get(host.source_ip);
      if (!existing) {
        byIp.set(host.source_ip, host);
        continue;
      }
      const existingTime = existing.timestamp_block
        ? new Date(existing.timestamp_block).getTime()
        : 0;
      const hostTime = host.timestamp_block
        ? new Date(host.timestamp_block).getTime()
        : 0;
      if (hostTime > existingTime) {
        byIp.set(host.source_ip, host);
      }
    }
    return Array.from(byIp.values()).sort((a, b) => {
      const aTime = a.timestamp_block
        ? new Date(a.timestamp_block).getTime()
        : 0;
      const bTime = b.timestamp_block
        ? new Date(b.timestamp_block).getTime()
        : 0;
      return bTime - aTime;
    });
  }, [hosts]);

  const alertTypes = useMemo(
    () =>
      Array.from(
        new Set(entries.map((entry) => entry.alert_type).filter(Boolean)),
      ).sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const haystack =
        `${entry.id} ${entry.source_ip} ${entry.alert_type} ${entry.reason}`.toLowerCase();
      const matchesQuery = needle === "" || haystack.includes(needle);
      const matchesType = alertType === "all" || entry.alert_type === alertType;
      return matchesQuery && matchesType;
    });
  }, [entries, query, alertType]);

  const latest = entries[0]?.timestamp_block ?? null;
  const filtersActive = query.trim() !== "" || alertType !== "all";

  const exportCsv = () => {
    const header = [
      "ID",
      "Adresse IP",
      "Type d'alerte",
      "Motif",
      "Bloqué depuis",
    ];
    const rows = filtered.map((entry) => [
      entry.id,
      entry.source_ip,
      entry.alert_type ?? "",
      entry.reason ?? "",
      formatDate(entry.timestamp_block),
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(";"),
      )
      .join("\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `liste-noire-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const confirmUnban = async () => {
    if (!unbanTarget || !token) return;
    setUnbanning(true);
    try {
      const res = await fetch(API_ENDPOINTS.ALERTS.UNBAN(unbanTarget.id), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ip: unbanTarget.source_ip }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      setHosts((current) =>
        current.filter((host) => host.source_ip !== unbanTarget.source_ip),
      );
      setFeedback({
        tone: "success",
        text: `L'hôte ${unbanTarget.source_ip} a été débloqué.`,
      });
      setUnbanTarget(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "erreur inconnue";
      setFeedback({
        tone: "error",
        text: `Échec du déblocage : ${message}`,
      });
    } finally {
      setUnbanning(false);
    }
  };

  const emptyMessage =
    entries.length === 0
      ? "Aucun hôte bloqué dans le registre."
      : "Aucun hôte ne correspond aux filtres.";

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:px-[30px] lg:py-[28px]">
      {/* En-tête de page */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Politique de blocage
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Liste noire
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Hôtes actuellement bloqués par le moteur IPS.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 self-start rounded-[4px] border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:self-auto"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter CSV
        </button>
      </div>

      {/* Retour d'action */}
      {feedback && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground"
        >
          {feedback.tone === "success" ? (
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">{feedback.text}</span>
          <button
            type="button"
            aria-label="Masquer la confirmation"
            onClick={() => setFeedback(null)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-border text-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Cartes de synthèse */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<ShieldX className="h-4 w-4" aria-hidden="true" />}
          label="Hôtes bloqués"
          value={entries.length}
          note="Adresses distinctes"
        />
        <SummaryCard
          icon={<Activity className="h-4 w-4" aria-hidden="true" />}
          label="Types d'alerte"
          value={alertTypes.length}
          note="Origines distinctes"
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          label="Dernier blocage"
          value={latest ? formatDate(latest) : "—"}
          note="Horodatage backend"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Registre */}
        <div className="overflow-hidden rounded-md border border-border bg-card xl:col-span-2">
          <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 rounded-sm border border-input bg-background px-3 py-1.5 lg:max-w-md lg:flex-1">
              <Search
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une IP, un type ou un motif..."
                aria-label="Rechercher dans la liste noire"
                className="w-full border-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                Type d'alerte
                <select
                  value={alertType}
                  onChange={(event) => setAlertType(event.target.value)}
                  className="rounded-sm border border-input bg-background px-2 py-1 text-[11px] text-foreground"
                >
                  <option value="all">Tous</option>
                  {alertTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              {filtersActive && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setAlertType("all");
                  }}
                  className="rounded-sm px-2 py-1 text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Effacer
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[760px] border-collapse text-[11px]"
              aria-label="Hôtes bloqués"
            >
              <thead>
                <tr className="border-b border-border bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 text-left">Indicateur</th>
                  <th className="px-4 py-2 text-left">Type d'alerte</th>
                  <th className="px-4 py-2 text-left">Motif</th>
                  <th className="px-4 py-2 text-left">Bloqué depuis</th>
                  <th className="px-4 py-2 text-left">Statut</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="h-24 text-center font-data-mono text-xs italic text-muted-foreground"
                    >
                      Chargement du registre...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={6} className="h-24 text-center">
                      <p className="font-data-mono text-xs italic text-muted-foreground">
                        {loadError}
                      </p>
                      <button
                        type="button"
                        onClick={() => setReloadKey((key) => key + 1)}
                        className="mt-2 rounded-sm border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
                      >
                        Réessayer
                      </button>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="h-24 text-center font-data-mono text-xs italic text-muted-foreground"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  filtered.map((entry) => (
                    <tr
                      key={entry.source_ip}
                      className="transition-colors hover:bg-muted/50"
                    >
                      <td className="px-4 py-2">
                        <span className="flex flex-col">
                          <strong className="font-data-mono text-foreground">
                            {entry.source_ip}
                          </strong>
                          <span className="text-[10px] text-muted-foreground">
                            #{entry.id}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-secondary-foreground">
                        {entry.alert_type || "—"}
                      </td>
                      <td className="px-4 py-2 text-secondary-foreground">
                        {entry.reason || "—"}
                      </td>
                      <td className="px-4 py-2 text-secondary-foreground">
                        {formatDate(entry.timestamp_block)}
                      </td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                          Actif
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setUnbanTarget(entry)}
                          aria-label={`Débloquer ${entry.source_ip}`}
                          className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] font-bold uppercase text-foreground transition-colors hover:bg-muted"
                        >
                          <Unlock className="h-3 w-3" aria-hidden="true" />
                          Débloquer
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-1 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">
              {filtered.length} hôte(s) affiché(s) sur {entries.length}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Source : registre Netfilter du backend
            </p>
          </div>
        </div>

        {/* État du registre */}
        <aside className="flex flex-col gap-4">
          <Panel className="p-4">
            <h3 className="text-[13px] font-semibold text-foreground">
              État du registre
            </h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Données lues depuis le backend
            </p>
            <dl className="mt-4 space-y-3 text-[11px]">
              <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                <dt className="text-muted-foreground">Hôtes actifs</dt>
                <dd className="font-data-mono font-semibold text-foreground">
                  {entries.length}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                <dt className="text-muted-foreground">Types d'alerte</dt>
                <dd className="font-data-mono font-semibold text-foreground">
                  {alertTypes.length}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Dernier blocage</dt>
                <dd className="font-data-mono font-semibold text-foreground">
                  {latest ? formatDate(latest) : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
              L'ajout et la suspension manuels ne sont pas exposés par l'API.
              Cette page est un registre en lecture avec déblocage.
            </p>
          </Panel>

          <Panel className="p-4">
            <h3 className="text-[13px] font-semibold text-foreground">
              Types d'alerte
            </h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Répartition des hôtes bloqués
            </p>
            <div className="mt-4 space-y-2">
              {alertTypes.length === 0 ? (
                <p className="text-[11px] italic text-muted-foreground">—</p>
              ) : (
                alertTypes.map((type) => (
                  <div
                    key={type}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="truncate text-secondary-foreground">
                      {type}
                    </span>
                    <span className="font-data-mono font-semibold text-foreground">
                      {
                        entries.filter((entry) => entry.alert_type === type)
                          .length
                      }
                    </span>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </aside>
      </div>

      {/* Confirmation de déblocage */}
      {unbanTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unban-title"
        >
          <div className="w-full max-w-md rounded-md border border-border bg-card p-6">
            <h3
              id="unban-title"
              className="text-sm font-bold uppercase tracking-wider text-foreground"
            >
              Confirmer le déblocage
            </h3>
            <p className="mt-3 text-xs leading-relaxed text-secondary-foreground">
              L'hôte{" "}
              <strong className="font-data-mono text-foreground">
                {unbanTarget.source_ip}
              </strong>{" "}
              sera réintégré au trafic réseau.
            </p>
            <p className="mt-2 text-[11px] italic text-muted-foreground">
              {unbanTarget.reason}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUnbanTarget(null)}
                disabled={unbanning}
                autoFocus
                className="rounded-[4px] border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmUnban}
                disabled={unbanning}
                className="rounded-[4px] bg-foreground px-3 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {unbanning ? "Déblocage..." : "Débloquer l'hôte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
