import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AliasesResponse,
  type ServerProcessStatus,
  type StatusResponse,
  getAliases,
  getBaseUrl,
  getHealth,
  getServerProcessStatus,
  getStatus,
  reloadConfig,
  restartServerProcess,
  startServerProcess,
  stopServerProcess,
  switchAlias
} from "./api";

type ConnectionState = "checking" | "connected" | "disconnected";

const serverUrl = getBaseUrl();

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [aliases, setAliases] = useState<AliasesResponse | null>(null);
  const [serverProcess, setServerProcess] = useState<ServerProcessStatus | null>(null);
  const [message, setMessage] = useState("Ready");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);

  const activeAlias = useMemo(() => {
    if (!status || !aliases) {
      return null;
    }

    return aliases.aliases.find((alias) => alias.name === status.active) ?? null;
  }, [aliases, status]);

  const codexConfig = `Base URL: ${serverUrl}/v1\nAPI Key: modelgate-local\nModel: codex-main`;

  const refresh = useCallback(async () => {
    setBusyAction("refresh");

    try {
      const nextProcessStatus = await getServerProcessStatus();
      setServerProcess(nextProcessStatus);
      await getHealth();
      const [nextStatus, nextAliases] = await Promise.all([getStatus(), getAliases()]);
      setStatus(nextStatus);
      setAliases(nextAliases);
      setConnection("connected");
      setMessage("Status refreshed");
    } catch (error) {
      setConnection("disconnected");
      setStatus(null);
      setAliases(null);
      const nextProcessStatus = await getServerProcessStatus().catch(() => null);
      setServerProcess(nextProcessStatus);
      setMessage(`ModelGate server is not running. Start it with: npm run dev. ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSwitch(aliasName: string) {
    setBusyAction(`switch:${aliasName}`);

    try {
      await switchAlias(aliasName);
      const [nextStatus, nextAliases] = await Promise.all([getStatus(), getAliases()]);
      setStatus(nextStatus);
      setAliases(nextAliases);
      setConnection("connected");
      setMessage(`Switched to ${aliasName}`);
    } catch (error) {
      setMessage(`Failed to switch: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReload() {
    setBusyAction("reload");

    try {
      const result = await reloadConfig();
      const [nextStatus, nextAliases] = await Promise.all([getStatus(), getAliases()]);
      setStatus(nextStatus);
      setAliases(nextAliases);
      setConnection("connected");
      setMessage(`Configuration reloaded. Active alias: ${result.active}`);
    } catch (error) {
      setMessage(`Failed to reload: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshAfterServerAction(successMessage: string) {
    await refresh();
    setMessage(successMessage);
  }

  async function handleStartServer() {
    setBusyAction("server:start");

    try {
      const result = await startServerProcess();
      setServerProcess(result);
      await refreshAfterServerAction("Server started");
    } catch (error) {
      setMessage(`Failed to start server: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStopServer() {
    setBusyAction("server:stop");

    try {
      const result = await stopServerProcess();
      setServerProcess(result);
      setConnection("disconnected");
      setStatus(null);
      setAliases(null);
      setMessage("Server stopped");
      await refresh();
    } catch (error) {
      setMessage(`Failed to stop server: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestartServer() {
    setBusyAction("server:restart");

    try {
      const result = await restartServerProcess();
      setServerProcess(result);
      await refreshAfterServerAction("Server restarted");
    } catch (error) {
      setMessage(`Failed to restart server: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCopy() {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(codexConfig);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = codexConfig;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopyOk(true);
      setMessage("Codex configuration copied");
      window.setTimeout(() => setCopyOk(false), 1800);
    } catch {
      setCopyOk(false);
      setMessage("Copy failed. Select the Codex configuration text manually.");
    }
  }

  const entrypoints = status ? Object.entries(status.entrypoints) : [];
  const aliasesList = aliases?.aliases ?? [];
  const disconnected = connection === "disconnected";
  const serverMode = serverProcess?.mode ?? "unknown";
  const serverStatusText = serverProcess?.running
    ? "Running"
    : serverMode === "stopped"
      ? "Stopped"
      : "Unknown";
  const launchModeText = serverMode === "managed"
    ? "Managed by desktop"
    : serverMode === "external"
      ? "External"
      : serverMode === "stopped"
        ? "Not running"
        : "Unknown";
  const serverBusy = busyAction?.startsWith("server:") ?? false;
  const isExternalServer = serverMode === "external";
  const isManagedServer = serverMode === "managed";
  const hasManagedChild = serverProcess?.managed ?? false;
  const isStoppedServer = serverMode === "stopped";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>ModelGate</h1>
          <p>Local LLM Gateway</p>
        </div>
        <div className="connection">
          <span className={`status-dot ${connection}`} />
          <strong>{connection === "connected" ? "Connected" : connection === "checking" ? "Checking" : "Disconnected"}</strong>
          <span>{serverUrl}</span>
        </div>
      </header>

      {disconnected && (
        <section className="notice error">
          <strong>ModelGate server is not running.</strong>
          <span>Start it with: npm run dev</span>
        </section>
      )}

      <section className="actions">
        <button onClick={() => void refresh()} disabled={busyAction !== null}>
          {busyAction === "refresh" ? "Refreshing..." : "Refresh"}
        </button>
        <button onClick={() => void handleReload()} disabled={busyAction !== null || disconnected}>
          {busyAction === "reload" ? "Reloading..." : "Reload Config"}
        </button>
        <span className={message.startsWith("Failed") || disconnected ? "action-message bad" : "action-message"}>
          {message}
        </span>
      </section>

      <section className="card server-card">
        <div className="card-heading">
          <span>Server Control</span>
          <strong>{serverStatusText}</strong>
        </div>
        <dl className="server-details">
          <div>
            <dt>Status</dt>
            <dd>{serverStatusText}</dd>
          </div>
          <div>
            <dt>Launch Mode</dt>
            <dd>{launchModeText}</dd>
          </div>
          <div>
            <dt>Endpoint</dt>
            <dd>{serverProcess?.endpoint ?? serverUrl}</dd>
          </div>
          <div>
            <dt>PID</dt>
            <dd>{serverProcess?.pid ?? "None"}</dd>
          </div>
        </dl>
        {isExternalServer && (
          <p className="server-hint">
            Server is running externally. Stop it from the terminal or process manager.
          </p>
        )}
        {serverProcess?.message && serverMode === "unknown" && (
          <p className="server-hint">{serverProcess.message}</p>
        )}
        <div className="server-actions">
          <button
            onClick={() => void handleStartServer()}
            disabled={busyAction !== null || !isStoppedServer}
          >
            {busyAction === "server:start" ? "Starting..." : "Start Server"}
          </button>
          <button
            className="secondary"
            onClick={() => void handleStopServer()}
            disabled={busyAction !== null || !hasManagedChild}
          >
            {busyAction === "server:stop" ? "Stopping..." : "Stop Server"}
          </button>
          <button
            className="secondary"
            onClick={() => void handleRestartServer()}
            disabled={busyAction !== null || !hasManagedChild}
          >
            {busyAction === "server:restart" ? "Restarting..." : "Restart Server"}
          </button>
          <button className="secondary" onClick={() => void refresh()} disabled={busyAction !== null || serverBusy}>
            Refresh
          </button>
        </div>
      </section>

      <section className="grid">
        <article className="card active-card">
          <div className="card-heading">
            <span>Active Alias</span>
            {status && <strong>{status.active}</strong>}
          </div>
          {status && activeAlias ? (
            <dl>
              <div>
                <dt>Provider</dt>
                <dd>{activeAlias.provider}</dd>
              </div>
              <div>
                <dt>Upstream Model</dt>
                <dd>{activeAlias.model}</dd>
              </div>
            </dl>
          ) : status ? (
            <p className="inline-error">Active alias is missing from the alias list.</p>
          ) : (
            <p className="muted">Connect to ModelGate to view active alias details.</p>
          )}
        </article>

        <article className="card">
          <div className="card-heading">
            <span>Entrypoints</span>
            <strong>{entrypoints.length}</strong>
          </div>
          {entrypoints.length > 0 ? (
            <div className="entrypoints">
              {entrypoints.map(([name, entrypoint]) => (
                <div className="entrypoint" key={name}>
                  <code>{name}</code>
                  <span>{entrypoint.use === "active" ? "active" : entrypoint.use}</span>
                  <strong>{entrypoint.resolved}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No entrypoints reported.</p>
          )}
        </article>
      </section>

      <section className="card table-card">
        <div className="card-heading">
          <span>Aliases</span>
          <strong>{aliasesList.length}</strong>
        </div>
        <div className="alias-table">
          <div className="alias-row alias-head">
            <span>Name</span>
            <span>Provider</span>
            <span>Upstream Model</span>
            <span>Action</span>
          </div>
          {aliasesList.map((alias) => {
            const isActive = alias.name === status?.active;
            return (
              <div className={isActive ? "alias-row active" : "alias-row"} key={alias.name}>
                <span>{alias.name}</span>
                <span>{alias.provider}</span>
                <span>{alias.model}</span>
                <span>
                  {isActive ? (
                    <span className="pill">Active</span>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() => void handleSwitch(alias.name)}
                      disabled={busyAction !== null || disconnected}
                    >
                      {busyAction === `switch:${alias.name}` ? "Switching..." : "Switch"}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card codex-card">
        <div className="card-heading">
          <span>Codex Configuration</span>
          <button className="secondary" onClick={() => void handleCopy()}>
            {copyOk ? "Copied" : "Copy"}
          </button>
        </div>
        <pre>{codexConfig}</pre>
      </section>
    </main>
  );
}
