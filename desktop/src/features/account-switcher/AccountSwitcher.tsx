import { AccountCard } from "./AccountCard";
import {
  formatAliasTitle,
  type AccountAlias,
  type ConnectionState
} from "./accountTypes";
import { useI18n } from "../../i18n/i18n";
import "./accountSwitcher.css";

type AccountSwitcherProps = {
  connection: ConnectionState;
  endpoint: string;
  activeAliasName?: string;
  activeAlias?: AccountAlias | null;
  accounts: AccountAlias[];
  message: string;
  switchingAlias?: string | null;
  onGoToIntegrations?: () => void;
  onSelectAccount: (alias: string) => void;
  onAlreadyActive: () => void;
};

export function AccountSwitcher({
  connection,
  endpoint,
  activeAliasName,
  activeAlias,
  accounts,
  message,
  switchingAlias,
  onGoToIntegrations,
  onSelectAccount,
  onAlreadyActive
}: AccountSwitcherProps) {
  const { t } = useI18n();
  const disconnected = connection === "disconnected";
  const activeName = activeAliasName ?? activeAlias?.name;

  function handleSelect(alias: string) {
    if (disconnected) {
      return;
    }

    if (alias === activeName) {
      onAlreadyActive();
      return;
    }

    onSelectAccount(alias);
  }

  return (
    <section className="switcher-page">
      <section className="switcher-hero">
        <div>
          <span className="switcher-kicker">{t("switcher.title")}</span>
          <h2>{activeName ? formatAliasTitle(activeName) : t("switcher.noActive")}</h2>
          <p>{t("switcher.description")}</p>
        </div>
        <div className="switcher-status">
          <span className={`status-dot ${connection}`} />
          <strong>{connection === "connected" ? t("app.connected") : connection === "checking" ? t("app.checking") : t("switcher.serverNotRunning")}</strong>
          <span>{endpoint}/v1</span>
        </div>
      </section>

      {activeName && (
        <section className="switcher-current">
          <dl>
            <div>
              <dt>{t("switcher.currentAccount")}</dt>
              <dd>{activeName}</dd>
            </div>
            <div>
              <dt>{t("common.provider")}</dt>
              <dd>{activeAlias?.provider ?? "-"}</dd>
            </div>
            <div>
              <dt>{t("common.model")}</dt>
              <dd>{activeAlias?.model ?? "-"}</dd>
            </div>
            <div>
              <dt>{t("common.status")}</dt>
              <dd>{connection === "connected" ? t("app.connected") : t("app.disconnected")}</dd>
            </div>
          </dl>
        </section>
      )}

      {disconnected && (
        <section className="switcher-notice">
          {t("switcher.connectToSwitch")}
        </section>
      )}

      <section className="account-grid" aria-label="Accounts">
        {accounts.length > 0 ? (
          accounts.map((account) => (
            <AccountCard
              account={account}
              active={account.name === activeName}
              disabled={disconnected || Boolean(switchingAlias)}
              key={account.name}
              switching={switchingAlias === account.name}
              onSelect={handleSelect}
            />
          ))
        ) : (
          <div className="empty-state switcher-empty">
            <strong>{t("switcher.noAccounts")}</strong>
            {connection === "connected" && onGoToIntegrations && (
              <>
                <p>{t("empty.noAccounts.goToIntegrations")}</p>
                <button className="secondary" onClick={onGoToIntegrations} type="button">
                  {t("empty.noAccounts.integrationsLink")}
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <span className={message.startsWith("Failed") ? "switcher-message bad" : "switcher-message"}>
        {message}
      </span>
    </section>
  );
}
