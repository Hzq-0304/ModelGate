import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AliasesResponse,
  type CcSwitchImportCandidate,
  type CcSwitchProviderLink,
  type DiagnosticResult,
  type EditableConfig,
  type ProviderPreset,
  type ProviderConfig,
  type RequestLogEntry,
  type RequestStats,
  type ServerProcessStatus,
  type StatusResponse,
  clearRequestLogs,
  detectCcSwitchDatabase,
  getAliases,
  getAdminConfig,
  getBaseUrl,
  getCcSwitchLink,
  getHealth,
  getProviderPresets,
  getRequestLogs,
  getRequestStats,
  getServerProcessStatus,
  getStatus,
  reloadConfig,
  restartServerProcess,
  saveAdminConfig,
  scanCcSwitchDatabase,
  selectAndScanCcSwitchDatabase,
  openCcSwitchDeepLink,
  startServerProcess,
  stopServerProcess,
  switchAlias,
  testActive,
  testAlias,
  testProvider,
  validateAdminConfig
} from "./api";

type ConnectionState = "checking" | "connected" | "disconnected";
type ActiveTab = "dashboard" | "configuration" | "logs";

type ImportDraft = CcSwitchImportCandidate & {
  selected: boolean;
  providerName: string;
  baseUrl: string;
  envName: string;
  modelValue: string;
  aliasName: string;
};

type PresetDraft = {
  presetId: string;
  providerName: string;
  aliasName: string;
  baseUrl: string;
  envName: string;
  modelValue: string;
  setActive: boolean;
};

type CcSwitchExportDraft = {
  name: string;
  app: string;
  endpoint: string;
  apiKey: string;
  model: string;
};

const serverUrl = getBaseUrl();
const ccSwitchAppLabels: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code",
  gemini: "Gemini",
  opencode: "OpenCode",
  openclaw: "OpenClaw"
};

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
  const [ccSwitchPath, setCcSwitchPath] = useState("");
  const [ccSwitchMessage, setCcSwitchMessage] = useState("CC Switch import not scanned");
  const [showManagedCcSwitch, setShowManagedCcSwitch] = useState(false);
  const [ccSwitchExportDraft, setCcSwitchExportDraft] = useState<CcSwitchExportDraft>({
    name: "ModelGate Local",
    app: "codex",
    endpoint: `${serverUrl}/v1`,
    apiKey: "modelgate-local",
    model: "codex-main"
  });
  const [ccSwitchExportMessage, setCcSwitchExportMessage] = useState("CC Switch link not generated");
  const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([]);
  const [overwriteProviders, setOverwriteProviders] = useState(false);
  const [overwriteAliases, setOverwriteAliases] = useState(false);
  const [setImportedActive, setSetImportedActive] = useState(false);
  const [showPresetPanel, setShowPresetPanel] = useState(false);
  const [providerPresets, setProviderPresets] = useState<ProviderPreset[]>([]);
  const [presetSearch, setPresetSearch] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null);
  const [presetMessage, setPresetMessage] = useState("Preset library not loaded");
  const [requestLogs, setRequestLogs] = useState<RequestLogEntry[]>([]);
  const [requestStats, setRequestStats] = useState<RequestStats | null>(null);
  const [logsMessage, setLogsMessage] = useState("Logs not loaded");
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState("Diagnostics not run");
  const [providerForm, setProviderForm] = useState({
    editingName: "",
    name: "",
    type: "openai-compatible",
    baseUrl: "",
    envName: "",
    responsesApi: false
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

  function candidateToDraft(candidate: CcSwitchImportCandidate): ImportDraft {
    return {
      ...candidate,
      selected: candidate.complete,
      providerName: candidate.suggested_modelgate_provider,
      baseUrl: candidate.base_url ?? "",
      envName: candidate.suggested_env_name,
      modelValue: candidate.model ?? candidate.models[0] ?? "",
      aliasName: candidate.suggested_modelgate_alias
    };
  }

  function makeUniqueName(baseName: string, existing: Set<string>) {
    if (!existing.has(baseName)) {
      existing.add(baseName);
      return baseName;
    }

    let candidate = `${baseName}-imported`;
    let index = 2;
    while (existing.has(candidate)) {
      candidate = `${baseName}-imported-${index}`;
      index += 1;
    }
    existing.add(candidate);
    return candidate;
  }

  function makeNumberedName(baseName: string, existing: Set<string>) {
    const normalized = baseName.trim();
    if (!existing.has(normalized)) {
      return normalized;
    }

    let index = 2;
    let candidate = `${normalized}-${index}`;
    while (existing.has(candidate)) {
      index += 1;
      candidate = `${normalized}-${index}`;
    }
    return candidate;
  }

  function presetToDraft(preset: ProviderPreset, config: EditableConfig): PresetDraft {
    return {
      presetId: preset.id,
      providerName: makeNumberedName(preset.provider_name, new Set(Object.keys(config.providers))),
      aliasName: makeNumberedName(preset.suggested_alias, new Set(Object.keys(config.aliases))),
      baseUrl: preset.base_url,
      envName: preset.suggested_env_name,
      modelValue: preset.default_model,
      setActive: false
    };
  }

  function updateImportDraft(id: string, patch: Partial<ImportDraft>) {
    setImportDrafts((drafts) => drafts.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  }

  async function loadConfiguration() {
    const result = await getAdminConfig();
    setConfigPath(result.path);
    setEditableConfig(result.config);
    setConfigMessage("Configuration loaded");
  }

  async function loadProviderPresets() {
    const result = await getProviderPresets();
    setProviderPresets(result.presets);
    setPresetMessage(`Loaded ${result.presets.length} provider preset(s)`);
    return result.presets;
  }

  function applyCcSwitchLink(link: CcSwitchProviderLink) {
    setCcSwitchExportDraft({
      name: link.provider.name,
      app: link.provider.app,
      endpoint: link.provider.endpoint,
      apiKey: link.provider.api_key,
      model: link.provider.model
    });
    setCcSwitchExportMessage("CC Switch link generated");
  }

  async function loadCcSwitchLink(app = ccSwitchExportDraft.app) {
    const link = await getCcSwitchLink(app);
    applyCcSwitchLink(link);
    return link;
  }

  function buildCcSwitchDeepLink() {
    const params = new URLSearchParams({
      resource: "provider",
      app: ccSwitchExportDraft.app,
      name: ccSwitchExportDraft.name,
      endpoint: ccSwitchExportDraft.endpoint,
      apiKey: "modelgate-local",
      model: ccSwitchExportDraft.model,
      notes: "Managed by ModelGate. modelgate-managed=true",
      enabled: "true"
    });

    return `ccswitch://v1/import?${params.toString()}`;
  }

  async function handleCopyCcSwitchLink() {
    try {
      await navigator.clipboard.writeText(buildCcSwitchDeepLink());
      setCcSwitchExportMessage("Deep link copied");
    } catch {
      setCcSwitchExportMessage("Copy failed. Select the deep link manually.");
    }
  }

  async function handleOpenCcSwitch() {
    setBusyAction("ccswitch:open");
    try {
      await openCcSwitchDeepLink(buildCcSwitchDeepLink());
      setCcSwitchExportMessage("Opened CC Switch import link");
    } catch (error) {
      setCcSwitchExportMessage(`Open failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTogglePresetPanel() {
    const nextVisible = !showPresetPanel;
    setShowPresetPanel(nextVisible);

    if (!nextVisible || providerPresets.length > 0) {
      return;
    }

    setBusyAction("preset:load");
    try {
      await loadProviderPresets();
    } catch (error) {
      setPresetMessage(`Failed to load presets: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function selectPreset(preset: ProviderPreset) {
    if (!editableConfig) {
      setPresetMessage("Load ModelGate configuration before adding a preset.");
      return;
    }

    setSelectedPresetId(preset.id);
    setPresetDraft(presetToDraft(preset, editableConfig));
    setPresetMessage(`${preset.display_name} selected. Review fields before adding.`);
  }

  function updatePresetDraft(patch: Partial<PresetDraft>) {
    setPresetDraft((current) => current ? { ...current, ...patch } : current);
  }

  async function handleAddPresetProvider() {
    if (!editableConfig || !presetDraft) {
      setPresetMessage("Select a preset before adding.");
      return;
    }

    if (!presetDraft.providerName.trim() || !presetDraft.aliasName.trim() || !presetDraft.baseUrl.trim() || !presetDraft.envName.trim() || !presetDraft.modelValue.trim()) {
      setPresetMessage("Provider name, alias name, base URL, env var name, and upstream model are required.");
      return;
    }

    setBusyAction("preset:add");
    try {
      const providerName = makeNumberedName(presetDraft.providerName, new Set(Object.keys(editableConfig.providers)));
      const aliasName = makeNumberedName(presetDraft.aliasName, new Set(Object.keys(editableConfig.aliases)));
      const nextConfig: EditableConfig = {
        ...editableConfig,
        active: presetDraft.setActive ? aliasName : editableConfig.active,
        providers: {
          ...editableConfig.providers,
          [providerName]: {
            type: "openai-compatible",
            base_url: presetDraft.baseUrl.trim(),
            api_key: `\${${presetDraft.envName.trim()}}`
          }
        },
        aliases: {
          ...editableConfig.aliases,
          [aliasName]: {
            provider: providerName,
            model: presetDraft.modelValue.trim()
          }
        }
      };

      const validation = await validateAdminConfig(nextConfig);
      if (!validation.ok) {
        throw new Error((validation.errors ?? ["Validation failed"]).join(" "));
      }

      await saveAdminConfig(nextConfig);
      setEditableConfig(nextConfig);
      setPresetDraft({
        ...presetDraft,
        providerName,
        aliasName
      });
      setPresetMessage(`Added ${providerName} and ${aliasName}. Set ${presetDraft.envName.trim()} before using this provider.`);
      await refresh();
    } catch (error) {
      setPresetMessage(`Add preset failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDetectCcSwitch() {
    setBusyAction("ccswitch:detect");
    try {
      const detection = await detectCcSwitchDatabase();
      setCcSwitchPath(detection.path ?? "");
      setCcSwitchMessage(detection.found
        ? `Auto-detected: ${detection.path}`
        : detection.message ?? "CC Switch database was not found automatically.");
    } catch (error) {
      setCcSwitchMessage(`Detection failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function applyCcSwitchScan(scan: Awaited<ReturnType<typeof scanCcSwitchDatabase>>) {
    setCcSwitchPath(scan.path);
    setImportDrafts(scan.candidates.map(candidateToDraft));
    const warning = scan.warnings.length > 0 ? ` Warnings: ${scan.warnings.join(" ")}` : "";
    const skipped = scan.skipped_modelgate_managed > 0
      ? ` Skipped ${scan.skipped_modelgate_managed} ModelGate-managed CC Switch provider(s).`
      : "";
    setCcSwitchMessage(`Found ${scan.candidates.length} candidate(s).${skipped}${warning}`);
  }

  async function handleScanAutoCcSwitch() {
    setBusyAction("ccswitch:scan");
    try {
      await applyCcSwitchScan(await scanCcSwitchDatabase(showManagedCcSwitch));
    } catch (error) {
      setCcSwitchMessage(`Scan failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSelectCcSwitch() {
    setBusyAction("ccswitch:select");
    try {
      const scan = await selectAndScanCcSwitchDatabase(showManagedCcSwitch);
      if (!scan) {
        setCcSwitchMessage("No database selected.");
        return;
      }
      await applyCcSwitchScan(scan);
    } catch (error) {
      setCcSwitchMessage(`Scan failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function loadLogs() {
    const [logsResult, statsResult] = await Promise.all([
      getRequestLogs(50),
      getRequestStats()
    ]);
    setRequestLogs(logsResult.logs);
    setRequestStats(statsResult);
    setLogsMessage("Logs refreshed");
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
      await loadCcSwitchLink("codex").catch(() => undefined);
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

  useEffect(() => {
    if (activeTab !== "logs") {
      return;
    }

    void loadLogs().catch((error) => setLogsMessage(`Failed to load logs: ${getErrorMessage(error)}`));
    const timer = window.setInterval(() => {
      void loadLogs().catch((error) => setLogsMessage(`Failed to load logs: ${getErrorMessage(error)}`));
    }, 3000);

    return () => window.clearInterval(timer);
  }, [activeTab]);

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
      envName: "",
      responsesApi: false
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
        api_key: `\${${providerForm.envName.trim()}}`,
        responses_api: providerForm.responsesApi
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
      envName: providerEnvName(provider),
      responsesApi: provider.type === "openai-compatible" ? Boolean(provider.responses_api) : false
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

  async function handleImportCcSwitch() {
    if (!editableConfig) {
      setCcSwitchMessage("Load ModelGate configuration before importing.");
      return;
    }

    const selected = importDrafts.filter((draft) => draft.selected);
    if (selected.length === 0) {
      setCcSwitchMessage("Select at least one candidate to import.");
      return;
    }

    setBusyAction("ccswitch:import");
    try {
      const providers = { ...editableConfig.providers };
      const aliases = { ...editableConfig.aliases };
      const providerNames = new Set(Object.keys(providers));
      const aliasNames = new Set(Object.keys(aliases));
      let firstAlias: string | null = null;

      for (const draft of selected) {
        if (!draft.providerName || !draft.baseUrl || !draft.envName || !draft.modelValue || !draft.aliasName) {
          throw new Error(`Candidate ${draft.name} is incomplete.`);
        }

        const providerName = overwriteProviders
          ? draft.providerName
          : makeUniqueName(draft.providerName, providerNames);
        if (overwriteProviders) {
          providerNames.add(providerName);
        }

        const aliasName = overwriteAliases
          ? draft.aliasName
          : makeUniqueName(draft.aliasName, aliasNames);
        if (overwriteAliases) {
          aliasNames.add(aliasName);
        }

        providers[providerName] = {
          type: "openai-compatible",
          base_url: draft.baseUrl,
          api_key: `\${${draft.envName}}`
        };
        aliases[aliasName] = {
          provider: providerName,
          model: draft.modelValue
        };
        firstAlias ??= aliasName;
      }

      const nextConfig = {
        ...editableConfig,
        active: setImportedActive && firstAlias ? firstAlias : editableConfig.active,
        providers,
        aliases
      };

      const validation = await validateAdminConfig(nextConfig);
      if (!validation.ok) {
        throw new Error((validation.errors ?? ["Validation failed"]).join(" "));
      }

      await saveAdminConfig(nextConfig);
      setEditableConfig(nextConfig);
      setCcSwitchMessage(`Imported ${selected.length} candidate(s). Set the suggested environment variables before using them.`);
      await refresh();
    } catch (error) {
      setCcSwitchMessage(`Import failed: ${getErrorMessage(error)}`);
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

  async function handleRefreshLogs() {
    setBusyAction("logs:refresh");
    try {
      await loadLogs();
    } catch (error) {
      setLogsMessage(`Failed to load logs: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClearLogs() {
    if (!window.confirm("Clear all in-memory request logs?")) {
      return;
    }

    setBusyAction("logs:clear");
    try {
      await clearRequestLogs();
      await loadLogs();
      setLogsMessage("Logs cleared");
    } catch (error) {
      setLogsMessage(`Failed to clear logs: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function formatDiagnosticResult(result: DiagnosticResult) {
    const lines = [
      `Target: ${result.target}${result.alias ? ` ${result.alias}` : result.provider ? ` ${result.provider}` : ""}`,
      `Provider: ${result.provider ?? "-"}`,
      `Model: ${result.model ?? "-"}`,
      `Stream: ${result.stream}`,
      `Status: ${result.ok ? "Passed" : "Failed"}`,
      `Duration: ${result.duration_ms}ms`
    ];

    if (result.status_code) {
      lines.push(`HTTP status: ${result.status_code}`);
    }

    lines.push("", "Checks:");
    for (const check of result.checks) {
      lines.push(`  ${check.ok ? "OK" : "FAIL"} ${check.name}${check.message ? `: ${check.message}` : ""}`);
    }

    if (result.error_message) {
      lines.push("", `Error: ${result.error_message}`);
    }

    return lines.join("\n");
  }

  async function handleCopyDiagnostic() {
    if (!diagnosticResult) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatDiagnosticResult(diagnosticResult));
      setDiagnosticMessage("Diagnostics result copied");
    } catch {
      setDiagnosticMessage("Copy failed. Select the diagnostics result manually.");
    }
  }

  async function runDiagnostic(action: string, callback: () => Promise<DiagnosticResult>) {
    setBusyAction(action);
    setDiagnosticMessage("Running diagnostics...");

    try {
      const result = await callback();
      setDiagnosticResult(result);
      setDiagnosticMessage(result.ok ? "Diagnostics passed" : "Diagnostics failed");
      await loadLogs().catch(() => undefined);
    } catch (error) {
      setDiagnosticMessage(`Diagnostics failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function providerDiagnosticModel(providerName: string) {
    return aliasEntries.find(([, alias]) => alias.provider === providerName)?.[1].model;
  }

  function handleTestProvider(providerName: string) {
    const inferredModel = providerDiagnosticModel(providerName);
    const model = inferredModel ?? window.prompt(`Model for provider ${providerName}`)?.trim();
    if (!model) {
      setDiagnosticMessage("Provider diagnostics require a model.");
      return;
    }

    void runDiagnostic(`diagnostic:provider:${providerName}`, () => testProvider(providerName, model, false));
  }

  function renderDiagnosticResult() {
    if (!diagnosticResult) {
      return null;
    }

    return (
      <section className="card diagnostic-card">
        <div className="card-heading">
          <span>Diagnostics Result</span>
          <button className="secondary" onClick={() => void handleCopyDiagnostic()}>Copy</button>
        </div>
        <dl className="diagnostic-summary">
          <div>
            <dt>Target</dt>
            <dd>{diagnosticResult.target}{diagnosticResult.alias ? ` ${diagnosticResult.alias}` : diagnosticResult.provider ? ` ${diagnosticResult.provider}` : ""}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd><span className={diagnosticResult.ok ? "pill" : "pill bad"}>{diagnosticResult.ok ? "Passed" : "Failed"}</span></dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{diagnosticResult.provider ?? "-"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{diagnosticResult.model ?? "-"}</dd>
          </div>
          <div>
            <dt>Stream</dt>
            <dd>{diagnosticResult.stream ? "true" : "false"}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{diagnosticResult.duration_ms}ms</dd>
          </div>
          <div>
            <dt>HTTP Status</dt>
            <dd>{diagnosticResult.status_code ?? "-"}</dd>
          </div>
        </dl>
        <div className="diagnostic-checks">
          {diagnosticResult.checks.map((check) => (
            <div className={check.ok ? "diagnostic-check" : "diagnostic-check failed"} key={check.name}>
              <span>{check.ok ? "OK" : "FAIL"}</span>
              <strong>{check.name}</strong>
              <p>{check.message ?? ""}</p>
            </div>
          ))}
        </div>
        {diagnosticResult.error_message && (
          <p className="inline-error">{diagnosticResult.error_message}</p>
        )}
        <span className={diagnosticMessage.startsWith("Diagnostics failed") ? "action-message bad" : "action-message"}>
          {diagnosticMessage}
        </span>
      </section>
    );
  }

  function renderCcSwitchIntegration() {
    const deepLink = buildCcSwitchDeepLink();

    return (
      <section className="card config-card ccswitch-export-card">
        <div className="card-heading">
          <span>CC Switch Integration</span>
          <button className="secondary" onClick={() => void loadCcSwitchLink(ccSwitchExportDraft.app).catch((error) => setCcSwitchExportMessage(`Generate failed: ${getErrorMessage(error)}`))} disabled={busyAction !== null || disconnected}>
            Generate Defaults
          </button>
        </div>
        <p className="muted">
          Export ModelGate as a local provider through a CC Switch deep link. The link uses the local placeholder API key only.
        </p>
        <div className="ccswitch-export-form">
          <label>
            Provider Name
            <input value={ccSwitchExportDraft.name} onChange={(event) => setCcSwitchExportDraft({ ...ccSwitchExportDraft, name: event.target.value })} />
          </label>
          <label>
            Target App
            <select value={ccSwitchExportDraft.app} onChange={(event) => setCcSwitchExportDraft({ ...ccSwitchExportDraft, app: event.target.value })}>
              {Object.entries(ccSwitchAppLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Endpoint
            <input value={ccSwitchExportDraft.endpoint} onChange={(event) => setCcSwitchExportDraft({ ...ccSwitchExportDraft, endpoint: event.target.value })} />
          </label>
          <label>
            API Key
            <input value={ccSwitchExportDraft.apiKey} readOnly disabled />
          </label>
          <label>
            Model
            <input value={ccSwitchExportDraft.model} onChange={(event) => setCcSwitchExportDraft({ ...ccSwitchExportDraft, model: event.target.value })} />
          </label>
        </div>
        <dl className="ccswitch-export-preview">
          <div>
            <dt>Name</dt>
            <dd>{ccSwitchExportDraft.name}</dd>
          </div>
          <div>
            <dt>App</dt>
            <dd>{ccSwitchAppLabels[ccSwitchExportDraft.app] ?? ccSwitchExportDraft.app}</dd>
          </div>
          <div>
            <dt>Endpoint</dt>
            <dd>{ccSwitchExportDraft.endpoint}</dd>
          </div>
          <div>
            <dt>API Key</dt>
            <dd>{ccSwitchExportDraft.apiKey}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{ccSwitchExportDraft.model}</dd>
          </div>
        </dl>
        <pre className="deep-link-preview">{deepLink}</pre>
        <div className="server-actions">
          <button onClick={() => void handleOpenCcSwitch()} disabled={busyAction !== null}>
            {busyAction === "ccswitch:open" ? "Opening..." : "Open in CC Switch"}
          </button>
          <button className="secondary" onClick={() => void handleCopyCcSwitchLink()} disabled={busyAction !== null}>
            Copy Deep Link
          </button>
          <span className={ccSwitchExportMessage.startsWith("Open failed") || ccSwitchExportMessage.startsWith("Generate failed") ? "action-message bad" : "action-message"}>
            {ccSwitchExportMessage}
          </span>
        </div>
      </section>
    );
  }

  function formatLogTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString();
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
  const logsBusy = busyAction?.startsWith("logs:") ?? false;
  const presetBusy = busyAction?.startsWith("preset:") ?? false;
  const selectedPreset = providerPresets.find((preset) => preset.id === selectedPresetId) ?? null;
  const normalizedPresetSearch = presetSearch.trim().toLowerCase();
  const filteredPresets = providerPresets.filter((preset) => {
    if (!normalizedPresetSearch) {
      return true;
    }

    return [
      preset.display_name,
      preset.provider_name,
      preset.base_url,
      preset.default_model,
      preset.suggested_alias
    ].some((value) => value.toLowerCase().includes(normalizedPresetSearch));
  });

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
        <button
          className={activeTab === "logs" ? "tab active" : "tab"}
          onClick={() => {
            setActiveTab("logs");
            void loadLogs().catch((error) => setLogsMessage(`Failed to load logs: ${getErrorMessage(error)}`));
          }}
        >
          Logs
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
            <>
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
              <div className="diagnostic-actions">
                <button onClick={() => void runDiagnostic("diagnostic:active", () => testActive(false))} disabled={busyAction !== null || disconnected}>
                  {busyAction === "diagnostic:active" ? "Testing..." : "Test Active"}
                </button>
                <button className="secondary" onClick={() => void runDiagnostic("diagnostic:active-stream", () => testActive(true))} disabled={busyAction !== null || disconnected}>
                  {busyAction === "diagnostic:active-stream" ? "Testing..." : "Test Active Stream"}
                </button>
              </div>
            </>
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

      {renderDiagnosticResult()}

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
      {renderCcSwitchIntegration()}
        </>
      ) : activeTab === "configuration" ? (
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

          {renderDiagnosticResult()}
          {renderCcSwitchIntegration()}

          <section className="card config-card preset-card">
            <div className="card-heading">
              <span>Provider Presets</span>
              <button className="secondary" onClick={() => void handleTogglePresetPanel()} disabled={busyAction !== null}>
                {showPresetPanel ? "Hide Presets" : "Add from Preset"}
              </button>
            </div>
            <p className="muted">
              Built-in OpenAI-compatible templates save provider endpoints and <code>{"${ENV_NAME}"}</code> references only. Set the environment variable before using the provider.
            </p>
            {showPresetPanel && (
              <>
                <div className="preset-toolbar">
                  <input
                    placeholder="Search presets"
                    value={presetSearch}
                    onChange={(event) => setPresetSearch(event.target.value)}
                  />
                  <button className="secondary" onClick={() => void loadProviderPresets().catch((error) => setPresetMessage(`Failed to load presets: ${getErrorMessage(error)}`))} disabled={busyAction !== null}>
                    {busyAction === "preset:load" ? "Loading..." : "Refresh Presets"}
                  </button>
                  <span className={presetMessage.startsWith("Failed") || presetMessage.startsWith("Add preset failed") ? "action-message bad" : "action-message"}>
                    {presetMessage}
                  </span>
                </div>
                <div className="preset-table">
                  <div className="preset-row preset-head">
                    <span>Provider</span>
                    <span>Base URL</span>
                    <span>Default Model</span>
                  </div>
                  {filteredPresets.map((preset) => (
                    <button
                      className={selectedPresetId === preset.id ? "preset-row preset-option active" : "preset-row preset-option"}
                      key={preset.id}
                      onClick={() => selectPreset(preset)}
                      type="button"
                    >
                      <span>{preset.display_name}</span>
                      <span>{preset.base_url}</span>
                      <span>{preset.default_model}</span>
                    </button>
                  ))}
                </div>
                {presetDraft && selectedPreset && (
                  <div className="preset-preview">
                    <div className="preset-preview-heading">
                      <strong>{selectedPreset.display_name}</strong>
                      <span>{selectedPreset.notes ?? "Review and edit before adding."}</span>
                    </div>
                    <div className="preset-form">
                      <label>
                        Provider Name
                        <input value={presetDraft.providerName} onChange={(event) => updatePresetDraft({ providerName: event.target.value })} />
                      </label>
                      <label>
                        Alias Name
                        <input value={presetDraft.aliasName} onChange={(event) => updatePresetDraft({ aliasName: event.target.value })} />
                      </label>
                      <label>
                        Base URL
                        <input value={presetDraft.baseUrl} onChange={(event) => updatePresetDraft({ baseUrl: event.target.value })} />
                      </label>
                      <label>
                        Environment Variable Name
                        <input value={presetDraft.envName} onChange={(event) => updatePresetDraft({ envName: event.target.value })} />
                      </label>
                      <label>
                        Upstream Model
                        {selectedPreset.models && selectedPreset.models.length > 1 ? (
                          <select value={presetDraft.modelValue} onChange={(event) => updatePresetDraft({ modelValue: event.target.value })}>
                            {selectedPreset.models.map((model) => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                          </select>
                        ) : (
                          <input value={presetDraft.modelValue} onChange={(event) => updatePresetDraft({ modelValue: event.target.value })} />
                        )}
                      </label>
                    </div>
                    <div className="preset-actions">
                      <label>
                        <input type="checkbox" checked={presetDraft.setActive} onChange={(event) => updatePresetDraft({ setActive: event.target.checked })} />
                        Set as active after adding
                      </label>
                      <button onClick={() => void handleAddPresetProvider()} disabled={!editableConfig || busyAction !== null}>
                        {presetBusy ? "Adding..." : "Add Provider"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card config-card import-card">
            <div className="card-heading">
              <span>Import from CC Switch</span>
              <strong>{importDrafts.length}</strong>
            </div>
            <p className="muted">
              Read-only import from CC Switch. Plaintext API keys are never imported; ModelGate saves environment variable references only.
            </p>
            <div className="server-actions">
              <button onClick={() => void handleDetectCcSwitch()} disabled={busyAction !== null}>
                {busyAction === "ccswitch:detect" ? "Detecting..." : "Auto Detect"}
              </button>
              <button onClick={() => void handleScanAutoCcSwitch()} disabled={busyAction !== null || !ccSwitchPath}>
                {busyAction === "ccswitch:scan" ? "Scanning..." : "Scan Auto-detected Database"}
              </button>
              <button className="secondary" onClick={() => void handleSelectCcSwitch()} disabled={busyAction !== null}>
                {busyAction === "ccswitch:select" ? "Selecting..." : "Select cc-switch.db"}
              </button>
            </div>
            <div className="import-options">
              <label>
                <input type="checkbox" checked={showManagedCcSwitch} onChange={(event) => setShowManagedCcSwitch(event.target.checked)} />
                Show ModelGate-managed providers
              </label>
            </div>
            <div className="import-source">
              <span>{ccSwitchPath ? `Source: ${ccSwitchPath}` : "CC Switch database was not found automatically. Select cc-switch.db manually."}</span>
              <span className={ccSwitchMessage.startsWith("Import failed") || ccSwitchMessage.startsWith("Scan failed") ? "action-message bad" : "action-message"}>
                {ccSwitchMessage}
              </span>
            </div>

            {importDrafts.length > 0 && (
              <>
                <div className="import-options">
                  <label>
                    <input type="checkbox" checked={overwriteProviders} onChange={(event) => setOverwriteProviders(event.target.checked)} />
                    Overwrite existing providers with same name
                  </label>
                  <label>
                    <input type="checkbox" checked={overwriteAliases} onChange={(event) => setOverwriteAliases(event.target.checked)} />
                    Overwrite existing aliases with same name
                  </label>
                  <label>
                    <input type="checkbox" checked={setImportedActive} onChange={(event) => setSetImportedActive(event.target.checked)} />
                    Set first imported alias as active
                  </label>
                </div>
                <div className="ccswitch-table">
                  <div className="ccswitch-row ccswitch-head">
                    <span>Import</span>
                    <span>Provider</span>
                    <span>Base URL</span>
                    <span>Detected Key</span>
                    <span>Env Name</span>
                    <span>Model</span>
                    <span>Alias</span>
                    <span>Warnings</span>
                  </div>
                  {importDrafts.map((draft) => (
                    <div className={draft.complete ? "ccswitch-row" : "ccswitch-row incomplete"} key={draft.id}>
                      <span>
                        <input
                          type="checkbox"
                          checked={draft.selected}
                          onChange={(event) => updateImportDraft(draft.id, { selected: event.target.checked })}
                        />
                      </span>
                      <input value={draft.providerName} onChange={(event) => updateImportDraft(draft.id, { providerName: event.target.value })} />
                      <input value={draft.baseUrl} onChange={(event) => updateImportDraft(draft.id, { baseUrl: event.target.value })} />
                      <span>{draft.api_key_detected ? draft.api_key_preview ?? "Detected" : "Not detected"}</span>
                      <input value={draft.envName} onChange={(event) => updateImportDraft(draft.id, { envName: event.target.value })} />
                      {draft.models.length > 1 ? (
                        <select value={draft.modelValue} onChange={(event) => updateImportDraft(draft.id, { modelValue: event.target.value })}>
                          {draft.models.map((model) => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </select>
                      ) : (
                        <input value={draft.modelValue} onChange={(event) => updateImportDraft(draft.id, { modelValue: event.target.value })} />
                      )}
                      <input value={draft.aliasName} onChange={(event) => updateImportDraft(draft.id, { aliasName: event.target.value })} />
                      <span>{draft.warnings.join(" ")}</span>
                    </div>
                  ))}
                </div>
                <section className="actions import-actions">
                  <button onClick={() => void handleImportCcSwitch()} disabled={!editableConfig || busyAction !== null}>
                    {busyAction === "ccswitch:import" ? "Importing..." : "Import Selected"}
                  </button>
                </section>
              </>
            )}
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
                <span>Responses</span>
                <span>API Key</span>
                <span>Actions</span>
              </div>
              {providerEntries.map(([name, provider]) => (
                <div className="config-row" key={name}>
                  <span>{name}</span>
                  <span>{provider.type}</span>
                  <span>{provider.type === "openai-compatible" ? provider.base_url : "-"}</span>
                  <span>{provider.type === "openai-compatible" && provider.responses_api ? "direct" : "-"}</span>
                  <span>
                    {provider.type === "openai-compatible"
                      ? `${provider.api_key} ${provider.api_key_resolved ? "OK" : "Missing"}`
                      : "-"}
                  </span>
                  <span className="row-actions">
                    <button className="secondary" onClick={() => handleTestProvider(name)} disabled={busyAction !== null}>
                      {busyAction === `diagnostic:provider:${name}` ? "Testing..." : "Test"}
                    </button>
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
              <label className="inline-checkbox">
                <input type="checkbox" checked={providerForm.responsesApi} onChange={(event) => setProviderForm({ ...providerForm, responsesApi: event.target.checked })} disabled={providerForm.type === "mock"} />
                Responses API
              </label>
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
                    <button className="secondary" onClick={() => void runDiagnostic(`diagnostic:alias:${name}`, () => testAlias(name, false))} disabled={busyAction !== null}>
                      {busyAction === `diagnostic:alias:${name}` ? "Testing..." : "Test"}
                    </button>
                    <button className="secondary" onClick={() => void runDiagnostic(`diagnostic:alias-stream:${name}`, () => testAlias(name, true))} disabled={busyAction !== null}>
                      {busyAction === `diagnostic:alias-stream:${name}` ? "Testing..." : "Test Stream"}
                    </button>
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
      ) : (
        <section className="logs-page">
          {disconnected && (
            <section className="notice error">
              <strong>ModelGate server is not connected.</strong>
              <span>Start or reconnect the server to view request logs.</span>
            </section>
          )}

          <section className="grid">
            <article className="card stats-card">
              <div className="card-heading">
                <span>Request Stats</span>
                <strong>{requestStats?.total ?? 0}</strong>
              </div>
              <dl className="stats-grid">
                <div>
                  <dt>Total Requests</dt>
                  <dd>{requestStats?.total ?? 0}</dd>
                </div>
                <div>
                  <dt>Success</dt>
                  <dd>{requestStats?.success ?? 0}</dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd>{requestStats?.failed ?? 0}</dd>
                </div>
                <div>
                  <dt>Average Duration</dt>
                  <dd>{requestStats?.avg_duration_ms ?? 0}ms</dd>
                </div>
                <div>
                  <dt>Stream</dt>
                  <dd>{requestStats?.stream ?? 0}</dd>
                </div>
                <div>
                  <dt>Non-stream</dt>
                  <dd>{requestStats?.non_stream ?? 0}</dd>
                </div>
              </dl>
            </article>

            <article className="card stats-card">
              <div className="card-heading">
                <span>By Provider</span>
                <strong>{Object.keys(requestStats?.by_provider ?? {}).length}</strong>
              </div>
              <div className="provider-stats">
                {Object.entries(requestStats?.by_provider ?? {}).length > 0 ? (
                  Object.entries(requestStats?.by_provider ?? {}).map(([provider, count]) => (
                    <div key={provider}>
                      <span>{provider}</span>
                      <strong>{count}</strong>
                    </div>
                  ))
                ) : (
                  <p className="muted">No provider stats yet.</p>
                )}
              </div>
            </article>
          </section>

          <section className="actions">
            <button onClick={() => void handleRefreshLogs()} disabled={busyAction !== null || disconnected}>
              {busyAction === "logs:refresh" ? "Refreshing..." : "Refresh"}
            </button>
            <button className="secondary danger" onClick={() => void handleClearLogs()} disabled={busyAction !== null || disconnected}>
              {busyAction === "logs:clear" ? "Clearing..." : "Clear Logs"}
            </button>
            <span className={logsMessage.startsWith("Failed") ? "action-message bad" : "action-message"}>
              {logsMessage}
            </span>
          </section>

          <section className="card table-card">
            <div className="card-heading">
              <span>Recent Requests</span>
              <strong>{requestLogs.length}</strong>
            </div>
            <div className="request-log-table">
              <div className="request-log-row request-log-head">
                <span>Time</span>
                <span>Kind</span>
                <span>API</span>
                <span>Fallback</span>
                <span>Status</span>
                <span>Stream</span>
                <span>Requested Model</span>
                <span>Alias</span>
                <span>Provider</span>
                <span>Upstream Model</span>
                <span>Duration</span>
                <span>Error</span>
              </div>
              {requestLogs.map((entry) => (
                <div className={entry.ok ? "request-log-row ok" : "request-log-row failed"} key={entry.id}>
                  <span>{formatLogTime(entry.started_at)}</span>
                  <span>{entry.kind === "diagnostic" ? "Diagnostic" : "Normal"}</span>
                  <span>{entry.api_type === "responses" ? "responses" : "chat"}</span>
                  <span>{entry.fallback_mode ?? "-"}</span>
                  <span><span className={entry.ok ? "pill" : "pill bad"}>{entry.ok ? "OK" : entry.status_code ?? "ERR"}</span></span>
                  <span>{entry.stream ? "stream" : "non-stream"}</span>
                  <span>{entry.requested_model ?? "-"}</span>
                  <span>{entry.resolved_alias ?? "-"}</span>
                  <span>{entry.provider ?? "-"}</span>
                  <span>{entry.upstream_model ?? "-"}</span>
                  <span>{entry.duration_ms ?? 0}ms</span>
                  <span>{entry.error_message ?? ""}</span>
                </div>
              ))}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
