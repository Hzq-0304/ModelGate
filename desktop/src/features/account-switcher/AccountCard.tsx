import { formatAliasTitle, type AccountAlias } from "./accountTypes";
import { useI18n } from "../../i18n/i18n";

type AccountCardProps = {
  account: AccountAlias;
  active: boolean;
  disabled: boolean;
  authWarning?: string;
  selected: boolean;
  switching: boolean;
  onSelect: (alias: string) => void;
};

export function AccountCard({ account, active, disabled, authWarning, selected, switching, onSelect }: AccountCardProps) {
  const { t } = useI18n();
  const statusText = switching
    ? t("common.switching")
    : active
      ? t("common.active")
      : authWarning
        ? t("switcher.missingAuth")
        : t("common.available");

  return (
    <button
      className={[
        "account-card",
        active ? "active" : "",
        selected ? "selected" : "",
        authWarning ? "warning" : ""
      ].filter(Boolean).join(" ")}
      disabled={disabled}
      onClick={() => onSelect(account.name)}
      type="button"
    >
      <span className="account-card-topline">
        <strong>{formatAliasTitle(account.name)}</strong>
        <span className={authWarning ? "account-card-status bad" : "account-card-status"}>{statusText}</span>
      </span>
      {account.description && (
        <p className="account-card-description" title={account.description}>{account.description}</p>
      )}
      <dl>
        <div>
          <dt>{t("common.alias")}</dt>
          <dd>{account.name}</dd>
        </div>
        <div>
          <dt>{t("common.provider")}</dt>
          <dd>{account.provider}</dd>
        </div>
        <div>
          <dt>{t("common.model")}</dt>
          <dd>{account.model}</dd>
        </div>
      </dl>
      {authWarning && <span className="account-card-warning">{authWarning}</span>}
    </button>
  );
}
