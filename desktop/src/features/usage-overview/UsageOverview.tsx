import { useEffect, useState } from "react";
import { getUsageRecords, getUsageSummary, getUsageTimeline } from "../../api";
import { UsageRecentTable } from "./UsageRecentTable";
import { UsageSummaryCards } from "./UsageSummaryCards";
import { UsageTrendChart } from "./UsageTrendChart";
import type { UsageOverviewRange, UsageRecord, UsageSummary, UsageSummaryGroup, UsageTimeline } from "./usageTypes";
import { useI18n } from "../../i18n/i18n";
import "./usageOverview.css";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function DistributionPanel({
  title,
  groups
}: {
  title: string;
  groups?: Record<string, UsageSummaryGroup>;
}) {
  const entries = Object.entries(groups ?? {})
    .sort((a, b) => b[1].requests - a[1].requests)
    .slice(0, 5);
  const maxRequests = Math.max(...entries.map(([, value]) => value.requests), 1);

  return (
    <section className="usage-distribution-panel">
      <div className="usage-section-title">{title}</div>
      {entries.length > 0 ? (
        <div className="usage-distribution-list">
          {entries.map(([name, value]) => (
            <div className="usage-distribution-row" key={name}>
              <span>{name}</span>
              <div>
                <i style={{ width: `${Math.max(8, (value.requests / maxRequests) * 100)}%` }} />
              </div>
              <strong title={value.cost_available ? `$${(value.actual_cost_usd ?? value.estimated_cost_usd ?? 0).toFixed(6)}` : undefined}>
                {value.requests}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="usage-empty compact">N/A</div>
      )}
    </section>
  );
}

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-US");
}

function formatCost(value: number | undefined, available: boolean) {
  return available && typeof value === "number" ? `$${value.toFixed(6)}` : "N/A";
}

function ConfigUsagePanel({ groups }: { groups?: Record<string, UsageSummaryGroup> }) {
  const { t } = useI18n();
  const entries = Object.entries(groups ?? {})
    .sort((a, b) => b[1].requests - a[1].requests)
    .slice(0, 6);

  return (
    <section className="usage-config-panel">
      <div className="usage-chart-heading">
        <span>{t("usage.configUsage")}</span>
        <div className="usage-legend">
          <span><i className="legend-actual-cost" />{t("usage.realCost")}</span>
          <span><i className="legend-original-cost" />{t("usage.originalCost")}</span>
        </div>
      </div>
      {entries.length > 0 ? (
        <div className="usage-config-list">
          {entries.map(([alias, value]) => (
            <article className="usage-config-row" key={alias}>
              <div>
                <strong>{alias}</strong>
                <span>{formatNumber(value.requests)} {t("usage.requests")} · {formatNumber(value.total_tokens)} {t("usage.tokens")}</span>
              </div>
              <div className="usage-config-costs">
                <span>{formatCost(value.actual_cost_usd ?? value.estimated_cost_usd, value.cost_available)}</span>
                <small>{t("usage.originalCost")}: {formatCost(value.original_cost_usd ?? value.estimated_cost_usd, value.cost_available)}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="usage-empty compact">{t("usage.empty")}</div>
      )}
    </section>
  );
}

export function UsageOverview({ activeModel, disconnected }: { activeModel?: string; disconnected: boolean }) {
  const { t } = useI18n();
  const [range, setRange] = useState<UsageOverviewRange>("today");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [timeline, setTimeline] = useState<UsageTimeline | null>(null);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [message, setMessage] = useState(t("usage.notLoaded"));
  const [loading, setLoading] = useState(false);
  const ranges: Array<{ label: string; value: UsageOverviewRange }> = [
    { label: t("usage.today"), value: "today" },
    { label: t("usage.last24h"), value: "24h" },
    { label: t("usage.last7d"), value: "7d" }
  ];

  useEffect(() => {
    if (disconnected) {
      setSummary(null);
      setTimeline(null);
      setRecords([]);
      setMessage(t("usage.connect"));
      return;
    }

    let cancelled = false;
    async function loadUsage() {
      setLoading(true);
      try {
        const [nextSummary, nextTimeline, nextRecords] = await Promise.all([
          getUsageSummary(range),
          getUsageTimeline(range, range === "7d" ? "day" : "hour"),
          getUsageRecords({ range, limit: 8 })
        ]);

        if (cancelled) {
          return;
        }

        setSummary(nextSummary);
        setTimeline(nextTimeline);
        setRecords(nextRecords.records);
        setMessage(t("usage.refreshed"));
      } catch (error) {
        if (!cancelled) {
          setMessage(t("usage.refreshFailed", { message: getErrorMessage(error) }));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUsage();
    const timer = window.setInterval(() => void loadUsage(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [disconnected, range, t]);

  return (
    <section className="usage-overview card">
      <div className="usage-topline">
        <div>
          <div className="card-heading usage-heading">
            <span>{t("usage.title")}</span>
            <strong>{range === "today" ? t("usage.today") : range === "24h" ? t("usage.last24h") : t("usage.last7d")}</strong>
          </div>
          <p className="muted">{t("usage.description")}</p>
        </div>
        <div className="usage-toolbar">
          <div className="usage-range" aria-label="Usage range">
            {ranges.map((item) => (
              <button
                className={range === item.value ? "usage-range-button active" : "usage-range-button"}
                key={item.value}
                onClick={() => setRange(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className={loading ? "usage-live-state loading" : "usage-live-state"}>
            <i />
            <span>{loading ? t("usage.refreshing") : t("usage.refreshed")}</span>
          </div>
        </div>
      </div>

      {disconnected ? (
        <div className="usage-empty">{t("usage.connect")}</div>
      ) : (
        <>
          <UsageSummaryCards activeModel={activeModel} summary={summary} />
          <UsageTrendChart timeline={timeline} />
          <section className="usage-lower-grid">
            <UsageRecentTable records={records} />
            <ConfigUsagePanel groups={summary?.by_alias} />
            <div className="usage-distribution-stack">
              <DistributionPanel title={t("usage.providerDistribution")} groups={summary?.by_provider} />
              <DistributionPanel title={t("usage.modelDistribution")} groups={summary?.by_model} />
            </div>
          </section>
        </>
      )}

      <div className={message.startsWith("Usage refresh failed") ? "usage-message bad" : "usage-message"}>
        {loading ? t("usage.refreshing") : message}
      </div>
    </section>
  );
}
