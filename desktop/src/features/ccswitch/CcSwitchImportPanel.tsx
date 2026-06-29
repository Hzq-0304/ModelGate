import type { CcSwitchImportReport } from "../../api";
import { useI18n } from "../../i18n/i18n";

export type CcSwitchImportDraft = {
  id: string;
  app: string;
  name: string;
  provider_type: "openai-compatible" | "unknown";
  base_url?: string;
  api_key_detected: boolean;
  api_key_preview?: string;
  suggested_env_name: string;
  complete: boolean;
  modelgate_managed: boolean;
  warnings: string[];
  models: string[];
  selected: boolean;
  providerName: string;
  baseUrl: string;
  envName: string;
  modelValue: string;
  aliasName: string;
};

type CcSwitchImportPanelProps = {
  path: string;
  message: string;
  report: CcSwitchImportReport | null;
  drafts: CcSwitchImportDraft[];
  showManaged: boolean;
  overwriteProviders: boolean;
  overwriteAliases: boolean;
  setImportedActive: boolean;
  busyAction: string | null;
  configLoaded: boolean;
  onDetect: () => void;
  onScanAuto: () => void;
  onSelectDatabase: () => void;
  onShowManagedChange: (value: boolean) => void;
  onOverwriteProvidersChange: (value: boolean) => void;
  onOverwriteAliasesChange: (value: boolean) => void;
  onSetImportedActiveChange: (value: boolean) => void;
  onUpdateDraft: (id: string, patch: Partial<CcSwitchImportDraft>) => void;
  onImport: () => void;
};

function selectedPreview(drafts: CcSwitchImportDraft[]) {
  const selected = drafts.filter((draft) => draft.selected);
  if (selected.length === 0) {
    return "providers: {}\naliases: {}";
  }

  const providerLines = selected.flatMap((draft) => [
    `  ${draft.providerName}:`,
    "    type: openai-compatible",
    `    base_url: ${draft.baseUrl || "<missing>"}`,
    `    api_key: \${${draft.envName || "ENV_NAME"}}`
  ]);
  const aliasLines = selected.flatMap((draft) => [
    `  ${draft.aliasName}:`,
    `    provider: ${draft.providerName || "<missing>"}`,
    `    model: ${draft.modelValue || "<missing>"}`
  ]);

  return ["providers:", ...providerLines, "", "aliases:", ...aliasLines].join("\n");
}

export function CcSwitchImportPanel({
  path,
  message,
  report,
  drafts,
  showManaged,
  overwriteProviders,
  overwriteAliases,
  setImportedActive,
  busyAction,
  configLoaded,
  onDetect,
  onScanAuto,
  onSelectDatabase,
  onShowManagedChange,
  onOverwriteProvidersChange,
  onOverwriteAliasesChange,
  onSetImportedActiveChange,
  onUpdateDraft,
  onImport
}: CcSwitchImportPanelProps) {
  const { t } = useI18n();
  const messageIsBad = message.startsWith("Import failed") || message.startsWith("Scan failed") || message.startsWith("Detection failed");
  const selectedCount = drafts.filter((draft) => draft.selected).length;

  return (
    <section className="ccswitch-flow">
      <section className="card config-card">
        <div className="card-heading">
          <span>{t("ccswitch.stepSource")}</span>
          <strong>{path ? t("common.ok") : t("config.notLoaded")}</strong>
        </div>
        <p className="muted">{t("ccswitch.safety")}</p>
        <div className="import-source">
          <span className="field-label">{t("ccswitch.autoDetectedDatabase")}</span>
          <code>{path || "C:\\Users\\<User>\\.cc-switch\\cc-switch.db"}</code>
          <span className={messageIsBad ? "action-message bad" : "action-message"}>{message}</span>
        </div>
        <div className="server-actions">
          <button onClick={onDetect} disabled={busyAction !== null}>
            {busyAction === "ccswitch:detect" ? t("config.detecting") : t("config.autoDetect")}
          </button>
          <button onClick={onScanAuto} disabled={busyAction !== null || !path}>
            {busyAction === "ccswitch:scan" ? t("config.scanning") : t("config.scanAuto")}
          </button>
          <button className="secondary" onClick={onSelectDatabase} disabled={busyAction !== null}>
            {busyAction === "ccswitch:select" ? t("config.selecting") : t("config.selectDb")}
          </button>
        </div>
      </section>

      <section className="card config-card">
        <div className="card-heading">
          <span>{t("ccswitch.stepReport")}</span>
          <strong>{report?.parser ?? "-"}</strong>
        </div>
        {report ? (
          <>
            <dl className="scan-report-summary">
              <div>
                <dt>{t("ccswitch.parser")}</dt>
                <dd>{report.parser}</dd>
              </div>
              <div>
                <dt>{t("ccswitch.candidatesFound")}</dt>
                <dd>{report.candidatesFound}</dd>
              </div>
              <div>
                <dt>{t("ccswitch.skippedManaged")}</dt>
                <dd>{report.skippedModelGateManaged}</dd>
              </div>
            </dl>
            <div className="scan-table-list">
              {report.tables.map((table) => (
                <div key={table.name}>
                  <strong>{table.name}</strong>
                  <span>{table.rowCount ?? "-"} rows</span>
                  <code>{table.columns.join(", ") || "-"}</code>
                </div>
              ))}
            </div>
            {report.warnings.length > 0 && (
              <div className="warning-list">
                {report.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="muted">{t("ccswitch.scanFirst")}</p>
        )}
      </section>

      <section className="card config-card">
        <div className="card-heading">
          <span>{t("ccswitch.stepCandidates")}</span>
          <strong>{drafts.length}</strong>
        </div>
        <div className="import-options">
          <label>
            <input type="checkbox" checked={showManaged} onChange={(event) => onShowManagedChange(event.target.checked)} />
            {t("ccswitch.showManaged")}
          </label>
        </div>
        {drafts.length > 0 ? (
          <div className="ccswitch-table">
            <div className="ccswitch-row ccswitch-head">
              <span>{t("config.import")}</span>
              <span>{t("common.name")}</span>
              <span>{t("ccswitch.app")}</span>
              <span>{t("common.type")}</span>
              <span>{t("config.baseUrl")}</span>
              <span>{t("common.model")}</span>
              <span>{t("config.detectedKey")}</span>
              <span>{t("config.envNameShort")}</span>
              <span>{t("common.alias")}</span>
              <span>{t("config.warnings")}</span>
            </div>
            {drafts.map((draft) => (
              <div className={draft.complete ? "ccswitch-row" : "ccswitch-row incomplete"} key={draft.id}>
                <span>
                  <input
                    type="checkbox"
                    checked={draft.selected}
                    onChange={(event) => onUpdateDraft(draft.id, { selected: event.target.checked })}
                  />
                </span>
                <input value={draft.providerName} onChange={(event) => onUpdateDraft(draft.id, { providerName: event.target.value })} />
                <span>{draft.app}</span>
                <span>{draft.provider_type}</span>
                <input value={draft.baseUrl} onChange={(event) => onUpdateDraft(draft.id, { baseUrl: event.target.value })} />
                {draft.models.length > 1 ? (
                  <select value={draft.modelValue} onChange={(event) => onUpdateDraft(draft.id, { modelValue: event.target.value })}>
                    {draft.models.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                ) : (
                  <input value={draft.modelValue} onChange={(event) => onUpdateDraft(draft.id, { modelValue: event.target.value })} />
                )}
                <span>{draft.api_key_detected ? draft.api_key_preview ?? t("ccswitch.detected") : t("ccswitch.notDetected")}</span>
                <input value={draft.envName} onChange={(event) => onUpdateDraft(draft.id, { envName: event.target.value })} />
                <input value={draft.aliasName} onChange={(event) => onUpdateDraft(draft.id, { aliasName: event.target.value })} />
                <span>{draft.warnings.join(" ")}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>{t("ccswitch.noCandidatesTitle")}</strong>
            <p>{t("ccswitch.noCandidatesBody")}</p>
            {report && (
              <ul>
                {report.tables
                  .filter((table) => table.name === "providers" || table.name === "provider_endpoints")
                  .map((table) => (
                    <li key={table.name}>{table.name} ({table.columns.join(", ") || "-"})</li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="card config-card">
        <div className="card-heading">
          <span>{t("ccswitch.stepPreview")}</span>
          <strong>{selectedCount}</strong>
        </div>
        <div className="import-options">
          <label>
            <input type="checkbox" checked={overwriteProviders} onChange={(event) => onOverwriteProvidersChange(event.target.checked)} />
            {t("ccswitch.overwriteProviders")}
          </label>
          <label>
            <input type="checkbox" checked={overwriteAliases} onChange={(event) => onOverwriteAliasesChange(event.target.checked)} />
            {t("ccswitch.overwriteAliases")}
          </label>
          <label>
            <input type="checkbox" checked={setImportedActive} onChange={(event) => onSetImportedActiveChange(event.target.checked)} />
            {t("ccswitch.setImportedActive")}
          </label>
        </div>
        <pre className="yaml-preview">{selectedPreview(drafts)}</pre>
        <div className="server-actions">
          <button onClick={onImport} disabled={!configLoaded || busyAction !== null || selectedCount === 0}>
            {busyAction === "ccswitch:import" ? t("config.importing") : t("config.importSelected")}
          </button>
          <span className={messageIsBad ? "action-message bad" : "action-message"}>{message}</span>
        </div>
      </section>
    </section>
  );
}
