import type { UsageRecord } from "./usageTypes";

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatNumber(value: number | undefined) {
  return value === undefined ? "N/A" : value.toLocaleString("en-US");
}

function formatCost(record: UsageRecord) {
  return record.cost_available && typeof record.estimated_cost_usd === "number"
    ? `$${record.estimated_cost_usd.toFixed(6)}`
    : "N/A";
}

export function UsageRecentTable({ records }: { records: UsageRecord[] }) {
  return (
    <section className="usage-table-panel">
      <div className="usage-section-title">Recent Usage</div>
      {records.length > 0 ? (
        <div className="usage-table">
          <div className="usage-row usage-head">
            <span>Time</span>
            <span>Alias</span>
            <span>Provider</span>
            <span>Model</span>
            <span>API</span>
            <span>Input</span>
            <span>Output</span>
            <span>Total</span>
            <span>Cost</span>
            <span>Status</span>
          </div>
          {records.map((record) => (
            <div className={record.ok ? "usage-row" : "usage-row failed"} key={record.id}>
              <span>{formatTime(record.timestamp)}</span>
              <span>{record.resolved_alias ?? record.requested_model ?? "-"}</span>
              <span>{record.provider ?? "-"}</span>
              <span>{record.upstream_model ?? "-"}</span>
              <span>{record.api_type === "responses" ? "responses" : "chat"}</span>
              <span>{formatNumber(record.input_tokens)}</span>
              <span>{formatNumber(record.output_tokens)}</span>
              <span>{formatNumber(record.total_tokens)}</span>
              <span>{formatCost(record)}</span>
              <span><span className={record.ok ? "pill" : "pill bad"}>{record.ok ? "OK" : record.status_code ?? "ERR"}</span></span>
            </div>
          ))}
        </div>
      ) : (
        <div className="usage-empty">No usage records yet. Send a request through ModelGate to see usage here.</div>
      )}
    </section>
  );
}
