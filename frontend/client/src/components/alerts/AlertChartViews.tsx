import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Alert } from "@/components/types";
import { normalizeSeverity, severityLabel } from "@/lib/logs";

type ChartView = "area" | "bar" | "radar" | "radial" | "advanced";

const CHART_VIEWS: { id: ChartView; label: string }[] = [
  { id: "area", label: "Zone Interactive" },
  { id: "bar", label: "Barres Interactives" },
  { id: "radar", label: "Radar d'Analyse" },
  { id: "radial", label: "Graphique Radial Empilé" },
  { id: "advanced", label: "Barres Avancées et Totaux" },
];

interface TimelinePoint {
  key: string;
  label: string;
  alerts: number;
  blocked: number;
  pending: number;
}

function buildTimeline(alerts: Alert[]): TimelinePoint[] {
  const valid = alerts
    .map((alert) => ({ alert, date: new Date(alert.timestamp) }))
    .filter(({ date }) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (valid.length === 0) return [];

  const spanHours =
    (valid[valid.length - 1].date.getTime() - valid[0].date.getTime()) /
    3_600_000;
  const byDay = spanHours > 48;
  const points = new Map<string, TimelinePoint>();

  for (const { alert, date } of valid) {
    const key = byDay
      ? date.toISOString().slice(0, 10)
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}`;
    const label = byDay
      ? date.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
        })
      : date.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });

    const point = points.get(key) ?? {
      key,
      label,
      alerts: 0,
      blocked: 0,
      pending: 0,
    };

    point.alerts += 1;
    if (alert.is_blocked) {
      point.blocked += 1;
    } else {
      point.pending += 1;
    }
    points.set(key, point);
  }

  return Array.from(points.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-30);
}

const timeConfig = {
  alerts: { label: "Alertes", color: "var(--chart-1)" },
  blocked: { label: "Bloquées", color: "var(--chart-2)" },
  pending: { label: "À traiter", color: "var(--chart-3)" },
} satisfies ChartConfig;

const radarConfig = {
  count: { label: "Alertes", color: "var(--chart-1)" },
} satisfies ChartConfig;

const radialConfig = {
  blocked: { label: "Bloquées", color: "var(--chart-2)" },
  pending: { label: "À traiter", color: "var(--chart-3)" },
} satisfies ChartConfig;

interface AlertChartViewsProps {
  alerts: Alert[];
}

export function AlertChartViews({ alerts }: AlertChartViewsProps) {
  const [view, setView] = useState<ChartView>("area");
  const [activeSeries, setActiveSeries] = useState<"alerts" | "blocked">(
    "alerts",
  );

  const timeline = useMemo(() => buildTimeline(alerts), [alerts]);
  const totals = useMemo(
    () => ({
      alerts: alerts.length,
      blocked: alerts.filter((alert) => alert.is_blocked).length,
      pending: alerts.filter((alert) => !alert.is_blocked).length,
    }),
    [alerts],
  );
  const severityData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const alert of alerts) {
      const label = severityLabel(normalizeSeverity(alert.severity));
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([category, count]) => ({
      category,
      count,
    }));
  }, [alerts]);

  const emptyState = (
    <div className="flex h-[300px] items-center justify-center text-center font-data-mono text-xs italic text-muted-foreground">
      Aucune alerte chargée pour le moment.
    </div>
  );

  const renderChart = () => {
    if (alerts.length === 0) return emptyState;

    switch (view) {
      case "bar":
        return (
          <>
            <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
              {(["alerts", "blocked"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  data-active={activeSeries === key}
                  onClick={() => setActiveSeries(key)}
                  className="flex min-w-[140px] flex-1 flex-col gap-1 rounded-md border border-border px-3 py-2 text-left transition-colors data-[active=true]:bg-muted"
                >
                  <span className="text-xs text-muted-foreground">
                    {timeConfig[key].label}
                  </span>
                  <span className="text-lg font-semibold text-foreground">
                    {totals[key]}
                  </span>
                </button>
              ))}
            </div>
            <ChartContainer
              config={timeConfig}
              className="aspect-auto h-[300px] w-full"
            >
              <BarChart data={timeline} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tick={{
                    fill: "var(--muted-foreground)",
                    fontSize: 10,
                  }}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent nameKey={activeSeries} />}
                />
                <Bar
                  dataKey={activeSeries}
                  fill={`var(--color-${activeSeries})`}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </>
        );

      case "radar":
        return (
          <ChartContainer
            config={radarConfig}
            className="mx-auto aspect-square h-[320px] max-h-[320px]"
          >
            <RadarChart data={severityData}>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="category"
                tick={{
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                }}
              />
              <Radar
                dataKey="count"
                fill="var(--color-count)"
                fillOpacity={0.5}
                stroke="var(--color-count)"
              />
            </RadarChart>
          </ChartContainer>
        );

      case "radial":
        return (
          <ChartContainer
            config={radialConfig}
            className="mx-auto aspect-square w-full max-w-[320px]"
          >
            <RadialBarChart
              data={[
                {
                  name: "Alertes",
                  blocked: totals.blocked,
                  pending: totals.pending,
                },
              ]}
              endAngle={180}
              innerRadius={90}
              outerRadius={130}
            >
              <RadialBar
                dataKey="pending"
                fill="var(--color-pending)"
                fillOpacity={0.55}
                stackId="a"
                cornerRadius={5}
                className="stroke-transparent stroke-2"
              />
              <RadialBar
                dataKey="blocked"
                fill="var(--color-blocked)"
                fillOpacity={1}
                stackId="a"
                cornerRadius={5}
                className="stroke-transparent stroke-2"
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) - 16}
                            className="fill-foreground text-2xl font-bold"
                          >
                            {totals.alerts.toLocaleString("fr-FR")}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 4}
                            className="fill-muted-foreground"
                          >
                            Alertes
                          </tspan>
                        </text>
                      );
                    }
                    return null;
                  }}
                />
              </PolarRadiusAxis>
            </RadialBarChart>
          </ChartContainer>
        );

      case "advanced":
        return (
          <ChartContainer
            config={timeConfig}
            className="aspect-auto h-[300px] w-full"
          >
            <BarChart data={timeline} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tick={{
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                }}
              />
              <Bar
                dataKey="pending"
                stackId="a"
                fill="var(--color-pending)"
                fillOpacity={0.55}
                radius={[0, 0, 4, 4]}
              />
              <Bar
                dataKey="blocked"
                stackId="a"
                fill="var(--color-blocked)"
                fillOpacity={1}
                radius={[4, 4, 0, 0]}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    className="w-[190px]"
                    formatter={(value, name, item, index) => (
                      <>
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                          style={{
                            backgroundColor: `var(--color-${String(name)})`,
                          }}
                        />
                        {timeConfig[name as keyof typeof timeConfig]?.label ||
                          name}
                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium text-foreground tabular-nums">
                          {value}
                        </div>
                        {index === 1 && (
                          <div className="mt-1.5 flex basis-full items-center border-t pt-1.5 text-xs font-medium text-foreground">
                            Total
                            <div className="ml-auto font-mono font-medium text-foreground tabular-nums">
                              {Number(item?.payload?.pending ?? 0) +
                                Number(item?.payload?.blocked ?? 0)}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  />
                }
              />
            </BarChart>
          </ChartContainer>
        );

      case "area":
      default:
        return (
          <ChartContainer
            config={timeConfig}
            className="aspect-auto h-[300px] w-full"
          >
            <AreaChart data={timeline} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tick={{
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                }}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Area
                dataKey="alerts"
                type="natural"
                fill="var(--color-alerts)"
                fillOpacity={0.18}
                stroke="var(--color-alerts)"
                strokeWidth={2}
              />
              <Area
                dataKey="blocked"
                type="natural"
                fill="var(--color-blocked)"
                fillOpacity={0.32}
                stroke="var(--color-blocked)"
                strokeWidth={2}
                strokeDasharray="6 3"
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        );
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">
            Analyse des alertes
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Cinq lectures des alertes chargées.
          </CardDescription>
        </div>
        <div
          role="tablist"
          aria-label="Type de graphique"
          className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-0.5"
        >
          {CHART_VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              onClick={() => setView(item.id)}
              className={`rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors ${
                view === item.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{renderChart()}</CardContent>
    </Card>
  );
}
