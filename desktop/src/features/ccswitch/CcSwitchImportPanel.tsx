import type { CcSwitchImportReport } from "../../api";
import { useI18n } from "../../i18n/i18n";

export type CcSwitchImportDraft = {
  id: string;
  app: string;
  name: string;
  provider_name: string;
  provider_type: "openai-compatible" | "unknown";
  base_url?: string;
  description?: string;
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
  message: string;
  report: CcSwitchImportReport | null;
  drafts: CcSwitchImportDraft[];
  generateNewNames: boolean;
  busyAction: string | null;
  configLoaded: boolean;
  onCancel: () => void;
  onGenerateNewNamesChange: (value: boolean) => void;
  onImport: () => void;
  onScanAuto: () => void;
  onSelectDatabase: () => void;
  onUpdateDraft: (id: string, patch: Partial<CcSwitchImportDraft>) => void;
};

function isProblemMessage(message: string) {
  return message.startsWith("Import failed")
    || message.startsWith("Scan failed")
    || message.startsWith("CC Switch database was not found");
}

export function CcSwitchImportPanel({
  message,
  report,
  drafts,
  generateNewNames,
  busyAction,
  configLoaded,
  onCancel,
  onGenerateNewNamesChange,
  onImport,
  onScanAuto,
  onSelectDatabase,
  onUpdateDraft
}: CcSwitchImportPanelProps) {
  const { t } = useI18n();
  const selectedCount = drafts.filter((draft) => draft.selected).length;
  const scanning = busyAction === "ccswitch:scan";
  const selecting = busyAction === "ccswitch:select";
  const importing = busyAction === "ccswitch:import";

  return (
    <section className="ccswitch-simple card config-card">
      <div className="ccswitch-simple-heading">
        <div>
          <span className="field-label">{t("ccswitch.simple.kicker")}</span>
          <h3>{t("ccswitch.simple.title")}</h3>
          <p className="muted">{t("ccswitch.simple.subtitle")}</p>
        </div>
        <strong>{t("ccswitch.simple.found", { count: drafts.length })}</strong>
      </div>

      <div className="server-actions">
        <button type="button" onClick={onScanAuto} disabled={busyAction !== null}>
          {scanning ? t("config.scanning") : t("ccswitch.simple.rescan")}
        </button>
        <button className="secondary" type="button" onClick={onSelectDatabase} disabled={busyAction !== null}>
          {selecting ? t("config.selecting") : t("ccswitch.simple.selectDatabase")}
        </button>
        <button className="secondary" type="button" onClick={onCancel} disabled={busyAction !== null}>
          {t("ccswitch.simple.cancel")}
        </button>
        <span className={isProblemMessage(message) ? "action-message bad" : "action-message"}>{message}</span>
      </div>

      <label className="inline-checkbox">
        <input
          type="checkbox"
          checked={generateNewNames}
          onChange={(event) => onGenerateNewNamesChange(event.target.checked)}
        />
        {t("ccswitch.simple.generateNames")}
      </label>

      {drafts.length > 0 ? (
        <div className="ccswitch-model-list">
          {drafts.map((draft) => (
            <article className={draft.complete ? "ccswitch-model-card" : "ccswitch-model-card incomplete"} key={draft.id}>
              <label className="ccswitch-model-select">
                <input
                  type="checkbox"
                  checked={draft.selected}
                  onChange={(event) => onUpdateDraft(draft.id, { selected: event.target.checked })}
                />
                <span>{t("config.import")}</span>
              </label>

              <div className="ccswitch-model-main">
                <strong>{draft.name}</strong>
                <code>{draft.aliasName}</code>
                {draft.description && (
                  <p className="ccswitch-description" title={draft.description}>{draft.description}</p>
                )}
              </div>

              <dl className="ccswitch-model-details">
                <div>
                  <dt>{t("common.model")}</dt>
                  <dd>{draft.modelValue || "-"}</dd>
                </div>
                <div>
                  <dt>{t("common.provider")}</dt>
                  <dd>{draft.provider_name || draft.providerName}</dd>
                </div>
                <div>
                  <dt>{t("config.baseUrl")}</dt>
                  <dd title={draft.baseUrl}>{draft.baseUrl || "-"}</dd>
                </div>
                <div>
                  <dt>{t("ccswitch.simple.description")}</dt>
                  <dd title={draft.description}>{draft.description || "-"}</dd>
                </div>
                <div>
                  <dt>{t("config.apiKey")}</dt>
                  <dd>
                    {draft.api_key_detected
                      ? t("ccswitch.simple.apiKeyDetected", {
                        preview: draft.api_key_preview ?? "****",
                        env: draft.envName
                      })
                      : t("ccswitch.simple.apiKeyMissing", { env: draft.envName })}
                  </dd>
                </div>
              </dl>

              {draft.warnings.length > 0 && (
                <div className="warning-list compact">
                  {draft.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>{t("ccswitch.simple.empty")}</strong>
          <p>{t("ccswitch.simple.emptyHint")}</p>
        </div>
      )}

      <div className="server-actions ccswitch-import-actions">
        <button onClick={onImport} disabled={!configLoaded || busyAction !== null || selectedCount === 0}>
          {importing ? t("config.importing") : t("ccswitch.simple.importSelected")}
        </button>
        <span className="action-message">{t("ccswitch.simple.selected", { count: selectedCount })}</span>
      </div>

      <details className="ccswitch-scan-details">
        <summary>{t("ccswitch.simple.showDetails")}</summary>
        {report ? (
          <div className="scan-details-body">
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
                <dd>{t("ccswitch.simple.skippedManaged", { count: report.skippedModelGateManaged })}</dd>
              </div>
            </dl>
            {report.warnings.length > 0 && (
              <div className="warning-list">
                {report.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="muted">{t("ccswitch.scanFirst")}</p>
        )}
      </details>
    </section>
  );
}
