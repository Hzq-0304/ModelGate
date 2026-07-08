import type { ReactNode } from "react";
import { Minus, Settings, Square, X } from "lucide-react";
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

type WindowAction = "minimize" | "toggleMaximize" | "close";

function runWindowAction(action: WindowAction) {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    const appWindow = getCurrentWindow();
    if (action === "minimize") {
      return appWindow.minimize();
    }
    if (action === "toggleMaximize") {
      return appWindow.toggleMaximize();
    }
    return appWindow.close();
  });
}

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
          <div className="ccs-window-controls" data-tauri-no-drag>
            <button
              aria-label="Minimize"
              className="ccs-window-button"
              onClick={() => runWindowAction("minimize")}
              title="Minimize"
              type="button"
            >
              <Minus className="ccs-window-icon" />
            </button>
            <button
              aria-label="Maximize"
              className="ccs-window-button"
              onClick={() => runWindowAction("toggleMaximize")}
              title="Maximize"
              type="button"
            >
              <Square className="ccs-window-icon" />
            </button>
            <button
              aria-label="Close"
              className="ccs-window-button close"
              onClick={() => runWindowAction("close")}
              title="Close"
              type="button"
            >
              <X className="ccs-window-icon" />
            </button>
          </div>
        </div>
      </header>
      <div className="ccs-main">{children}</div>
    </main>
  );
}
