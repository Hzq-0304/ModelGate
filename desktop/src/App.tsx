import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AliasesResponse,
  type EditableConfig,
  type ProviderConfig,
  type ServerProcessStatus,
  type StatusResponse,
  getAliases,
  getAdminConfig,
  getBaseUrl,
  getHealth,
  getServerProcessStatus,
  getStatus,
  reloadConfig,
  restartServerProcess,
  saveAdminConfig,
  startServerProcess,
  stopServerProcess,
  switchAlias,
  validateAdminConfig
} from "./api";

type ConnectionState = "checking" | "connected" | "disconnected";
type ActiveTab = "dashboard" | "configuration";

const serverUrl = getBaseUrl();

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [aliases, setAliases] = useState<AliasesResponse | null>(null);
  const [serverProcess, setServerProcess] = useState<ServerProcessStatus | null>(null);
  const [configPath, setConfigPath] = useState("");
  const [editableConfig, setEditableConfig] = useState<EditableConfig | null>(null);
  const [configMessage, setConfigMessage] = useState("Configuration not loaded");
  const [providerForm, setProviderForm] = useState({
    editingName: "",
    name: "",
    type: "openai-compatible",
    baseUrl: "",
    envName: ""
  });
  const [aliasForm, setAliasForm] = useState({
    editingName: "",
    name: "",
    provider: "",
    model: ""
  });
  const [entrypointForm, setEntrypointForm] = useState({
    editingName: "",
    name: "",
    use: "active"
  });
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

  async function loadConfiguration() {
    const result = await getAdminConfig();
    setConfigPath(result.path);
    setEditableConfig(result.config);
    setConfigMessage("Configuration loaded");
  }

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
      await loadConfiguration().catch(() => undefined);
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
      await loadConfiguration().catch(() => undefined);
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

  function updateConfig(updater: (config: EditableConfig) => EditableConfig) {
    setEditableConfig((current) => current ? updater(current) : current);
  }

  function providerEnvName(provider: ProviderConfig) {
    if (provider.type !== "openai-compatible") {
      return "";
    }

    const match = provider.api_key.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
    return match ? match[1] : "";
  }

  function resetProviderForm() {
    setProviderForm({
      editingName: "",
      name: "",
      type: "openai-compatible",
      baseUrl: "",
      envName: ""
    });
  }

  function resetAliasForm() {
    setAliasForm({
      editingName: "",
      name: "",
      provider: "",
      model: ""
    });
  }

  function resetEntrypointForm() {
    setEntrypointForm({
      editingName: "",
      name: "",
      use: "active"
    });
  }

  function saveProviderDraft() {
    if (!editableConfig || !providerForm.name.trim()) {
      setConfigMessage("Provider name is required");
      return;
    }

    const name = providerForm.name.trim();
    const provider: ProviderConfig = providerForm.type === "mock"
      ? { type: "mock" }
      : {
        type: "openai-compatible",
        base_url: providerForm.baseUrl.trim(),
        api_key: `\${${providerForm.envName.trim()}}`
      };

    updateConfig((config) => {
      const providers = { ...config.providers };
      if (providerForm.editingName && providerForm.editingName !== name) {
        delete providers[providerForm.editingName];
      }
      providers[name] = provider;
      return { ...config, providers };
    });
    resetProviderForm();
    setConfigMessage(`Provider ${name} updated locally`);
  }

  function editProvider(name: string, provider: ProviderConfig) {
    setProviderForm({
      editingName: name,
      name,
      type: provider.type,
      baseUrl: provider.type === "openai-compatible" ? provider.base_url : "",
      envName: providerEnvName(provider)
    });
  }

  function deleteProvider(name: string) {
    updateConfig((config) => {
      const providers = { ...config.providers };
      delete providers[name];
      return { ...config, providers };
    });
    setConfigMessage(`Provider ${name} deleted locally`);
  }

  function saveAliasDraft() {
    if (!editableConfig || !aliasForm.name.trim()) {
      setConfigMessage("Alias name is required");
      return;
    }

    const name = aliasForm.name.trim();
    updateConfig((config) => {
      const aliases = { ...config.aliases };
      if (aliasForm.editingName && aliasForm.editingName !== name) {
        delete aliases[aliasForm.editingName];
      }
      aliases[name] = {
        provider: aliasForm.provider,
        model: aliasForm.model.trim()
      };
      return { ...config, aliases };
    });
    resetAliasForm();
    setConfigMessage(`Alias ${name} updated locally`);
  }

  function editAlias(name: string, alias: EditableConfig["aliases"][string]) {
    setAliasForm({
      editingName: name,
      name,
      provider: alias.provider,
      model: alias.model
    });
  }

  function deleteAlias(name: string) {
    updateConfig((config) => {
      const aliases = { ...config.aliases };
      delete aliases[name];
      return { ...config, aliases };
    });
    setConfigMessage(`Alias ${name} deleted locally`);
  }

  function setActiveAlias(name: string) {
    updateConfig((config) => ({ ...config, active: name }));
    setConfigMessage(`Active alias set to ${name} locally`);
  }

  function saveEntrypointDraft() {
    if (!editableConfig || !entrypointForm.name.trim()) {
      setConfigMessage("Entrypoint name is required");
      return;
    }

    const name = entrypointForm.name.trim();
    updateConfig((config) => {
      const entrypoints = { ...config.entrypoints };
      if (entrypointForm.editingName && entrypointForm.editingName !== name) {
        delete entrypoints[entrypointForm.editingName];
      }
      entrypoints[name] = {
        use: entrypointForm.use
      };
      return { ...config, entrypoints };
    });
    resetEntrypointForm();
    setConfigMessage(`Entrypoint ${name} updated locally`);
  }

  function editEntrypoint(name: string, entrypoint: EditableConfig["entrypoints"][string]) {
    setEntrypointForm({
      editingName: name,
      name,
      use: entrypoint.use
    });
  }

  function deleteEntrypoint(name: string) {
    updateConfig((config) => {
      const entrypoints = { ...config.entrypoints };
      delete entrypoints[name];
      return { ...config, entrypoints };
    });
    setConfigMessage(`Entrypoint ${name} deleted locally`);
  }

  async function handleValidateConfig() {
    if (!editableConfig) {
      return;
    }

    setBusyAction("config:validate");
    try {
      const result = await validateAdminConfig(editableConfig);
      const warnings = result.warnings.length > 0 ? ` Warnings: ${result.warnings.join(" ")}` : "";
      setConfigMessage(result.ok ? `Configuration is valid.${warnings}` : `Validation failed: ${(result.errors ?? []).join(" ")}`);
    } catch (error) {
      setConfigMessage(`Validation failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveConfig() {
    if (!editableConfig) {
      return;
    }

    setBusyAction("config:save");
    try {
      const result = await saveAdminConfig(editableConfig);
      const warnings = result.warnings.length > 0 ? ` Warnings: ${result.warnings.join(" ")}` : "";
      setConfigMessage(`Configuration saved and reloaded.${warnings}`);
      await refresh();
    } catch (error) {
      setConfigMessage(`Save failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResetConfig() {
    setBusyAction("config:reset");
    try {
      await loadConfiguration();
    } catch (error) {
      setConfigMessage(`Reset failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
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
  const providerEntries = editableConfig ? Object.entries(editableConfig.providers) : [];
  const aliasEntries = editableConfig ? Object.entries(editableConfig.aliases) : [];
  const entrypointEntries = editableConfig ? Object.entries(editableConfig.entrypoints) : [];
  const providerNames = providerEntries.map(([name]) => name);
  const aliasNames = aliasEntries.map(([name]) => name);
  const configBusy = busyAction?.startsWith("config:") ?? false;

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

      <nav className="tabs">
        <button className={activeTab === "dashboard" ? "tab active" : "tab"} onClick={() => setActiveTab("dashboard")}>
          Dashboard
        </button>
        <button
          className={activeTab === "configuration" ? "tab active" : "tab"}
          onClick={() => {
            setActiveTab("configuration");
            if (!editableConfig) {
              void loadConfiguration().catch((error) => setConfigMessage(`Failed to load configuration: ${getErrorMessage(error)}`));
            }
          }}
        >
          Configuration
        </button>
      </nav>

      {activeTab === "dashboard" ? (
        <>

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
        </>
      ) : (
        <section className="config-page">
          <section className="card config-card">
            <div className="card-heading">
              <span>Configuration</span>
              <strong>{configPath || "Not loaded"}</strong>
            </div>
            <div className="config-summary">
              <label>
                Active Alias
                <select
                  value={editableConfig?.active ?? ""}
                  onChange={(event) => editableConfig && setActiveAlias(event.target.value)}
                  disabled={!editableConfig || configBusy}
                >
                  {aliasNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <span className={configMessage.startsWith("Save failed") || configMessage.startsWith("Validation failed") ? "action-message bad" : "action-message"}>
                {configMessage}
              </span>
            </div>
          </section>

          <section className="card config-card">
            <div className="card-heading">
              <span>Providers</span>
              <strong>{providerEntries.length}</strong>
            </div>
            <div className="config-table providers-table">
              <div className="config-row config-head">
                <span>Name</span>
                <span>Type</span>
                <span>Base URL</span>
                <span>API Key</span>
                <span>Actions</span>
              </div>
              {providerEntries.map(([name, provider]) => (
                <div className="config-row" key={name}>
                  <span>{name}</span>
                  <span>{provider.type}</span>
                  <span>{provider.type === "openai-compatible" ? provider.base_url : "-"}</span>
                  <span>
                    {provider.type === "openai-compatible"
                      ? `${provider.api_key} ${provider.api_key_resolved ? "OK" : "Missing"}`
                      : "-"}
                  </span>
                  <span className="row-actions">
                    <button className="secondary" onClick={() => editProvider(name, provider)} disabled={configBusy}>Edit</button>
                    <button className="secondary danger" onClick={() => deleteProvider(name)} disabled={configBusy}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
            <div className="config-form">
              <input placeholder="Name" value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} />
              <select value={providerForm.type} onChange={(event) => setProviderForm({ ...providerForm, type: event.target.value })}>
                <option value="openai-compatible">openai-compatible</option>
                <option value="mock">mock</option>
              </select>
              <input placeholder="Base URL" value={providerForm.baseUrl} onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })} disabled={providerForm.type === "mock"} />
              <input placeholder="API Key Env Name" value={providerForm.envName} onChange={(event) => setProviderForm({ ...providerForm, envName: event.target.value })} disabled={providerForm.type === "mock"} />
              <button onClick={saveProviderDraft} disabled={configBusy}>{providerForm.editingName ? "Update Provider" : "Add Provider"}</button>
            </div>
          </section>

          <section className="card config-card">
            <div className="card-heading">
              <span>Aliases</span>
              <strong>{aliasEntries.length}</strong>
            </div>
            <div className="config-table aliases-config-table">
              <div className="config-row config-head">
                <span>Name</span>
                <span>Provider</span>
                <span>Upstream Model</span>
                <span>Actions</span>
              </div>
              {aliasEntries.map(([name, alias]) => (
                <div className={editableConfig?.active === name ? "config-row active" : "config-row"} key={name}>
                  <span>{name}</span>
                  <span>{alias.provider}</span>
                  <span>{alias.model}</span>
                  <span className="row-actions">
                    <button className="secondary" onClick={() => editAlias(name, alias)} disabled={configBusy}>Edit</button>
                    <button className="secondary" onClick={() => setActiveAlias(name)} disabled={configBusy}>Set Active</button>
                    <button className="secondary danger" onClick={() => deleteAlias(name)} disabled={configBusy}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
            <div className="config-form alias-form">
              <input placeholder="Name" value={aliasForm.name} onChange={(event) => setAliasForm({ ...aliasForm, name: event.target.value })} />
              <select value={aliasForm.provider} onChange={(event) => setAliasForm({ ...aliasForm, provider: event.target.value })}>
                <option value="">Provider</option>
                {providerNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <input placeholder="Upstream Model" value={aliasForm.model} onChange={(event) => setAliasForm({ ...aliasForm, model: event.target.value })} />
              <button onClick={saveAliasDraft} disabled={configBusy}>{aliasForm.editingName ? "Update Alias" : "Add Alias"}</button>
            </div>
          </section>

          <section className="card config-card">
            <div className="card-heading">
              <span>Entrypoints</span>
              <strong>{entrypointEntries.length}</strong>
            </div>
            <div className="config-table entrypoints-table">
              <div className="config-row config-head">
                <span>Name</span>
                <span>Use</span>
                <span>Actions</span>
              </div>
              {entrypointEntries.map(([name, entrypoint]) => (
                <div className="config-row" key={name}>
                  <span>{name}</span>
                  <span>{entrypoint.use}</span>
                  <span className="row-actions">
                    <button className="secondary" onClick={() => editEntrypoint(name, entrypoint)} disabled={configBusy}>Edit</button>
                    <button className="secondary danger" onClick={() => deleteEntrypoint(name)} disabled={configBusy}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
            <div className="config-form entrypoint-form">
              <input placeholder="Name" value={entrypointForm.name} onChange={(event) => setEntrypointForm({ ...entrypointForm, name: event.target.value })} />
              <select value={entrypointForm.use} onChange={(event) => setEntrypointForm({ ...entrypointForm, use: event.target.value })}>
                <option value="active">active</option>
                {aliasNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button onClick={saveEntrypointDraft} disabled={configBusy}>{entrypointForm.editingName ? "Update Entrypoint" : "Add Entrypoint"}</button>
            </div>
          </section>

          <section className="actions config-actions">
            <button onClick={() => void handleValidateConfig()} disabled={!editableConfig || busyAction !== null}>
              {busyAction === "config:validate" ? "Validating..." : "Validate"}
            </button>
            <button onClick={() => void handleSaveConfig()} disabled={!editableConfig || busyAction !== null}>
              {busyAction === "config:save" ? "Saving..." : "Save & Reload"}
            </button>
            <button className="secondary" onClick={() => void handleResetConfig()} disabled={busyAction !== null}>
              {busyAction === "config:reset" ? "Resetting..." : "Reset"}
            </button>
          </section>
        </section>
      )}
    </main>
  );
}
