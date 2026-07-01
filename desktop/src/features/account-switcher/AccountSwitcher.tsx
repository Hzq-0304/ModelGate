import { useEffect, useMemo, useState } from "react";
import type { ConfigWarning } from "../../api";
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
  configWarnings?: ConfigWarning[];
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
  configWarnings = [],
  message,
  switchingAlias,
  onGoToIntegrations,
  onSelectAccount,
  onAlreadyActive
}: AccountSwitcherProps) {
  const { t } = useI18n();
  const disconnected = connection === "disconnected";
  const activeName = activeAliasName ?? activeAlias?.name;
  const [selectedAliasName, setSelectedAliasName] = useState<string | undefined>(activeName);
  const missingEnvByProvider = useMemo(() => {
    const entries = configWarnings
      .filter((warning) => warning.type === "missing_env" && warning.provider)
      .map((warning) => [warning.provider as string, warning.envName ?? warning.env] as const);
    return new Map(entries);
  }, [configWarnings]);
  const selectedAlias = accounts.find((account) => account.name === selectedAliasName)
    ?? activeAlias
    ?? accounts[0]
    ?? null;
  const selectedMissingEnv = selectedAlias ? missingEnvByProvider.get(selectedAlias.provider) : undefined;

  useEffect(() => {
    setSelectedAliasName((current) => current && accounts.some((account) => account.name === current)
      ? current
      : activeName ?? accounts[0]?.name);
  }, [accounts, activeName]);

  function handleSelect(alias: string) {
    setSelectedAliasName(alias);

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
      <section className="switcher-console">
        <div>
          <span className="switcher-kicker">{t("switcher.title")}</span>
          <h2>{activeName ? formatAliasTitle(activeName) : t("switcher.noActive")}</h2>
          <p>{activeAlias ? `${activeAlias.provider} / ${activeAlias.model}` : t("switcher.description")}</p>
        </div>
        <div className="switcher-status">
          <span className={`status-dot ${connection}`} />
          <strong>{connection === "connected" ? t("app.connected") : connection === "checking" ? t("app.checking") : t("switcher.serverNotRunning")}</strong>
          <span>{endpoint}/v1</span>
        </div>
      </section>

      {disconnected && (
        <section className="switcher-notice">
          {t("switcher.connectToSwitch")}
        </section>
      )}

      <section className="switcher-workbench">
        <section className="account-list-panel" aria-label="Accounts">
          <div className="panel-heading compact">
            <span>{t("switcher.accounts")}</span>
            <strong>{accounts.length}</strong>
          </div>
          {accounts.length > 0 ? (
            <div className="account-list">
              {accounts.map((account) => (
                <AccountCard
                  account={account}
                  active={account.name === activeName}
                  disabled={disconnected || Boolean(switchingAlias)}
                  key={account.name}
                  missingEnv={missingEnvByProvider.get(account.provider)}
                  selected={account.name === selectedAlias?.name}
                  switching={switchingAlias === account.name}
                  onSelect={handleSelect}
                />
              ))}
            </div>
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

        <aside className="account-detail-panel">
          <div className="panel-heading compact">
            <span>{t("switcher.details")}</span>
            {selectedAlias?.name === activeName && <strong>{t("common.active")}</strong>}
          </div>
          {selectedAlias ? (
            <>
              <div className="account-detail-title">
                <strong>{formatAliasTitle(selectedAlias.name)}</strong>
                <span className={selectedMissingEnv ? "pill bad" : selectedAlias.name === activeName ? "pill" : "pill neutral"}>
                  {selectedMissingEnv ? t("switcher.missingApiKey") : selectedAlias.name === activeName ? t("switcher.currentlyUsing") : t("common.available")}
                </span>
              </div>
              {selectedAlias.description && <p>{selectedAlias.description}</p>}
              <dl>
                <div>
                  <dt>{t("common.alias")}</dt>
                  <dd>{selectedAlias.name}</dd>
                </div>
                <div>
                  <dt>{t("common.provider")}</dt>
                  <dd>{selectedAlias.provider}</dd>
                </div>
                <div>
                  <dt>{t("common.model")}</dt>
                  <dd>{selectedAlias.model}</dd>
                </div>
                <div>
                  <dt>{t("common.status")}</dt>
                  <dd>{selectedMissingEnv ? t("switcher.missingApiKeyShort", { env: selectedMissingEnv }) : t("common.available")}</dd>
                </div>
              </dl>
              <div className="account-detail-actions">
                <button
                  disabled={disconnected || Boolean(switchingAlias) || selectedAlias.name === activeName}
                  onClick={() => handleSelect(selectedAlias.name)}
                  type="button"
                >
                  {switchingAlias === selectedAlias.name ? t("common.switching") : t("switcher.switchToAlias")}
                </button>
                {onGoToIntegrations && (
                  <button className="secondary" onClick={onGoToIntegrations} type="button">
                    {t("quickStart.configureProviders")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="usage-empty">{t("switcher.noAccounts")}</div>
          )}
        </aside>
      </section>

      <span className={message.startsWith("Failed") ? "switcher-message bad" : "switcher-message"}>
        {message}
      </span>
    </section>
  );
}
