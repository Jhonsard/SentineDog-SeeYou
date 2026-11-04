# MAP.md : carte du projet

```
.
├── client/
│   ├── index.html                  # y ajouter le script anti-flash du thème
│   ├── public/                     # images, polices Inter, debug-collector
│   └── src/
│       ├── App.tsx                 # routes wouter
│       ├── main.tsx
│       ├── index.css               # variables de couleurs, @theme, dark
│       ├── config.ts, const.ts
│       ├── contexts/               # ThemeContext.tsx (À ADAPTER), AuthContext, AIContext
│       ├── hooks/                  # useComposition, useMobile, usePersistFn,
│       │                           # useLogsDisplay, useExpandableLogs
│       ├── lib/                    # utils.ts, logs.ts, reportPdf.ts
│       ├── components/
│       │   ├── SidebarLayout.tsx   # shell : sidebar repliable, topbar, navigation
│       │   ├── AlertFeed.tsx, BannedHosts.tsx, ThemeToggle.tsx
│       │   ├── MetricCardsGrid.tsx, TrafficAttackChart.tsx
│       │   ├── dashboard/          # Panel, KpiCard, StatusRing, Sparkline, Widget,
│       │   │                       # EngineHealthPanel, NetworkTrafficView, EndpointSecurityView,
│       │   │                       # RecentAlertsPanel, AIPanel
│       │   ├── types.ts            # contrat des alertes et stats backend
│       │   └── ui/                 # shadcn (table.tsx, card.tsx...)
│       └── pages/                  # Alerts, Assets, AssetsHub, Login, LogsHub,
│                                   # NetworkLogs, NodesManagement, NotFound, Reports,
│                                   # Settings, ThreatIntel, UserProfile, WelcomeAuth
├── server/index.ts                 # INTERDIT
├── shared/const.ts                 # INTERDIT
├── patches/                        # INTERDIT
├── dist/                           # généré par pnpm build, jamais édité à la main
├── package.json, pnpm-lock.yaml, vite.config.ts, tsconfig*.json, vercel.json
└── (cet agent-kit) CLAUDE.md, AGENTS.md, SPEC.md, PLAN.md, .claude/, contexte/, livrables/, scripts/, docs/
```

## Pages de logs (couleur de sévérité autorisée)

`NetworkLogs.tsx`, `LogsHub.tsx`, `ThreatIntel.tsx`, `AlertFeed.tsx`.
