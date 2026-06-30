import { useI18n } from "../../i18n/i18n";
import "./quickStart.css";

type QuickStartProps = {
  busyAction: string | null;
  hasAccounts: boolean;
  serverRunning: boolean;
  onOpenSettings: () => void;
  onStartServer: () => void;
  onSwitchAccount: () => void;
};

export function QuickStart({
  busyAction,
  hasAccounts,
  serverRunning,
  onOpenSettings,
  onStartServer,
  onSwitchAccount
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
        {serverRunning ? (
          <>
            <button disabled type="button">
              {t("home.serverRunning")}
            </button>
            <button className="secondary" type="button" onClick={onSwitchAccount}>
              {t("home.switchAccount")}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onStartServer} disabled={busyAction !== null}>
              {busyAction === "server:start" ? t("advanced.starting") : t("home.startServer")}
            </button>
            <button className="secondary" type="button" onClick={onOpenSettings}>
              {t("home.openSettings")}
            </button>
          </>
        )}
      </div>

      {!hasAccounts && (
        <p className="quick-start-hint">{t("home.noAccountsHint")}</p>
      )}
    </section>
  );
}
