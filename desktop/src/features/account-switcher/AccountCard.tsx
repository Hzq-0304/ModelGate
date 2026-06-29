import { formatAliasTitle, type AccountAlias } from "./accountTypes";

type AccountCardProps = {
  account: AccountAlias;
  active: boolean;
  disabled: boolean;
  switching: boolean;
  onSelect: (alias: string) => void;
};

export function AccountCard({ account, active, disabled, switching, onSelect }: AccountCardProps) {
  return (
    <button
      className={active ? "account-card active" : "account-card"}
      disabled={disabled}
      onClick={() => onSelect(account.name)}
      type="button"
    >
      <span className="account-card-status">{switching ? "Switching" : active ? "Active" : "Available"}</span>
      <strong>{formatAliasTitle(account.name)}</strong>
      <code>{account.name}</code>
      <dl>
        <div>
          <dt>Provider</dt>
          <dd>{account.provider}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{account.model}</dd>
        </div>
      </dl>
    </button>
  );
}
