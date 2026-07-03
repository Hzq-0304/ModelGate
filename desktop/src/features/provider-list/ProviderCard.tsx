import { formatAliasTitle, type AccountAlias } from "../account-switcher/accountTypes";
import { useI18n } from "../../i18n/i18n";

type ProviderCardProps = {
  account: AccountAlias;
  active: boolean;
  connectionState: "checking" | "connected" | "disconnected";
  disabled: boolean;
  authWarning?: string;
  switching: boolean;
  onDelete?: (alias: string) => void;
  onEdit?: (alias: string) => void;
  onSelect: (alias: string) => void;
};

function providerInitial(account: AccountAlias) {
  return formatAliasTitle(account.name).charAt(0).toUpperCase() || "M";
}

function providerSubtitle(account: AccountAlias) {
  return account.baseUrl
    ?? account.description
    ?? account.providerDescription
    ?? account.model;
}

function copyProviderInfo(account: AccountAlias) {
  void navigator.clipboard?.writeText([
    `Alias: ${account.name}`,
    `Provider: ${account.provider}`,
    `Model: ${account.model}`,
    account.baseUrl ? `Base URL: ${account.baseUrl}` : undefined,
    account.description ? `Description: ${account.description}` : undefined
  ].filter(Boolean).join("\n"));
}

export function ProviderCard({
  account,
  active,
  connectionState,
  disabled,
  authWarning,
  switching,
  onDelete,
  onEdit,
  onSelect
}: ProviderCardProps) {
  const { t } = useI18n();
  const statusText = switching
    ? t("common.switching")
    : authWarning
      ? t("switcher.status.missingAuth")
      : connectionState === "disconnected"
        ? t("switcher.status.offline")
        : connectionState === "checking"
          ? t("app.checking")
          : t("switcher.status.ready");
  const subtitle = providerSubtitle(account);

  function handleSelect() {
    if (!disabled) {
      onSelect(account.name);
    }
  }

  return (
    <article
      className={[
        "provider-card",
        active ? "is-selected" : "",
        authWarning ? "has-warning" : ""
      ].filter(Boolean).join(" ")}
      aria-disabled={disabled}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="provider-card-grip" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="provider-avatar" aria-hidden="true">{providerInitial(account)}</span>
      <span className="provider-card-main">
        <span className="provider-card-title-row">
          <strong>{formatAliasTitle(account.name)}</strong>
          <span className={[
            "provider-status-badge",
            authWarning ? "warning" : "",
            connectionState !== "connected" && !authWarning ? "muted" : ""
          ].filter(Boolean).join(" ")}
          >
            {statusText}
          </span>
        </span>
        <span className="provider-card-subtitle" title={subtitle}>{subtitle}</span>
        <span className="provider-card-meta">
          <span>{account.provider}</span>
          <span>{account.model}</span>
          {account.providerType === "mock" && <span>{t("switcher.managedLocal")}</span>}
        </span>
      </span>
      {active && <span className="provider-selected-dot" aria-hidden="true" title={t("switcher.activeHint")} />}
      <details className="provider-card-menu" onClick={(event) => event.stopPropagation()}>
        <summary aria-label={t("provider.more")} title={t("provider.more")}>
          <span aria-hidden="true">...</span>
        </summary>
        <div className="provider-card-menu-popover">
          <button disabled={disabled || active} onClick={() => onSelect(account.name)} type="button">
            {t("provider.setActive")}
          </button>
          <button onClick={() => copyProviderInfo(account)} type="button">
            {t("provider.copyInfo")}
          </button>
          {onEdit && (
            <button onClick={() => onEdit(account.name)} type="button">
              {t("provider.edit")}
            </button>
          )}
          {onDelete && (
            <button className="danger" onClick={() => onDelete(account.name)} type="button">
              {t("provider.delete")}
            </button>
          )}
        </div>
      </details>
    </article>
  );
}
