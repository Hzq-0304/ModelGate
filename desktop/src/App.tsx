import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AliasesResponse,
  type CcSwitchImportCandidate,
  type CcSwitchImportReport,
  type CcSwitchProviderLink,
  type ConfigWarning,
  type DiagnosticResult,
  type EditableConfig,
  type ProviderPreset,
  type ProviderConfig,
  type RequestLogEntry,
  type RequestStats,
  type ServerProcessStatus,
  type StatusResponse,
  clearRequestLogs,
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
  readModelGateConfig,
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
  validateAdminConfig,
  validateModelGateConfigOffline,
  writeModelGateConfig
} from "./api";
import { SettingsIcon } from "./components/icons/SettingsIcon";
import { LanguageSelector } from "./components/LanguageSelector";
import { PageHeader } from "./components/PageHeader";
import { AccountSwitcher } from "./features/account-switcher/AccountSwitcher";
import type { ConnectionState } from "./features/account-switcher/accountTypes";
import type { CcSwitchExportDraft } from "./features/ccswitch/CcSwitchExportPanel";
import { CcSwitchImportModal } from "./features/ccswitch-import/CcSwitchImportModal";
import { QuickStart } from "./features/quick-start/QuickStart";
import { ServerControl } from "./features/server-control/ServerControl";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import type { SettingsSectionId } from "./features/settings/settingsRoutes";
import { UsageOverview } from "./features/usage-overview/UsageOverview";
import { useI18n } from "./i18n/i18n";
import type { AppRouteId } from "./routes/routeTypes";
import { primaryRoutes } from "./routes/routes";

type ActiveTab = AppRouteId;
type ConfigSection = SettingsSectionId;

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

const serverUrl = getBaseUrl();
const OPENAI_OFFICIAL_BASE_URL = "https://api.openai.com/v1";
const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const configKeyPattern = /^[A-Za-z0-9_-]+$/;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeConfigKey(value: string, fallback = "ccswitch-provider") {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

function isPlaceholderValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "-" || normalized === "none" || normalized === "null" || normalized === "undefined" || normalized === "n/a";
}

function normalizeImportBaseUrl(value: string | undefined) {
  if (!value || isPlaceholderValue(value)) {
    return "";
  }

  return value.trim().replace(/^['"]|['"]$/g, "");
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeEnvName(value: string | undefined, fallbackKey: string) {
  const unwrapped = (value ?? "")
    .trim()
    .replace(/^env:/i, "")
    .replace(/^\$\{?/, "")
    .replace(/\}$/, "")
    .trim();

  if (envNamePattern.test(unwrapped)) {
    return unwrapped;
  }

  const fallback = normalizeConfigKey(fallbackKey)
    .replace(/-/g, "_")
    .toUpperCase();
  return `${fallback || "CCSWITCH_PROVIDER"}_API_KEY`;
}

function looksLikeOpenAIOfficial(value: string | undefined) {
  const normalized = normalizeConfigKey(value ?? "");
  return normalized === "openai"
    || normalized === "openai-official"
    || normalized === "official-openai"
    || normalized === "codex-official"
    || normalized === "official";
}

function draftLooksLikeOpenAIOfficial(draft: Pick<ImportDraft, "name" | "providerName" | "aliasName" | "provider_name">) {
  return looksLikeOpenAIOfficial(draft.name)
    || looksLikeOpenAIOfficial(draft.providerName)
    || looksLikeOpenAIOfficial(draft.aliasName)
    || looksLikeOpenAIOfficial(draft.provider_name);
}

function buildProviderAuthFromDraft(draft: ImportDraft, providerName: string, envName: string) {
  const hasCcSwitchCredential = draft.auth_type === "ccswitch"
    && draft.auth_status === "imported"
    && Boolean(draft.credential_ref || draft.credential_path || draft.source_id);

  if (hasCcSwitchCredential) {
    return {
      type: "ccswitch" as const,
      source: draft.auth_source ?? "CC Switch OpenAI Official",
      app: draft.app || "codex",
      db_path: draft.db_path,
      provider_id: draft.source_id,
      credential_ref: draft.credential_ref ?? (draft.source_id ? `ccswitch://providers/${draft.app || "codex"}/${draft.source_id}/auth` : undefined),
      credential_path: draft.credential_path ?? "/auth/OPENAI_API_KEY",
      fallback_env: envName,
      header: "Authorization",
      scheme: "Bearer"
    };
  }

  return {
    type: "env" as const,
    header: "Authorization",
    scheme: "Bearer",
    env: envName || normalizeEnvName(draft.api_key_env ?? draft.suggested_env_name, providerName)
  };
}

export function App() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ActiveTab>("switcher");
  const [configSection, setConfigSection] = useState<ConfigSection>("providers");
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [aliases, setAliases] = useState<AliasesResponse | null>(null);
  const [serverProcess, setServerProcess] = useState<ServerProcessStatus | null>(null);
  const [configPath, setConfigPath] = useState("");
  const [editableConfig, setEditableConfig] = useState<EditableConfig | null>(null);
  const [configWarnings, setConfigWarnings] = useState<ConfigWarning[]>([]);
  const [configMessage, setConfigMessage] = useState(t("config.notLoaded"));
  const [ccSwitchPath, setCcSwitchPath] = useState("");
  const [ccSwitchMessage, setCcSwitchMessage] = useState("CC Switch import not scanned");
  const [ccSwitchReport, setCcSwitchReport] = useState<CcSwitchImportReport | null>(null);
  const [showCcSwitchImportGuide, setShowCcSwitchImportGuide] = useState(false);
  const [generateImportNames, setGenerateImportNames] = useState(true);
  const [ccSwitchExportDraft, setCcSwitchExportDraft] = useState<CcSwitchExportDraft>({
    name: "ModelGate Local",
    app: "codex",
    endpoint: `${serverUrl}/v1`,
    apiKey: "modelgate-local",
    model: "codex-main"
  });
  const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([]);
  const [showPresetPanel, setShowPresetPanel] = useState(false);
  const [providerPresets, setProviderPresets] = useState<ProviderPreset[]>([]);
  const [presetSearch, setPresetSearch] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null);
  const [presetMessage, setPresetMessage] = useState("Preset library not loaded");
  const [requestLogs, setRequestLogs] = useState<RequestLogEntry[]>([]);
  const [requestStats, setRequestStats] = useState<RequestStats | null>(null);
  const [logsMessage, setLogsMessage] = useState(t("usage.notLoaded"));
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState("Diagnostics not run");
  const [codexImportMessage, setCodexImportMessage] = useState(t("codexImport.notStarted"));
  const [showCodexImportPanel, setShowCodexImportPanel] = useState(false);
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
  const [message, setMessage] = useState(t("advanced.statusRefreshed"));
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);

  const localAliases = useMemo(() => {
    if (!editableConfig) {
      return [];
    }

    return Object.entries(editableConfig.aliases).map(([name, alias]) => ({
      name,
      provider: alias.provider,
      model: alias.model,
      description: alias.description
    }));
  }, [editableConfig]);

  const displayAliases = aliases?.aliases ?? localAliases;
  const displayActiveAliasName = status?.active ?? editableConfig?.active;
  const displayConfigWarnings = status?.config_warnings ?? configWarnings;
  const configWarningByProvider = useMemo(() => {
    return new Map(
      displayConfigWarnings
        .filter((warning) => warning.provider)
        .map((warning) => [warning.provider as string, warning])
    );
  }, [displayConfigWarnings]);

  const activeAlias = useMemo(() => {
    if (!displayActiveAliasName) {
      return null;
    }

    return displayAliases.find((alias) => alias.name === displayActiveAliasName) ?? null;
  }, [displayAliases, displayActiveAliasName]);

  const codexConfig = `Base URL: ${serverUrl}/v1\nAPI Key: modelgate-local\nModel: codex-main`;

  function candidateToDraft(candidate: CcSwitchImportCandidate): ImportDraft {
    const providerName = normalizeConfigKey(candidate.suggested_modelgate_provider || candidate.provider_name || candidate.name);
    const aliasName = normalizeConfigKey(candidate.suggested_modelgate_alias || candidate.name, providerName);
    const openaiOfficial = looksLikeOpenAIOfficial(candidate.name) || looksLikeOpenAIOfficial(providerName) || looksLikeOpenAIOfficial(aliasName);
    const baseUrl = normalizeImportBaseUrl(candidate.base_url) || (openaiOfficial ? OPENAI_OFFICIAL_BASE_URL : "");
    const envName = normalizeEnvName(candidate.api_key_env ?? candidate.suggested_env_name, openaiOfficial ? "openai" : candidate.name || providerName);
    const modelValue = candidate.model ?? candidate.models[0] ?? "";
    const complete = Boolean(providerName && aliasName && baseUrl && modelValue);

    return {
      ...candidate,
      selected: complete && candidate.provider_type === "openai-compatible",
      providerName,
      baseUrl,
      envName,
      modelValue,
      aliasName
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
    try {
      const result = await getAdminConfig();
      setConfigPath(result.path);
      setEditableConfig(result.config);
      setConfigWarnings(result.config_warnings ?? []);
      setConfigMessage("Configuration loaded");
      return result;
    } catch (onlineError) {
      const result = await readModelGateConfig();
      setConfigPath(result.path);
      setEditableConfig(result.config);
      setConfigWarnings(result.config_warnings ?? []);
      setConfigMessage(`Configuration loaded offline: ${result.path}`);
      return result;
    }
  }

  async function validateConfigForCurrentMode(config: EditableConfig) {
    if (connection === "connected") {
      try {
        return {
          mode: "online" as const,
          result: await validateAdminConfig(config)
        };
      } catch {
        // The server can go away between refreshes; fall through to offline validation.
      }
    }

    return {
      mode: "offline" as const,
      result: await validateModelGateConfigOffline(config)
    };
  }

  async function saveConfigForCurrentMode(config: EditableConfig) {
    if (connection === "connected") {
      try {
        return {
          mode: "online" as const,
          result: await saveAdminConfig(config)
        };
      } catch {
        // Keep configuration editing usable when the backend is stopped or restarting.
      }
    }

    return {
      mode: "offline" as const,
      result: await writeModelGateConfig(config)
    };
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
  }

  async function loadCcSwitchLink(app = ccSwitchExportDraft.app) {
    const link = await getCcSwitchLink(app);
    applyCcSwitchLink(link);
    return link;
  }

  function buildCcSwitchDeepLink(app = ccSwitchExportDraft.app) {
    const params = new URLSearchParams({
      resource: "provider",
      app,
      name: ccSwitchExportDraft.name,
      endpoint: ccSwitchExportDraft.endpoint,
      apiKey: "modelgate-local",
      model: ccSwitchExportDraft.model,
      notes: "Managed by ModelGate. modelgate-managed=true",
      enabled: "true"
    });

    return `ccswitch://v1/import?${params.toString()}`;
  }

  function scrollToElement(id: string) {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openSettings(section: ConfigSection = "integrations") {
    setActiveTab("settings");
    setConfigSection(section);
    if (!editableConfig) {
      void loadConfiguration().catch((error) => setConfigMessage(`Failed to load configuration: ${getErrorMessage(error)}`));
    }
  }

  function openSettingsSection(section: ConfigSection, targetId?: string) {
    openSettings(section);
    if (targetId) {
      scrollToElement(targetId);
    }
  }

  function openCcSwitchImportModal() {
    setShowCcSwitchImportGuide(true);
    if (!editableConfig) {
      void loadConfiguration().catch((error) => setConfigMessage(`Failed to load configuration: ${getErrorMessage(error)}`));
    }
    void handleScanAutoCcSwitch();
  }

  function openCodexImportPanel() {
    setShowCodexImportPanel(true);
    openSettingsSection("integrations", "codex-import-panel");
    setCodexImportMessage(t("codexImport.review"));
  }

  function openLogsPage() {
    setActiveTab("logs");
    void loadLogs().catch((error) => setLogsMessage(`Failed to load logs: ${getErrorMessage(error)}`));
  }

  async function handleCopyCodexImportConfig() {
    try {
      await navigator.clipboard.writeText(codexConfig);
      setCodexImportMessage(t("codexImport.configCopied"));
    } catch {
      setCodexImportMessage(t("codexImport.configCopyFailed"));
    }
  }

  async function handleCopyCodexDeepLink() {
    try {
      await navigator.clipboard.writeText(buildCcSwitchDeepLink("codex"));
      setCodexImportMessage(t("codexImport.deepLinkCopied"));
    } catch {
      setCodexImportMessage(t("codexImport.deepLinkCopyFailed"));
    }
  }

  async function handleOpenCodexInCcSwitch() {
    setBusyAction("codex-import:open");
    try {
      await openCcSwitchDeepLink(buildCcSwitchDeepLink("codex"));
      setCodexImportMessage(t("codexImport.opened"));
    } catch (error) {
      setCodexImportMessage(t("codexImport.openFailed", { message: getErrorMessage(error) }));
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

      const { result: validation } = await validateConfigForCurrentMode(nextConfig);
      if (!validation.ok) {
        throw new Error((validation.errors ?? ["Validation failed"]).join(" "));
      }

      const { result: saveResult } = await saveConfigForCurrentMode(nextConfig);
      if (!saveResult.ok) {
        throw new Error((saveResult.errors ?? ["Save failed"]).join(" "));
      }
      setEditableConfig(nextConfig);
      setPresetDraft({
        ...presetDraft,
        providerName,
        aliasName
      });
      setPresetMessage(`Added ${providerName} and ${aliasName}. Set ${presetDraft.envName.trim()} before using this provider.`);
      await loadConfiguration().catch(() => undefined);
      if (connection === "connected") {
        await refresh();
      }
    } catch (error) {
      setPresetMessage(`Add preset failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function applyCcSwitchScan(scan: Awaited<ReturnType<typeof scanCcSwitchDatabase>>) {
    setCcSwitchPath(scan.path);
    setCcSwitchReport(scan.report);
    setImportDrafts(scan.candidates.map(candidateToDraft));
    const skipped = scan.skipped_modelgate_managed > 0
      ? ` ${t("ccswitch.simple.skippedManaged", { count: scan.skipped_modelgate_managed })}`
      : "";
    setCcSwitchMessage(`${t("ccswitch.simple.found", { count: scan.candidates.length })}.${skipped}`);
  }

  function formatCcSwitchScanError(error: unknown) {
    const message = getErrorMessage(error);
    if (message.toLowerCase().includes("not found")) {
      return t("ccswitch.simple.notFound");
    }

    return `Scan failed: ${message}`;
  }

  async function handleScanAutoCcSwitch() {
    setShowCcSwitchImportGuide(true);
    setBusyAction("ccswitch:scan");
    setCcSwitchMessage(t("ccswitch.simple.scanning"));
    try {
      await applyCcSwitchScan(await scanCcSwitchDatabase(false));
    } catch (error) {
      setCcSwitchPath("");
      setCcSwitchReport(null);
      setImportDrafts([]);
      setCcSwitchMessage(formatCcSwitchScanError(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSelectCcSwitch() {
    setShowCcSwitchImportGuide(true);
    setBusyAction("ccswitch:select");
    try {
      const scan = await selectAndScanCcSwitchDatabase(false);
      if (!scan) {
        setCcSwitchMessage(t("ccswitch.simple.noDatabaseSelected"));
        return;
      }
      await applyCcSwitchScan(scan);
    } catch (error) {
      setCcSwitchMessage(formatCcSwitchScanError(error));
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

  const syncServerState = useCallback(async (processStatus?: ServerProcessStatus, successMessage = "Status refreshed") => {
    const nextProcessStatus = processStatus ?? await getServerProcessStatus();
    setServerProcess(nextProcessStatus);
    try {
      await getHealth();
      const [nextStatus, nextAliases] = await Promise.all([getStatus(), getAliases()]);
      setStatus(nextStatus);
      setAliases(nextAliases);
      setConnection("connected");
      setMessage(successMessage);
      await loadConfiguration().catch(() => undefined);
      await loadCcSwitchLink("codex").catch(() => undefined);
    } catch (error) {
      setConnection("disconnected");
      setStatus(null);
      setAliases(null);
      await loadConfiguration().catch(() => undefined);
      const statusMessage = nextProcessStatus.lastError ?? nextProcessStatus.message;
      if (nextProcessStatus.status === "starting") {
        setMessage(statusMessage ?? "Server is starting.");
      } else if (nextProcessStatus.status === "stopping") {
        setMessage(statusMessage ?? "Server is stopping.");
      } else if (nextProcessStatus.status === "failed" && statusMessage) {
        setMessage(`Failed to start server: ${statusMessage}`);
      } else {
        setMessage(`ModelGate server is not running. Local configuration is available. ${getErrorMessage(error)}`);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    setBusyAction("refresh");

    try {
      await syncServerState(undefined, "Status refreshed");
    } catch (error) {
      setConnection("disconnected");
      setStatus(null);
      setAliases(null);
      await loadConfiguration().catch(() => undefined);
      const nextProcessStatus = await getServerProcessStatus().catch(() => null);
      setServerProcess(nextProcessStatus);
      setMessage(`ModelGate server is not running. Local configuration is available. ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }, [syncServerState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const lifecycle = serverProcess?.status;
    if (lifecycle !== "starting" && lifecycle !== "stopping") {
      return;
    }

    const timer = window.setInterval(() => {
      void syncServerState(
        undefined,
        lifecycle === "starting" ? "Server started" : "Server status refreshed"
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [serverProcess?.status, syncServerState]);

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

  async function handleStartServer() {
    setBusyAction("server:start");

    try {
      const result = await startServerProcess();
      setServerProcess(result);
      if (result.status === "running" || result.status === "external-running" || result.reachable) {
        await syncServerState(result, "Server started");
      } else {
        setConnection("disconnected");
        setStatus(null);
        setAliases(null);
        await loadConfiguration().catch(() => undefined);
        setMessage(
          result.status === "failed"
            ? `Failed to start server: ${result.lastError ?? result.message ?? "Unknown error"}`
            : result.message ?? "Server is starting."
        );
      }
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
      await loadConfiguration().catch(() => undefined);
      setMessage(result.message ?? (result.status === "stopped" ? "Server stopped" : "Server is stopping."));
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
      if (result.status === "running" || result.status === "external-running" || result.reachable) {
        await syncServerState(result, "Server restarted");
      } else {
        setConnection("disconnected");
        setStatus(null);
        setAliases(null);
        await loadConfiguration().catch(() => undefined);
        setMessage(
          result.status === "failed"
            ? `Failed to restart server: ${result.lastError ?? result.message ?? "Unknown error"}`
            : result.message ?? "Server is restarting."
        );
      }
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

    const explicitAuth = provider.auth;
    if (explicitAuth?.type === "env") {
      return explicitAuth.env;
    }
    if (explicitAuth?.type === "ccswitch") {
      return explicitAuth.fallback_env ?? "";
    }
    if (explicitAuth?.type === "static-header-ref") {
      return explicitAuth.value_env ?? "";
    }

    const match = provider.api_key?.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
    return match ? match[1] : "";
  }

  function providerAuthSummary(name: string, provider: ProviderConfig) {
    if (provider.type !== "openai-compatible") {
      return "-";
    }

    const warning = configWarningByProvider.get(name);
    if (warning?.type === "missing_env") {
      return `Missing ${warning.envName ?? warning.env ?? "API_KEY"}`;
    }
    if (warning?.type === "missing_credential") {
      return "CC Switch auth missing";
    }

    if (provider.auth?.type === "ccswitch") {
      return provider.auth.credential_ref || provider.auth.credential_path
        ? "CC Switch auth imported"
        : "CC Switch auth";
    }
    if (provider.auth?.type === "env") {
      return `${provider.auth.env}${provider.api_key_resolved ? " OK" : ""}`.trim();
    }
    if (provider.auth?.type === "static-header-ref") {
      return provider.api_key_resolved ? "Header ref OK" : "Header ref";
    }

    return `${provider.api_key ?? "-"} ${provider.api_key_resolved ? "OK" : ""}`.trim();
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
        auth: {
          type: "env",
          header: "Authorization",
          scheme: "Bearer",
          env: providerForm.envName.trim()
        },
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
      const { mode, result } = await validateConfigForCurrentMode(editableConfig);
      const warnings = result.warnings.length > 0 ? ` Warnings: ${result.warnings.join(" ")}` : "";
      setConfigMessage(result.ok ? `Configuration is valid (${mode}).${warnings}` : `Validation failed: ${(result.errors ?? []).join(" ")}`);
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
      const { mode, result } = await saveConfigForCurrentMode(editableConfig);
      if (!result.ok) {
        throw new Error((result.errors ?? ["Save failed"]).join(" "));
      }
      const warnings = result.warnings.length > 0 ? ` Warnings: ${result.warnings.join(" ")}` : "";
      setConfigMessage(mode === "online" ? `Configuration saved and reloaded.${warnings}` : `Configuration saved offline.${warnings}`);
      await loadConfiguration().catch(() => undefined);
      if (mode === "online") {
        await refresh();
      }
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

    const normalized = selected.map((draft) => {
      const openaiOfficial = draftLooksLikeOpenAIOfficial(draft);
      const providerName = normalizeConfigKey(draft.providerName || draft.provider_name || draft.name);
      const aliasName = normalizeConfigKey(draft.aliasName || draft.name, providerName);
      const baseUrl = normalizeImportBaseUrl(draft.baseUrl) || (openaiOfficial ? OPENAI_OFFICIAL_BASE_URL : "");
      const envName = normalizeEnvName(draft.envName || draft.suggested_env_name, openaiOfficial ? "openai" : draft.name || providerName);
      const modelValue = draft.modelValue.trim();

      return {
        draft,
        providerName,
        aliasName,
        baseUrl,
        envName,
        modelValue
      };
    });
    const localErrors = normalized.flatMap((item) => {
      const errors: string[] = [];
      const label = item.draft.name || item.aliasName || item.providerName;

      if (!configKeyPattern.test(item.providerName)) {
        errors.push(`Provider "${label}" generated invalid provider key "${item.providerName}".`);
      }
      if (!configKeyPattern.test(item.aliasName)) {
        errors.push(`Provider "${label}" generated invalid alias key "${item.aliasName}".`);
      }
      if (!item.modelValue) {
        errors.push(`Provider "${label}" is missing model.`);
      }
      if (!item.baseUrl) {
        errors.push(`Provider "${label}" is missing base_url. Edit the item before importing.`);
      } else if (!isValidHttpUrl(item.baseUrl)) {
        errors.push(`Provider "${label}" has invalid base_url "${item.baseUrl}".`);
      }
      if (!envNamePattern.test(item.envName)) {
        errors.push(`Provider "${label}" generated invalid API key env "${item.envName}".`);
      }

      return errors;
    });

    if (localErrors.length > 0) {
      setCcSwitchMessage(`Import failed: ${localErrors[0]}${localErrors.length > 1 ? ` (${localErrors.length - 1} more)` : ""}`);
      return;
    }

    setBusyAction("ccswitch:import");
    try {
      const providers = { ...editableConfig.providers };
      const aliases = { ...editableConfig.aliases };
      const providerNames = new Set(Object.keys(providers));
      const aliasNames = new Set(Object.keys(aliases));

      for (const item of normalized) {
        let providerName = item.providerName;
        let aliasName = item.aliasName;

        if (generateImportNames) {
          providerName = makeNumberedName(providerName, providerNames);
          providerNames.add(providerName);
          aliasName = makeNumberedName(aliasName, aliasNames);
          aliasNames.add(aliasName);
        } else {
          if (providerNames.has(providerName)) {
            throw new Error(`Provider "${providerName}" already exists. Enable generated names or rename the source.`);
          }
          if (aliasNames.has(aliasName)) {
            throw new Error(`Alias "${aliasName}" already exists. Enable generated names or rename the source.`);
          }
          providerNames.add(providerName);
          aliasNames.add(aliasName);
        }

        const description = item.draft.description?.trim();

        providers[providerName] = {
          type: "openai-compatible",
          base_url: item.baseUrl,
          api_key: `\${${item.envName}}`,
          auth: buildProviderAuthFromDraft(item.draft, providerName, item.envName),
          ...(description ? { description } : {})
        };
        aliases[aliasName] = {
          provider: providerName,
          model: item.modelValue,
          ...(description ? { description } : {})
        };
      }

      const nextConfig = {
        ...editableConfig,
        providers,
        aliases
      };

      const { result: validation } = await validateConfigForCurrentMode(nextConfig);
      if (!validation.ok) {
        throw new Error((validation.errors ?? ["Validation failed"]).join(" "));
      }

      const { mode, result: saveResult } = await saveConfigForCurrentMode(nextConfig);
      if (!saveResult.ok) {
        throw new Error((saveResult.errors ?? ["Save failed"]).join(" "));
      }
      setEditableConfig(nextConfig);
      await loadConfiguration().catch(() => undefined);

      if (mode === "online") {
        await reloadConfig().catch(() => undefined);
        setCcSwitchMessage(t("ccswitch.simple.importedReloaded"));
        await refresh();
      } else {
        setCcSwitchMessage(t("ccswitch.simple.importedOffline"));
      }
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
          <span>{t("advanced.diagnosticsResult")}</span>
          <button className="secondary" onClick={() => void handleCopyDiagnostic()}>{t("common.copy")}</button>
        </div>
        <dl className="diagnostic-summary">
          <div>
            <dt>{t("advanced.target")}</dt>
            <dd>{diagnosticResult.target}{diagnosticResult.alias ? ` ${diagnosticResult.alias}` : diagnosticResult.provider ? ` ${diagnosticResult.provider}` : ""}</dd>
          </div>
          <div>
            <dt>{t("common.status")}</dt>
            <dd><span className={diagnosticResult.ok ? "pill" : "pill bad"}>{diagnosticResult.ok ? t("advanced.passed") : t("common.failed")}</span></dd>
          </div>
          <div>
            <dt>{t("common.provider")}</dt>
            <dd>{diagnosticResult.provider ?? "-"}</dd>
          </div>
          <div>
            <dt>{t("common.model")}</dt>
            <dd>{diagnosticResult.model ?? "-"}</dd>
          </div>
          <div>
            <dt>{t("logs.stream")}</dt>
            <dd>{diagnosticResult.stream ? "true" : "false"}</dd>
          </div>
          <div>
            <dt>{t("common.duration")}</dt>
            <dd>{diagnosticResult.duration_ms}ms</dd>
          </div>
          <div>
            <dt>{t("advanced.httpStatus")}</dt>
            <dd>{diagnosticResult.status_code ?? "-"}</dd>
          </div>
        </dl>
        <div className="diagnostic-checks">
          {diagnosticResult.checks.map((check) => (
            <div className={check.ok ? "diagnostic-check" : "diagnostic-check failed"} key={check.name}>
              <span>{check.ok ? t("common.ok") : t("common.fail")}</span>
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
      <section className="ccswitch-integration">
        <section className="integration-card-grid">
          <section className="card config-card integration-action-card">
            <div className="card-heading">
              <span>{t("settings.importFromCcSwitch")}</span>
              <strong>{t("config.import")}</strong>
            </div>
            <p className="muted">{t("ccswitchImport.shortDescription")}</p>
            <div className="server-actions">
              <button type="button" onClick={openCcSwitchImportModal} disabled={busyAction !== null}>
                {t("settings.importFromCcSwitch")}
              </button>
            </div>
          </section>

          <section className="card config-card integration-action-card">
            <div className="card-heading">
              <span>{t("settings.importToCodex")}</span>
              <strong>Codex</strong>
            </div>
            <p className="muted">{t("codexImport.description")}</p>
            <div className="server-actions">
              <button type="button" onClick={openCodexImportPanel} disabled={busyAction !== null}>
                {t("settings.importToCodex")}
              </button>
            </div>
          </section>
        </section>

        {showCodexImportPanel && (
          <section className="card config-card codex-import-panel" id="codex-import-panel">
            <div className="card-heading">
              <span>{t("settings.importToCodex")}</span>
              <button className="secondary" type="button" onClick={() => setShowCodexImportPanel(false)}>
                {t("common.close")}
              </button>
            </div>
            <pre>{codexConfig}</pre>
            <div className="server-actions">
              <button type="button" onClick={() => void handleOpenCodexInCcSwitch()} disabled={busyAction !== null}>
                {busyAction === "codex-import:open" ? t("config.opening") : t("codexImport.openInCcSwitch")}
              </button>
              <button className="secondary" type="button" onClick={() => void handleCopyCodexImportConfig()} disabled={busyAction !== null}>
                {t("codexImport.copyCodexConfig")}
              </button>
              <button className="secondary" type="button" onClick={() => void handleCopyCodexDeepLink()} disabled={busyAction !== null}>
                {t("codexImport.copyDeepLink")}
              </button>
              <span className={codexImportMessage.startsWith("Failed") ? "action-message bad" : "action-message"}>
                {codexImportMessage}
              </span>
            </div>
            <pre className="deep-link-preview">{deepLink}</pre>
          </section>
        )}
      </section>
    );
  }

  function formatLogTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString();
  }

  const entrypoints = status
    ? Object.entries(status.entrypoints)
    : Object.entries(editableConfig?.entrypoints ?? {}).map(([name, entrypoint]) => [
      name,
      {
        use: entrypoint.use,
        resolved: entrypoint.use === "active" ? editableConfig?.active ?? "" : entrypoint.use
      }
    ] as const);
  const aliasesList = displayAliases;
  const disconnected = connection === "disconnected";
  const serverLifecycle = serverProcess?.status ?? (connection === "connected" ? "external-running" : "stopped");
  const isServerStarting = serverLifecycle === "starting";
  const quickStartBusyAction = isServerStarting ? "server:start" : busyAction;
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
  const codexDeepLink = buildCcSwitchDeepLink("codex");

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>{t("app.title")}</h1>
          <p>{t("app.subtitle")}</p>
        </div>
        <nav className="tabs primary-tabs" aria-label="Primary">
          {primaryRoutes.map((route) => (
            <button
              className={activeTab === route.id ? "tab active" : "tab"}
              key={route.id}
              onClick={route.id === "logs" ? openLogsPage : () => setActiveTab(route.id)}
            >
              {t(route.i18nKey)}
            </button>
          ))}
        </nav>
        <div className="topbar-tools">
          <LanguageSelector />
          <button
            aria-label={t("settings.title")}
            className={activeTab === "settings" ? "settings-button active" : "settings-button"}
            onClick={() => openSettings()}
            title={t("settings.title")}
            type="button"
          >
            <SettingsIcon className="settings-button-icon" />
          </button>
          <div className="connection">
            <span className={`status-dot ${connection}`} />
            <strong>{connection === "connected" ? t("app.connected") : connection === "checking" ? t("app.checking") : t("app.disconnected")}</strong>
            <span>{serverUrl}</span>
          </div>
        </div>
      </header>

      {activeTab === "switcher" ? (
        <section className="switcher-page">
          {disconnected && (
            <section className="notice error disconnected-guide">
              <div>
                <strong>{t("home.serverNotRunning")}</strong>
                <span>{t("home.serverGuidance")}</span>
              </div>
            </section>
          )}
          <QuickStart
            busyAction={quickStartBusyAction}
            hasAccounts={aliasesList.length > 0}
            serverRunning={serverLifecycle === "running" || serverLifecycle === "external-running"}
            onOpenSettings={() => openSettings()}
            onStartServer={() => void handleStartServer()}
            onSwitchAccount={() => scrollToElement("account-switcher")}
          />
          <section id="account-switcher">
            <AccountSwitcher
              accounts={aliasesList}
              activeAlias={activeAlias}
              activeAliasName={displayActiveAliasName}
              connection={connection}
              configWarnings={displayConfigWarnings}
              endpoint={serverUrl}
              message={message}
              switchingAlias={busyAction?.startsWith("switch:") ? busyAction.slice("switch:".length) : null}
              onAlreadyActive={() => setMessage(t("switcher.alreadyActive"))}
              onGoToIntegrations={() => openSettings("integrations")}
              onSelectAccount={(alias) => void handleSwitch(alias)}
            />
          </section>
          <UsageOverview activeModel={activeAlias?.model} disconnected={disconnected} />
        </section>
      ) : activeTab === "advanced" ? (
        <>

      {disconnected && (
        <section className="notice error">
          <strong>{t("advanced.serverNotRunning")}</strong>
          <span>{t("advanced.startWithDev")}</span>
        </section>
      )}

      <section className="actions">
        <button onClick={() => void refresh()} disabled={busyAction !== null}>
          {busyAction === "refresh" ? t("common.refreshing") : t("common.refresh")}
        </button>
        <button onClick={() => void handleReload()} disabled={busyAction !== null || disconnected}>
          {busyAction === "reload" ? t("config.reloading") : t("config.reload")}
        </button>
        <span className={message.startsWith("Failed") || disconnected ? "action-message bad" : "action-message"}>
          {message}
        </span>
      </section>

      <ServerControl
        busyAction={busyAction}
        serverProcess={serverProcess}
        serverUrl={serverUrl}
        onRefresh={() => void refresh()}
        onRestart={() => void handleRestartServer()}
        onStart={() => void handleStartServer()}
        onStop={() => void handleStopServer()}
      />

      <section className="grid">
        <article className="card active-card">
          <div className="card-heading">
            <span>{t("advanced.activeAlias")}</span>
            {status && <strong>{status.active}</strong>}
          </div>
          {status && activeAlias ? (
            <>
              <dl>
                <div>
                  <dt>{t("common.provider")}</dt>
                  <dd>{activeAlias.provider}</dd>
                </div>
                <div>
                  <dt>{t("config.upstreamModel")}</dt>
                  <dd>{activeAlias.model}</dd>
                </div>
              </dl>
              <div className="diagnostic-actions">
                <button onClick={() => void runDiagnostic("diagnostic:active", () => testActive(false))} disabled={busyAction !== null || disconnected}>
                  {busyAction === "diagnostic:active" ? t("common.testing") : t("advanced.testActive")}
                </button>
                <button className="secondary" onClick={() => void runDiagnostic("diagnostic:active-stream", () => testActive(true))} disabled={busyAction !== null || disconnected}>
                  {busyAction === "diagnostic:active-stream" ? t("common.testing") : t("advanced.testActiveStream")}
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
            <span>{t("config.entrypoints")}</span>
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

      <section className="card codex-card">
        <div className="card-heading">
          <span>{t("advanced.codexConfiguration")}</span>
          <button className="secondary" onClick={() => void handleCopy()}>
            {copyOk ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <pre>{codexConfig}</pre>
      </section>
        </>
      ) : activeTab === "settings" ? (
        <section className="config-page">
          <PageHeader
            title={t("settings.title")}
            subtitle={t("settings.subtitle")}
            actions={(
              <span className={configMessage.startsWith("Save failed") || configMessage.startsWith("Validation failed") ? "action-message bad" : "action-message"}>
                {configMessage}
              </span>
            )}
          />

          <section className="card config-card">
            <div className="card-heading">
              <span>{t("config.title")}</span>
              <strong>{configPath || t("config.notLoaded")}</strong>
            </div>
            <div className="config-summary">
              <label>
                {t("config.activeAlias")}
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
              <span className="muted">{configPath || t("config.notLoaded")}</span>
            </div>
          </section>

          <SettingsPanel
            activeSection={configSection}
            busyAction={busyAction}
            configPath={configPath}
            disconnected={disconnected}
            onOpenCcSwitchImport={openCcSwitchImportModal}
            onOpenCodexImport={openCodexImportPanel}
            onOpenLogs={openLogsPage}
            onReload={() => void handleReload()}
            onSelectSection={setConfigSection}
          />

          {renderDiagnosticResult()}

          {configSection === "providers" && (
          <>
          <section className="card config-card preset-card" id="configuration-providers">
            <div className="card-heading">
              <span>{t("config.providerPresets")}</span>
              <button className="secondary" onClick={() => void handleTogglePresetPanel()} disabled={busyAction !== null}>
                {showPresetPanel ? t("config.hidePresets") : t("config.addFromPreset")}
              </button>
            </div>
            <p className="muted">
              Built-in OpenAI-compatible templates save provider endpoints and <code>{"${ENV_NAME}"}</code> references only. Set the environment variable before using the provider.
            </p>
            {showPresetPanel && (
              <>
                <div className="preset-toolbar">
                  <input
                    placeholder={t("config.searchPresets")}
                    value={presetSearch}
                    onChange={(event) => setPresetSearch(event.target.value)}
                  />
                  <button className="secondary" onClick={() => void loadProviderPresets().catch((error) => setPresetMessage(`Failed to load presets: ${getErrorMessage(error)}`))} disabled={busyAction !== null}>
                    {busyAction === "preset:load" ? t("common.loading") : t("config.refreshPresets")}
                  </button>
                  <span className={presetMessage.startsWith("Failed") || presetMessage.startsWith("Add preset failed") ? "action-message bad" : "action-message"}>
                    {presetMessage}
                  </span>
                </div>
                <div className="preset-table">
                  <div className="preset-row preset-head">
                    <span>{t("common.provider")}</span>
                    <span>{t("config.baseUrl")}</span>
                    <span>{t("config.defaultModel")}</span>
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
                        {t("config.providerName")}
                        <input value={presetDraft.providerName} onChange={(event) => updatePresetDraft({ providerName: event.target.value })} />
                      </label>
                      <label>
                        {t("config.aliasName")}
                        <input value={presetDraft.aliasName} onChange={(event) => updatePresetDraft({ aliasName: event.target.value })} />
                      </label>
                      <label>
                        {t("config.baseUrl")}
                        <input value={presetDraft.baseUrl} onChange={(event) => updatePresetDraft({ baseUrl: event.target.value })} />
                      </label>
                      <label>
                        {t("config.envName")}
                        <input value={presetDraft.envName} onChange={(event) => updatePresetDraft({ envName: event.target.value })} />
                      </label>
                      <label>
                        {t("config.upstreamModel")}
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
                        {t("config.setActive")}
                      </label>
                      <button onClick={() => void handleAddPresetProvider()} disabled={!editableConfig || busyAction !== null}>
                        {presetBusy ? t("common.adding") : t("config.addProvider")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card config-card">
            <div className="card-heading">
              <span>{t("config.providers")}</span>
              <strong>{providerEntries.length}</strong>
            </div>
            <div className="config-table providers-table">
              <div className="config-row config-head">
                <span>{t("common.name")}</span>
                <span>{t("common.type")}</span>
                <span>{t("config.baseUrl")}</span>
                <span>{t("config.responses")}</span>
                <span>{t("config.apiKey")}</span>
                <span>{t("common.actions")}</span>
              </div>
              {providerEntries.map(([name, provider]) => (
                <div className="config-row" key={name}>
                  <span>{name}</span>
                  <span>{provider.type}</span>
                  <span>{provider.type === "openai-compatible" ? provider.base_url : "-"}</span>
                  <span>{provider.type === "openai-compatible" && provider.responses_api ? "direct" : "-"}</span>
                  <span>{providerAuthSummary(name, provider)}</span>
                  <span className="row-actions">
                    <button className="secondary" onClick={() => handleTestProvider(name)} disabled={busyAction !== null || disconnected}>
                      {busyAction === `diagnostic:provider:${name}` ? t("common.testing") : t("config.test")}
                    </button>
                    <button className="secondary" onClick={() => editProvider(name, provider)} disabled={configBusy}>{t("common.edit")}</button>
                    <button className="secondary danger" onClick={() => deleteProvider(name)} disabled={configBusy}>{t("common.delete")}</button>
                  </span>
                </div>
              ))}
            </div>
            <div className="config-form">
              <input placeholder={t("common.name")} value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} />
              <select value={providerForm.type} onChange={(event) => setProviderForm({ ...providerForm, type: event.target.value })}>
                <option value="openai-compatible">openai-compatible</option>
                <option value="mock">mock</option>
              </select>
              <input placeholder={t("config.baseUrl")} value={providerForm.baseUrl} onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })} disabled={providerForm.type === "mock"} />
              <input placeholder={t("config.apiKeyEnvName")} value={providerForm.envName} onChange={(event) => setProviderForm({ ...providerForm, envName: event.target.value })} disabled={providerForm.type === "mock"} />
              <label className="inline-checkbox">
                <input type="checkbox" checked={providerForm.responsesApi} onChange={(event) => setProviderForm({ ...providerForm, responsesApi: event.target.checked })} disabled={providerForm.type === "mock"} />
                Responses API
              </label>
              <button onClick={saveProviderDraft} disabled={configBusy}>{providerForm.editingName ? t("config.updateProvider") : t("config.addProvider")}</button>
            </div>
          </section>
          </>
          )}

          {configSection === "integrations" && (
          <>
          {renderCcSwitchIntegration()}
          </>
          )}

          {configSection === "aliases" && (
          <section className="card config-card">
            <div className="card-heading">
              <span>{t("config.aliases")}</span>
              <strong>{aliasEntries.length}</strong>
            </div>
            <div className="config-table aliases-config-table">
              <div className="config-row config-head">
                <span>{t("common.name")}</span>
                <span>{t("common.provider")}</span>
                <span>{t("config.upstreamModel")}</span>
                <span>{t("common.actions")}</span>
              </div>
              {aliasEntries.map(([name, alias]) => (
                <div className={editableConfig?.active === name ? "config-row active" : "config-row"} key={name}>
                  <span>{name}</span>
                  <span>{alias.provider}</span>
                  <span>{alias.model}</span>
                  <span className="row-actions">
                    <button className="secondary" onClick={() => void runDiagnostic(`diagnostic:alias:${name}`, () => testAlias(name, false))} disabled={busyAction !== null || disconnected}>
                      {busyAction === `diagnostic:alias:${name}` ? t("common.testing") : t("config.test")}
                    </button>
                    <button className="secondary" onClick={() => void runDiagnostic(`diagnostic:alias-stream:${name}`, () => testAlias(name, true))} disabled={busyAction !== null || disconnected}>
                      {busyAction === `diagnostic:alias-stream:${name}` ? t("common.testing") : t("config.testStream")}
                    </button>
                    <button className="secondary" onClick={() => editAlias(name, alias)} disabled={configBusy}>{t("common.edit")}</button>
                    <button className="secondary" onClick={() => setActiveAlias(name)} disabled={configBusy}>{t("config.setActive")}</button>
                    <button className="secondary danger" onClick={() => deleteAlias(name)} disabled={configBusy}>{t("common.delete")}</button>
                  </span>
                </div>
              ))}
            </div>
            <div className="config-form alias-form">
              <input placeholder={t("common.name")} value={aliasForm.name} onChange={(event) => setAliasForm({ ...aliasForm, name: event.target.value })} />
              <select value={aliasForm.provider} onChange={(event) => setAliasForm({ ...aliasForm, provider: event.target.value })}>
                <option value="">{t("common.provider")}</option>
                {providerNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <input placeholder={t("config.upstreamModel")} value={aliasForm.model} onChange={(event) => setAliasForm({ ...aliasForm, model: event.target.value })} />
              <button onClick={saveAliasDraft} disabled={configBusy}>{aliasForm.editingName ? t("config.updateAlias") : t("config.addAlias")}</button>
            </div>
          </section>
          )}

          {configSection === "entrypoints" && (
          <section className="card config-card">
            <div className="card-heading">
              <span>{t("config.entrypoints")}</span>
              <strong>{entrypointEntries.length}</strong>
            </div>
            <div className="config-table entrypoints-table">
              <div className="config-row config-head">
                <span>{t("common.name")}</span>
                <span>{t("config.use")}</span>
                <span>{t("common.actions")}</span>
              </div>
              {entrypointEntries.map(([name, entrypoint]) => (
                <div className="config-row" key={name}>
                  <span>{name}</span>
                  <span>{entrypoint.use}</span>
                  <span className="row-actions">
                    <button className="secondary" onClick={() => editEntrypoint(name, entrypoint)} disabled={configBusy}>{t("common.edit")}</button>
                    <button className="secondary danger" onClick={() => deleteEntrypoint(name)} disabled={configBusy}>{t("common.delete")}</button>
                  </span>
                </div>
              ))}
            </div>
            <div className="config-form entrypoint-form">
              <input placeholder={t("common.name")} value={entrypointForm.name} onChange={(event) => setEntrypointForm({ ...entrypointForm, name: event.target.value })} />
              <select value={entrypointForm.use} onChange={(event) => setEntrypointForm({ ...entrypointForm, use: event.target.value })}>
                <option value="active">active</option>
                {aliasNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button onClick={saveEntrypointDraft} disabled={configBusy}>{entrypointForm.editingName ? t("config.updateEntrypoint") : t("config.addEntrypoint")}</button>
            </div>
          </section>
          )}

          {configSection === "pricing" && (
            <section className="card config-card">
              <div className="card-heading">
                <span>{t("config.section.pricing")}</span>
                <strong>{Object.keys(editableConfig?.pricing ?? {}).length}</strong>
              </div>
              <p className="muted">{t("config.pricingPlaceholder")}</p>
            </section>
          )}

          <section className="actions config-actions">
            <button onClick={() => void handleValidateConfig()} disabled={!editableConfig || busyAction !== null}>
              {busyAction === "config:validate" ? t("config.validating") : t("config.validate")}
            </button>
            <button onClick={() => void handleSaveConfig()} disabled={!editableConfig || busyAction !== null}>
              {busyAction === "config:save" ? t("config.saving") : t("config.saveReload")}
            </button>
            <button className="secondary" onClick={() => void handleResetConfig()} disabled={busyAction !== null}>
              {busyAction === "config:reset" ? t("config.resetting") : t("config.reset")}
            </button>
          </section>
        </section>
      ) : (
        <section className="logs-page">
          {disconnected && (
            <section className="notice error">
              <strong>{t("logs.notConnected")}</strong>
              <span>{t("logs.startToView")}</span>
            </section>
          )}

          <section className="grid">
            <article className="card stats-card">
              <div className="card-heading">
                <span>{t("logs.requestStats")}</span>
                <strong>{requestStats?.total ?? 0}</strong>
              </div>
              <dl className="stats-grid">
                <div>
                  <dt>{t("logs.totalRequests")}</dt>
                  <dd>{requestStats?.total ?? 0}</dd>
                </div>
                <div>
                  <dt>{t("common.success")}</dt>
                  <dd>{requestStats?.success ?? 0}</dd>
                </div>
                <div>
                  <dt>{t("common.failed")}</dt>
                  <dd>{requestStats?.failed ?? 0}</dd>
                </div>
                <div>
                  <dt>{t("logs.averageDuration")}</dt>
                  <dd>{requestStats?.avg_duration_ms ?? 0}ms</dd>
                </div>
                <div>
                  <dt>{t("logs.stream")}</dt>
                  <dd>{requestStats?.stream ?? 0}</dd>
                </div>
                <div>
                  <dt>{t("logs.nonStream")}</dt>
                  <dd>{requestStats?.non_stream ?? 0}</dd>
                </div>
              </dl>
            </article>

            <article className="card stats-card">
              <div className="card-heading">
                <span>{t("logs.byProvider")}</span>
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
                  <p className="muted">{t("logs.noProviderStats")}</p>
                )}
              </div>
            </article>
          </section>

          <section className="actions">
            <button onClick={() => void handleRefreshLogs()} disabled={busyAction !== null || disconnected}>
              {busyAction === "logs:refresh" ? t("common.refreshing") : t("common.refresh")}
            </button>
            <button className="secondary danger" onClick={() => void handleClearLogs()} disabled={busyAction !== null || disconnected}>
              {busyAction === "logs:clear" ? t("logs.clearing") : t("logs.clearLogs")}
            </button>
            <span className={logsMessage.startsWith("Failed") ? "action-message bad" : "action-message"}>
              {logsMessage}
            </span>
          </section>

          <section className="card table-card">
            <div className="card-heading">
              <span>{t("logs.recentRequests")}</span>
              <strong>{requestLogs.length}</strong>
            </div>
            <div className="request-log-table">
              <div className="request-log-row request-log-head">
                <span>{t("usage.time")}</span>
                <span>{t("logs.kind")}</span>
                <span>API</span>
                <span>{t("logs.fallback")}</span>
                <span>{t("common.status")}</span>
                <span>{t("logs.stream")}</span>
                <span>{t("logs.requestedModel")}</span>
                <span>{t("common.alias")}</span>
                <span>{t("common.provider")}</span>
                <span>{t("config.upstreamModel")}</span>
                <span>{t("common.duration")}</span>
                <span>{t("common.error")}</span>
              </div>
              {requestLogs.map((entry) => (
                <div className={entry.ok ? "request-log-row ok" : "request-log-row failed"} key={entry.id}>
                  <span>{formatLogTime(entry.started_at)}</span>
                  <span>{entry.kind === "diagnostic" ? t("logs.diagnostic") : t("logs.normal")}</span>
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
      <CcSwitchImportModal
        busyAction={busyAction}
        configLoaded={Boolean(editableConfig)}
        drafts={importDrafts}
        generateNewNames={generateImportNames}
        message={ccSwitchMessage}
        open={showCcSwitchImportGuide}
        report={ccSwitchReport}
        onClose={() => setShowCcSwitchImportGuide(false)}
        onGenerateNewNamesChange={setGenerateImportNames}
        onImport={() => void handleImportCcSwitch()}
        onScanAuto={() => void handleScanAutoCcSwitch()}
        onSelectDatabase={() => void handleSelectCcSwitch()}
        onUpdateDraft={updateImportDraft}
      />
    </main>
  );
}
