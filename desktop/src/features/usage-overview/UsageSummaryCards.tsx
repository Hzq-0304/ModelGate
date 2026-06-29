import type { UsageSummary } from "./usageTypes";

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-US");
}

function formatCost(summary: UsageSummary | null) {
  if (!summary?.cost_available || typeof summary.estimated_cost_usd !== "number") {
    return "N/A";
  }

  return `$${summary.estimated_cost_usd.toFixed(6)}`;
}

export function UsageSummaryCards({ summary }: { summary: UsageSummary | null }) {
  const cards = [
    ["Total Tokens", formatNumber(summary?.total_tokens)],
    ["Input Tokens", formatNumber(summary?.input_tokens)],
    ["Output Tokens", formatNumber(summary?.output_tokens)],
    ["Cached Tokens", formatNumber(summary?.cached_tokens)],
    ["Requests", formatNumber(summary?.requests)],
    ["Estimated Cost", formatCost(summary)]
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
