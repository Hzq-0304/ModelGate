import type { UsageSummary } from "./usageTypes";
import { useI18n } from "../../i18n/i18n";

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-US");
}

function actualCost(summary: UsageSummary | null) {
  return summary?.actual_cost_usd ?? summary?.estimated_cost_usd;
}

function formatCost(value: number | undefined, available = true) {
  if (!available || typeof value !== "number") {
    return "N/A";
  }

  return `$${value.toFixed(6)}`;
}

export function UsageSummaryCards({ activeModel, summary }: { activeModel?: string; summary: UsageSummary | null }) {
  const { t } = useI18n();
  const original = summary?.original_cost_usd;
  const actual = actualCost(summary);
  const saved = typeof original === "number" && typeof actual === "number"
    ? Math.max(0, original - actual)
    : undefined;
  const cards = [
    {
      label: t("usage.realCost"),
      value: formatCost(actual, Boolean(summary?.cost_available)),
      detail: `${t("usage.originalCost")}: ${formatCost(original, Boolean(summary?.cost_available))}`,
      tone: "primary"
    },
    {
      label: t("usage.totalTokens"),
      value: formatNumber(summary?.total_tokens),
      detail: `${t("usage.input")}: ${formatNumber(summary?.input_tokens)} / ${t("usage.output")}: ${formatNumber(summary?.output_tokens)}`,
      tone: "green"
    },
    {
      label: t("usage.requests"),
      value: formatNumber(summary?.requests),
      detail: `${t("usage.success")}: ${formatNumber(summary?.success)} / ${t("usage.failed")}: ${formatNumber(summary?.failed)}`,
      tone: "blue"
    },
    {
      label: t("usage.savedCost"),
      value: formatCost(saved, Boolean(summary?.cost_available)),
      detail: activeModel ? `${t("usage.currentModel")}: ${activeModel}` : t("usage.currentModel"),
      tone: "amber"
    }
  ];

  return (
    <div className="usage-summary-grid">
      {cards.map((card) => (
        <article className={`usage-metric ${card.tone}`} key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.detail}</small>
        </article>
      ))}
    </div>
  );
}
