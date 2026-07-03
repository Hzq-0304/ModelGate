import type { ConfigWarning } from "../../api";
import { ProviderList } from "../provider-list/ProviderList";
import {
  type AccountAlias,
  type ConnectionState
} from "./accountTypes";
import { useI18n } from "../../i18n/i18n";

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

  function handleSelect(alias: string) {
    if (alias === activeName) {
      onAlreadyActive();
      return;
    }

    onSelectAccount(alias);
  }

  const showToast = message
    && message !== "Status refreshed"
    && message !== t("advanced.statusRefreshed")
    && message !== t("config.notLoaded");

  return (
    <section className="switcher-page" aria-label={t("switcher.providerList")}>
      <ProviderList
        activeAliasName={activeName}
        configWarnings={configWarnings}
        connection={connection}
        onDeleteProvider={onDeleteAccount}
        onEditProvider={onEditAccount}
        onGoToIntegrations={onGoToIntegrations}
        onSelectProvider={handleSelect}
        providers={accounts}
        switchingAlias={switchingAlias}
      />

      {showToast && (
        <span className={message.startsWith("Failed") || message.includes("failed") ? "switcher-toast bad" : "switcher-toast"} role="status">
          {message}
        </span>
      )}
    </section>
  );
}
