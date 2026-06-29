import { useEffect, useState } from "react";
import { getUsageRecords, getUsageSummary, getUsageTimeline } from "../../api";
import { UsageRecentTable } from "./UsageRecentTable";
import { UsageSummaryCards } from "./UsageSummaryCards";
import { UsageTrendChart } from "./UsageTrendChart";
import type { UsageOverviewRange, UsageRecord, UsageSummary, UsageTimeline } from "./usageTypes";
import { useI18n } from "../../i18n/i18n";
import "./usageOverview.css";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function UsageOverview({ disconnected }: { disconnected: boolean }) {
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
      </div>

      {disconnected ? (
        <div className="usage-empty">{t("usage.connect")}</div>
      ) : (
        <>
          <UsageSummaryCards summary={summary} />
          <UsageTrendChart timeline={timeline} />
          <UsageRecentTable records={records} />
        </>
      )}

      <div className={message.startsWith("Usage refresh failed") ? "usage-message bad" : "usage-message"}>
        {loading ? t("usage.refreshing") : message}
      </div>
    </section>
  );
}
