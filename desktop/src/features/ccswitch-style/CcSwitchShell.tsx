import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import { CcSwitchServiceToggle } from "./CcSwitchServiceToggle";

type ServerLifecycle =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "failed"
  | "external-running";

type CcSwitchShellProps = {
  title: string;
  brand?: ReactNode;
  headerAccessory?: ReactNode;
  settingsLabel: string;
  settingsActive: boolean;
  onOpenSettings: () => void;
  serverLifecycle: ServerLifecycle;
  serverBusy: boolean;
  onStartServer: () => void;
  onStopServer: () => void;
  children: ReactNode;
};

export function CcSwitchShell({
  title,
  brand,
  headerAccessory,
  settingsLabel,
  settingsActive,
  onOpenSettings,
  serverLifecycle,
  serverBusy,
  onStartServer,
  onStopServer,
  children
}: CcSwitchShellProps) {
  return (
    <main className="ccs-shell">
      <header className="ccs-header" data-tauri-drag-region>
        <div className="ccs-header-left">
          <div className="ccs-brand">
            <h1>{brand ?? title}</h1>
          </div>
          <CcSwitchServiceToggle
            lifecycle={serverLifecycle}
            busy={serverBusy}
            onStart={onStartServer}
            onStop={onStopServer}
          />
        </div>
        <div className="ccs-header-right">
          {headerAccessory}
          <button
            aria-label={settingsLabel}
            className={settingsActive ? "ccs-icon-button is-active" : "ccs-icon-button"}
            data-tauri-no-drag
            onClick={onOpenSettings}
            title={settingsLabel}
            type="button"
          >
            <Settings className="ccs-icon" />
          </button>
        </div>
      </header>
      <div className="ccs-main">{children}</div>
    </main>
  );
}
