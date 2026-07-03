import type { ConfigWarning } from "../../api";
import type { AccountAlias, ConnectionState } from "../account-switcher/accountTypes";
import { useI18n } from "../../i18n/i18n";
import { ProviderCard } from "./ProviderCard";
import "./providerList.css";

type ProviderListProps = {
  connection: ConnectionState;
  activeAliasName?: string;
  providers: AccountAlias[];
  configWarnings?: ConfigWarning[];
  switchingAlias?: string | null;
  onGoToIntegrations?: () => void;
  onSelectProvider: (alias: string) => void;
  onDeleteProvider?: (alias: string) => void;
  onEditProvider?: (alias: string) => void;
};

export function ProviderList({
  connection,
  activeAliasName,
  providers,
  configWarnings = [],
  switchingAlias,
  onGoToIntegrations,
  onDeleteProvider,
  onEditProvider,
  onSelectProvider
}: ProviderListProps) {
  const { t } = useI18n();
  const missingAuthByProvider = new Map(
    configWarnings
      .filter((warning) => warning.provider)
      .map((warning) => [
        warning.provider as string,
        warning.type === "missing_credential"
          ? t("switcher.missingCredentialShort", { source: warning.source ?? "CC Switch" })
          : t("switcher.missingApiKeyShort", { env: warning.envName ?? warning.env ?? "API_KEY" })
      ] as const)
  );

  if (providers.length === 0) {
    return (
      <div className="provider-empty-state">
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
    );
  }

  return (
    <section className="provider-list" aria-label={t("switcher.providerList")}>
      {providers.map((provider) => (
        <ProviderCard
          account={provider}
          active={provider.name === activeAliasName}
          authWarning={missingAuthByProvider.get(provider.provider)}
          connectionState={connection}
          disabled={Boolean(switchingAlias)}
          key={provider.name}
          onDelete={onDeleteProvider}
          onEdit={onEditProvider}
          onSelect={onSelectProvider}
          switching={switchingAlias === provider.name}
        />
      ))}
    </section>
  );
}
