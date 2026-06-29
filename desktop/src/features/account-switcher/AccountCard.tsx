import { formatAliasTitle, type AccountAlias } from "./accountTypes";
import { useI18n } from "../../i18n/i18n";

type AccountCardProps = {
  account: AccountAlias;
  active: boolean;
  disabled: boolean;
  switching: boolean;
  onSelect: (alias: string) => void;
};

export function AccountCard({ account, active, disabled, switching, onSelect }: AccountCardProps) {
  const { t } = useI18n();

  return (
    <button
      className={active ? "account-card active" : "account-card"}
      disabled={disabled}
      onClick={() => onSelect(account.name)}
      type="button"
    >
      <span className="account-card-status">{switching ? t("common.switching") : active ? t("common.active") : t("common.available")}</span>
      <strong>{formatAliasTitle(account.name)}</strong>
      <code>{account.name}</code>
      <dl>
        <div>
          <dt>{t("common.provider")}</dt>
          <dd>{account.provider}</dd>
        </div>
        <div>
          <dt>{t("common.model")}</dt>
          <dd>{account.model}</dd>
        </div>
      </dl>
    </button>
  );
}
