import type { UsageSummary } from "./usageTypes";
import { useI18n } from "../../i18n/i18n";
import { ArrowDownToLine, ArrowUpFromLine, BrainCircuit, Database, Sparkles, Zap } from "lucide-react";

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-US");
}

function formatCompactNumber(value: number | undefined) {
  const total = value ?? 0;
  const units = ["", "k", "M", "B", "T"];
  let scaled = total;
  let unitIndex = 0;

  while (Math.abs(scaled) >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return total.toLocaleString("en-US");
  }

  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")} ${units[unitIndex]}`;
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
  const costAvailable = Boolean(summary?.cost_available);
  const saved = typeof original === "number" && typeof actual === "number"
    ? Math.max(0, original - actual)
    : undefined;
  const costCards = [
    {
      label: t("usage.realCost"),
      value: formatCost(actual, costAvailable),
      detail: `${t("usage.originalCost")}: ${formatCost(original, costAvailable)}`,
      tone: "green"
    },
    {
      label: t("usage.savedCost"),
      value: formatCost(saved, costAvailable),
      detail: activeModel ? `${t("usage.currentModel")}: ${activeModel}` : t("usage.currentModel"),
      tone: "amber"
    }
  ];
  const miniStats = [
    {
      label: t("usage.input"),
      value: formatCompactNumber(summary?.input_tokens),
      icon: <ArrowDownToLine />,
      accent: "blue"
    },
    {
      label: t("usage.output"),
      value: formatCompactNumber(summary?.output_tokens),
      icon: <ArrowUpFromLine />,
      accent: "purple"
    },
    {
      label: t("usage.cachedTokens"),
      value: formatCompactNumber(summary?.cached_tokens),
      icon: <Database />,
      accent: "emerald"
    },
    {
      label: t("usage.reasoning"),
      value: formatCompactNumber(summary?.reasoning_tokens),
      icon: <BrainCircuit />,
      accent: "slate"
    }
  ];

  return (
    <section className="usage-hero-panel">
      <div className="usage-hero-top">
        <div className="usage-hero-total">
          <div className="usage-hero-icon">
            <Zap />
          </div>
          <div>
            <span>{t("usage.totalTokens")}</span>
            <div className="usage-hero-total-line">
              <strong title={formatNumber(summary?.total_tokens)}>{formatNumber(summary?.total_tokens)}</strong>
              <small>~ {formatCompactNumber(summary?.total_tokens)}</small>
            </div>
          </div>
        </div>
        <div className="usage-hero-costs">
          {costCards.map((card) => (
            <article className={`usage-hero-cost-card ${card.tone}`} key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </article>
          ))}
        </div>
      </div>
      <div className="usage-hero-breakdown">
        {miniStats.map((item) => (
          <article className={`usage-mini-stat ${item.accent}`} key={item.label}>
            <span>
              {item.icon}
              {item.label}
            </span>
            <strong>{item.value}</strong>
          </article>
        ))}
        <article className="usage-mini-stat cache-rate">
          <span>
            <Sparkles />
            {t("usage.cachedTokens")}
          </span>
          <strong>
            {summary && summary.input_tokens + summary.cached_tokens > 0
              ? `${((summary.cached_tokens / (summary.input_tokens + summary.cached_tokens)) * 100).toFixed(1)}%`
              : "0%"}
          </strong>
          <div>
            <i
              style={{
                width: summary && summary.input_tokens + summary.cached_tokens > 0
                  ? `${Math.min(100, (summary.cached_tokens / (summary.input_tokens + summary.cached_tokens)) * 100)}%`
                  : "0%"
              }}
            />
          </div>
        </article>
      </div>
    </section>
  );
}
