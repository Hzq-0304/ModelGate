import type { UsageTimeline } from "./usageTypes";
import { useI18n } from "../../i18n/i18n";

function buildPath(values: number[], width: number, height: number) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;

  return values
    .map((value, index) => {
      const x = values.length > 1 ? index * step : width / 2;
      const y = height - (value / max) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
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
  const costs = hasCost ? points.map((point) => point.estimated_cost_usd ?? 0) : [];
  const panels = [
    { label: t("usage.requestsTrend"), className: "usage-request-line", values: requests, enabled: true },
    { label: t("usage.tokensTrend"), className: "usage-token-line", values: tokens, enabled: true },
    { label: t("usage.costTrend"), className: "usage-cost-line", values: costs, enabled: hasCost }
  ];

  return (
    <section className="usage-chart-panel">
      <div className="usage-chart-heading">
        <span>{t("usage.trend")}</span>
        <div className="usage-legend">
          <span><i className="legend-token" />{t("usage.tokens")}</span>
          {hasCost && <span><i className="legend-cost" />{t("usage.cost")}</span>}
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
        </div>
      ) : (
        <div className="usage-chart-empty">{t("usage.empty")}</div>
      )}
    </section>
  );
}
