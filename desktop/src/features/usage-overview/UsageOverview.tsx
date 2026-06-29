import { useEffect, useState } from "react";
import { getUsageRecords, getUsageSummary, getUsageTimeline } from "../../api";
import { UsageRecentTable } from "./UsageRecentTable";
import { UsageSummaryCards } from "./UsageSummaryCards";
import { UsageTrendChart } from "./UsageTrendChart";
import type { UsageOverviewRange, UsageRecord, UsageSummary, UsageTimeline } from "./usageTypes";
import "./usageOverview.css";

const ranges: Array<{ label: string; value: UsageOverviewRange }> = [
  { label: "Today", value: "today" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" }
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function UsageOverview({ disconnected }: { disconnected: boolean }) {
  const [range, setRange] = useState<UsageOverviewRange>("today");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [timeline, setTimeline] = useState<UsageTimeline | null>(null);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [message, setMessage] = useState("Usage not loaded");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (disconnected) {
      setSummary(null);
      setTimeline(null);
      setRecords([]);
      setMessage("Connect to ModelGate to view usage.");
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
        setMessage("Usage refreshed");
      } catch (error) {
        if (!cancelled) {
          setMessage(`Usage refresh failed: ${getErrorMessage(error)}`);
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
  }, [disconnected, range]);

  return (
    <section className="usage-overview card">
      <div className="usage-topline">
        <div>
          <div className="card-heading usage-heading">
            <span>Usage Overview</span>
            <strong>{range === "today" ? "Today" : range === "24h" ? "Last 24h" : "Last 7d"}</strong>
          </div>
          <p className="muted">Local token, request, and estimated cost overview.</p>
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
        <div className="usage-empty">Connect to ModelGate to view usage.</div>
      ) : (
        <>
          <UsageSummaryCards summary={summary} />
          <UsageTrendChart timeline={timeline} />
          <UsageRecentTable records={records} />
        </>
      )}

      <div className={message.startsWith("Usage refresh failed") ? "usage-message bad" : "usage-message"}>
        {loading ? "Refreshing usage..." : message}
      </div>
    </section>
  );
}
