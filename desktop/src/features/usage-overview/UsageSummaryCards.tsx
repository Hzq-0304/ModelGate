import type { UsageSummary } from "./usageTypes";
import { useI18n } from "../../i18n/i18n";

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-US");
}

function formatCost(summary: UsageSummary | null) {
  if (!summary?.cost_available || typeof summary.estimated_cost_usd !== "number") {
    return "N/A";
  }

  return `$${summary.estimated_cost_usd.toFixed(6)}`;
}

export function UsageSummaryCards({ activeModel, summary }: { activeModel?: string; summary: UsageSummary | null }) {
  const { t } = useI18n();
  const cards = [
    [t("usage.requests"), formatNumber(summary?.requests)],
    [t("usage.totalTokens"), formatNumber(summary?.total_tokens)],
    [t("usage.estimatedCost"), formatCost(summary)],
    [t("usage.currentModel"), activeModel ?? "N/A"]
  ];

  return (
    <div className="usage-summary-grid">
      {cards.map(([label, value]) => (
        <article className="usage-metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}
