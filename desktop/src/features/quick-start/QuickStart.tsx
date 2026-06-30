import { useI18n } from "../../i18n/i18n";
import "./quickStart.css";

type QuickStartProps = {
  busyAction: string | null;
  codexConfig: string;
  codexImportMessage: string;
  deepLink: string;
  showCodexImport: boolean;
  onConfigureProviders: () => void;
  onCopyCodexConfig: () => void;
  onCopyDeepLink: () => void;
  onImportFromCcSwitch: () => void;
  onImportToCodex: () => void;
  onOpenInCcSwitch: () => void;
  onStartServer: () => void;
};

export function QuickStart({
  busyAction,
  codexConfig,
  codexImportMessage,
  deepLink,
  showCodexImport,
  onConfigureProviders,
  onCopyCodexConfig,
  onCopyDeepLink,
  onImportFromCcSwitch,
  onImportToCodex,
  onOpenInCcSwitch,
  onStartServer
}: QuickStartProps) {
  const { t } = useI18n();

  return (
    <section className="quick-start">
      <div className="quick-start-heading">
        <div>
          <span>{t("quickStart.title")}</span>
          <p>{t("quickStart.subtitle")}</p>
        </div>
      </div>

      <div className="quick-start-actions" aria-label={t("quickStart.title")}>
        <button type="button" onClick={onStartServer}>
          {t("quickStart.startServer")}
        </button>
        <button type="button" onClick={onImportFromCcSwitch}>
          {t("quickStart.importFromCcSwitch")}
        </button>
        <button type="button" onClick={onImportToCodex}>
          {t("quickStart.importToCodex")}
        </button>
        <button className="secondary" type="button" onClick={onConfigureProviders}>
          {t("quickStart.configureProviders")}
        </button>
      </div>

      {showCodexImport && (
        <section className="codex-import-panel" id="codex-import-panel">
          <div className="card-heading">
            <span>{t("codexImport.title")}</span>
            <strong>codex-main</strong>
          </div>
          <p className="muted">{t("codexImport.description")}</p>
          <pre>{codexConfig}</pre>
          <div className="server-actions">
            <button type="button" onClick={onOpenInCcSwitch} disabled={busyAction !== null}>
              {busyAction === "codex-import:open" ? t("config.opening") : t("codexImport.openInCcSwitch")}
            </button>
            <button className="secondary" type="button" onClick={onCopyCodexConfig} disabled={busyAction !== null}>
              {t("codexImport.copyCodexConfig")}
            </button>
            <button className="secondary" type="button" onClick={onCopyDeepLink} disabled={busyAction !== null}>
              {t("codexImport.copyDeepLink")}
            </button>
            <span className={codexImportMessage.startsWith("Failed") ? "action-message bad" : "action-message"}>
              {codexImportMessage}
            </span>
          </div>
          <pre className="deep-link-preview">{deepLink}</pre>
        </section>
      )}
    </section>
  );
}
