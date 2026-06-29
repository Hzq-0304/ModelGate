import type { CcSwitchProviderLink } from "../../api";
import { useI18n } from "../../i18n/i18n";

export type CcSwitchExportDraft = {
  name: string;
  app: string;
  endpoint: string;
  apiKey: string;
  model: string;
};

type CcSwitchExportPanelProps = {
  appLabels: Record<string, string>;
  busyAction: string | null;
  disconnected: boolean;
  draft: CcSwitchExportDraft;
  message: string;
  deepLink: string;
  onDraftChange: (draft: CcSwitchExportDraft) => void;
  onGenerateDefaults: (app: string) => Promise<CcSwitchProviderLink>;
  onGenerateMessage: (message: string) => void;
  onOpen: () => void;
  onCopy: () => void;
};

export function CcSwitchExportPanel({
  appLabels,
  busyAction,
  disconnected,
  draft,
  message,
  deepLink,
  onDraftChange,
  onGenerateDefaults,
  onGenerateMessage,
  onOpen,
  onCopy
}: CcSwitchExportPanelProps) {
  const { t } = useI18n();

  return (
    <section className="card config-card ccswitch-export-card">
      <div className="card-heading">
        <span>{t("config.exportToCcSwitch")}</span>
        <button
          className="secondary"
          onClick={() => void onGenerateDefaults(draft.app).catch((error) => onGenerateMessage(`Generate failed: ${error instanceof Error ? error.message : String(error)}`))}
          disabled={busyAction !== null || disconnected}
        >
          {t("config.generateDefaults")}
        </button>
      </div>
      <p className="muted">
        Export ModelGate as a local provider through a CC Switch deep link. The link uses the local placeholder API key only.
      </p>
      <div className="ccswitch-export-form">
        <label>
          {t("config.providerName")}
          <input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} />
        </label>
        <label>
          {t("config.targetApp")}
          <select value={draft.app} onChange={(event) => onDraftChange({ ...draft, app: event.target.value })}>
            {Object.entries(appLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          {t("config.endpoint")}
          <input value={draft.endpoint} onChange={(event) => onDraftChange({ ...draft, endpoint: event.target.value })} />
        </label>
        <label>
          {t("config.apiKey")}
          <input value={draft.apiKey} readOnly disabled />
        </label>
        <label>
          {t("common.model")}
          <input value={draft.model} onChange={(event) => onDraftChange({ ...draft, model: event.target.value })} />
        </label>
      </div>
      <dl className="ccswitch-export-preview">
        <div>
          <dt>{t("common.name")}</dt>
          <dd>{draft.name}</dd>
        </div>
        <div>
          <dt>App</dt>
          <dd>{appLabels[draft.app] ?? draft.app}</dd>
        </div>
        <div>
          <dt>{t("config.endpoint")}</dt>
          <dd>{draft.endpoint}</dd>
        </div>
        <div>
          <dt>{t("config.apiKey")}</dt>
          <dd>{draft.apiKey}</dd>
        </div>
        <div>
          <dt>{t("common.model")}</dt>
          <dd>{draft.model}</dd>
        </div>
      </dl>
      <pre className="deep-link-preview">{deepLink}</pre>
      <div className="server-actions">
        <button onClick={onOpen} disabled={busyAction !== null}>
          {busyAction === "ccswitch:open" ? t("config.opening") : t("config.openInCcSwitch")}
        </button>
        <button className="secondary" onClick={onCopy} disabled={busyAction !== null}>
          {t("config.copyDeepLink")}
        </button>
        <span className={message.startsWith("Open failed") || message.startsWith("Generate failed") ? "action-message bad" : "action-message"}>
          {message}
        </span>
      </div>
    </section>
  );
}
