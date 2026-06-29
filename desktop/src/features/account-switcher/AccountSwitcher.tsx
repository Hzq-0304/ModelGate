import { AccountCard } from "./AccountCard";
import {
  formatAliasTitle,
  type AccountAlias,
  type ConnectionState,
  type EntrypointStatusMap
} from "./accountTypes";
import "./accountSwitcher.css";

type AccountSwitcherProps = {
  connection: ConnectionState;
  endpoint: string;
  activeAliasName?: string;
  activeAlias?: AccountAlias | null;
  accounts: AccountAlias[];
  entrypoints: EntrypointStatusMap;
  message: string;
  switchingAlias?: string | null;
  onSelectAccount: (alias: string) => void;
  onAlreadyActive: () => void;
};

export function AccountSwitcher({
  connection,
  endpoint,
  activeAliasName,
  activeAlias,
  accounts,
  entrypoints,
  message,
  switchingAlias,
  onSelectAccount,
  onAlreadyActive
}: AccountSwitcherProps) {
  const disconnected = connection === "disconnected";
  const activeName = activeAliasName ?? activeAlias?.name;
  const entrypointEntries = Object.entries(entrypoints);

  function handleSelect(alias: string) {
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
      <section className="switcher-hero">
        <div>
          <span className="switcher-kicker">Account Switcher</span>
          <h2>{activeName ? formatAliasTitle(activeName) : "No Active Account"}</h2>
          <p>Choose which alias profile ModelGate should route local requests through.</p>
        </div>
        <div className="switcher-status">
          <span className={`status-dot ${connection}`} />
          <strong>{connection === "connected" ? "Connected" : connection === "checking" ? "Checking" : "Server is not running"}</strong>
          <span>{endpoint}/v1</span>
        </div>
      </section>

      <section className="switcher-current">
        <dl>
          <div>
            <dt>Current Account</dt>
            <dd>{activeName ?? "-"}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{activeAlias?.provider ?? "-"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{activeAlias?.model ?? "-"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{connection === "connected" ? "Connected" : "Disconnected"}</dd>
          </div>
        </dl>
      </section>

      {disconnected && (
        <section className="switcher-notice">
          Connect to ModelGate server to switch accounts.
        </section>
      )}

      <section className="account-grid" aria-label="Accounts">
        {accounts.length > 0 ? (
          accounts.map((account) => (
            <AccountCard
              account={account}
              active={account.name === activeName}
              disabled={disconnected || Boolean(switchingAlias)}
              key={account.name}
              switching={switchingAlias === account.name}
              onSelect={handleSelect}
            />
          ))
        ) : (
          <p className="muted">No accounts are configured yet.</p>
        )}
      </section>

      <section className="switcher-footnotes">
        <div>
          <strong>Codex should use</strong>
          <span>Base URL: {endpoint}/v1</span>
          <span>Model: codex-main</span>
        </div>
        <div>
          <strong>Entrypoints</strong>
          {entrypointEntries.length > 0 ? (
            entrypointEntries.map(([name, entrypoint]) => (
              <span key={name}>{`${name} -> ${entrypoint.use} -> ${entrypoint.resolved}`}</span>
            ))
          ) : (
            <span>No public entrypoints reported.</span>
          )}
        </div>
      </section>

      <span className={message.startsWith("Failed") ? "switcher-message bad" : "switcher-message"}>
        {message}
      </span>
    </section>
  );
}
