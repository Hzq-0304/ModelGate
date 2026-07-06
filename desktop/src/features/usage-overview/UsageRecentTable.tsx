import type { UsageRecord } from "./usageTypes";
import { useI18n } from "../../i18n/i18n";

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatNumber(value: number | undefined) {
  return value === undefined ? "N/A" : value.toLocaleString("en-US");
}

function formatCost(value: number | undefined, available: boolean) {
  return available && typeof value === "number" ? `$${value.toFixed(6)}` : "N/A";
}

export function UsageRecentTable({ records }: { records: UsageRecord[] }) {
  const { t } = useI18n();

  return (
    <section className="usage-table-panel">
      <div className="usage-section-title">{t("usage.recent")}</div>
      {records.length > 0 ? (
        <div className="usage-table">
          <div className="usage-row usage-head">
            <span>{t("usage.time")}</span>
            <span>{t("common.alias")}</span>
            <span>{t("usage.api")}</span>
            <span>{t("usage.input")}</span>
            <span>{t("usage.output")}</span>
            <span>{t("usage.total")}</span>
            <span>{t("usage.realCost")}</span>
            <span>{t("common.status")}</span>
          </div>
          {records.map((record) => (
            <div className={record.ok ? "usage-row" : "usage-row failed"} key={record.id}>
              <span>{formatTime(record.timestamp)}</span>
              <span>{record.resolved_alias ?? record.requested_model ?? "-"}</span>
              <span>{record.api_type === "responses" ? "responses" : "chat"}</span>
              <span>{formatNumber(record.input_tokens)}</span>
              <span>{formatNumber(record.output_tokens)}</span>
              <span>{formatNumber(record.total_tokens)}</span>
              <span title={`${t("usage.originalCost")}: ${formatCost(record.original_cost_usd ?? record.estimated_cost_usd, record.cost_available)}`}>
                {formatCost(record.actual_cost_usd ?? record.estimated_cost_usd, record.cost_available)}
              </span>
              <span><span className={record.ok ? "pill" : "pill bad"}>{record.ok ? "OK" : record.status_code ?? "ERR"}</span></span>
            </div>
          ))}
        </div>
      ) : (
        <div className="usage-empty">{t("usage.empty")}</div>
      )}
    </section>
  );
}
