import type { ConfigWarning } from "../../api";
import type { AccountAlias, ConnectionState } from "../account-switcher/accountTypes";
import { useI18n } from "../../i18n/i18n";
import { CcSwitchProviderCard } from "./CcSwitchProviderCard";

type CcSwitchProviderListProps = {
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

function copyProviderInfo(provider: AccountAlias) {
  void navigator.clipboard?.writeText([
    `Alias: ${provider.name}`,
    `Provider: ${provider.provider}`,
    `Model: ${provider.model}`,
    provider.baseUrl ? `Base URL: ${provider.baseUrl}` : undefined,
    provider.description ? `Description: ${provider.description}` : undefined
  ].filter(Boolean).join("\n"));
}

export function CcSwitchProviderList({
  connection,
  activeAliasName,
  providers,
  configWarnings = [],
  switchingAlias,
  onGoToIntegrations,
  onDeleteProvider,
  onEditProvider,
  onSelectProvider
}: CcSwitchProviderListProps) {
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
      <div className="ccs-empty-state">
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
    <section className="ccs-provider-list" aria-label={t("switcher.providerList")}>
      {providers.map((provider) => (
        <CcSwitchProviderCard
          authWarning={missingAuthByProvider.get(provider.provider)}
          connectionState={connection}
          disabled={Boolean(switchingAlias)}
          isCurrent={provider.name === activeAliasName}
          key={provider.name}
          onCopy={copyProviderInfo}
          onDelete={onDeleteProvider}
          onEdit={onEditProvider}
          onSwitch={onSelectProvider}
          provider={provider}
          switching={switchingAlias === provider.name}
        />
      ))}
    </section>
  );
}
