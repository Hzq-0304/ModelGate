import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
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

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ConfigUsagePanel({
  groups,
  range
}: {
  groups?: Record<string, UsageSummaryGroup>;
  range: UsageOverviewRange;
}) {
  const { t } = useI18n();
  const [expandedAlias, setExpandedAlias] = useState<string | null>(null);
  const [recordsByAlias, setRecordsByAlias] = useState<Record<string, UsageRecord[]>>({});
  const [loadingAlias, setLoadingAlias] = useState<string | null>(null);
  const entries = Object.entries(groups ?? {})
    .sort((a, b) => b[1].requests - a[1].requests)
    .slice(0, 6);

  useEffect(() => {
    setExpandedAlias(null);
    setRecordsByAlias({});
    setLoadingAlias(null);
  }, [range]);

  async function toggleAlias(alias: string) {
    if (expandedAlias === alias) {
      setExpandedAlias(null);
      return;
    }

    setExpandedAlias(alias);
    if (alias === "unknown" || recordsByAlias[alias]) {
      return;
    }

    setLoadingAlias(alias);
    try {
      const result = await getUsageRecords({ range, alias, limit: 5 });
      setRecordsByAlias((current) => ({
        ...current,
        [alias]: result.records
      }));
    } catch {
      setRecordsByAlias((current) => ({
        ...current,
        [alias]: []
      }));
    } finally {
      setLoadingAlias((current) => current === alias ? null : current);
    }
  }

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
          {entries.map(([alias, value]) => {
            const expanded = expandedAlias === alias;
            const detailRecords = recordsByAlias[alias] ?? [];
            const loading = loadingAlias === alias;

            return (
              <article className={expanded ? "usage-config-card expanded" : "usage-config-card"} key={alias}>
                <button
                  aria-expanded={expanded}
                  className="usage-config-card-button"
                  onClick={() => void toggleAlias(alias)}
                  type="button"
                >
                  <div className="usage-config-main">
                    <strong>{alias}</strong>
                    <span>{formatNumber(value.requests)} {t("usage.requests")} · {formatNumber(value.total_tokens)} {t("usage.tokens")}</span>
                  </div>
                  <div className="usage-config-costs">
                    <span>{formatCost(value.actual_cost_usd ?? value.estimated_cost_usd, value.cost_available)}</span>
                    <small>{t("usage.originalCost")}: {formatCost(value.original_cost_usd ?? value.estimated_cost_usd, value.cost_available)}</small>
                  </div>
                  <ChevronDown aria-hidden="true" className="usage-config-chevron" size={18} />
                </button>
                {expanded && (
                  <div className="usage-config-detail">
                    <div className="usage-config-detail-grid">
                      <span><strong>{formatNumber(value.success)}</strong>{t("usage.success")}</span>
                      <span><strong>{formatNumber(value.failed)}</strong>{t("usage.failed")}</span>
                      <span><strong>{formatNumber(value.input_tokens)}</strong>{t("usage.input")}</span>
                      <span><strong>{formatNumber(value.output_tokens)}</strong>{t("usage.output")}</span>
                      <span><strong>{formatNumber(value.cached_tokens)}</strong>{t("usage.cachedTokens")}</span>
                    </div>
                    <div className="usage-config-records">
                      {loading ? (
                        <div className="usage-config-record muted">{t("usage.refreshing")}</div>
                      ) : detailRecords.length > 0 ? (
                        detailRecords.map((record) => (
                          <div className={record.ok ? "usage-config-record" : "usage-config-record failed"} key={record.id}>
                            <span>{formatTime(record.timestamp)}</span>
                            <span>{record.api_type === "responses" ? "responses" : "chat"}</span>
                            <span>{formatNumber(record.total_tokens)} {t("usage.tokens")}</span>
                            <span>{formatCost(record.actual_cost_usd ?? record.estimated_cost_usd, record.cost_available)}</span>
                            <strong>{record.ok ? "OK" : record.status_code ?? "ERR"}</strong>
                          </div>
                        ))
                      ) : (
                        <div className="usage-config-record muted">{t("usage.empty")}</div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="usage-empty compact">{t("usage.empty")}</div>
      )}
    </section>
  );
}

export function UsageOverview({ activeModel }: { activeModel?: string }) {
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
  }, [range, t]);

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

      <UsageSummaryCards activeModel={activeModel} summary={summary} />
      <UsageTrendChart timeline={timeline} />
      <section className="usage-lower-grid">
        <UsageRecentTable records={records} />
        <ConfigUsagePanel groups={summary?.by_alias} range={range} />
        <div className="usage-distribution-stack">
          <DistributionPanel title={t("usage.providerDistribution")} groups={summary?.by_provider} />
          <DistributionPanel title={t("usage.modelDistribution")} groups={summary?.by_model} />
        </div>
      </section>

      <div className={message.startsWith("Usage refresh failed") ? "usage-message bad" : "usage-message"}>
        {loading ? t("usage.refreshing") : message}
      </div>
    </section>
  );
}
