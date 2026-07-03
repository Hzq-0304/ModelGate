import { formatAliasTitle, type AccountAlias } from "./accountTypes";
import { useI18n } from "../../i18n/i18n";

type AccountCardProps = {
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

function accountSubtitle(account: AccountAlias) {
  return account.baseUrl
    ?? account.description
    ?? account.providerDescription
    ?? account.model;
}

export function AccountCard({
  account,
  active,
  connectionState,
  disabled,
  authWarning,
  switching,
  onDelete,
  onEdit,
  onSelect
}: AccountCardProps) {
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
  const subtitle = accountSubtitle(account);

  return (
    <article
      className={[
        "account-card",
        active ? "active" : "",
        authWarning ? "warning" : ""
      ].filter(Boolean).join(" ")}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onSelect(account.name);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!disabled) {
            onSelect(account.name);
          }
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="account-avatar" aria-hidden="true">{providerInitial(account)}</span>
      <span className="account-card-main">
        <span className="account-card-topline">
          <strong>{formatAliasTitle(account.name)}</strong>
          <span className={[
            "account-card-status",
            authWarning ? "bad" : "",
            connectionState !== "connected" && !authWarning ? "offline" : ""
          ].filter(Boolean).join(" ")}
          >
            {statusText}
          </span>
        </span>
        <span className="account-card-subtitle" title={subtitle}>{subtitle}</span>
        <span className="account-card-meta">
          <span>{account.provider}</span>
          <span>{account.model}</span>
          {account.providerType === "mock" && <span>{t("switcher.managedLocal")}</span>}
        </span>
      </span>
      {active && <span className="account-card-active-dot" title={t("switcher.activeHint")} aria-hidden="true" />}
      <details className="account-card-menu" onClick={(event) => event.stopPropagation()}>
        <summary aria-label={t("common.actions")} title={t("common.actions")}>...</summary>
        <div className="account-card-menu-popover">
          <button disabled={disabled || active} onClick={() => onSelect(account.name)} type="button">
            {t("config.setActive")}
          </button>
          {onEdit && (
            <button onClick={() => onEdit(account.name)} type="button">
              {t("common.edit")}
            </button>
          )}
          {onDelete && (
            <button className="danger" onClick={() => onDelete(account.name)} type="button">
              {t("common.delete")}
            </button>
          )}
        </div>
      </details>
    </article>
  );
}
