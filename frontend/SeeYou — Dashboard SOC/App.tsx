import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

type IconName =
  | "activity"
  | "alert"
  | "brain"
  | "chevron"
  | "dashboard"
  | "database"
  | "eye"
  | "file"
  | "filter"
  | "globe"
  | "menu"
  | "moon"
  | "network"
  | "search"
  | "settings"
  | "shield"
  | "sun"
  | "user"
  | "x";

interface IconProps {
  name: IconName;
  size?: number;
}

const iconPaths: Record<IconName, ReactNode> = {
  activity: <path d="M3 12h4l2.4-7 4.2 14 2.4-7h5" />,
  alert: (
    <>
      <path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  brain: (
    <>
      <path d="M9.5 4.5A3 3 0 0 0 4 6v.5A3.5 3.5 0 0 0 3 13v1a3 3 0 0 0 3 3 3 3 0 0 0 3 3h1V4.5Z" />
      <path d="M14.5 4.5A3 3 0 0 1 20 6v.5a3.5 3.5 0 0 1 1 6.5v1a3 3 0 0 1-3 3 3 3 0 0 1-3 3h-1V4.5Z" />
      <path d="M6 9h4M14 9h4M7 14h3M14 14h3" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  file: (
    <>
      <path d="M6 2h8l4 4v16H6Z" />
      <path d="M14 2v5h5M9 13h6M9 17h6" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7v5l-4 2v-7Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 9 9 0 1 0 20.5 14.2Z" />,
  network: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="3" y="16" width="6" height="5" rx="1" />
      <rect x="15" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v4M6 16v-4h12v4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1-2.6 2.6-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V21h-3.6v-.2A2 2 0 0 0 9 19a2 2 0 0 0-2.2.4l-.1.1-2.6-2.6.1-.1A2 2 0 0 0 4.6 15a2 2 0 0 0-1.8-1.2H2v-3.6h.8A2 2 0 0 0 4.6 9a2 2 0 0 0-.4-2.2l-.1-.1 2.6-2.6.1.1A2 2 0 0 0 9 4.6a2 2 0 0 0 1.2-1.8V2h3.6v.8A2 2 0 0 0 15 4.6a2 2 0 0 0 2.2-.4l.1-.1 2.6 2.6-.1.1a2 2 0 0 0-.4 2.2 2 2 0 0 0 1.8 1.2h.8v3.6h-.8A2 2 0 0 0 19.4 15Z" />
    </>
  ),
  shield: (
    <path d="M12 3 4 6v5c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6ZM9 12l2 2 4-5" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
};

function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {iconPaths[name]}
    </svg>
  );
}

interface NavItemProps {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function NavItem({ icon, label, active = false, onClick }: NavItemProps) {
  return (
    <button
      className={`nav-item ${active ? "nav-item-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

interface PanelProps {
  children: ReactNode;
  className?: string;
}

function Panel({ children, className = "" }: PanelProps) {
  return <section className={`panel ${className}`}>{children}</section>;
}

interface KpiProps {
  icon: IconName;
  label: string;
  value: string;
  detail: string;
  trend: "up" | "down" | "stable";
}

function KpiCard({ icon, label, value, detail, trend }: KpiProps) {
  const trendLabel =
    trend === "up" ? "En hausse" : trend === "down" ? "En baisse" : "Stable";
  return (
    <Panel className="kpi-card">
      <div className="kpi-heading">
        <span className="icon-box">
          <Icon name={icon} />
        </span>
        <span>{label}</span>
      </div>
      <div className="kpi-value font-data-mono">{value}</div>
      <div className="kpi-footer">
        <span className="status-label">
          <span aria-hidden="true">
            {trend === "up" ? "↗" : trend === "down" ? "↘" : "→"}
          </span>
          {trendLabel}
        </span>
        <span className="muted">{detail}</span>
      </div>
    </Panel>
  );
}

const alertRows = [
  {
    id: "ALT-8291",
    time: "14:32:08",
    severity: "Critique",
    source: "10.14.2.117",
    signature: "Tentative d’exécution de code distant",
    target: "SRV-WEB-02",
  },
  {
    id: "ALT-8290",
    time: "14:28:41",
    severity: "Élevée",
    source: "185.220.101.42",
    signature: "Balayage de ports TCP détecté",
    target: "FW-EDGE-01",
  },
  {
    id: "ALT-8289",
    time: "14:21:16",
    severity: "Moyenne",
    source: "10.14.8.23",
    signature: "Requête DNS anormale",
    target: "DNS-CORE-01",
  },
  {
    id: "ALT-8288",
    time: "14:15:03",
    severity: "Faible",
    source: "10.14.3.89",
    signature: "Échec d’authentification répété",
    target: "AUTH-01",
  },
  {
    id: "ALT-8287",
    time: "13:58:44",
    severity: "Élevée",
    source: "45.83.64.12",
    signature: "Charge utile SQL détectée",
    target: "SRV-APP-01",
  },
  {
    id: "ALT-8286",
    time: "13:42:19",
    severity: "Moyenne",
    source: "10.14.5.74",
    signature: "Volume de transfert inhabituel",
    target: "NAS-BACKUP-01",
  },
  {
    id: "ALT-8285",
    time: "13:31:02",
    severity: "Faible",
    source: "10.14.6.31",
    signature: "Certificat TLS bientôt expiré",
    target: "MAIL-01",
  },
  {
    id: "ALT-8284",
    time: "13:18:57",
    severity: "Critique",
    source: "194.165.16.11",
    signature: "Communication avec un serveur C2",
    target: "WKST-ADMIN-04",
  },
];

const chartPoints =
  "0,81 45,72 90,76 135,48 180,58 225,29 270,43 315,18 360,35 405,20 450,26 500,9";
const chartArea = `0,100 ${chartPoints} 500,100`;

interface AlertsPageProps {
  onBackToOverview: () => void;
}

function AlertsPage({ onBackToOverview }: AlertsPageProps) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("Toutes");
  const [status, setStatus] = useState("Toutes");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>("ALT-8291");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    function closeDetail(event: KeyboardEvent) {
      if (event.key === "Escape") setExpandedId(null);
    }
    window.addEventListener("keydown", closeDetail);
    return () => window.removeEventListener("keydown", closeDetail);
  }, []);

  const filteredRows = useMemo(
    () =>
      alertRows
        .map((alert, index) => {
          const alertStatus =
            index % 3 === 0
              ? "À traiter"
              : index % 3 === 1
                ? "En analyse"
                : "Bloquée";
          return {
            ...alert,
            id:
              currentPage === 1
                ? alert.id
                : `ALT-${8291 - ((currentPage - 1) * alertRows.length + index)}`,
            status: alertStatus,
          };
        })
        .filter((alert) => {
          const matchesQuery =
            `${alert.id} ${alert.source} ${alert.signature} ${alert.target}`
              .toLowerCase()
              .includes(query.toLowerCase());
          const matchesSeverity =
            severity === "Toutes" || alert.severity === severity;
          const matchesStatus = status === "Toutes" || alert.status === status;
          return matchesQuery && matchesSeverity && matchesStatus;
        }),
    [currentPage, query, severity, status],
  );

  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((alert) => selectedIds.includes(alert.id));

  function toggleAll() {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !filteredRows.some((alert) => alert.id === id)),
      );
      return;
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...filteredRows.map((alert) => alert.id)]),
    ]);
  }

  function toggleAlert(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  return (
    <div className="dashboard alerts-page">
      <div className="alerts-page-header">
        <div>
          <button
            className="breadcrumb-button"
            onClick={onBackToOverview}
            type="button"
          >
            Vue d’ensemble <span aria-hidden="true">/</span>
          </button>
          <p className="eyebrow">CENTRE DE DÉTECTION</p>
          <h2>Alertes de sécurité</h2>
          <p className="muted">
            Analysez, qualifiez et traitez les événements détectés par Snort.
          </p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button">
            <Icon name="file" size={16} /> Exporter
          </button>
          <button className="primary-button inline-primary" type="button">
            <Icon name="activity" size={16} /> Actualiser
          </button>
        </div>
      </div>

      <div className="alert-summary-grid">
        <Panel className="alert-summary-card">
          <span className="summary-icon">
            <Icon name="alert" />
          </span>
          <div>
            <span>Alertes totales</span>
            <strong className="font-data-mono">248</strong>
          </div>
          <span className="summary-note">24 dernières heures</span>
        </Panel>
        <Panel className="alert-summary-card">
          <span className="summary-icon solid">
            <Icon name="alert" />
          </span>
          <div>
            <span>Critiques</span>
            <strong className="font-data-mono">12</strong>
          </div>
          <span className="summary-note">4 non traitées</span>
        </Panel>
        <Panel className="alert-summary-card">
          <span className="summary-icon">
            <Icon name="eye" />
          </span>
          <div>
            <span>En analyse</span>
            <strong className="font-data-mono">31</strong>
          </div>
          <span className="summary-note">Par l’équipe SOC</span>
        </Panel>
        <Panel className="alert-summary-card">
          <span className="summary-icon">
            <Icon name="shield" />
          </span>
          <div>
            <span>Bloquées</span>
            <strong className="font-data-mono">193</strong>
          </div>
          <span className="summary-note">Efficacité 98,7 %</span>
        </Panel>
      </div>

      <Panel className="alerts-workspace">
        <div
          className="alerts-tabs"
          role="tablist"
          aria-label="État des alertes"
        >
          <button
            aria-selected={status === "Toutes"}
            className={status === "Toutes" ? "active" : ""}
            onClick={() => setStatus("Toutes")}
            role="tab"
            type="button"
          >
            Toutes <span>248</span>
          </button>
          <button
            aria-selected={status === "À traiter"}
            className={status === "À traiter" ? "active" : ""}
            onClick={() => setStatus("À traiter")}
            role="tab"
            type="button"
          >
            À traiter <span>24</span>
          </button>
          <button
            aria-selected={status === "En analyse"}
            className={status === "En analyse" ? "active" : ""}
            onClick={() => setStatus("En analyse")}
            role="tab"
            type="button"
          >
            En analyse <span>31</span>
          </button>
          <button
            aria-selected={status === "Bloquée"}
            className={status === "Bloquée" ? "active" : ""}
            onClick={() => setStatus("Bloquée")}
            role="tab"
            type="button"
          >
            Résolues <span>193</span>
          </button>
        </div>

        <div className="alerts-toolbar">
          <label className="search-field alerts-search">
            <span className="sr-only">Rechercher une alerte</span>
            <Icon name="search" size={16} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ID, IP, signature ou cible…"
              value={query}
            />
          </label>
          <div className="filter-group">
            <label>
              <span className="sr-only">Filtrer par sévérité</span>
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option>Toutes</option>
                <option>Critique</option>
                <option>Élevée</option>
                <option>Moyenne</option>
                <option>Faible</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filtrer par statut</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option>Toutes</option>
                <option>À traiter</option>
                <option>En analyse</option>
                <option>Bloquée</option>
              </select>
            </label>
            <button
              className="clear-filters"
              disabled={
                query === "" && severity === "Toutes" && status === "Toutes"
              }
              onClick={() => {
                setQuery("");
                setSeverity("Toutes");
                setStatus("Toutes");
              }}
              type="button"
            >
              Effacer
            </button>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="bulk-actions" role="status">
            <strong>
              {selectedIds.length} sélectionnée
              {selectedIds.length > 1 ? "s" : ""}
            </strong>
            <span />
            <button onClick={() => setSelectedIds([])} type="button">
              <Icon name="eye" size={15} /> Marquer en analyse
            </button>
            <button onClick={() => setSelectedIds([])} type="button">
              <Icon name="shield" size={15} /> Marquer résolue
            </button>
            <button
              aria-label="Annuler la sélection"
              onClick={() => setSelectedIds([])}
              type="button"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        )}

        <div className="table-scroll alerts-table">
          <table>
            <thead>
              <tr>
                <th className="check-cell">
                  <input
                    aria-label="Sélectionner toutes les alertes visibles"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    type="checkbox"
                  />
                </th>
                <th>ID / Heure</th>
                <th>Sévérité</th>
                <th>Source</th>
                <th>Signature</th>
                <th>Cible</th>
                <th>Statut</th>
                <th>
                  <span className="sr-only">Détails</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((alert) => {
                const rowStatus = alert.status;
                const isExpanded = expandedId === alert.id;
                return (
                  <Fragment key={alert.id}>
                    <tr className={isExpanded ? "expanded-row" : ""}>
                      <td className="check-cell">
                        <input
                          aria-label={`Sélectionner ${alert.id}`}
                          checked={selectedIds.includes(alert.id)}
                          onChange={() => toggleAlert(alert.id)}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <span className="alert-identity">
                          <strong className="font-data-mono">{alert.id}</strong>
                          <span className="font-data-mono">{alert.time}</span>
                        </span>
                      </td>
                      <td>
                        <span
                          className={`severity severity-${alert.severity.toLowerCase().replace("é", "e")}`}
                        >
                          <Icon name="alert" size={13} />
                          {alert.severity}
                        </span>
                      </td>
                      <td className="font-data-mono">{alert.source}</td>
                      <td>{alert.signature}</td>
                      <td className="font-data-mono">{alert.target}</td>
                      <td>
                        <span
                          className={`row-status status-${rowStatus.toLowerCase().replace("à ", "").replace(" ", "-")}`}
                        >
                          <span aria-hidden="true" />
                          {rowStatus}
                        </span>
                      </td>
                      <td>
                        <button
                          aria-controls={`detail-${alert.id}`}
                          aria-expanded={isExpanded}
                          aria-label={`${
                            isExpanded ? "Masquer" : "Afficher"
                          } le détail de ${alert.id}`}
                          className="row-action"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : alert.id)
                          }
                          type="button"
                        >
                          <Icon name="chevron" size={16} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="detail-row" id={`detail-${alert.id}`}>
                        <td colSpan={8}>
                          <div className="alert-detail-grid">
                            <div>
                              <span>Classification</span>
                              <strong>Tentative d’intrusion réseau</strong>
                            </div>
                            <div>
                              <span>Protocole</span>
                              <strong className="font-data-mono">
                                TCP / 443
                              </strong>
                            </div>
                            <div>
                              <span>Capteur</span>
                              <strong className="font-data-mono">
                                SENSOR-GOMA-02
                              </strong>
                            </div>
                            <div>
                              <span>Action IPS</span>
                              <strong>Paquet bloqué</strong>
                            </div>
                            <div className="detail-description">
                              <span>Observation</span>
                              <strong>
                                Le trafic correspond à une règle Snort active.
                                Une vérification de l’hôte source est
                                recommandée.
                              </strong>
                            </div>
                            <button className="secondary-button" type="button">
                              Ouvrir l’incident{" "}
                              <span aria-hidden="true">→</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredRows.length === 0 && (
            <div className="alerts-empty">
              <span>
                <Icon name="search" size={22} />
              </span>
              <strong>Aucune alerte trouvée</strong>
              <p>Modifiez les filtres ou élargissez votre recherche.</p>
            </div>
          )}
        </div>
        <div className="alerts-pagination">
          <span className="muted">
            Affichage de{" "}
            {filteredRows.length === 0
              ? 0
              : (currentPage - 1) * alertRows.length + 1}{" "}
            à{" "}
            {Math.min(
              (currentPage - 1) * alertRows.length + filteredRows.length,
              248,
            )}{" "}
            sur 248 alertes
          </span>
          <div>
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              type="button"
            >
              Précédent
            </button>
            {[1, 2, 3].map((page) => (
              <button
                aria-current={currentPage === page ? "page" : undefined}
                className={currentPage === page ? "current" : ""}
                key={page}
                onClick={() => setCurrentPage(page)}
                type="button"
              >
                {page}
              </button>
            ))}
            <span>…</span>
            <button
              className={currentPage === 31 ? "current" : ""}
              onClick={() => setCurrentPage(31)}
              type="button"
            >
              31
            </button>
            <button
              disabled={currentPage === 31}
              onClick={() => setCurrentPage((page) => Math.min(31, page + 1))}
              type="button"
            >
              Suivant
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

const networkFlows = [
  {
    id: "FLW-48291",
    source: "10.14.2.117",
    sourcePort: "54182",
    destination: "172.217.20.78",
    destinationPort: "443",
    protocol: "HTTPS",
    volume: "18,4 Mo",
    duration: "04:12",
    state: "Autorisé",
  },
  {
    id: "FLW-48290",
    source: "10.14.8.23",
    sourcePort: "49211",
    destination: "10.14.0.53",
    destinationPort: "53",
    protocol: "DNS",
    volume: "842 Ko",
    duration: "00:18",
    state: "Analysé",
  },
  {
    id: "FLW-48289",
    source: "185.220.101.42",
    sourcePort: "38204",
    destination: "10.14.0.10",
    destinationPort: "22",
    protocol: "SSH",
    volume: "14 Ko",
    duration: "00:02",
    state: "Bloqué",
  },
  {
    id: "FLW-48288",
    source: "10.14.3.89",
    sourcePort: "52814",
    destination: "10.14.1.25",
    destinationPort: "445",
    protocol: "SMB",
    volume: "4,7 Mo",
    duration: "01:46",
    state: "Autorisé",
  },
  {
    id: "FLW-48287",
    source: "10.14.6.31",
    sourcePort: "60112",
    destination: "142.250.74.110",
    destinationPort: "443",
    protocol: "TLS",
    volume: "9,2 Mo",
    duration: "02:35",
    state: "Autorisé",
  },
];

interface NetworkChartSeries {
  inbound: string;
  outbound: string;
}

const networkChartData: Record<string, NetworkChartSeries> = {
  "1 h": {
    inbound:
      "0,78 42,66 84,71 126,53 168,61 210,38 252,45 294,25 336,34 378,18 420,29 462,12 500,20",
    outbound:
      "0,89 42,83 84,85 126,74 168,78 210,65 252,69 294,58 336,64 378,51 420,57 462,47 500,53",
  },
  "6 h": {
    inbound:
      "0,73 42,61 84,68 126,49 168,55 210,32 252,42 294,18 336,29 378,25 420,35 462,19 500,27",
    outbound:
      "0,87 42,78 84,81 126,69 168,73 210,59 252,65 294,51 336,56 378,48 420,55 462,43 500,49",
  },
  "24 h": {
    inbound:
      "0,81 42,69 84,75 126,58 168,63 210,40 252,48 294,28 336,37 378,20 420,31 462,17 500,24",
    outbound:
      "0,91 42,84 84,86 126,76 168,80 210,68 252,72 294,61 336,66 378,55 420,61 462,50 500,56",
  },
};

function NetworkPage() {
  const [range, setRange] = useState("1 h");
  const [query, setQuery] = useState("");
  const [protocol, setProtocol] = useState("Tous");
  const [expandedFlow, setExpandedFlow] = useState<string | null>(null);

  const visibleFlows = useMemo(
    () =>
      networkFlows.filter((flow) => {
        const matchesQuery =
          `${flow.id} ${flow.source} ${flow.destination} ${flow.protocol}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return (
          matchesQuery && (protocol === "Tous" || flow.protocol === protocol)
        );
      }),
    [protocol, query],
  );

  const chart = networkChartData[range];

  return (
    <div className="dashboard network-page">
      <div className="network-page-header">
        <div>
          <p className="eyebrow">OBSERVABILITÉ RÉSEAU</p>
          <h2>Trafic réseau</h2>
          <p className="muted">
            Supervision des flux, protocoles et capteurs en temps réel.
          </p>
        </div>
        <div className="network-live">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>Capture en direct</strong>
            <span>Dernier paquet il y a moins d’une seconde</span>
          </div>
        </div>
      </div>

      <div className="network-kpi-grid">
        <KpiCard
          detail="+8,2 % sur 1 h"
          icon="activity"
          label="Débit entrant"
          trend="up"
          value="842 Mb/s"
        />
        <KpiCard
          detail="-2,4 % sur 1 h"
          icon="network"
          label="Débit sortant"
          trend="down"
          value="318 Mb/s"
        />
        <KpiCard
          detail="sur 8 192 max."
          icon="globe"
          label="Connexions actives"
          trend="stable"
          value="2 847"
        />
        <KpiCard
          detail="seuil normal < 1 %"
          icon="shield"
          label="Perte de paquets"
          trend="stable"
          value="0,18 %"
        />
      </div>

      <div className="network-main-grid">
        <Panel className="traffic-panel">
          <div className="panel-heading">
            <div>
              <div className="title-with-icon">
                <Icon name="activity" />
                <h3>Débit en temps réel</h3>
              </div>
              <p className="muted">Volume agrégé sur toutes les interfaces</p>
            </div>
            <div
              className="period-control compact-period"
              aria-label="Période du trafic"
            >
              {["1 h", "6 h", "24 h"].map((item) => (
                <button
                  aria-pressed={range === item}
                  className={range === item ? "selected" : ""}
                  key={item}
                  onClick={() => setRange(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="traffic-legend">
            <span>
              <i className="legend-line inbound" /> Entrant{" "}
              <strong className="font-data-mono">842 Mb/s</strong>
            </span>
            <span>
              <i className="legend-line outbound" /> Sortant{" "}
              <strong className="font-data-mono">318 Mb/s</strong>
            </span>
            <span className="muted">
              Pic : <strong className="font-data-mono">1,24 Gb/s</strong>
            </span>
          </div>
          <div className="network-chart-wrap">
            <div className="network-y-axis font-data-mono">
              <span>1,2 G</span>
              <span>900 M</span>
              <span>600 M</span>
              <span>300 M</span>
              <span>0</span>
            </div>
            <svg
              aria-label={`Trafic entrant et sortant sur ${range}`}
              className="network-line-chart"
              preserveAspectRatio="none"
              role="img"
              viewBox="0 0 500 105"
            >
              <line x1="0" x2="500" y1="20" y2="20" />
              <line x1="0" x2="500" y1="40" y2="40" />
              <line x1="0" x2="500" y1="60" y2="60" />
              <line x1="0" x2="500" y1="80" y2="80" />
              <polyline className="inbound-line" points={chart.inbound} />
              <polyline className="outbound-line" points={chart.outbound} />
            </svg>
          </div>
          <div className="network-x-axis font-data-mono">
            <span>-60 min</span>
            <span>-50 min</span>
            <span>-40 min</span>
            <span>-30 min</span>
            <span>-20 min</span>
            <span>-10 min</span>
            <span>Maintenant</span>
          </div>
        </Panel>

        <Panel className="protocol-panel">
          <div className="panel-heading">
            <div>
              <div className="title-with-icon">
                <Icon name="globe" />
                <h3>Protocoles</h3>
              </div>
              <p className="muted">Répartition du trafic</p>
            </div>
            <button
              aria-label="Options des protocoles"
              className="row-action"
              type="button"
            >
              •••
            </button>
          </div>
          <div className="protocol-total">
            <span>Volume analysé</span>
            <strong className="font-data-mono">5,86 To</strong>
          </div>
          <div className="protocol-list">
            {[
              ["HTTPS", 44, "2,58 To"],
              ["QUIC", 21, "1,23 To"],
              ["DNS", 14, "820 Go"],
              ["SSH", 9, "527 Go"],
              ["Autres", 12, "703 Go"],
            ].map(([name, value, volume]) => (
              <div className="protocol-row" key={name}>
                <div>
                  <strong>{name}</strong>
                  <span className="font-data-mono">{volume}</span>
                </div>
                <progress
                  aria-label={`${name} : ${value} %`}
                  max="100"
                  value={value}
                />
                <span className="font-data-mono">{value} %</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="network-secondary-grid">
        <Panel className="sensors-panel">
          <div className="panel-heading">
            <div>
              <div className="title-with-icon">
                <Icon name="network" />
                <h3>Capteurs réseau</h3>
              </div>
              <p className="muted">12 capteurs · 12 opérationnels</p>
            </div>
            <span className="status-label">
              <span className="status-dot" /> Tous en ligne
            </span>
          </div>
          <div className="sensor-list">
            {[
              [
                "SENSOR-GOMA-01",
                "Passerelle principale",
                "10.14.0.2",
                "426 Mb/s",
                "34 %",
              ],
              [
                "SENSOR-GOMA-02",
                "Réseau académique",
                "10.14.1.2",
                "318 Mb/s",
                "28 %",
              ],
              [
                "SENSOR-GOMA-03",
                "Zone serveurs",
                "10.14.2.2",
                "247 Mb/s",
                "22 %",
              ],
              [
                "SENSOR-GOMA-04",
                "Réseau administratif",
                "10.14.3.2",
                "169 Mb/s",
                "16 %",
              ],
            ].map(([name, zone, ip, rate, load]) => (
              <button className="sensor-row" key={name} type="button">
                <span className="sensor-state">
                  <Icon name="network" size={16} />
                </span>
                <span>
                  <strong>{name}</strong>
                  <small>{zone}</small>
                </span>
                <span className="font-data-mono">{ip}</span>
                <span>
                  <strong className="font-data-mono">{rate}</strong>
                  <small>Trafic</small>
                </span>
                <span>
                  <strong className="font-data-mono">{load}</strong>
                  <small>Charge</small>
                </span>
                <Icon name="chevron" size={15} />
              </button>
            ))}
          </div>
          <div className="panel-footer">
            <span className="muted">Dernière synchronisation : 14:42:08</span>
            <button className="text-button" type="button">
              Tous les capteurs <span aria-hidden="true">→</span>
            </button>
          </div>
        </Panel>

        <Panel className="interfaces-panel">
          <div className="panel-heading">
            <div>
              <div className="title-with-icon">
                <Icon name="database" />
                <h3>Interfaces</h3>
              </div>
              <p className="muted">Utilisation des liens</p>
            </div>
          </div>
          <div className="interface-list">
            {[
              ["WAN-01", "Fibre principale", 84, "1 Gb/s"],
              ["LAN-CORE", "Cœur de réseau", 62, "10 Gb/s"],
              ["DMZ-01", "Zone publique", 38, "1 Gb/s"],
            ].map(([name, label, usage, capacity]) => (
              <div className="interface-row" key={name}>
                <div>
                  <strong>{name}</strong>
                  <span>{label}</span>
                </div>
                <div>
                  <span className="font-data-mono">{usage} %</span>
                  <span className="font-data-mono">{capacity}</span>
                </div>
                <progress
                  aria-label={`${name} utilisé à ${usage} %`}
                  max="100"
                  value={usage}
                />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="flows-panel">
        <div className="panel-heading flows-heading">
          <div>
            <div className="title-with-icon">
              <Icon name="activity" />
              <h3>Flux actifs</h3>
            </div>
            <p className="muted">Connexions observées en temps réel</p>
          </div>
          <div className="table-actions">
            <label className="search-field flow-search">
              <span className="sr-only">Rechercher un flux</span>
              <Icon name="search" size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="IP, protocole ou identifiant"
                value={query}
              />
            </label>
            <label className="protocol-filter">
              <span className="sr-only">Filtrer les flux par protocole</span>
              <select
                onChange={(event) => setProtocol(event.target.value)}
                value={protocol}
              >
                <option>Tous</option>
                <option>HTTPS</option>
                <option>DNS</option>
                <option>SSH</option>
                <option>SMB</option>
                <option>TLS</option>
              </select>
            </label>
          </div>
        </div>
        <div className="table-scroll flows-table">
          <table>
            <thead>
              <tr>
                <th>Flux</th>
                <th>Source</th>
                <th>Destination</th>
                <th>Protocole</th>
                <th>Volume</th>
                <th>Durée</th>
                <th>Décision</th>
                <th>
                  <span className="sr-only">Détails</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleFlows.map((flow) => {
                const isExpanded = expandedFlow === flow.id;
                return (
                  <Fragment key={flow.id}>
                    <tr className={isExpanded ? "expanded-row" : ""}>
                      <td className="font-data-mono">{flow.id}</td>
                      <td>
                        <span className="endpoint font-data-mono">
                          {flow.source}
                          <small>:{flow.sourcePort}</small>
                        </span>
                      </td>
                      <td>
                        <span className="endpoint font-data-mono">
                          {flow.destination}
                          <small>:{flow.destinationPort}</small>
                        </span>
                      </td>
                      <td>
                        <span className="protocol-badge">{flow.protocol}</span>
                      </td>
                      <td className="font-data-mono">{flow.volume}</td>
                      <td className="font-data-mono">{flow.duration}</td>
                      <td>
                        <span
                          className={`flow-decision decision-${flow.state.toLowerCase().replace("é", "e")}`}
                        >
                          <span aria-hidden="true" />
                          {flow.state}
                        </span>
                      </td>
                      <td>
                        <button
                          aria-controls={`flow-${flow.id}`}
                          aria-expanded={isExpanded}
                          aria-label={`${
                            isExpanded ? "Masquer" : "Afficher"
                          } le flux ${flow.id}`}
                          className="row-action"
                          onClick={() =>
                            setExpandedFlow(isExpanded ? null : flow.id)
                          }
                          type="button"
                        >
                          <Icon name="chevron" size={16} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="flow-detail-row" id={`flow-${flow.id}`}>
                        <td colSpan={8}>
                          <div>
                            <span>
                              <small>Interface</small>
                              <strong className="font-data-mono">eth0</strong>
                            </span>
                            <span>
                              <small>Paquets</small>
                              <strong className="font-data-mono">12 481</strong>
                            </span>
                            <span>
                              <small>Première observation</small>
                              <strong className="font-data-mono">
                                14:37:56
                              </strong>
                            </span>
                            <span>
                              <small>Risque</small>
                              <strong>Faible · trafic habituel</strong>
                            </span>
                            <button className="secondary-button" type="button">
                              Inspecter le flux{" "}
                              <span aria-hidden="true">→</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {visibleFlows.length === 0 && (
            <p className="empty-state">
              Aucun flux ne correspond à ces critères.
            </p>
          )}
        </div>
        <div className="panel-footer">
          <span className="muted">
            {visibleFlows.length} flux affichés · mise à jour automatique
          </span>
          <button className="text-button" type="button">
            Ouvrir l’analyse réseau <span aria-hidden="true">→</span>
          </button>
        </div>
      </Panel>
    </div>
  );
}

interface RecurringAnomaly {
  name: string;
  category: string;
  occurrences: number;
  previous: number;
  severity: string;
  source: string;
  lastSeen: string;
}

interface GeneratedReport {
  id: string;
  name: string;
  period: string;
  createdAt: string;
  size: string;
}

const recurringAnomalies: RecurringAnomaly[] = [
  {
    name: "Échecs d’authentification répétés",
    category: "Identité",
    occurrences: 84,
    previous: 61,
    severity: "Élevée",
    source: "AUTH-01",
    lastSeen: "Aujourd’hui, 14:15",
  },
  {
    name: "Balayage séquentiel de ports",
    category: "Reconnaissance",
    occurrences: 47,
    previous: 52,
    severity: "Élevée",
    source: "FW-EDGE-01",
    lastSeen: "Aujourd’hui, 14:28",
  },
  {
    name: "Requêtes DNS à forte entropie",
    category: "Réseau",
    occurrences: 31,
    previous: 18,
    severity: "Moyenne",
    source: "DNS-CORE-01",
    lastSeen: "Aujourd’hui, 14:21",
  },
  {
    name: "Volume sortant inhabituel",
    category: "Exfiltration",
    occurrences: 19,
    previous: 12,
    severity: "Critique",
    source: "SENSOR-GOMA-03",
    lastSeen: "Hier, 23:42",
  },
  {
    name: "Certificats TLS proches de l’expiration",
    category: "Configuration",
    occurrences: 12,
    previous: 12,
    severity: "Faible",
    source: "SENSOR-GOMA-01",
    lastSeen: "Hier, 18:05",
  },
];

const initialReports: GeneratedReport[] = [
  {
    id: "RPT-2025-048",
    name: "Bilan hebdomadaire · Semaine 48",
    period: "25 nov. – 1 déc. 2025",
    createdAt: "2 déc. 2025, 08:00",
    size: "1,8 Mo",
  },
  {
    id: "RPT-2025-011",
    name: "Bilan mensuel · Novembre 2025",
    period: "1 – 30 novembre 2025",
    createdAt: "1 déc. 2025, 08:00",
    size: "4,2 Mo",
  },
  {
    id: "RPT-2025-047",
    name: "Bilan hebdomadaire · Semaine 47",
    period: "18 – 24 novembre 2025",
    createdAt: "25 nov. 2025, 08:00",
    size: "1,6 Mo",
  },
];

function exportReportCsv(periodLabel: string, anomalies: RecurringAnomaly[]) {
  const rows = [
    ["Bilan SOC SeeYou", periodLabel],
    [],
    [
      "Anomalie",
      "Catégorie",
      "Occurrences",
      "Période précédente",
      "Évolution",
      "Sévérité",
      "Source",
      "Dernière observation",
    ],
    ...anomalies.map((anomaly) => [
      anomaly.name,
      anomaly.category,
      anomaly.occurrences.toString(),
      anomaly.previous.toString(),
      `${
        anomaly.occurrences - anomaly.previous >= 0 ? "+" : ""
      }${anomaly.occurrences - anomaly.previous}`,
      anomaly.severity,
      anomaly.source,
      anomaly.lastSeen,
    ]),
  ];
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"),
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bilan-soc-${periodLabel.toLowerCase().replace(/ /g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function printReport(periodLabel: string) {
  const previousTitle = document.title;
  document.title = `Bilan SOC SeeYou — ${periodLabel}`;
  document.body.classList.add("printing-report");
  const restore = () => {
    document.body.classList.remove("printing-report");
    document.title = previousTitle;
  };
  window.addEventListener("afterprint", restore, { once: true });
  window.print();
  window.setTimeout(restore, 1000);
}

function LogsPage() {
  const [frequency, setFrequency] = useState<"Hebdomadaire" | "Mensuel">(
    "Hebdomadaire",
  );
  const [referenceDate, setReferenceDate] = useState("2025-12-08");
  const [sections, setSections] = useState({
    summary: true,
    anomalies: true,
    sources: true,
    recommendations: true,
  });
  const [reports, setReports] = useState(initialReports);
  const [reportQuery, setReportQuery] = useState("");
  const [generatedMessage, setGeneratedMessage] = useState("");

  const periodLabel = useMemo(() => {
    const date = new Date(`${referenceDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "Période non définie";
    if (frequency === "Mensuel") {
      const label = new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
      }).format(date);
      return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
    }
    const start = new Date(date);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const shortDate = (value: Date) =>
      new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
      }).format(value);
    return `Semaine du ${shortDate(start)} au ${shortDate(end)} ${end.getFullYear()}`;
  }, [frequency, referenceDate]);

  const displayedAnomalies = useMemo(
    () =>
      recurringAnomalies.map((anomaly) => ({
        ...anomaly,
        occurrences:
          frequency === "Mensuel"
            ? Math.round(anomaly.occurrences * 3.8)
            : anomaly.occurrences,
        previous:
          frequency === "Mensuel"
            ? Math.round(anomaly.previous * 3.8)
            : anomaly.previous,
      })),
    [frequency],
  );

  const visibleReports = reports.filter((report) =>
    `${report.id} ${report.name} ${report.period}`
      .toLowerCase()
      .includes(reportQuery.toLowerCase()),
  );

  const totalOccurrences = displayedAnomalies.reduce(
    (total, anomaly) => total + anomaly.occurrences,
    0,
  );
  const previousOccurrences = displayedAnomalies.reduce(
    (total, anomaly) => total + anomaly.previous,
    0,
  );
  const change = Math.round(
    ((totalOccurrences - previousOccurrences) / previousOccurrences) * 100,
  );

  function generateReport() {
    const selectedSections = Object.values(sections).filter(Boolean).length;
    const now = new Date();
    const newReport: GeneratedReport = {
      id: `RPT-${now.getFullYear()}-${String(reports.length + 49).padStart(3, "0")}`,
      name: `Bilan ${frequency.toLowerCase()} · ${periodLabel}`,
      period: periodLabel,
      createdAt: "À l’instant",
      size: `${(1.1 + selectedSections * 0.4).toFixed(1).replace(".", ",")} Mo`,
    };
    setReports((current) => [newReport, ...current]);
    setGeneratedMessage(
      `Le rapport ${newReport.id} a été généré avec ${selectedSections} section${
        selectedSections > 1 ? "s" : ""
      }.`,
    );
  }

  function toggleSection(section: keyof typeof sections) {
    setSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  return (
    <div className="dashboard logs-page">
      <div className="logs-page-header">
        <div>
          <p className="eyebrow">RAPPORTS & CONFORMITÉ</p>
          <h2>Journaux et bilans</h2>
          <p className="muted">
            Analysez la récurrence des anomalies et produisez vos bilans
            périodiques.
          </p>
        </div>
        <div className="report-header-actions">
          <button
            className="secondary-button"
            onClick={() => exportReportCsv(periodLabel, displayedAnomalies)}
            type="button"
          >
            <Icon name="database" size={16} /> Exporter CSV
          </button>
          <button
            className="primary-button inline-primary"
            onClick={() => printReport(periodLabel)}
            type="button"
          >
            <Icon name="file" size={16} /> Exporter PDF
          </button>
        </div>
      </div>

      <div className="print-report-heading">
        <div className="brand-mark">
          <Icon name="shield" size={22} />
        </div>
        <div>
          <strong>SeeYou · Bilan SOC</strong>
          <span>{periodLabel}</span>
        </div>
      </div>

      <div className="report-summary-grid">
        <Panel className="report-summary-card">
          <span>Anomalies récurrentes</span>
          <strong className="font-data-mono">{totalOccurrences}</strong>
          <small>
            <span aria-hidden="true">↗</span> {change} % par rapport à la
            période précédente
          </small>
        </Panel>
        <Panel className="report-summary-card">
          <span>Signatures distinctes</span>
          <strong className="font-data-mono">38</strong>
          <small>
            <span aria-hidden="true">→</span> 7 nouvelles signatures
          </small>
        </Panel>
        <Panel className="report-summary-card">
          <span>Sources concernées</span>
          <strong className="font-data-mono">24</strong>
          <small>
            <span aria-hidden="true">↘</span> 3 sources isolées
          </small>
        </Panel>
        <Panel className="report-summary-card">
          <span>Taux de traitement</span>
          <strong className="font-data-mono">92,4 %</strong>
          <small>
            <span aria-hidden="true">✓</span> Objectif SOC atteint
          </small>
        </Panel>
      </div>

      <div className="reports-layout">
        <Panel className="report-builder">
          <div className="panel-heading">
            <div>
              <div className="title-with-icon">
                <Icon name="file" />
                <h3>Générer un bilan</h3>
              </div>
              <p className="muted">
                Configurez la période et le contenu du rapport
              </p>
            </div>
            <span className="step-label">ÉTAPE 1 / 2</span>
          </div>
          <div className="builder-body">
            <fieldset>
              <legend>Fréquence du bilan</legend>
              <div className="frequency-options">
                {(["Hebdomadaire", "Mensuel"] as const).map((option) => (
                  <label
                    className={frequency === option ? "selected" : ""}
                    key={option}
                  >
                    <input
                      checked={frequency === option}
                      name="frequency"
                      onChange={() => setFrequency(option)}
                      type="radio"
                    />
                    <span>
                      <Icon
                        name={option === "Hebdomadaire" ? "activity" : "file"}
                      />
                      <strong>{option}</strong>
                      <small>
                        {option === "Hebdomadaire"
                          ? "Du lundi au dimanche"
                          : "Du 1er au dernier jour"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="date-field">
              <span>Date de référence</span>
              <input
                onChange={(event) => setReferenceDate(event.target.value)}
                type="date"
                value={referenceDate}
              />
              <small>
                La période calculée sera : <strong>{periodLabel}</strong>
              </small>
            </label>
            <fieldset className="sections-fieldset">
              <legend>Sections à inclure</legend>
              {[
                [
                  "summary",
                  "Résumé exécutif",
                  "Indicateurs clés et évolution globale",
                ],
                [
                  "anomalies",
                  "Récurrence des anomalies",
                  "Fréquence, sévérité et tendances",
                ],
                [
                  "sources",
                  "Sources et actifs concernés",
                  "Origines, cibles et capteurs",
                ],
                [
                  "recommendations",
                  "Recommandations",
                  "Actions suggérées par l’agent IA",
                ],
              ].map(([key, title, description]) => (
                <label key={key}>
                  <input
                    checked={sections[key as keyof typeof sections]}
                    onChange={() => toggleSection(key as keyof typeof sections)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              className="primary-button generate-button"
              disabled={!Object.values(sections).some(Boolean)}
              onClick={generateReport}
              type="button"
            >
              <span>
                <Icon name="file" size={16} /> Générer le bilan
              </span>
              <span aria-hidden="true">→</span>
            </button>
            {generatedMessage && (
              <p className="generated-message" role="status">
                <Icon name="shield" size={14} />
                {generatedMessage}
              </p>
            )}
          </div>
        </Panel>

        <Panel className="recurrence-panel">
          <div className="panel-heading">
            <div>
              <div className="title-with-icon">
                <Icon name="activity" />
                <h3>Récurrence des anomalies</h3>
              </div>
              <p className="muted">{periodLabel} · comparaison précédente</p>
            </div>
            <span className="status-label">
              <Icon name="eye" size={14} /> {displayedAnomalies.length} familles
            </span>
          </div>
          <div
            className="recurrence-chart"
            aria-label="Fréquence des anomalies"
          >
            <div className="recurrence-scale font-data-mono">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100+</span>
            </div>
            {displayedAnomalies.map((anomaly) => {
              const maximum = Math.max(
                ...displayedAnomalies.map((item) => item.occurrences),
              );
              return (
                <div className="recurrence-row" key={anomaly.name}>
                  <div>
                    <strong>{anomaly.name}</strong>
                    <span>{anomaly.category}</span>
                  </div>
                  <progress max={maximum} value={anomaly.occurrences} />
                  <strong className="font-data-mono">
                    {anomaly.occurrences}
                  </strong>
                  <span
                    className={
                      anomaly.occurrences >= anomaly.previous
                        ? "trend-up"
                        : "trend-down"
                    }
                  >
                    {anomaly.occurrences >= anomaly.previous ? "↗" : "↘"}{" "}
                    {Math.abs(anomaly.occurrences - anomaly.previous)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="recurrence-insight">
            <span>
              <Icon name="brain" size={18} />
            </span>
            <div>
              <strong>Analyse de l’agent IA</strong>
              <p>
                Les échecs d’authentification se concentrent entre 22 h et 02 h.
                Le renforcement des règles sur AUTH-01 est recommandé.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="anomaly-detail-panel">
        <div className="panel-heading">
          <div>
            <div className="title-with-icon">
              <Icon name="alert" />
              <h3>Détail des anomalies récurrentes</h3>
            </div>
            <p className="muted">Classement par nombre d’occurrences</p>
          </div>
          <button
            className="text-button"
            onClick={() => exportReportCsv(periodLabel, displayedAnomalies)}
            type="button"
          >
            Télécharger les données <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="table-scroll report-table">
          <table>
            <thead>
              <tr>
                <th>Anomalie</th>
                <th>Catégorie</th>
                <th>Occurrences</th>
                <th>Évolution</th>
                <th>Sévérité</th>
                <th>Source principale</th>
                <th>Dernière observation</th>
              </tr>
            </thead>
            <tbody>
              {displayedAnomalies.map((anomaly) => (
                <tr key={anomaly.name}>
                  <td>
                    <strong>{anomaly.name}</strong>
                  </td>
                  <td>{anomaly.category}</td>
                  <td className="font-data-mono">{anomaly.occurrences}</td>
                  <td>
                    <span className="report-trend">
                      {anomaly.occurrences >= anomaly.previous
                        ? "↗ Hausse"
                        : anomaly.occurrences === anomaly.previous
                          ? "→ Stable"
                          : "↘ Baisse"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`severity severity-${anomaly.severity.toLowerCase().replace("é", "e")}`}
                    >
                      <Icon name="alert" size={13} />
                      {anomaly.severity}
                    </span>
                  </td>
                  <td className="font-data-mono">{anomaly.source}</td>
                  <td>{anomaly.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="generated-reports-panel">
        <div className="panel-heading reports-list-heading">
          <div>
            <div className="title-with-icon">
              <Icon name="database" />
              <h3>Bilans générés</h3>
            </div>
            <p className="muted">Historique des exports disponibles</p>
          </div>
          <label className="search-field">
            <span className="sr-only">Rechercher un bilan</span>
            <Icon name="search" size={16} />
            <input
              onChange={(event) => setReportQuery(event.target.value)}
              placeholder="Rechercher"
              value={reportQuery}
            />
          </label>
        </div>
        <div className="reports-list">
          {visibleReports.map((report) => (
            <div className="report-list-row" key={report.id}>
              <span className="report-file-icon">
                <Icon name="file" />
              </span>
              <div>
                <strong>{report.name}</strong>
                <span>
                  {report.id} · {report.period}
                </span>
              </div>
              <span>
                <small>Généré le</small>
                <strong>{report.createdAt}</strong>
              </span>
              <span>
                <small>Taille</small>
                <strong className="font-data-mono">{report.size}</strong>
              </span>
              <div className="report-row-actions">
                <button
                  aria-label={`Exporter ${report.id} en CSV`}
                  onClick={() =>
                    exportReportCsv(report.period, displayedAnomalies)
                  }
                  type="button"
                >
                  CSV
                </button>
                <button
                  aria-label={`Exporter ${report.id} en PDF`}
                  onClick={() => printReport(report.period)}
                  type="button"
                >
                  PDF
                </button>
              </div>
            </div>
          ))}
          {visibleReports.length === 0 && (
            <p className="empty-state">
              Aucun bilan ne correspond à cette recherche.
            </p>
          )}
        </div>
      </Panel>

      <footer className="print-report-footer">
        <span>SentineDog-SeeYou · ULPGL Goma</span>
        <span>Document généré depuis le centre des opérations de sécurité</span>
      </footer>
    </div>
  );
}

interface BlacklistEntry {
  id: string;
  value: string;
  type: "Adresse IP" | "Domaine" | "Empreinte";
  reason: string;
  source: "Manuel" | "Agent IA" | "Threat Intel";
  addedAt: string;
  expiresAt: string;
  status: "Actif" | "Suspendu" | "Expiré";
  blocked: number;
}

const initialBlacklist: BlacklistEntry[] = [
  {
    id: "BL-1048",
    value: "185.220.101.42",
    type: "Adresse IP",
    reason: "Balayage de ports répété",
    source: "Agent IA",
    addedAt: "8 déc. 2025",
    expiresAt: "Permanent",
    status: "Actif",
    blocked: 284,
  },
  {
    id: "BL-1047",
    value: "194.165.16.11",
    type: "Adresse IP",
    reason: "Communication avec un serveur C2",
    source: "Threat Intel",
    addedAt: "8 déc. 2025",
    expiresAt: "7 janv. 2026",
    status: "Actif",
    blocked: 91,
  },
  {
    id: "BL-1046",
    value: "update-system-check.net",
    type: "Domaine",
    reason: "Distribution de charge utile malveillante",
    source: "Threat Intel",
    addedAt: "7 déc. 2025",
    expiresAt: "Permanent",
    status: "Actif",
    blocked: 56,
  },
  {
    id: "BL-1045",
    value: "45.83.64.12",
    type: "Adresse IP",
    reason: "Tentatives d’injection SQL",
    source: "Manuel",
    addedAt: "6 déc. 2025",
    expiresAt: "13 déc. 2025",
    status: "Actif",
    blocked: 37,
  },
  {
    id: "BL-1044",
    value: "a7f42b9d…e218c1f0",
    type: "Empreinte",
    reason: "Binaire identifié comme rançongiciel",
    source: "Agent IA",
    addedAt: "3 déc. 2025",
    expiresAt: "Permanent",
    status: "Actif",
    blocked: 12,
  },
  {
    id: "BL-1043",
    value: "103.251.167.20",
    type: "Adresse IP",
    reason: "Force brute SSH",
    source: "Manuel",
    addedAt: "28 nov. 2025",
    expiresAt: "5 déc. 2025",
    status: "Expiré",
    blocked: 148,
  },
  {
    id: "BL-1042",
    value: "cdn-secure-login.org",
    type: "Domaine",
    reason: "Hameçonnage ciblé",
    source: "Threat Intel",
    addedAt: "25 nov. 2025",
    expiresAt: "Permanent",
    status: "Suspendu",
    blocked: 29,
  },
];

function exportBlacklistCsv(entries: BlacklistEntry[]) {
  const rows = [
    [
      "Indicateur",
      "Type",
      "Motif",
      "Source",
      "Ajout",
      "Expiration",
      "Statut",
      "Tentatives bloquées",
    ],
    ...entries.map((entry) => [
      entry.value,
      entry.type,
      entry.reason,
      entry.source,
      entry.addedAt,
      entry.expiresAt,
      entry.status,
      entry.blocked.toString(),
    ]),
  ];
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "liste-noire-seeyou.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function BlacklistPage() {
  const [entries, setEntries] = useState(initialBlacklist);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [statusFilter, setStatusFilter] = useState("Tous");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newType, setNewType] = useState<BlacklistEntry["type"]>("Adresse IP");
  const [newValue, setNewValue] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newDuration, setNewDuration] = useState("Permanent");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    function closeDialog(event: KeyboardEvent) {
      if (event.key === "Escape") setShowAddDialog(false);
    }
    window.addEventListener("keydown", closeDialog);
    return () => window.removeEventListener("keydown", closeDialog);
  }, []);

  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const matchesQuery =
          `${entry.value} ${entry.reason} ${entry.source} ${entry.id}`
            .toLowerCase()
            .includes(query.toLowerCase());
        const matchesType = typeFilter === "Tous" || entry.type === typeFilter;
        const matchesStatus =
          statusFilter === "Tous" || entry.status === statusFilter;
        return matchesQuery && matchesType && matchesStatus;
      }),
    [entries, query, statusFilter, typeFilter],
  );

  const allVisibleSelected =
    visibleEntries.length > 0 &&
    visibleEntries.every((entry) => selectedIds.includes(entry.id));

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter(
          (id) => !visibleEntries.some((entry) => entry.id === id),
        ),
      );
      return;
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...visibleEntries.map((entry) => entry.id)]),
    ]);
  }

  function toggleEntry(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  function removeSelected() {
    setEntries((current) =>
      current.filter((entry) => !selectedIds.includes(entry.id)),
    );
    setFeedback(
      `${selectedIds.length} indicateur${
        selectedIds.length > 1 ? "s ont" : " a"
      } été retiré${selectedIds.length > 1 ? "s" : ""}.`,
    );
    setSelectedIds([]);
  }

  function suspendSelected() {
    setEntries((current) =>
      current.map((entry) =>
        selectedIds.includes(entry.id)
          ? { ...entry, status: "Suspendu" as const }
          : entry,
      ),
    );
    setFeedback("Les indicateurs sélectionnés ont été suspendus.");
    setSelectedIds([]);
  }

  function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry: BlacklistEntry = {
      id: `BL-${1050 + entries.length}`,
      value: newValue.trim(),
      type: newType,
      reason: newReason.trim(),
      source: "Manuel",
      addedAt: "Aujourd’hui",
      expiresAt:
        newDuration === "Permanent"
          ? "Permanent"
          : newDuration === "7 jours"
            ? "Dans 7 jours"
            : "Dans 30 jours",
      status: "Actif",
      blocked: 0,
    };
    setEntries((current) => [entry, ...current]);
    setNewValue("");
    setNewReason("");
    setShowAddDialog(false);
    setFeedback(`${entry.value} a été ajouté à la liste noire.`);
  }

  return (
    <div className="dashboard blacklist-page">
      <div className="blacklist-page-header">
        <div>
          <p className="eyebrow">POLITIQUE DE BLOCAGE</p>
          <h2>Liste noire</h2>
          <p className="muted">
            Gérez les adresses, domaines et empreintes bloqués par le moteur
            IPS.
          </p>
        </div>
        <div className="blacklist-header-actions">
          <button
            className="secondary-button"
            onClick={() => exportBlacklistCsv(visibleEntries)}
            type="button"
          >
            <Icon name="database" size={16} /> Exporter CSV
          </button>
          <button
            className="primary-button inline-primary"
            onClick={() => setShowAddDialog(true)}
            type="button"
          >
            <span className="plus-symbol" aria-hidden="true">
              +
            </span>{" "}
            Ajouter un indicateur
          </button>
        </div>
      </div>

      {feedback && (
        <div className="blacklist-feedback" role="status">
          <Icon name="shield" size={15} />
          <span>{feedback}</span>
          <button
            aria-label="Masquer la confirmation"
            onClick={() => setFeedback("")}
            type="button"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      <div className="blacklist-summary-grid">
        <Panel className="blacklist-summary-card">
          <span className="summary-icon solid">
            <Icon name="shield" />
          </span>
          <div>
            <span>Indicateurs actifs</span>
            <strong className="font-data-mono">
              {entries.filter((entry) => entry.status === "Actif").length}
            </strong>
          </div>
          <small>Protection appliquée en temps réel</small>
        </Panel>
        <Panel className="blacklist-summary-card">
          <span className="summary-icon">
            <Icon name="activity" />
          </span>
          <div>
            <span>Tentatives bloquées</span>
            <strong className="font-data-mono">
              {entries.reduce((total, entry) => total + entry.blocked, 0)}
            </strong>
          </div>
          <small>Depuis le début du mois</small>
        </Panel>
        <Panel className="blacklist-summary-card">
          <span className="summary-icon">
            <Icon name="brain" />
          </span>
          <div>
            <span>Ajouts par l’IA</span>
            <strong className="font-data-mono">
              {entries.filter((entry) => entry.source === "Agent IA").length}
            </strong>
          </div>
          <small>Confiance moyenne : 96,1 %</small>
        </Panel>
        <Panel className="blacklist-summary-card">
          <span className="summary-icon">
            <Icon name="alert" />
          </span>
          <div>
            <span>À renouveler</span>
            <strong className="font-data-mono">03</strong>
          </div>
          <small>Expiration dans moins de 7 jours</small>
        </Panel>
      </div>

      <div className="blacklist-layout">
        <Panel className="blacklist-table-panel">
          <div
            className="blacklist-tabs"
            role="tablist"
            aria-label="Type d’indicateur"
          >
            {[
              ["Tous", entries.length],
              [
                "Adresse IP",
                entries.filter((entry) => entry.type === "Adresse IP").length,
              ],
              [
                "Domaine",
                entries.filter((entry) => entry.type === "Domaine").length,
              ],
              [
                "Empreinte",
                entries.filter((entry) => entry.type === "Empreinte").length,
              ],
            ].map(([label, count]) => (
              <button
                aria-selected={typeFilter === label}
                className={typeFilter === label ? "active" : ""}
                key={label}
                onClick={() => setTypeFilter(String(label))}
                role="tab"
                type="button"
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
          <div className="blacklist-toolbar">
            <label className="search-field blacklist-search">
              <span className="sr-only">Rechercher dans la liste noire</span>
              <Icon name="search" size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="IP, domaine, empreinte ou motif…"
                value={query}
              />
            </label>
            <div className="blacklist-filters">
              <label>
                <span className="sr-only">Filtrer par statut</span>
                <select
                  onChange={(event) => setStatusFilter(event.target.value)}
                  value={statusFilter}
                >
                  <option>Tous</option>
                  <option>Actif</option>
                  <option>Suspendu</option>
                  <option>Expiré</option>
                </select>
              </label>
              <button
                className="clear-filters"
                disabled={
                  query === "" &&
                  typeFilter === "Tous" &&
                  statusFilter === "Tous"
                }
                onClick={() => {
                  setQuery("");
                  setTypeFilter("Tous");
                  setStatusFilter("Tous");
                }}
                type="button"
              >
                Effacer
              </button>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="bulk-actions" role="status">
              <strong>
                {selectedIds.length} sélectionné
                {selectedIds.length > 1 ? "s" : ""}
              </strong>
              <span />
              <button onClick={suspendSelected} type="button">
                <Icon name="eye" size={15} /> Suspendre
              </button>
              <button onClick={removeSelected} type="button">
                <Icon name="x" size={15} /> Retirer
              </button>
              <button
                aria-label="Annuler la sélection"
                onClick={() => setSelectedIds([])}
                type="button"
              >
                <Icon name="x" size={15} />
              </button>
            </div>
          )}

          <div className="table-scroll blacklist-table">
            <table>
              <thead>
                <tr>
                  <th className="check-cell">
                    <input
                      aria-label="Sélectionner tous les indicateurs visibles"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      type="checkbox"
                    />
                  </th>
                  <th>Indicateur</th>
                  <th>Type</th>
                  <th>Motif</th>
                  <th>Origine</th>
                  <th>Expiration</th>
                  <th>Statut</th>
                  <th>Blocages</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="check-cell">
                      <input
                        aria-label={`Sélectionner ${entry.value}`}
                        checked={selectedIds.includes(entry.id)}
                        onChange={() => toggleEntry(entry.id)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <span className="blacklist-identity">
                        <strong className="font-data-mono">
                          {entry.value}
                        </strong>
                        <small>
                          {entry.id} · ajouté {entry.addedAt}
                        </small>
                      </span>
                    </td>
                    <td>
                      <span className="indicator-type">
                        <Icon
                          name={
                            entry.type === "Adresse IP"
                              ? "network"
                              : entry.type === "Domaine"
                                ? "globe"
                                : "file"
                          }
                          size={13}
                        />
                        {entry.type}
                      </span>
                    </td>
                    <td>{entry.reason}</td>
                    <td>
                      <span className="entry-source">
                        <Icon
                          name={
                            entry.source === "Agent IA"
                              ? "brain"
                              : entry.source === "Threat Intel"
                                ? "globe"
                                : "user"
                          }
                          size={13}
                        />
                        {entry.source}
                      </span>
                    </td>
                    <td>{entry.expiresAt}</td>
                    <td>
                      <span
                        className={`blacklist-status blacklist-status-${entry.status.toLowerCase().replace("é", "e")}`}
                      >
                        <span aria-hidden="true" />
                        {entry.status}
                      </span>
                    </td>
                    <td className="font-data-mono">{entry.blocked}</td>
                    <td>
                      <button
                        aria-label={`${
                          entry.status === "Actif" ? "Suspendre" : "Activer"
                        } ${entry.value}`}
                        aria-pressed={entry.status === "Actif"}
                        className={`status-switch ${
                          entry.status === "Actif" ? "enabled" : ""
                        }`}
                        onClick={() =>
                          setEntries((current) =>
                            current.map((item) =>
                              item.id === entry.id
                                ? {
                                    ...item,
                                    status:
                                      item.status === "Actif"
                                        ? "Suspendu"
                                        : "Actif",
                                  }
                                : item,
                            ),
                          )
                        }
                        type="button"
                      >
                        <span />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleEntries.length === 0 && (
              <div className="blacklist-empty">
                <span>
                  <Icon name="shield" size={22} />
                </span>
                <strong>Aucun indicateur trouvé</strong>
                <p>Modifiez les filtres ou ajoutez un nouvel indicateur.</p>
                <button
                  className="secondary-button"
                  onClick={() => setShowAddDialog(true)}
                  type="button"
                >
                  Ajouter un indicateur
                </button>
              </div>
            )}
          </div>
          <div className="panel-footer">
            <span className="muted">
              {visibleEntries.length} indicateurs affichés sur {entries.length}
            </span>
            <span className="muted">Synchronisé avec Snort il y a 12 s</span>
          </div>
        </Panel>

        <aside className="blacklist-aside">
          <Panel className="blocking-health">
            <div className="panel-heading">
              <div>
                <div className="title-with-icon">
                  <Icon name="shield" />
                  <h3>État du blocage</h3>
                </div>
                <p className="muted">Synchronisation IPS</p>
              </div>
              <span className="status-label status-solid">Actif</span>
            </div>
            <div className="blocking-score">
              <strong className="font-data-mono">100%</strong>
              <span>Règles synchronisées</span>
            </div>
            <dl className="stats-list compact">
              <div>
                <dt>Dernier déploiement</dt>
                <dd className="font-data-mono">14:44:02</dd>
              </div>
              <div>
                <dt>Temps de propagation</dt>
                <dd className="font-data-mono">1,8 s</dd>
              </div>
              <div>
                <dt>Erreurs de règles</dt>
                <dd className="font-data-mono">0</dd>
              </div>
            </dl>
          </Panel>
          <Panel className="expiring-panel">
            <div className="panel-heading">
              <div>
                <div className="title-with-icon">
                  <Icon name="alert" />
                  <h3>Expirations proches</h3>
                </div>
                <p className="muted">À vérifier cette semaine</p>
              </div>
            </div>
            <div className="expiring-list">
              {entries
                .filter((entry) => entry.expiresAt !== "Permanent")
                .slice(0, 3)
                .map((entry, index) => (
                  <button key={entry.id} type="button">
                    <span>
                      <strong className="font-data-mono">{entry.value}</strong>
                      <small>{entry.reason}</small>
                    </span>
                    <span>
                      <strong>
                        {index === 0
                          ? "2 jours"
                          : index === 1
                            ? "5 jours"
                            : "Expiré"}
                      </strong>
                      <Icon name="chevron" size={14} />
                    </span>
                  </button>
                ))}
            </div>
          </Panel>
          <Panel className="ai-blocking-panel">
            <span>
              <Icon name="brain" size={22} />
            </span>
            <div>
              <strong>Blocage assisté par IA</strong>
              <p>
                L’agent peut proposer automatiquement des indicateurs selon leur
                score de confiance.
              </p>
            </div>
            <button className="secondary-button" type="button">
              Configurer l’automatisation
            </button>
          </Panel>
        </aside>
      </div>

      {showAddDialog && (
        <div className="dialog-backdrop" role="presentation">
          <section
            aria-labelledby="add-indicator-title"
            aria-modal="true"
            className="add-indicator-dialog"
            role="dialog"
          >
            <div className="dialog-heading">
              <div>
                <span>
                  <Icon name="shield" />
                </span>
                <div>
                  <h3 id="add-indicator-title">Ajouter un indicateur</h3>
                  <p>La règle sera synchronisée avec le moteur IPS.</p>
                </div>
              </div>
              <button
                aria-label="Fermer"
                className="icon-button"
                onClick={() => setShowAddDialog(false)}
                type="button"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={addEntry}>
              <fieldset>
                <legend>Type d’indicateur</legend>
                <div className="indicator-options">
                  {(["Adresse IP", "Domaine", "Empreinte"] as const).map(
                    (type) => (
                      <label
                        className={newType === type ? "selected" : ""}
                        key={type}
                      >
                        <input
                          checked={newType === type}
                          name="indicator-type"
                          onChange={() => setNewType(type)}
                          type="radio"
                        />
                        <Icon
                          name={
                            type === "Adresse IP"
                              ? "network"
                              : type === "Domaine"
                                ? "globe"
                                : "file"
                          }
                          size={16}
                        />
                        <span>{type}</span>
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
              <label className="form-field">
                <span>Valeur de l’indicateur</span>
                <input
                  autoFocus
                  onChange={(event) => setNewValue(event.target.value)}
                  placeholder={
                    newType === "Adresse IP"
                      ? "Ex. 203.0.113.42"
                      : newType === "Domaine"
                        ? "Ex. domaine-suspect.net"
                        : "Empreinte SHA-256"
                  }
                  required
                  value={newValue}
                />
                <small>Vérifiez la valeur avant de déployer la règle.</small>
              </label>
              <label className="form-field">
                <span>Motif du blocage</span>
                <textarea
                  onChange={(event) => setNewReason(event.target.value)}
                  placeholder="Décrivez la menace ou l’activité observée…"
                  required
                  rows={3}
                  value={newReason}
                />
              </label>
              <label className="form-field">
                <span>Durée du blocage</span>
                <select
                  onChange={(event) => setNewDuration(event.target.value)}
                  value={newDuration}
                >
                  <option>Permanent</option>
                  <option>7 jours</option>
                  <option>30 jours</option>
                </select>
              </label>
              <div className="dialog-note">
                <Icon name="alert" size={15} />
                <p>
                  Le nouvel indicateur sera actif immédiatement sur les 12
                  capteurs connectés.
                </p>
              </div>
              <div className="dialog-actions">
                <button
                  className="secondary-button"
                  onClick={() => setShowAddDialog(false)}
                  type="button"
                >
                  Annuler
                </button>
                <button className="primary-button inline-primary" type="submit">
                  Ajouter et déployer
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState("24 h");
  const [search, setSearch] = useState("");
  const [activePage, setActivePage] = useState<
    "overview" | "alerts" | "network" | "logs" | "blacklist"
  >("overview");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const filteredAlerts = useMemo(
    () =>
      alertRows.filter((alert) =>
        `${alert.id} ${alert.source} ${alert.signature} ${alert.target}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [search],
  );

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          aria-label="Fermer le menu"
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      )}

      <aside
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        aria-label="Navigation principale"
      >
        <div className="brand">
          <span className="brand-mark">
            <Icon name="shield" size={22} />
          </span>
          <div>
            <strong>SeeYou</strong>
            <span>SENTINEDOG SOC</span>
          </div>
          <button
            aria-label="Fermer la navigation"
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <Icon name="x" />
          </button>
        </div>

        <nav>
          <p className="nav-label">SURVEILLANCE</p>
          <NavItem
            active={activePage === "overview"}
            icon="dashboard"
            label="Vue d’ensemble"
            onClick={() => {
              setActivePage("overview");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            active={activePage === "alerts"}
            icon="alert"
            label="Alertes"
            onClick={() => {
              setActivePage("alerts");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            active={activePage === "network"}
            icon="network"
            label="Réseau"
            onClick={() => {
              setActivePage("network");
              setSidebarOpen(false);
            }}
          />
          <NavItem
            active={activePage === "logs"}
            icon="file"
            label="Journaux"
            onClick={() => {
              setActivePage("logs");
              setSidebarOpen(false);
            }}
          />
          <p className="nav-label nav-section">PROTECTION</p>
          <NavItem
            active={activePage === "blacklist"}
            icon="shield"
            label="Liste noire"
            onClick={() => {
              setActivePage("blacklist");
              setSidebarOpen(false);
            }}
          />
          <NavItem icon="globe" label="Threat intelligence" />
          <NavItem icon="database" label="Actifs" />
        </nav>

        <div className="sidebar-bottom">
          <NavItem icon="settings" label="Paramètres" />
          <div className="user-card">
            <span className="avatar">
              <Icon name="user" />
            </span>
            <div>
              <strong>Admin SOC</strong>
              <span>ULPGL Goma</span>
            </div>
            <Icon name="chevron" size={16} />
          </div>
        </div>
      </aside>

      <main className="main-content" id="contenu-principal">
        <header className="topbar">
          <div className="topbar-left">
            <button
              aria-label="Ouvrir la navigation"
              className="icon-button menu-button"
              onClick={() => setSidebarOpen(true)}
              type="button"
            >
              <Icon name="menu" />
            </button>
            <div>
              <h1>
                {activePage === "overview"
                  ? "Vue d’ensemble"
                  : activePage === "alerts"
                    ? "Alertes"
                    : activePage === "network"
                      ? "Réseau"
                      : activePage === "logs"
                        ? "Journaux"
                        : "Liste noire"}
              </h1>
              <p>Centre des opérations de sécurité · ULPGL Goma</p>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="system-status">
              <span className="status-dot" aria-hidden="true" /> Systèmes
              opérationnels
            </span>
            <button
              aria-label={
                dark ? "Activer le thème clair" : "Activer le thème sombre"
              }
              aria-pressed={dark}
              className="icon-button"
              onClick={() => setDark((current) => !current)}
              type="button"
            >
              <Icon name={dark ? "sun" : "moon"} />
            </button>
            <button
              aria-label="Consulter le profil"
              className="avatar avatar-button"
              type="button"
            >
              AS
            </button>
          </div>
        </header>

        {activePage === "alerts" ? (
          <AlertsPage onBackToOverview={() => setActivePage("overview")} />
        ) : activePage === "network" ? (
          <NetworkPage />
        ) : activePage === "logs" ? (
          <LogsPage />
        ) : activePage === "blacklist" ? (
          <BlacklistPage />
        ) : (
          <div className="dashboard">
            <div className="dashboard-intro">
              <div>
                <p className="eyebrow">SITUATION ACTUELLE</p>
                <h2>Bonjour, équipe SOC</h2>
                <p className="muted">
                  Dernière synchronisation à 14:34:12 · 12 capteurs connectés
                </p>
              </div>
              <div className="period-control" aria-label="Période d’analyse">
                {["1 h", "24 h", "7 j", "30 j"].map((item) => (
                  <button
                    aria-pressed={period === item}
                    className={period === item ? "selected" : ""}
                    key={item}
                    onClick={() => setPeriod(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="kpi-grid">
              <KpiCard
                detail="+12 depuis hier"
                icon="alert"
                label="Alertes détectées"
                trend="up"
                value="248"
              />
              <KpiCard
                detail="98,7 % bloquées"
                icon="shield"
                label="Menaces bloquées"
                trend="stable"
                value="193"
              />
              <KpiCard
                detail="3 à examiner"
                icon="eye"
                label="Incidents ouverts"
                trend="down"
                value="07"
              />
              <KpiCard
                detail="sur 12 capteurs"
                icon="activity"
                label="Capteurs actifs"
                trend="stable"
                value="12/12"
              />
            </div>

            <div className="content-grid">
              <Panel className="threat-panel">
                <div className="panel-heading">
                  <div>
                    <div className="title-with-icon">
                      <Icon name="activity" />
                      <h3>Activité des menaces</h3>
                    </div>
                    <p className="muted">
                      Alertes détectées sur les dernières 24 heures
                    </p>
                  </div>
                  <button className="text-button" type="button">
                    Voir le rapport <span aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="chart-summary">
                  <div>
                    <span className="chart-value font-data-mono">248</span>
                    <span className="muted">alertes totales</span>
                  </div>
                  <span className="status-label">
                    ↗ 5,1 % vs période précédente
                  </span>
                </div>
                <div className="chart-wrap">
                  <div className="y-axis font-data-mono">
                    <span>80</span>
                    <span>60</span>
                    <span>40</span>
                    <span>20</span>
                    <span>0</span>
                  </div>
                  <svg
                    aria-label="Courbe des alertes, tendance en hausse"
                    className="line-chart"
                    preserveAspectRatio="none"
                    role="img"
                    viewBox="0 0 500 105"
                  >
                    <line x1="0" x2="500" y1="20" y2="20" />
                    <line x1="0" x2="500" y1="40" y2="40" />
                    <line x1="0" x2="500" y1="60" y2="60" />
                    <line x1="0" x2="500" y1="80" y2="80" />
                    <polygon points={chartArea} />
                    <polyline points={chartPoints} />
                    <circle cx="500" cy="9" r="4" />
                  </svg>
                </div>
                <div className="x-axis font-data-mono">
                  <span>00:00</span>
                  <span>04:00</span>
                  <span>08:00</span>
                  <span>12:00</span>
                  <span>16:00</span>
                  <span>20:00</span>
                  <span>24:00</span>
                </div>
              </Panel>

              <Panel className="engine-panel">
                <div className="panel-heading">
                  <div>
                    <div className="title-with-icon">
                      <Icon name="shield" />
                      <h3>Moteur IPS</h3>
                    </div>
                    <p className="muted">État de protection Snort</p>
                  </div>
                  <span className="status-label status-solid">
                    <Icon name="shield" size={14} /> Actif
                  </span>
                </div>
                <div className="status-ring">
                  <svg aria-hidden="true" viewBox="0 0 120 120">
                    <circle className="ring-track" cx="60" cy="60" r="50" />
                    <circle className="ring-value" cx="60" cy="60" r="50" />
                  </svg>
                  <div>
                    <strong className="font-data-mono">98,7%</strong>
                    <span>Efficacité</span>
                  </div>
                </div>
                <dl className="stats-list">
                  <div>
                    <dt>Paquets analysés</dt>
                    <dd className="font-data-mono">1,84 M</dd>
                  </div>
                  <div>
                    <dt>Règles chargées</dt>
                    <dd className="font-data-mono">4 286</dd>
                  </div>
                  <div>
                    <dt>Temps de disponibilité</dt>
                    <dd className="font-data-mono">18 j 06 h</dd>
                  </div>
                </dl>
              </Panel>
            </div>

            <div className="lower-grid">
              <Panel className="alerts-panel">
                <div className="panel-heading alerts-heading">
                  <div>
                    <div className="title-with-icon">
                      <Icon name="alert" />
                      <h3>Alertes récentes</h3>
                    </div>
                    <p className="muted">
                      Événements nécessitant votre attention
                    </p>
                  </div>
                  <div className="table-actions">
                    <label className="search-field">
                      <span className="sr-only">
                        Rechercher dans les alertes
                      </span>
                      <Icon name="search" size={16} />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Rechercher"
                      />
                    </label>
                    <button
                      aria-label="Filtrer les alertes"
                      className="icon-button"
                      type="button"
                    >
                      <Icon name="filter" size={16} />
                    </button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Heure</th>
                        <th>Sévérité</th>
                        <th>Source</th>
                        <th>Signature</th>
                        <th>Cible</th>
                        <th>
                          <span className="sr-only">Action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAlerts.map((alert) => (
                        <tr key={alert.id}>
                          <td className="font-data-mono">{alert.time}</td>
                          <td>
                            <span
                              className={`severity severity-${alert.severity.toLowerCase().replace("é", "e")}`}
                            >
                              <Icon name="alert" size={13} />
                              {alert.severity}
                            </span>
                          </td>
                          <td className="font-data-mono">{alert.source}</td>
                          <td>{alert.signature}</td>
                          <td className="font-data-mono">{alert.target}</td>
                          <td>
                            <button
                              aria-label={`Voir le détail de ${alert.id}`}
                              className="row-action"
                              type="button"
                            >
                              <Icon name="chevron" size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredAlerts.length === 0 && (
                    <p className="empty-state">
                      Aucune alerte ne correspond à cette recherche.
                    </p>
                  )}
                </div>
                <div className="panel-footer">
                  <span className="muted">
                    {filteredAlerts.length} alertes affichées
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setActivePage("alerts")}
                    type="button"
                  >
                    Toutes les alertes <span aria-hidden="true">→</span>
                  </button>
                </div>
              </Panel>

              <Panel className="ai-panel">
                <div className="panel-heading">
                  <div>
                    <div className="title-with-icon">
                      <Icon name="brain" />
                      <h3>Agent IA</h3>
                    </div>
                    <p className="muted">Modèle d’apprentissage RL</p>
                  </div>
                  <span className="status-label">
                    <span className="status-dot" /> En ligne
                  </span>
                </div>
                <div className="ai-hero">
                  <span className="ai-icon">
                    <Icon name="brain" size={26} />
                  </span>
                  <div>
                    <strong>Analyse autonome active</strong>
                    <span>Le modèle surveille le trafic en temps réel.</span>
                  </div>
                </div>
                <dl className="stats-list compact">
                  <div>
                    <dt>Confiance moyenne</dt>
                    <dd className="font-data-mono">94,2 %</dd>
                  </div>
                  <div>
                    <dt>Décisions aujourd’hui</dt>
                    <dd className="font-data-mono">1 247</dd>
                  </div>
                  <div>
                    <dt>Dernier entraînement</dt>
                    <dd className="font-data-mono">Il y a 3 h</dd>
                  </div>
                </dl>
                <button className="primary-button" type="button">
                  Ouvrir l’agent IA <span aria-hidden="true">→</span>
                </button>
              </Panel>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
