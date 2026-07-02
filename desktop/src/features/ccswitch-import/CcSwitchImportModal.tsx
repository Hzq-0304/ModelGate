import { useState } from "react";
import type { CcSwitchImportReport } from "../../api";
import { useI18n } from "../../i18n/i18n";
import "./ccswitchImportModal.css";

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
  auth_type?: "env" | "ccswitch" | "static-header-ref";
  auth_source?: string;
  auth_status?: "imported" | "fallback" | "missing";
  credential_id?: string;
  credential_ref?: string;
  credential_path?: string;
  source_config_hash?: string;
  source_fingerprint?: string;
  source_order?: number;
  duplicate?: {
    existing_alias?: string;
    existing_provider?: string;
    reason: string;
    match: "source_config_hash" | "source_fingerprint" | "source_provider_id" | "base_model_auth";
  };
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

type CcSwitchImportModalProps = {
  open: boolean;
  message: string;
  report: CcSwitchImportReport | null;
  drafts: CcSwitchImportDraft[];
  generateNewNames: boolean;
  busyAction: string | null;
  configLoaded: boolean;
  onClose: () => void;
  onGenerateNewNamesChange: (value: boolean) => void;
  onImport: () => void;
  onScanAuto: () => void;
  onSelectDatabase: () => void;
  onUpdateDraft: (id: string, patch: Partial<CcSwitchImportDraft>) => void;
};

type EditDraft = Pick<
  CcSwitchImportDraft,
  "id" | "aliasName" | "description" | "modelValue" | "providerName" | "baseUrl" | "envName"
>;

function isProblemMessage(message: string) {
  return message.startsWith("Import failed")
    || message.startsWith("Scan failed")
    || message.startsWith("CC Switch database was not found");
}

function draftToEdit(draft: CcSwitchImportDraft): EditDraft {
  return {
    id: draft.id,
    aliasName: draft.aliasName,
    description: draft.description ?? "",
    modelValue: draft.modelValue,
    providerName: draft.providerName,
    baseUrl: draft.baseUrl,
    envName: draft.envName
  };
}

export function CcSwitchImportModal({
  open,
  message,
  report,
  drafts,
  generateNewNames,
  busyAction,
  configLoaded,
  onClose,
  onGenerateNewNamesChange,
  onImport,
  onScanAuto,
  onSelectDatabase,
  onUpdateDraft
}: CcSwitchImportModalProps) {
  const { t } = useI18n();
  const selectedCount = drafts.filter((draft) => draft.selected && (!draft.duplicate || generateNewNames)).length;
  const scanning = busyAction === "ccswitch:scan";
  const selecting = busyAction === "ccswitch:select";
  const importing = busyAction === "ccswitch:import";
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const editingSource = editing ? drafts.find((draft) => draft.id === editing.id) ?? null : null;

  if (!open) {
    return null;
  }

  function saveEditing() {
    if (!editing) {
      return;
    }

    onUpdateDraft(editing.id, {
      aliasName: editing.aliasName,
      description: editing.description,
      modelValue: editing.modelValue,
      providerName: editing.providerName,
      baseUrl: editing.baseUrl,
      envName: editing.envName
    });
    setEditing(null);
  }

  function updateSelected(draft: CcSwitchImportDraft, selected: boolean) {
    onUpdateDraft(draft.id, {
      selected,
      duplicate: draft.duplicate
    });
  }

  return (
    <div className="ccswitch-import-backdrop" role="presentation">
      <section aria-modal="true" className="ccswitch-import-modal" role="dialog">
        <header className="ccswitch-import-header">
          <div>
            <h2>{t("ccswitchImport.modal.title")}</h2>
            <p>{t("ccswitchImport.modal.description")}</p>
          </div>
          <button className="secondary ccswitch-import-close" onClick={onClose} type="button">
            {t("ccswitchImport.modal.cancel")}
          </button>
        </header>

        <div className="ccswitch-import-toolbar">
          <div className="server-actions">
            <button type="button" onClick={onScanAuto} disabled={busyAction !== null}>
              {scanning ? t("config.scanning") : t("ccswitchImport.modal.rescan")}
            </button>
            <button className="secondary" type="button" onClick={onSelectDatabase} disabled={busyAction !== null}>
              {selecting ? t("config.selecting") : t("ccswitchImport.modal.selectDatabase")}
            </button>
          </div>
          <span className={isProblemMessage(message) ? "action-message bad" : "action-message"}>{message}</span>
        </div>

        <div className="ccswitch-import-count">
          <strong>{t("ccswitchImport.modal.foundCount", { count: drafts.length })}</strong>
          {report && report.skippedModelGateManaged > 0 && (
            <span>{t("ccswitch.simple.skippedManaged", { count: report.skippedModelGateManaged })}</span>
          )}
        </div>

        <details className="ccswitch-import-safety">
          <summary>{t("ccswitchImport.safety")}</summary>
          <p>{t("ccswitchImport.safetyBody")}</p>
        </details>

        <label className="inline-checkbox ccswitch-import-conflicts">
          <input
            type="checkbox"
            checked={generateNewNames}
            onChange={(event) => onGenerateNewNamesChange(event.target.checked)}
          />
          {t("ccswitch.simple.generateNames")}
        </label>

        {drafts.length > 0 ? (
          <div className="ccswitch-import-list">
            {drafts.map((draft) => (
              <article className={draft.duplicate ? "ccswitch-import-item duplicate" : "ccswitch-import-item"} key={draft.id}>
                <label className="ccswitch-import-check">
                  <input
                    disabled={Boolean(draft.duplicate) && !generateNewNames}
                    type="checkbox"
                    checked={draft.selected}
                    onChange={(event) => updateSelected(draft, event.target.checked)}
                  />
                </label>
                <div className="ccswitch-import-item-main">
                  <strong>{draft.name}</strong>
                  <p title={draft.description}>{draft.description || t("ccswitchImport.item.noDescription")}</p>
                  {draft.duplicate && (
                    <span className="ccswitch-import-source-line">
                      {t("ccswitchImport.item.alreadyImported", { alias: draft.duplicate.existing_alias ?? draft.duplicate.existing_provider ?? "-" })}
                      {" "}
                      {t("ccswitchImport.item.duplicateReason", { reason: draft.duplicate.reason })}
                    </span>
                  )}
                  {!draft.api_key_detected && (
                    <span className="ccswitch-import-warning-line">
                      {draft.auth_type === "ccswitch"
                        ? t("ccswitchImport.item.missingCredential", { env: draft.envName })
                        : t("ccswitchImport.item.missingApiKey", { env: draft.envName })}
                    </span>
                  )}
                  {draft.auth_source && (
                    <span className="ccswitch-import-source-line">
                      {t("ccswitchImport.item.authSource", { source: draft.auth_source })}
                    </span>
                  )}
                </div>
                {draft.warnings.length > 0 && <span className="ccswitch-import-status" title={draft.warnings.join("\n")} />}
                <button
                  aria-label={t("ccswitchImport.item.edit")}
                  className="secondary ccswitch-import-edit-button"
                  onClick={() => setEditing(draftToEdit(draft))}
                  type="button"
                >
                  {t("ccswitchImport.item.edit")}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>{t("ccswitchImport.modal.empty")}</strong>
            <p>{t("ccswitch.simple.emptyHint")}</p>
          </div>
        )}

        <footer className="ccswitch-import-footer">
          <span>{t("ccswitchImport.modal.selectedCount", { count: selectedCount })}</span>
          <div className="server-actions">
            <button className="secondary" onClick={onClose} type="button" disabled={busyAction !== null}>
              {t("ccswitchImport.modal.cancel")}
            </button>
            <button onClick={onImport} disabled={!configLoaded || busyAction !== null || selectedCount === 0}>
              {importing ? t("config.importing") : t("ccswitchImport.modal.importSelected")}
            </button>
          </div>
        </footer>
      </section>

      {editing && editingSource && (
        <section aria-modal="true" className="ccswitch-edit-modal" role="dialog">
          <header className="ccswitch-edit-header">
            <h3>{t("ccswitchImport.edit.title")}</h3>
            <button className="secondary ccswitch-import-close" onClick={() => setEditing(null)} type="button">
              {t("ccswitchImport.edit.cancel")}
            </button>
          </header>

          <div className="ccswitch-edit-form">
            <label>
              {t("ccswitchImport.edit.aliasName")}
              <input value={editing.aliasName} onChange={(event) => setEditing({ ...editing, aliasName: event.target.value })} />
            </label>
            <label>
              {t("ccswitchImport.edit.description")}
              <textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
            </label>
            <label>
              {t("ccswitchImport.edit.model")}
              <input value={editing.modelValue} onChange={(event) => setEditing({ ...editing, modelValue: event.target.value })} />
            </label>
            <label>
              {t("ccswitchImport.edit.provider")}
              <input value={editing.providerName} onChange={(event) => setEditing({ ...editing, providerName: event.target.value })} />
            </label>
            <label>
              {t("ccswitchImport.edit.baseUrl")}
              <input value={editing.baseUrl} onChange={(event) => setEditing({ ...editing, baseUrl: event.target.value })} />
            </label>
            <label>
              {t("ccswitchImport.edit.apiKeyEnv")}
              <input value={editing.envName} onChange={(event) => setEditing({ ...editing, envName: event.target.value })} />
            </label>
            <div className="ccswitch-edit-readonly">
              <span>{t("ccswitchImport.edit.authSource")}</span>
              <code>{editingSource.auth_source ?? editingSource.auth_type ?? "env"}</code>
            </div>
            {editingSource.duplicate && (
              <div className="ccswitch-edit-readonly">
                <span>{t("ccswitchImport.edit.duplicate")}</span>
                <code>
                  {t("ccswitchImport.item.alreadyImported", { alias: editingSource.duplicate.existing_alias ?? editingSource.duplicate.existing_provider ?? "-" })}
                  {" "}
                  {t("ccswitchImport.item.duplicateReason", { reason: editingSource.duplicate.reason })}
                </code>
              </div>
            )}
            <div className="ccswitch-edit-readonly">
              <span>{t("ccswitchImport.edit.apiKeyPreview")}</span>
              <code>
                {editingSource.api_key_detected
                  ? editingSource.api_key_preview ?? "****"
                  : t("ccswitch.notDetected")}
              </code>
            </div>
            <div className="ccswitch-edit-readonly">
              <span>{t("ccswitchImport.edit.warnings")}</span>
              {editingSource.warnings.length > 0 ? (
                <div className="warning-list compact">
                  {editingSource.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              ) : (
                <code>-</code>
              )}
            </div>
          </div>

          <footer className="ccswitch-edit-footer">
            <button className="secondary" onClick={() => setEditing(null)} type="button">
              {t("ccswitchImport.edit.cancel")}
            </button>
            <button onClick={saveEditing} type="button">
              {t("ccswitchImport.edit.save")}
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
