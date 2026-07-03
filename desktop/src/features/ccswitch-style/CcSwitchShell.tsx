import type { ReactNode } from "react";
import { SettingsIcon } from "../../components/icons/SettingsIcon";
import type { ConnectionState } from "../account-switcher/accountTypes";

type CcSwitchShellProps = {
  title: string;
  connection: ConnectionState;
  connectedLabel: string;
  checkingLabel: string;
  disconnectedLabel: string;
  settingsLabel: string;
  settingsActive: boolean;
  onOpenSettings: () => void;
  children: ReactNode;
};

export function CcSwitchShell({
  title,
  connection,
  connectedLabel,
  checkingLabel,
  disconnectedLabel,
  settingsLabel,
  settingsActive,
  onOpenSettings,
  children
}: CcSwitchShellProps) {
  const statusText = connection === "connected"
    ? connectedLabel
    : connection === "checking"
      ? checkingLabel
      : disconnectedLabel;

  return (
    <main className="ccs-shell">
      <header className="ccs-header" data-tauri-drag-region>
        <div className="ccs-brand">
          <h1>{title}</h1>
          <span className="ccs-status-text">
            <span className={`status-dot ${connection}`} />
            {statusText}
          </span>
        </div>
        <button
          aria-label={settingsLabel}
          className={settingsActive ? "ccs-icon-button is-active" : "ccs-icon-button"}
          onClick={onOpenSettings}
          title={settingsLabel}
          type="button"
        >
          <SettingsIcon className="ccs-icon" />
        </button>
      </header>
      <div className="ccs-main">{children}</div>
    </main>
  );
}
