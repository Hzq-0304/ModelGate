import { useMemo } from "react";
import type { ConfigWarning } from "../../api";
import { AccountCard } from "./AccountCard";
import {
  type AccountAlias,
  type ConnectionState
} from "./accountTypes";
import { useI18n } from "../../i18n/i18n";
import "./accountSwitcher.css";

type AccountSwitcherProps = {
  connection: ConnectionState;
  activeAliasName?: string;
  accounts: AccountAlias[];
  configWarnings?: ConfigWarning[];
  message: string;
  switchingAlias?: string | null;
  onGoToIntegrations?: () => void;
  onSelectAccount: (alias: string) => void;
  onAlreadyActive: () => void;
  onDeleteAccount?: (alias: string) => void;
  onEditAccount?: (alias: string) => void;
};

export function AccountSwitcher({
  connection,
  activeAliasName,
  accounts,
  configWarnings = [],
  message,
  switchingAlias,
  onGoToIntegrations,
  onDeleteAccount,
  onEditAccount,
  onSelectAccount,
  onAlreadyActive
}: AccountSwitcherProps) {
  const { t } = useI18n();
  const activeName = activeAliasName;
  const missingEnvByProvider = useMemo(() => {
    const entries = configWarnings
      .filter((warning) => warning.provider)
      .map((warning) => [
        warning.provider as string,
        warning.type === "missing_credential"
          ? t("switcher.missingCredentialShort", { source: warning.source ?? "CC Switch" })
          : t("switcher.missingApiKeyShort", { env: warning.envName ?? warning.env ?? "API_KEY" })
      ] as const);
    return new Map(entries);
  }, [configWarnings, t]);

  function handleSelect(alias: string) {
    if (alias === activeName) {
      onAlreadyActive();
      return;
    }

    onSelectAccount(alias);
  }

  return (
    <section className="switcher-page">
      <section className="account-list-panel" aria-label="Accounts">
        <div className="provider-list-toolbar">
          <div>
            <span>{t("switcher.providerList")}</span>
            <strong>{accounts.length}</strong>
          </div>
        </div>
        {accounts.length > 0 ? (
          <div className="account-list">
            {accounts.map((account) => (
              <AccountCard
                account={account}
                active={account.name === activeName}
                connectionState={connection}
                disabled={Boolean(switchingAlias)}
                key={account.name}
                authWarning={missingEnvByProvider.get(account.provider)}
                onDelete={onDeleteAccount}
                onEdit={onEditAccount}
                switching={switchingAlias === account.name}
                onSelect={handleSelect}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state switcher-empty">
            <strong>{t("switcher.noAccounts")}</strong>
            {onGoToIntegrations && (
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

      <span className={message.startsWith("Failed") || message.includes("failed") ? "switcher-message bad" : "switcher-message"}>
        {message}
      </span>
    </section>
  );
}
