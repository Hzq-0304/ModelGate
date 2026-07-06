import type { UsageTimeline } from "./usageTypes";
import { useI18n } from "../../i18n/i18n";

function buildPath(values: number[], width: number, height: number, maxValue?: number) {
  const max = Math.max(maxValue ?? Math.max(...values, 1), 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;

  return values
    .map((value, index) => {
      const x = values.length > 1 ? index * step : width / 2;
      const y = height - (value / max) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function formatCost(value: number | undefined) {
  return typeof value === "number" ? `$${value.toFixed(6)}` : "N/A";
}

function formatPointTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function UsageTrendChart({ timeline }: { timeline: UsageTimeline | null }) {
  const { t } = useI18n();
  const points = timeline?.points ?? [];
  const hasPoints = points.length > 0;
  const hasCost = points.some((point) => point.cost_available);
  const width = 360;
  const height = 96;
  const requests = hasPoints ? points.map((point) => point.requests) : [0];
  const tokens = hasPoints ? points.map((point) => point.total_tokens) : [0];
  const originalCosts = hasCost ? points.map((point) => point.original_cost_usd ?? point.estimated_cost_usd ?? 0) : [];
  const actualCosts = hasCost ? points.map((point) => point.actual_cost_usd ?? point.estimated_cost_usd ?? 0) : [];
  const maxCost = Math.max(...originalCosts, ...actualCosts, 1);
  const panels = [
    { label: t("usage.requestsTrend"), className: "usage-request-line", values: requests, enabled: true },
    { label: t("usage.tokensTrend"), className: "usage-token-line", values: tokens, enabled: true }
  ];

  return (
    <section className="usage-chart-panel">
      <div className="usage-chart-heading">
        <span>{t("usage.trend")}</span>
        <div className="usage-legend">
          <span><i className="legend-token" />{t("usage.tokens")}</span>
          {hasCost && <span><i className="legend-original-cost" />{t("usage.originalCost")}</span>}
          {hasCost && <span><i className="legend-actual-cost" />{t("usage.realCost")}</span>}
        </div>
      </div>
      {hasPoints ? (
        <div className="usage-chart-grid-panel">
          {panels.filter((panel) => panel.enabled).map((panel) => (
            <article className="usage-mini-chart" key={panel.label}>
              <span>{panel.label}</span>
              <svg className="usage-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={panel.label}>
                <path className="usage-chart-grid" d={`M 0 ${height - 1} H ${width}`} />
                <path className={panel.className} d={buildPath(panel.values, width, height)} />
              </svg>
            </article>
          ))}
          {hasCost && (
            <article className="usage-mini-chart usage-cost-chart">
              <span>{t("usage.costTrend")}</span>
              <svg className="usage-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("usage.costTrend")}>
                <path className="usage-chart-grid" d={`M 0 ${height - 1} H ${width}`} />
                <path className="usage-original-cost-line" d={buildPath(originalCosts, width, height, maxCost)} />
                <path className="usage-actual-cost-line" d={buildPath(actualCosts, width, height, maxCost)} />
              </svg>
              <div className="usage-cost-chart-footer">
                <span>{formatPointTime(points[points.length - 1]?.time ?? "")}</span>
                <strong>
                  {formatCost(actualCosts[actualCosts.length - 1])} / {formatCost(originalCosts[originalCosts.length - 1])}
                </strong>
                <em>{t("usage.maxCost")}: {formatCost(maxCost)}</em>
              </div>
            </article>
          )}
        </div>
      ) : (
        <div className="usage-chart-empty">{t("usage.empty")}</div>
      )}
    </section>
  );
}
