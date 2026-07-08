import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Boxes } from "lucide-react";
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
  type RatioBindingItem,
  type RatioCacheEntry,
  type RatioGroup,
  type RatioSource,
  type RatioSourceAuth,
  type RatioSourceType,
  type RatioSourcesResponse,
  type RequestLogEntry,
  type RequestStats,
  type ServerProcessStatus,
  type StatusResponse,
  type UsageRange,
  type UsageSummary,
  clearRequestLogs,
  getAliases,
  getAdminConfig,
  getBaseUrl,
  getCcSwitchLink,
  getHealth,
  getProviderPresets,
  getRatioBindings,
  getRatioSources,
  getRequestLogs,
  getRequestStats,
  getServerProcessStatus,
  getStatus,
  getUsageSummary,
  readModelGateConfig,
  reloadConfig,
  restartServerProcess,
  saveAdminConfig,
  saveRatioBindings,
  scanCcSwitchDatabase,
  selectAndScanCcSwitchDatabase,
  openCcSwitchDeepLink,
  startServerProcess,
  stopServerProcess,
  switchAlias,
  testActive,
  testAlias,
  testProvider,
  createRatioSource,
  deleteRatioSource,
  refreshRatioSource,
  updateRatioSource,
  validateAdminConfig,
  validateModelGateConfigOffline,
  writeModelGateConfig
} from "./api";
import { AccountSwitcher } from "./features/account-switcher/AccountSwitcher";
import type { ConnectionState, ProviderAuthKind } from "./features/account-switcher/accountTypes";
import type { CcSwitchExportDraft } from "./features/ccswitch/CcSwitchExportPanel";
import { CcSwitchImportModal } from "./features/ccswitch-import/CcSwitchImportModal";
import { CcSwitchConfirmModal } from "./features/ccswitch-style/CcSwitchConfirmModal";
import { CcSwitchProviderEditModal, type ProviderEditPatch } from "./features/ccswitch-style/CcSwitchProviderEditModal";
import { CcSwitchSettingsPage, type SettingsPageTabId } from "./features/ccswitch-style/CcSwitchSettingsPage";
import { CcSwitchShell } from "./features/ccswitch-style/CcSwitchShell";
import { ServerControl } from "./features/server-control/ServerControl";
import type { SettingsSectionId } from "./features/settings/settingsRoutes";
import { UsageOverview } from "./features/usage-overview/UsageOverview";
import { useI18n, type Language, type TranslationKey } from "./i18n/i18n";
import type { AppRouteId } from "./routes/routeTypes";
import desktopPackage from "../package.json";

type ActiveTab = AppRouteId;
type HomeSection = "providers" | "usage";
type TopbarUsageRange = Extract<UsageRange, "10m" | "30m" | "1h" | "12h" | "1d">;
type ConfigSection = SettingsSectionId;
type RecordsSection = "logs" | "usage";

type ImportDraft = CcSwitchImportCandidate & {
  selected: boolean;
  duplicate?: CcSwitchImportCandidate["duplicate"];
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
const appVersion = desktopPackage.version;
const OPENAI_OFFICIAL_BASE_URL = "https://api.openai.com/v1";
const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const configKeyPattern = /^[A-Za-z0-9_-]+$/;
const settingsPageTabs = [
  { id: "general", i18nKey: "settings.general" },
  { id: "integrations", i18nKey: "settings.integrations" },
  { id: "modelRouting", i18nKey: "settings.modelRouting" },
  { id: "records", i18nKey: "settings.records" },
  { id: "advanced", i18nKey: "settings.advanced" },
  { id: "about", i18nKey: "settings.about" }
] satisfies Array<{ id: SettingsPageTabId; i18nKey: TranslationKey }>;

const routingSections = ["providers", "aliases", "entrypoints", "pricing", "ratios"] as const;
const ratioSourceTypeOptions = [
  "new-api",
  "one-api",
  "sub2api",
  "new-api-compatible"
] satisfies RatioSourceType[];
const ratioSourceTypeLabels = {
  "new-api": "ratio.type.newApi",
  "one-api": "ratio.type.oneApi",
  sub2api: "ratio.type.sub2api",
  "new-api-compatible": "ratio.type.newApiCompatible"
} satisfies Record<RatioSourceType, TranslationKey>;
const ratioSourceStatusLabels = {
  never: "ratio.status.never",
  fetching: "ratio.status.fetching",
  ok: "ratio.status.ok",
  warning: "ratio.status.warning",
  failed: "ratio.status.failed"
} satisfies Record<RatioSource["status"], TranslationKey>;
const ratioBindingStatusLabels = {
  bound: "ratio.bindingStatus.bound",
  unbound: "ratio.bindingStatus.unbound",
  missing_source: "ratio.bindingStatus.missingSource",
  missing_group: "ratio.bindingStatus.missingGroup",
  missing_model_ratio: "ratio.bindingStatus.missingModelRatio",
  unsupported: "ratio.bindingStatus.unsupported"
} satisfies Record<RatioBindingItem["status"], TranslationKey>;
const topbarUsageRanges = [
  { value: "10m", label: "10m" },
  { value: "30m", label: "30m" },
  { value: "1h", label: "1h" },
  { value: "12h", label: "12h" },
  { value: "1d", label: "1day" }
] satisfies Array<{ value: TopbarUsageRange; label: string }>;

function ModelGateBrand() {
  return (
    <span className="modelgate-brand" aria-label="Model Gate">
      <svg className="modelgate-brand-symbol" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="modelgate-mark-blue" x1="8" x2="32" y1="6" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2563eb" />
            <stop offset="1" stopColor="#0f766e" />
          </linearGradient>
          <linearGradient id="modelgate-mark-ink" x1="10" x2="30" y1="8" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0f172a" />
            <stop offset="1" stopColor="#1e3a8a" />
          </linearGradient>
        </defs>
        <circle className="modelgate-mark-ring" cx="20" cy="20" r="15.5" />
        <g className="modelgate-mark-gates">
          <path d="M20 4.8c4.8 2.6 7.2 6 7.2 10.2L20 20l-7.2-5c0-4.2 2.4-7.6 7.2-10.2Z" />
          <path d="M35.2 20c-2.6 4.8-6 7.2-10.2 7.2L20 20l5-7.2c4.2 0 7.6 2.4 10.2 7.2Z" />
          <path d="M20 35.2c-4.8-2.6-7.2-6-7.2-10.2L20 20l7.2 5c0 4.2-2.4 7.6-7.2 10.2Z" />
          <path d="M4.8 20c2.6-4.8 6-7.2 10.2-7.2L20 20l-5 7.2c-4.2 0-7.6-2.4-10.2-7.2Z" />
        </g>
        <circle className="modelgate-mark-core" cx="20" cy="20" r="4.8" />
      </svg>
    </span>
  );
}

function formatTokenTotal(value: number | undefined) {
  const total = value ?? 0;
  const units = ["", "k", "M", "B", "T", "P"];
  let scaled = total;
  let unitIndex = 0;

  while (Math.abs(scaled) >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  const digits = scaled >= 100 || unitIndex === 0 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")}${units[unitIndex]}`;
}

function isRoutingSection(section: ConfigSection): section is typeof routingSections[number] {
  return routingSections.includes(section as typeof routingSections[number]);
}

function settingsPageTabFromSection(section: ConfigSection): SettingsPageTabId {
  if (section === "integrations") return "integrations";
  if (isRoutingSection(section)) return "modelRouting";
  if (section === "records") return "records";
  if (section === "advanced") return "advanced";
  if (section === "about") return "about";
  return "general";
}

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

function normalizeEndpointForCompare(value: string | undefined) {
  return (value ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

function metadataString(metadata: unknown, key: string) {
  return metadata && typeof metadata === "object" && key in metadata
    ? String((metadata as Record<string, unknown>)[key] ?? "")
    : "";
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
  const hasSnapshotCredential = draft.auth_type === "ccswitch-snapshot"
    && draft.auth_status === "imported"
    && Boolean(draft.snapshot_id && (draft.source_id || draft.credential_id || draft.credential_ref || draft.credential_path));

  if (hasSnapshotCredential) {
    return {
      type: "ccswitch-snapshot" as const,
      source: draft.auth_source ?? "CC Switch snapshot",
      app: draft.app || "codex",
      snapshot_id: draft.snapshot_id as string,
      snapshot_path: draft.snapshot_path,
      provider_id: draft.source_id ?? draft.credential_id ?? providerName,
      credential_id: draft.credential_id ?? draft.source_id,
      credential_ref: draft.credential_ref ?? (draft.source_id ? `ccswitch://providers/${draft.app || "codex"}/${draft.source_id}/auth` : undefined),
      credential_path: draft.credential_path ?? "/auth/OPENAI_API_KEY",
      fallback_env: envName,
      header: "Authorization",
      scheme: "Bearer"
    };
  }

  const hasCcSwitchCredential = draft.auth_type === "ccswitch"
    && draft.auth_status === "imported"
    && Boolean(draft.credential_ref || draft.credential_path || draft.credential_id || draft.source_id);

  if (hasCcSwitchCredential) {
    return {
      type: "ccswitch" as const,
      source: draft.auth_source ?? "CC Switch provider_settings",
      app: draft.app || "codex",
      db_path: draft.db_path,
      provider_id: draft.source_id,
      credential_id: draft.credential_id ?? draft.source_id,
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

function providerEnvNameOf(provider: ProviderConfig) {
  if (provider.type !== "openai-compatible") {
    return "";
  }

  const explicitAuth = provider.auth;
  if (explicitAuth?.type === "env") {
    return explicitAuth.env;
  }
  if (explicitAuth?.type === "ccswitch" || explicitAuth?.type === "ccswitch-snapshot") {
    return explicitAuth.fallback_env ?? "";
  }
  if (explicitAuth?.type === "static-header-ref") {
    return explicitAuth.value_env ?? "";
  }

  const match = provider.api_key?.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  return match ? match[1] : "";
}

function providerAuthKindOf(provider: ProviderConfig): ProviderAuthKind {
  if (provider.type !== "openai-compatible") {
    return "none";
  }

  return provider.auth?.type ?? "env";
}

function providerAuthSourceOf(provider: ProviderConfig) {
  if (provider.type !== "openai-compatible" || !provider.auth) {
    return undefined;
  }

  if (provider.auth.type === "ccswitch" || provider.auth.type === "ccswitch-snapshot") {
    return provider.auth.source;
  }
  if (provider.auth.type === "static-header-ref") {
    return "static-header-ref";
  }

  return undefined;
}

function metadataDisplayName(metadata: unknown) {
  const value = metadataString(metadata, "display_name") || metadataString(metadata, "displayName");
  return value.trim() ? value.trim() : undefined;
}

function findRatioModel(group: RatioGroup | undefined, model: string) {
  if (!group) {
    return undefined;
  }
  const exact = group.models.find((item) => item.model === model);
  if (exact) {
    return exact.ratio;
  }
  const lower = model.toLowerCase();
  return group.models.find((item) => item.model.toLowerCase() === lower)?.ratio;
}

function buildOfflineRatioBindings(config: EditableConfig | null, ratioData: RatioSourcesResponse | null): RatioBindingItem[] {
  if (!config) {
    return [];
  }

  const sources = new Map((ratioData?.sources ?? []).map((source) => [source.id, source]));
  const cache = ratioData?.cache ?? {};

  return Object.entries(config.aliases).map(([aliasName, alias]) => {
    const binding = alias.ratio_binding;
    if (!binding) {
      return {
        alias: aliasName,
        provider: alias.provider,
        model: alias.model,
        status: "unbound"
      };
    }

    const source = sources.get(binding.source_id);
    if (!source) {
      return {
        alias: aliasName,
        provider: alias.provider,
        model: alias.model,
        binding: { sourceId: binding.source_id, groupId: binding.group_id },
        status: "missing_source"
      };
    }

    const group = cache[source.id]?.groups.find((candidate) => candidate.groupId === binding.group_id);
    if (!group) {
      return {
        alias: aliasName,
        provider: alias.provider,
        model: alias.model,
        binding: { sourceId: binding.source_id, groupId: binding.group_id },
        sourceName: source.name,
        status: "missing_group"
      };
    }

    if (group.unsupportedReason === "no_model_ratio") {
      return {
        alias: aliasName,
        provider: alias.provider,
        model: alias.model,
        binding: { sourceId: binding.source_id, groupId: binding.group_id },
        sourceName: source.name,
        groupName: group.name,
        status: "unsupported"
      };
    }

    const currentRatio = findRatioModel(group, alias.model);
    return {
      alias: aliasName,
      provider: alias.provider,
      model: alias.model,
      binding: { sourceId: binding.source_id, groupId: binding.group_id },
      currentRatio,
      sourceName: source.name,
      groupName: group.name,
      status: currentRatio === undefined ? "missing_model_ratio" : "bound"
    };
  });
}

export function App() {
  const { language, setLanguage, t } = useI18n();
  const [activeTab, setActiveTab] = useState<ActiveTab>("switcher");
  const [homeSection, setHomeSection] = useState<HomeSection>("providers");
  const [topbarUsageRange, setTopbarUsageRange] = useState<TopbarUsageRange>("10m");
  const [topbarUsageSummary, setTopbarUsageSummary] = useState<UsageSummary | null>(null);
  const [configSection, setConfigSection] = useState<ConfigSection>("common");
  const [recordsSection, setRecordsSection] = useState<RecordsSection>("logs");
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
  const [generateImportNames, setGenerateImportNames] = useState(false);
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
    responsesApi: false,
    description: ""
  });
  const [aliasForm, setAliasForm] = useState({
    editingName: "",
    name: "",
    provider: "",
    model: "",
    description: ""
  });
  const [entrypointForm, setEntrypointForm] = useState({
    editingName: "",
    name: "",
    use: "active"
  });
  const [ratioSources, setRatioSources] = useState<RatioSourcesResponse | null>(null);
  const [ratioBindings, setRatioBindings] = useState<RatioBindingItem[]>([]);
  const [ratioMessage, setRatioMessage] = useState(t("ratio.notLoaded"));
  const [showRatioSourceForm, setShowRatioSourceForm] = useState(false);
  const [ratioSourceForm, setRatioSourceForm] = useState<{
    editingId: string;
    name: string;
    baseUrl: string;
    type: RatioSourceType;
    refreshIntervalMinutes: number;
    authType: RatioSourceAuth["type"];
    tokenEnv: string;
    header: string;
    scheme: string;
    enabled: boolean;
  }>({
    editingId: "",
    name: "",
    baseUrl: "",
    type: "new-api",
    refreshIntervalMinutes: 180,
    authType: "none",
    tokenEnv: "",
    header: "Authorization",
    scheme: "Bearer",
    enabled: true
  });
  const [message, setMessage] = useState(t("advanced.statusRefreshed"));
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);
  const [editAliasName, setEditAliasName] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editMessageBad, setEditMessageBad] = useState(false);
  const [deleteAliasName, setDeleteAliasName] = useState<string | null>(null);

  const localAliases = useMemo(() => {
    if (!editableConfig) {
      return [];
    }

    return Object.entries(editableConfig.aliases).map(([name, alias]) => {
      const provider = editableConfig.providers[alias.provider];

      return {
        name,
        provider: alias.provider,
        model: alias.model,
        description: alias.description,
        providerDescription: provider?.description,
        baseUrl: provider?.type === "openai-compatible"
          ? provider.base_url
          : provider?.type === "mock"
            ? "Managed by ModelGate"
            : undefined,
        providerType: provider?.type
      };
    });
  }, [editableConfig]);

  const displayAliases = useMemo(() => {
    const sourceAliases = aliases?.aliases ?? localAliases;

    return sourceAliases.map((alias) => {
      const localAlias = editableConfig?.aliases[alias.name];
      const providerName = localAlias?.provider ?? alias.provider;
      const provider = editableConfig?.providers[providerName];

      return {
        ...alias,
        provider: providerName,
        model: localAlias?.model ?? alias.model,
        description: localAlias?.description ?? alias.description,
        displayName: metadataDisplayName(localAlias?.metadata),
        providerDescription: provider?.description,
        baseUrl: provider?.type === "openai-compatible"
          ? provider.base_url
          : provider?.type === "mock"
            ? "Managed by ModelGate"
            : undefined,
        providerType: provider?.type,
        envName: provider ? providerEnvNameOf(provider) : undefined,
        authKind: provider ? providerAuthKindOf(provider) : undefined,
        authSource: provider ? providerAuthSourceOf(provider) : undefined
      };
    });
  }, [aliases, editableConfig, localAliases]);
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

  function findImportedDuplicate(draft: ImportDraft, config: EditableConfig | null): ImportDraft["duplicate"] {
    if (!config) {
      return undefined;
    }

    const sourceHash = draft.source_config_hash ?? "";
    const sourceFingerprint = draft.source_fingerprint ?? "";
    const sourceProviderId = draft.source_id ?? "";
    const credentialRef = draft.credential_ref ?? draft.credential_id ?? draft.credential_path ?? "";
    const baseUrl = normalizeEndpointForCompare(draft.baseUrl);
    const model = draft.modelValue.trim();

    for (const [aliasName, alias] of Object.entries(config.aliases)) {
      const provider = config.providers[alias.provider];
      if (!provider || provider.type !== "openai-compatible") {
        continue;
      }

      const providerMetadata = provider.metadata;
      const aliasMetadata = alias.metadata;
      const existingHash = metadataString(providerMetadata, "source_config_hash") || metadataString(aliasMetadata, "source_config_hash");
      const existingFingerprint = metadataString(providerMetadata, "source_fingerprint") || metadataString(aliasMetadata, "source_fingerprint");
      const existingProviderId = metadataString(providerMetadata, "source_provider_id") || metadataString(aliasMetadata, "source_provider_id");
      const existingCredential = provider.auth?.type === "ccswitch"
        ? provider.auth.credential_ref ?? provider.auth.credential_id ?? provider.auth.credential_path ?? ""
        : provider.auth?.type === "ccswitch-snapshot"
          ? provider.auth.credential_ref ?? provider.auth.credential_id ?? provider.auth.credential_path ?? provider.auth.provider_id ?? provider.auth.snapshot_id ?? ""
          : "";

      if (sourceHash && existingHash === sourceHash) {
        return { existing_alias: aliasName, existing_provider: alias.provider, reason: "source_config_hash", match: "source_config_hash" };
      }
      if (sourceFingerprint && existingFingerprint === sourceFingerprint) {
        return { existing_alias: aliasName, existing_provider: alias.provider, reason: "source_fingerprint", match: "source_fingerprint" };
      }
      if (sourceProviderId && existingProviderId === sourceProviderId) {
        return { existing_alias: aliasName, existing_provider: alias.provider, reason: "source_provider_id", match: "source_provider_id" };
      }
      if (
        baseUrl
        && normalizeEndpointForCompare(provider.base_url) === baseUrl
        && alias.model === model
        && credentialRef
        && existingCredential === credentialRef
      ) {
        return { existing_alias: aliasName, existing_provider: alias.provider, reason: "base_url + model + credential reference", match: "base_model_auth" };
      }
    }

    return undefined;
  }

  function markImportDuplicates(drafts: ImportDraft[], config = editableConfig) {
    return drafts.map((draft) => {
      const duplicate = findImportedDuplicate(draft, config);
      return {
        ...draft,
        duplicate,
        selected: duplicate ? false : draft.selected
      };
    });
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
    setImportDrafts((drafts) => drafts.map((draft) => {
      if (draft.id !== id) {
        return draft;
      }

      const nextDraft = { ...draft, ...patch };
      const duplicate = findImportedDuplicate(nextDraft, editableConfig);
      return {
        ...nextDraft,
        duplicate,
        selected: duplicate && !generateImportNames ? false : nextDraft.selected
      };
    }));
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

  async function persistConfigChange(config: EditableConfig, successMessage: string) {
    const { mode, result } = await saveConfigForCurrentMode(config);
    if (!result.ok) {
      throw new Error((result.errors ?? ["Save failed"]).join(" "));
    }

    setEditableConfig(config);
    await loadConfiguration().catch(() => undefined);
    if (mode === "online") {
      await reloadConfig().catch(() => undefined);
      await refresh();
    }
    setMessage(successMessage);
    setConfigMessage(successMessage);
  }

  async function loadProviderPresets() {
    const result = await getProviderPresets();
    setProviderPresets(result.presets);
    setPresetMessage(`Loaded ${result.presets.length} provider preset(s)`);
    return result.presets;
  }

  async function loadRatioMonitor() {
    const sourcesResult = await getRatioSources();
    setRatioSources(sourcesResult);

    if (connection === "connected") {
      try {
        const bindingsResult = await getRatioBindings();
        setRatioBindings(bindingsResult.bindings);
      } catch {
        setRatioBindings(buildOfflineRatioBindings(editableConfig, sourcesResult));
      }
    } else {
      setRatioBindings(buildOfflineRatioBindings(editableConfig, sourcesResult));
    }

    setRatioMessage(sourcesResult.offline ? t("ratio.loadedOffline") : t("ratio.loaded"));
    return sourcesResult;
  }

  function resetRatioSourceForm() {
    setRatioSourceForm({
      editingId: "",
      name: "",
      baseUrl: "",
      type: "new-api",
      refreshIntervalMinutes: 180,
      authType: "none",
      tokenEnv: "",
      header: "Authorization",
      scheme: "Bearer",
      enabled: true
    });
  }

  function editRatioSource(source: RatioSource) {
    setRatioSourceForm({
      editingId: source.id,
      name: source.name,
      baseUrl: source.baseUrl,
      type: source.type,
      refreshIntervalMinutes: source.refreshIntervalMinutes,
      authType: source.auth?.type ?? "none",
      tokenEnv: source.auth && source.auth.type !== "none" ? source.auth.token_env : "",
      header: source.auth?.type === "api-token" ? source.auth.header ?? "Authorization" : "Authorization",
      scheme: source.auth?.type === "api-token" ? source.auth.scheme ?? "" : "Bearer",
      enabled: source.enabled
    });
    setShowRatioSourceForm(true);
  }

  function ratioFormAuth(): RatioSourceAuth {
    if (ratioSourceForm.authType === "bearer") {
      return { type: "bearer", token_env: ratioSourceForm.tokenEnv.trim() };
    }
    if (ratioSourceForm.authType === "api-token") {
      return {
        type: "api-token",
        token_env: ratioSourceForm.tokenEnv.trim(),
        header: ratioSourceForm.header.trim() || "Authorization",
        scheme: ratioSourceForm.scheme.trim()
      };
    }
    return { type: "none" };
  }

  async function saveRatioSourceDraft() {
    if (connection !== "connected") {
      setRatioMessage(t("ratio.serverRequired"));
      return;
    }

    setBusyAction("ratio:save");
    try {
      const payload = {
        name: ratioSourceForm.name,
        baseUrl: ratioSourceForm.baseUrl,
        type: ratioSourceForm.type,
        enabled: ratioSourceForm.enabled,
        refreshIntervalMinutes: ratioSourceForm.refreshIntervalMinutes,
        auth: ratioFormAuth()
      };

      if (ratioSourceForm.editingId) {
        await updateRatioSource(ratioSourceForm.editingId, payload);
      } else {
        await createRatioSource(payload);
      }

      resetRatioSourceForm();
      setShowRatioSourceForm(false);
      await loadRatioMonitor();
      setRatioMessage(t("ratio.sourceSaved"));
    } catch (error) {
      setRatioMessage(t("ratio.sourceSaveFailed", { message: getErrorMessage(error) }));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRefreshRatioSource(id: string) {
    setBusyAction(`ratio:refresh:${id}`);
    try {
      await refreshRatioSource(id);
      await loadRatioMonitor();
      setRatioMessage(t("ratio.refreshed"));
    } catch (error) {
      setRatioMessage(t("ratio.refreshFailed", { message: getErrorMessage(error) }));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteRatioSource(id: string) {
    if (connection !== "connected") {
      setRatioMessage(t("ratio.serverRequired"));
      return;
    }

    setBusyAction(`ratio:delete:${id}`);
    try {
      await deleteRatioSource(id);
      await loadRatioMonitor();
      setRatioMessage(t("ratio.sourceDeleted"));
    } catch (error) {
      setRatioMessage(t("ratio.sourceDeleteFailed", { message: getErrorMessage(error) }));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRatioBindingChange(aliasName: string, sourceId: string, groupId: string) {
    if (!editableConfig) {
      setRatioMessage(t("config.notLoaded"));
      return;
    }

    const binding = sourceId && groupId ? { sourceId, groupId } : null;
    setBusyAction(`ratio:binding:${aliasName}`);
    try {
      if (connection === "connected") {
        const result = await saveRatioBindings({ [aliasName]: binding });
        setRatioBindings(result.bindings);
        await loadConfiguration().catch(() => undefined);
      } else {
        const nextAliases = { ...editableConfig.aliases };
        const alias = nextAliases[aliasName];
        if (alias) {
          nextAliases[aliasName] = binding
            ? { ...alias, ratio_binding: { source_id: binding.sourceId, group_id: binding.groupId } }
            : { ...alias, ratio_binding: undefined };
        }
        const nextConfig = { ...editableConfig, aliases: nextAliases };
        await persistConfigChange(nextConfig, t("ratio.bindingSaved"));
        setRatioBindings(buildOfflineRatioBindings(nextConfig, ratioSources));
      }
      setRatioMessage(t("ratio.bindingSaved"));
    } catch (error) {
      setRatioMessage(t("ratio.bindingSaveFailed", { message: getErrorMessage(error) }));
    } finally {
      setBusyAction(null);
    }
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

  function openSettings(section: ConfigSection = "common") {
    setActiveTab("settings");
    setConfigSection(section);
    if (section === "records") {
      setRecordsSection("logs");
    }
    if (section === "ratios") {
      void loadRatioMonitor().catch((error) => setRatioMessage(t("ratio.loadFailed", { message: getErrorMessage(error) })));
    }
    if (!editableConfig) {
      void loadConfiguration().catch((error) => setConfigMessage(`Failed to load configuration: ${getErrorMessage(error)}`));
    }
  }

  function selectSettingsTab(tab: SettingsPageTabId) {
    if (tab === "general") {
      setConfigSection("common");
      return;
    }
    if (tab === "integrations") {
      setConfigSection("integrations");
      return;
    }
    if (tab === "modelRouting") {
      setConfigSection(isRoutingSection(configSection) ? configSection : "providers");
      if (configSection === "ratios") {
        void loadRatioMonitor().catch((error) => setRatioMessage(t("ratio.loadFailed", { message: getErrorMessage(error) })));
      }
      return;
    }
    if (tab === "records") {
      setConfigSection("records");
      return;
    }
    if (tab === "advanced") {
      setConfigSection("advanced");
      return;
    }
    setConfigSection("about");
  }

  function selectLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
  }

  async function handleCopyConfigPath() {
    if (!configPath) {
      setConfigMessage(t("config.notLoaded"));
      return;
    }

    try {
      await navigator.clipboard.writeText(configPath);
      setConfigMessage(t("settings.configPathCopied"));
    } catch {
      setConfigMessage(t("settings.configPathCopyFailed"));
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
    openSettings("records");
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
    setImportDrafts(markImportDuplicates(scan.candidates.map(candidateToDraft)));
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
    if (connection !== "connected") {
      setTopbarUsageSummary(null);
      return;
    }

    let cancelled = false;
    async function loadTopbarUsage() {
      try {
        const summary = await getUsageSummary(topbarUsageRange);
        if (!cancelled) {
          setTopbarUsageSummary(summary);
        }
      } catch {
        if (!cancelled) {
          setTopbarUsageSummary(null);
        }
      }
    }

    void loadTopbarUsage();
    const timer = window.setInterval(() => void loadTopbarUsage(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connection, topbarUsageRange]);

  useEffect(() => {
    if (!showCcSwitchImportGuide || importDrafts.length === 0) {
      return;
    }

    setImportDrafts((drafts) => markImportDuplicates(drafts));
  }, [editableConfig, showCcSwitchImportGuide]);

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
    if (activeTab !== "settings" || configSection !== "records") {
      return;
    }

    void loadLogs().catch((error) => setLogsMessage(`Failed to load logs: ${getErrorMessage(error)}`));
    const timer = window.setInterval(() => {
      void loadLogs().catch((error) => setLogsMessage(`Failed to load logs: ${getErrorMessage(error)}`));
    }, 3000);

    return () => window.clearInterval(timer);
  }, [activeTab, configSection]);

  useEffect(() => {
    if (activeTab !== "settings" || configSection !== "ratios") {
      return;
    }

    void loadRatioMonitor().catch((error) => setRatioMessage(t("ratio.loadFailed", { message: getErrorMessage(error) })));
  }, [activeTab, configSection, editableConfig, connection]);

  async function handleSwitch(aliasName: string) {
    setBusyAction(`switch:${aliasName}`);

    try {
      if (connection === "connected") {
        await switchAlias(aliasName);
        const [nextStatus, nextAliases] = await Promise.all([getStatus(), getAliases()]);
        setStatus(nextStatus);
        setAliases(nextAliases);
        setConnection("connected");
        setMessage(`Switched to ${aliasName}`);
      } else if (editableConfig) {
        const nextConfig = { ...editableConfig, active: aliasName };
        await persistConfigChange(nextConfig, `Active alias set to ${aliasName}. It will take effect after the server starts.`);
      } else {
        setMessage("Load local configuration before switching aliases offline.");
      }
    } catch (error) {
      setMessage(`Failed to switch: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function cycleTopbarUsageRange() {
    const currentIndex = topbarUsageRanges.findIndex((item) => item.value === topbarUsageRange);
    const next = topbarUsageRanges[(currentIndex + 1) % topbarUsageRanges.length];
    setTopbarUsageRange(next.value);
  }

  function handleEditAccount(aliasName: string) {
    if (!editableConfig) {
      void loadConfiguration()
        .then(() => {
          setEditMessage("");
          setEditMessageBad(false);
          setEditAliasName(aliasName);
        })
        .catch((error) => setMessage(`Failed to load configuration: ${getErrorMessage(error)}`));
      return;
    }
    if (!editableConfig.aliases[aliasName]) {
      setMessage(`Alias ${aliasName} is missing from local config.`);
      return;
    }
    setEditMessage("");
    setEditMessageBad(false);
    setEditAliasName(aliasName);
  }

  async function handleSaveProviderEdit(patch: ProviderEditPatch) {
    if (!editableConfig) {
      return;
    }

    const aliasName = patch.aliasName.trim();
    const providerName = patch.providerName.trim();
    const model = patch.model.trim();
    const baseUrl = patch.baseUrl.trim();
    const envName = patch.envName.trim();
    const displayName = patch.displayName.trim();
    const description = patch.description.trim();

    if (!aliasName || !configKeyPattern.test(aliasName)) {
      setEditMessage(`Invalid alias name "${patch.aliasName}".`);
      setEditMessageBad(true);
      return;
    }
    if (!providerName || !configKeyPattern.test(providerName)) {
      setEditMessage(`Invalid provider name "${patch.providerName}".`);
      setEditMessageBad(true);
      return;
    }
    if (!model) {
      setEditMessage("Upstream model is required.");
      setEditMessageBad(true);
      return;
    }
    if (aliasName !== patch.originalAlias && editableConfig.aliases[aliasName]) {
      setEditMessage(`Alias "${aliasName}" already exists.`);
      setEditMessageBad(true);
      return;
    }

    const previousProvider = editableConfig.providers[patch.originalProvider];
    const isMock = previousProvider?.type === "mock";
    const repointToExisting = providerName !== patch.originalProvider
      && Boolean(editableConfig.providers[providerName]);

    if (!isMock && !repointToExisting) {
      if (!baseUrl) {
        setEditMessage("Base URL is required.");
        setEditMessageBad(true);
        return;
      }
      if (!isValidHttpUrl(baseUrl)) {
        setEditMessage(`Invalid base URL "${baseUrl}".`);
        setEditMessageBad(true);
        return;
      }
      if (patch.authKind === "env" && envName && !envNamePattern.test(envName)) {
        setEditMessage(`Invalid API key env "${envName}".`);
        setEditMessageBad(true);
        return;
      }
    }

    const providers = { ...editableConfig.providers };

    if (!isMock && !repointToExisting && previousProvider?.type === "openai-compatible") {
      const previousAuth = previousProvider.auth;
      const managedAuth = previousAuth?.type === "ccswitch" || previousAuth?.type === "ccswitch-snapshot";
      const nextAuth = managedAuth
        ? { ...previousAuth, fallback_env: envName || previousAuth.fallback_env }
        : envName
          ? { type: "env" as const, header: "Authorization", scheme: "Bearer", env: envName }
          : previousAuth;

      const nextProvider: ProviderConfig = {
        ...previousProvider,
        base_url: baseUrl,
        ...(nextAuth ? { auth: nextAuth } : {}),
        ...(nextAuth?.type === "env" ? { api_key: `\${${nextAuth.env}}` } : {})
      };

      if (providerName !== patch.originalProvider) {
        delete providers[patch.originalProvider];
      }
      providers[providerName] = nextProvider;
    }

    const previousAlias = editableConfig.aliases[patch.originalAlias];
    const previousMetadata = (previousAlias?.metadata ?? {}) as Record<string, unknown>;
    const nextMetadata: Record<string, unknown> = { ...previousMetadata };
    if (displayName) {
      nextMetadata.display_name = displayName;
    } else {
      delete nextMetadata.display_name;
      delete nextMetadata.displayName;
    }

    const aliases = { ...editableConfig.aliases };
    if (aliasName !== patch.originalAlias) {
      delete aliases[patch.originalAlias];
    }
    aliases[aliasName] = {
      provider: providerName,
      model,
      ...(description ? { description } : {}),
      ...(Object.keys(nextMetadata).length > 0 ? { metadata: nextMetadata } : {})
    };

    // Repoint any other alias that used the renamed provider key.
    if (providerName !== patch.originalProvider && !repointToExisting) {
      for (const [name, candidate] of Object.entries(aliases)) {
        if (name !== aliasName && candidate.provider === patch.originalProvider) {
          aliases[name] = { ...candidate, provider: providerName };
        }
      }
    }

    const active = editableConfig.active === patch.originalAlias ? aliasName : editableConfig.active;
    const nextConfig: EditableConfig = { ...editableConfig, active, aliases, providers };

    setBusyAction(`provider-edit:${patch.originalAlias}`);
    setEditMessage("");
    setEditMessageBad(false);
    try {
      const { result: validation } = await validateConfigForCurrentMode(nextConfig);
      if (!validation.ok) {
        throw new Error((validation.errors ?? ["Validation failed"]).join(" "));
      }
      await persistConfigChange(nextConfig, `Saved ${aliasName}.`);
      setEditAliasName(null);
    } catch (error) {
      setEditMessage(`Save failed: ${getErrorMessage(error)}`);
      setEditMessageBad(true);
    } finally {
      setBusyAction(null);
    }
  }

  function handleDeleteAccount(aliasName: string) {
    if (!editableConfig) {
      setMessage("Load local configuration before deleting aliases offline.");
      return;
    }
    const alias = editableConfig.aliases[aliasName];
    if (!alias) {
      setMessage(`Alias ${aliasName} is missing from local config.`);
      return;
    }
    if (Object.keys(editableConfig.aliases).length <= 1) {
      setMessage("Cannot delete the last alias. Add or import another alias first.");
      return;
    }
    setDeleteAliasName(aliasName);
  }

  async function confirmDeleteAccount(deleteProviderToo: boolean) {
    if (!editableConfig || !deleteAliasName) {
      return;
    }
    const aliasName = deleteAliasName;
    const alias = editableConfig.aliases[aliasName];
    if (!alias) {
      setDeleteAliasName(null);
      return;
    }

    const providerName = alias.provider;
    const remainingReferences = Object.entries(editableConfig.aliases)
      .filter(([name]) => name !== aliasName)
      .filter(([, candidate]) => candidate.provider === providerName);
    const removeProvider = deleteProviderToo
      && remainingReferences.length === 0
      && Boolean(editableConfig.providers[providerName]);

    const aliases = { ...editableConfig.aliases };
    delete aliases[aliasName];
    const providers = { ...editableConfig.providers };
    if (removeProvider) {
      delete providers[providerName];
    }
    const nextActive = editableConfig.active === aliasName
      ? Object.keys(aliases)[0] ?? ""
      : editableConfig.active;
    const nextConfig = {
      ...editableConfig,
      active: nextActive,
      aliases,
      providers
    };

    setBusyAction(`delete:${aliasName}`);
    try {
      await persistConfigChange(nextConfig, removeProvider
        ? `Deleted ${aliasName} and orphan provider ${providerName}.`
        : `Deleted ${aliasName}.`);
      setDeleteAliasName(null);
    } catch (error) {
      setMessage(`Delete failed: ${getErrorMessage(error)}`);
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
    if (explicitAuth?.type === "ccswitch-snapshot") {
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
      const providerAuth = provider.auth;
      return providerAuth?.type === "ccswitch-snapshot"
        ? "CC Switch snapshot unavailable"
        : "CC Switch auth missing";
    }

    if (provider.auth?.type === "ccswitch") {
      return provider.auth.credential_ref || provider.auth.credential_path
        ? "CC Switch auth imported"
        : "CC Switch auth";
    }
    if (provider.auth?.type === "ccswitch-snapshot") {
      return provider.auth.snapshot_id
        ? "CC Switch snapshot"
        : "CC Switch snapshot auth";
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
      responsesApi: false,
      description: ""
    });
  }

  function resetAliasForm() {
    setAliasForm({
      editingName: "",
      name: "",
      provider: "",
      model: "",
      description: ""
    });
  }

  function resetEntrypointForm() {
    setEntrypointForm({
      editingName: "",
      name: "",
      use: "active"
    });
  }

  async function saveProviderDraft() {
    if (!editableConfig || !providerForm.name.trim()) {
      setConfigMessage("Provider name is required");
      return;
    }

    const name = providerForm.name.trim();
    const previousProvider = providerForm.editingName
      ? editableConfig.providers[providerForm.editingName]
      : editableConfig.providers[name];
    const previousAuth = previousProvider?.type === "openai-compatible" ? previousProvider.auth : undefined;
    const previousMetadata = previousProvider?.metadata;
    const description = providerForm.description.trim();
    const preservedAuth = previousAuth?.type === "ccswitch" || previousAuth?.type === "ccswitch-snapshot"
      ? {
        ...previousAuth,
        fallback_env: providerForm.envName.trim() || previousAuth.fallback_env
      }
      : undefined;
    const provider: ProviderConfig = providerForm.type === "mock"
      ? {
        type: "mock",
        ...(description ? { description } : {}),
        ...(previousMetadata ? { metadata: previousMetadata } : {})
      }
      : preservedAuth
        ? {
          type: "openai-compatible",
          base_url: providerForm.baseUrl.trim(),
          auth: preservedAuth,
          responses_api: providerForm.responsesApi,
          ...(description ? { description } : {}),
          ...(previousMetadata ? { metadata: previousMetadata } : {})
        }
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
          responses_api: providerForm.responsesApi,
          ...(description ? { description } : {}),
          ...(previousMetadata ? { metadata: previousMetadata } : {})
        };

    const providers = { ...editableConfig.providers };
    if (providerForm.editingName && providerForm.editingName !== name) {
      delete providers[providerForm.editingName];
    }
    providers[name] = provider;
    const aliases = Object.fromEntries(
      Object.entries(editableConfig.aliases).map(([aliasName, alias]) => [
        aliasName,
        alias.provider === providerForm.editingName && providerForm.editingName !== name
          ? { ...alias, provider: name }
          : alias
      ])
    );

    setBusyAction("config:provider-save");
    try {
      await persistConfigChange({ ...editableConfig, providers, aliases }, `Provider ${name} saved.`);
      resetProviderForm();
    } catch (error) {
      setConfigMessage(`Provider save failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function editProvider(name: string, provider: ProviderConfig) {
    setProviderForm({
      editingName: name,
      name,
      type: provider.type,
      baseUrl: provider.type === "openai-compatible" ? provider.base_url : "",
      envName: providerEnvName(provider),
      responsesApi: provider.type === "openai-compatible" ? Boolean(provider.responses_api) : false,
      description: provider.description ?? ""
    });
  }

  async function deleteProvider(name: string) {
    if (!editableConfig) {
      return;
    }

    const aliasesUsingProvider = Object.entries(editableConfig.aliases)
      .filter(([, alias]) => alias.provider === name)
      .map(([aliasName]) => aliasName);
    const detail = aliasesUsingProvider.length > 0
      ? ` This also deletes aliases: ${aliasesUsingProvider.join(", ")}.`
      : "";
    if (!window.confirm(`Delete provider "${name}"?${detail}`)) {
      return;
    }

    const providers = { ...editableConfig.providers };
    delete providers[name];
    const aliases = { ...editableConfig.aliases };
    for (const aliasName of aliasesUsingProvider) {
      delete aliases[aliasName];
    }
    if (Object.keys(aliases).length === 0) {
      setConfigMessage("Cannot delete provider because it would remove the last alias.");
      return;
    }
    const active = aliases[editableConfig.active] ? editableConfig.active : Object.keys(aliases)[0];

    setBusyAction("config:provider-delete");
    try {
      await persistConfigChange({ ...editableConfig, active, providers, aliases }, `Provider ${name} deleted.`);
    } catch (error) {
      setConfigMessage(`Provider delete failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function saveAliasDraft() {
    if (!editableConfig || !aliasForm.name.trim()) {
      setConfigMessage("Alias name is required");
      return;
    }

    const name = aliasForm.name.trim();
    const previousAlias = aliasForm.editingName
      ? editableConfig.aliases[aliasForm.editingName]
      : editableConfig.aliases[name];
    const description = aliasForm.description.trim();
    const aliases = { ...editableConfig.aliases };
    if (aliasForm.editingName && aliasForm.editingName !== name) {
      delete aliases[aliasForm.editingName];
    }
    aliases[name] = {
      provider: aliasForm.provider,
      model: aliasForm.model.trim(),
      ...(description ? { description } : {}),
      ...(previousAlias?.ratio_binding ? { ratio_binding: previousAlias.ratio_binding } : {}),
      ...(previousAlias?.metadata ? { metadata: previousAlias.metadata } : {})
    };
    const active = editableConfig.active === aliasForm.editingName ? name : editableConfig.active;

    setBusyAction("config:alias-save");
    try {
      await persistConfigChange({ ...editableConfig, active, aliases }, `Alias ${name} saved.`);
      resetAliasForm();
    } catch (error) {
      setConfigMessage(`Alias save failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function editAlias(name: string, alias: EditableConfig["aliases"][string]) {
    setAliasForm({
      editingName: name,
      name,
      provider: alias.provider,
      model: alias.model,
      description: alias.description ?? ""
    });
  }

  async function deleteAlias(name: string) {
    if (!editableConfig) {
      return;
    }
    if (Object.keys(editableConfig.aliases).length <= 1) {
      setConfigMessage("Cannot delete the last alias. Add or import another alias first.");
      return;
    }
    if (!window.confirm(`Delete alias "${name}"?`)) {
      return;
    }

    const aliases = { ...editableConfig.aliases };
    delete aliases[name];
    const active = editableConfig.active === name ? Object.keys(aliases)[0] : editableConfig.active;

    setBusyAction("config:alias-delete");
    try {
      await persistConfigChange({ ...editableConfig, active, aliases }, `Alias ${name} deleted.`);
    } catch (error) {
      setConfigMessage(`Alias delete failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function setActiveAlias(name: string) {
    if (!editableConfig) {
      return;
    }

    setBusyAction("config:set-active");
    try {
      await persistConfigChange({ ...editableConfig, active: name }, `Active alias set to ${name}.`);
    } catch (error) {
      setConfigMessage(`Set active failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
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

    const selected = importDrafts.filter((draft) => draft.selected && (!draft.duplicate || generateImportNames));
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
        const metadata = {
          imported_from: "ccswitch",
          source_app: item.draft.app,
          source_provider_id: item.draft.source_id,
          snapshot_id: item.draft.snapshot_id,
          source_config_hash: item.draft.source_config_hash,
          source_fingerprint: item.draft.source_fingerprint,
          source_order: item.draft.source_order
        };
        const auth = buildProviderAuthFromDraft(item.draft, providerName, item.envName);

        providers[providerName] = {
          type: "openai-compatible",
          base_url: item.baseUrl,
          ...(auth.type === "env" ? { api_key: `\${${item.envName}}` } : {}),
          auth,
          ...(description ? { description } : {}),
          metadata
        };
        aliases[aliasName] = {
          provider: providerName,
          model: item.modelValue,
          ...(description ? { description } : {}),
          metadata
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
      <section className="ccswitch-integration ccs-settings-sections">
        <section className="ccs-settings-section">
          <header className="ccs-settings-section-header">
            <h2>CC Switch</h2>
            <p>{t("ccswitch.import.description")}</p>
          </header>
          <div className="ccs-setting-row">
            <div>
              <strong>{t("settings.importFromCcSwitch")}</strong>
              <span>{t("ccswitchImport.shortDescription")}</span>
            </div>
            <button type="button" onClick={openCcSwitchImportModal} disabled={busyAction !== null}>
              {t("config.import")}
            </button>
          </div>
        </section>

        <section className="ccs-settings-section">
          <header className="ccs-settings-section-header">
            <h2>Codex</h2>
            <p>{t("codexImport.description")}</p>
          </header>
          <div className="ccs-setting-row">
            <div>
              <strong>{t("settings.importToCodex")}</strong>
              <span>{t("config.integrations.importModelGateToCodex")}</span>
            </div>
            <button type="button" onClick={openCodexImportPanel} disabled={busyAction !== null}>
              {t("settings.importToCodex")}
            </button>
          </div>
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

  function renderRatioMonitor() {
    const sourceList = ratioSources?.sources ?? [];
    const cacheEntries = ratioSources?.cache ?? {};
    const sourceOptions = sourceList.filter((source) => source.enabled);
    const ratioBusy = busyAction?.startsWith("ratio:") ?? false;
    const ratioMessageBad = ratioMessage.includes("failed") || ratioMessage.includes("Failed");

    return (
      <div className="ccs-settings-sections ratio-monitor">
        <section className="ccs-settings-section ratio-monitor-section">
          <header className="ccs-settings-section-header ratio-section-header">
            <div>
              <h2>{t("ratio.sources")}</h2>
              <p>{t("ratio.sourcesDescription")}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetRatioSourceForm();
                setShowRatioSourceForm(true);
              }}
              disabled={ratioBusy}
            >
              {t("ratio.addSource")}
            </button>
          </header>

          {showRatioSourceForm && (
            <div className="ratio-source-form">
              <label>
                {t("common.name")}
                <input value={ratioSourceForm.name} onChange={(event) => setRatioSourceForm({ ...ratioSourceForm, name: event.target.value })} />
              </label>
              <label>
                {t("ratio.siteUrl")}
                <input value={ratioSourceForm.baseUrl} onChange={(event) => setRatioSourceForm({ ...ratioSourceForm, baseUrl: event.target.value })} />
              </label>
              <label>
                {t("common.type")}
                <select value={ratioSourceForm.type} onChange={(event) => setRatioSourceForm({ ...ratioSourceForm, type: event.target.value as RatioSourceType })}>
                  {ratioSourceTypeOptions.map((type) => (
                    <option key={type} value={type}>{t(ratioSourceTypeLabels[type])}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("ratio.refreshInterval")}
                <input
                  min={1}
                  type="number"
                  value={ratioSourceForm.refreshIntervalMinutes}
                  onChange={(event) => setRatioSourceForm({ ...ratioSourceForm, refreshIntervalMinutes: Number(event.target.value) })}
                />
              </label>
              <label>
                {t("ratio.auth")}
                <select value={ratioSourceForm.authType} onChange={(event) => setRatioSourceForm({ ...ratioSourceForm, authType: event.target.value as RatioSourceAuth["type"] })}>
                  <option value="none">{t("ratio.authNone")}</option>
                  <option value="bearer">{t("ratio.authBearer")}</option>
                  <option value="api-token">{t("ratio.authApiToken")}</option>
                </select>
              </label>
              <label>
                {t("ratio.tokenEnv")}
                <input
                  disabled={ratioSourceForm.authType === "none"}
                  placeholder="HARDYAI_RATIO_TOKEN"
                  value={ratioSourceForm.tokenEnv}
                  onChange={(event) => setRatioSourceForm({ ...ratioSourceForm, tokenEnv: event.target.value })}
                />
              </label>
              {ratioSourceForm.authType === "api-token" && (
                <>
                  <label>
                    {t("ratio.header")}
                    <input value={ratioSourceForm.header} onChange={(event) => setRatioSourceForm({ ...ratioSourceForm, header: event.target.value })} />
                  </label>
                  <label>
                    {t("ratio.scheme")}
                    <input value={ratioSourceForm.scheme} onChange={(event) => setRatioSourceForm({ ...ratioSourceForm, scheme: event.target.value })} />
                  </label>
                </>
              )}
              <label className="inline-checkbox ratio-enabled-field">
                <input
                  type="checkbox"
                  checked={ratioSourceForm.enabled}
                  onChange={(event) => setRatioSourceForm({ ...ratioSourceForm, enabled: event.target.checked })}
                />
                {t("ratio.enabled")}
              </label>
              <div className="ratio-form-actions">
                <button type="button" onClick={() => void saveRatioSourceDraft()} disabled={ratioBusy}>
                  {busyAction === "ratio:save" ? t("config.saving") : t("providerEdit.save")}
                </button>
                <button className="secondary" type="button" onClick={() => setShowRatioSourceForm(false)} disabled={ratioBusy}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}

          <div className="ratio-source-list">
            {sourceList.length === 0 ? (
              <div className="empty-state">
                <strong>{t("ratio.noSources")}</strong>
                <span>{t("ratio.noSourcesHint")}</span>
              </div>
            ) : sourceList.map((source) => {
              const groups = cacheEntries[source.id]?.groups ?? [];
              const modelCount = groups.reduce((count, group) => count + group.models.length, 0);
              const statusKey = ratioSourceStatusLabels[source.status];
              return (
                <div className="ccs-setting-row ratio-source-row" key={source.id}>
                  <div>
                    <strong>{source.name}</strong>
                    <span>{source.baseUrl} · {t(ratioSourceTypeLabels[source.type])}</span>
                    <span>
                      {t("ratio.groupCount", { count: groups.length })} · {t("ratio.modelCount", { count: modelCount })}
                      {source.lastSuccessAt ? ` · ${t("ratio.lastSuccess")}: ${formatLogTime(source.lastSuccessAt)}` : ""}
                      {source.nextRefreshAt ? ` · ${t("ratio.nextRefresh")}: ${formatLogTime(source.nextRefreshAt)}` : ""}
                    </span>
                    {source.lastError && <span className="inline-error">{source.lastError}</span>}
                  </div>
                  <div className="ratio-row-actions">
                    <span className={`ccs-status-badge ratio-status-${source.status}`}>{t(statusKey)}</span>
                    <button className="secondary" type="button" onClick={() => void handleRefreshRatioSource(source.id)} disabled={ratioBusy || connection !== "connected"}>
                      {busyAction === `ratio:refresh:${source.id}` ? t("common.refreshing") : t("common.refresh")}
                    </button>
                    <button className="secondary" type="button" onClick={() => editRatioSource(source)} disabled={ratioBusy}>
                      {t("common.edit")}
                    </button>
                    <button className="secondary danger" type="button" onClick={() => void handleDeleteRatioSource(source.id)} disabled={ratioBusy || connection !== "connected"}>
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="ccs-settings-section ratio-monitor-section">
          <header className="ccs-settings-section-header">
            <h2>{t("ratio.bindings")}</h2>
            <p>{t("ratio.bindingsDescription")}</p>
          </header>
          <div className="ratio-binding-list">
            {ratioBindings.length === 0 ? (
              <div className="empty-state">
                <strong>{t("ratio.noBindings")}</strong>
                <span>{t("ratio.noBindingsHint")}</span>
              </div>
            ) : ratioBindings.map((binding) => {
              const selectedSourceId = binding.binding?.sourceId ?? "";
              const selectedGroupId = binding.binding?.groupId ?? "";
              const groups = selectedSourceId ? cacheEntries[selectedSourceId]?.groups ?? [] : [];
              const currentRatio = binding.currentRatio === undefined ? t(ratioBindingStatusLabels[binding.status]) : `${binding.currentRatio}x`;
              return (
                <div className="ccs-setting-row ratio-binding-row" key={binding.alias}>
                  <div>
                    <strong>{binding.alias}</strong>
                    <span>{binding.provider} · {binding.model}</span>
                    <span>{t("ratio.currentRatio")}: {currentRatio}</span>
                  </div>
                  <div className="ratio-binding-controls">
                    <select
                      aria-label={t("ratio.source")}
                      value={selectedSourceId}
                      onChange={(event) => {
                        const nextSourceId = event.target.value;
                        const nextGroups = nextSourceId ? cacheEntries[nextSourceId]?.groups ?? [] : [];
                        void handleRatioBindingChange(binding.alias, nextSourceId, nextGroups[0]?.groupId ?? "");
                      }}
                      disabled={ratioBusy || !editableConfig}
                    >
                      <option value="">{t("ratio.unbound")}</option>
                      {sourceOptions.map((source) => (
                        <option key={source.id} value={source.id}>{source.name}</option>
                      ))}
                    </select>
                    <select
                      aria-label={t("ratio.group")}
                      value={selectedGroupId}
                      onChange={(event) => void handleRatioBindingChange(binding.alias, selectedSourceId, event.target.value)}
                      disabled={ratioBusy || !editableConfig || !selectedSourceId}
                    >
                      <option value="">{t("ratio.group")}</option>
                      {groups.map((group) => (
                        <option key={group.groupId} value={group.groupId}>
                          {group.name} ({group.models.length})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          <span className={ratioMessageBad ? "action-message bad" : "action-message"}>{ratioMessage}</span>
        </section>
      </div>
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
  const reportedServerLifecycle = serverProcess?.status;
  const serverLifecycle = connection === "connected"
    && (!reportedServerLifecycle || reportedServerLifecycle === "stopped" || reportedServerLifecycle === "failed")
    ? "external-running"
    : reportedServerLifecycle ?? "stopped";
  const isServerStarting = serverLifecycle === "starting";
  const isServerStopping = serverLifecycle === "stopping";
  const serverRunning = serverLifecycle === "running" || serverLifecycle === "external-running";
  const canStartServer = serverLifecycle === "stopped" || serverLifecycle === "failed";
  const canStopServer = Boolean(serverProcess?.canStop);
  const serverControlBusy = (busyAction?.startsWith("server:") ?? false) || isServerStarting || isServerStopping;
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
  const settingsTopTab = settingsPageTabFromSection(configSection);
  const editingAlias = editAliasName
    ? displayAliases.find((alias) => alias.name === editAliasName) ?? null
    : null;
  const configMessageIsError = configMessage.startsWith("Save failed")
    || configMessage.startsWith("Validation failed")
    || configMessage.startsWith("Failed");
  const deletingAlias = deleteAliasName ? editableConfig?.aliases[deleteAliasName] : undefined;
  const deleteProviderOrphaned = Boolean(
    deleteAliasName
    && deletingAlias
    && editableConfig
    && Object.entries(editableConfig.aliases)
      .filter(([name]) => name !== deleteAliasName)
      .every(([, candidate]) => candidate.provider !== deletingAlias.provider)
    && editableConfig.providers[deletingAlias.provider]
  );
  const editSaving = busyAction === `provider-edit:${editAliasName}`;
  const homeNavItems: Array<{ id: HomeSection; label: string; Icon: typeof Boxes }> = [
    { id: "providers", label: t("switcher.providerList"), Icon: Boxes },
    { id: "usage", label: t("usage.title"), Icon: BarChart3 }
  ];
  const topbarUsageLabel = topbarUsageRanges.find((item) => item.value === topbarUsageRange)?.label ?? "10m";
  const topbarTokenLabel = topbarUsageSummary ? formatTokenTotal(topbarUsageSummary.total_tokens) : "--";

  return (
    <>
      {activeTab === "settings" ? (
        <CcSwitchSettingsPage
          activeTab={settingsTopTab}
          message={configMessageIsError ? configMessage : undefined}
          messageBad={configMessageIsError}
          onBack={() => setActiveTab("switcher")}
          onSelectTab={selectSettingsTab}
          tabs={settingsPageTabs}
          title={t("settings.title")}
        >

          {configSection === "common" && (
            <div className="ccs-settings-sections">
              <section className="ccs-settings-section">
                <header className="ccs-settings-section-header">
                  <h2>{t("settings.interfaceLanguage")}</h2>
                  <p>{t("settings.interfaceLanguageHint")}</p>
                </header>
                <div className="ccs-setting-row">
                  <div>
                    <strong>{t("settings.language")}</strong>
                    <span>{t("settings.languageDescription")}</span>
                  </div>
                  <div className="ccs-segmented-control" role="group" aria-label={t("settings.language")}>
                    <button className={language === "zh-CN" ? "is-active" : ""} onClick={() => selectLanguage("zh-CN")} type="button">
                      {t("language.zhCN")}
                    </button>
                    <button className={language === "en" ? "is-active" : ""} onClick={() => selectLanguage("en")} type="button">
                      {t("language.en")}
                    </button>
                  </div>
                </div>
              </section>

              <section className="ccs-settings-section">
                <header className="ccs-settings-section-header">
                  <h2>{t("settings.service")}</h2>
                  <p>{t("settings.serviceDescription")}</p>
                </header>
                <div className="ccs-setting-row">
                  <div>
                    <strong>{t("common.status")}</strong>
                    <span>{serverRunning ? t("common.running") : t("app.disconnected")}</span>
                  </div>
                  <span className={serverRunning ? "ccs-status-badge is-running" : "ccs-status-badge"}>{serverRunning ? t("common.running") : t("app.disconnected")}</span>
                </div>
                <div className="ccs-setting-row">
                  <div>
                    <strong>{t("config.endpoint")}</strong>
                    <span className="ccs-path-text">{serverProcess?.endpoint ?? `${serverUrl}/v1`}</span>
                  </div>
                </div>
                <div className="ccs-setting-actions">
                  <button onClick={() => void handleStartServer()} disabled={busyAction !== null || !canStartServer}>
                    {busyAction === "server:start" || isServerStarting ? t("advanced.starting") : t("advanced.startServer")}
                  </button>
                  <button className="secondary" onClick={() => void handleStopServer()} disabled={busyAction !== null || !canStopServer || isServerStopping}>
                    {busyAction === "server:stop" || isServerStopping ? t("advanced.stopping") : t("advanced.stopServer")}
                  </button>
                  <button className="secondary" onClick={() => void handleRestartServer()} disabled={busyAction !== null || !canStopServer || isServerStarting || isServerStopping}>
                    {busyAction === "server:restart" ? t("advanced.restarting") : t("advanced.restartServer")}
                  </button>
                </div>
              </section>

              <section className="ccs-settings-section">
                <header className="ccs-settings-section-header">
                  <h2>{t("settings.configFile")}</h2>
                  <p>{t("settings.configFileDescription")}</p>
                </header>
                <div className="ccs-setting-row">
                  <div>
                    <strong>{t("settings.configFile")}</strong>
                    <span className="ccs-path-text">{configPath || t("config.notLoaded")}</span>
                  </div>
                  <button className="secondary" onClick={() => void handleCopyConfigPath()} disabled={!configPath} type="button">
                    {t("settings.copyPath")}
                  </button>
                </div>
              </section>
            </div>
          )}

          {configSection === "records" && (
            <section className="records-panel">
              <div className="ccs-segmented-control ccs-sub-tabs" role="tablist" aria-label={t("settings.records")}>
                <button className={recordsSection === "logs" ? "is-active" : ""} onClick={() => setRecordsSection("logs")} type="button">
                  {t("settings.logs")}
                </button>
                <button className={recordsSection === "usage" ? "is-active" : ""} onClick={() => setRecordsSection("usage")} type="button">
                  {t("settings.usage")}
                </button>
              </div>
              {recordsSection === "usage" ? (
                <UsageOverview activeModel={activeAlias?.model} disconnected={disconnected} />
              ) : (
                <>
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
                        <span>{t("common.status")}</span>
                        <span>{t("common.alias")}</span>
                        <span>{t("common.provider")}</span>
                        <span>{t("common.duration")}</span>
                      </div>
                      {requestLogs.map((entry) => (
                        <div className={entry.ok ? "request-log-row compact ok" : "request-log-row compact failed"} key={entry.id}>
                          <span>{formatLogTime(entry.started_at)}</span>
                          <span>{entry.kind === "diagnostic" ? t("logs.diagnostic") : t("logs.normal")}</span>
                          <span>{entry.api_type === "responses" ? "responses" : "chat"}</span>
                          <span><span className={entry.ok ? "pill" : "pill bad"}>{entry.ok ? "OK" : entry.status_code ?? "ERR"}</span></span>
                          <span>{entry.resolved_alias ?? "-"}</span>
                          <span>{entry.provider ?? "-"}</span>
                          <span>{entry.duration_ms ?? 0}ms</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </section>
          )}

          {configSection === "advanced" && (
            <div className="ccs-settings-sections">
              <ServerControl
                busyAction={busyAction}
                serverProcess={serverProcess}
                serverUrl={serverUrl}
                onRefresh={() => void refresh()}
                onRestart={() => void handleRestartServer()}
                onStart={() => void handleStartServer()}
                onStop={() => void handleStopServer()}
              />
              <section className="actions">
                <button onClick={() => void refresh()} disabled={busyAction !== null}>
                  {busyAction === "refresh" ? t("common.refreshing") : t("common.refresh")}
                </button>
                <button onClick={() => void handleReload()} disabled={busyAction !== null || disconnected}>
                  {busyAction === "reload" ? t("config.reloading") : t("settings.reloadConfig")}
                </button>
                <span className={message.startsWith("Failed") || disconnected ? "action-message bad" : "action-message"}>
                  {message}
                </span>
              </section>
              <section className="card active-card">
                <div className="card-heading">
                  <span>{t("advanced.activeAlias")}</span>
                  {displayActiveAliasName && <strong>{displayActiveAliasName}</strong>}
                </div>
                {activeAlias ? (
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
                ) : (
                  <p className="muted">{t("switcher.noActive")}</p>
                )}
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
            </div>
          )}

          {configSection === "about" && (
            <div className="ccs-settings-sections">
              <section className="ccs-settings-section about-section">
                <header className="ccs-settings-section-header">
                  <h2>ModelGate</h2>
                  <p>{t("app.subtitle")}</p>
                </header>
                <div className="ccs-setting-row">
                  <div>
                    <strong>{t("settings.version")}</strong>
                    <span>{appVersion}</span>
                  </div>
                </div>
                <div className="ccs-setting-row">
                  <div>
                    <strong>GitHub</strong>
                    <span>Hzq-0304/ModelGate</span>
                  </div>
                  <a className="ccs-link-button" href="https://github.com/Hzq-0304/ModelGate" target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </div>
                <p className="muted">{t("settings.ccSwitchAttribution")}</p>
              </section>
            </div>
          )}

          {isRoutingSection(configSection) && (
            <div className="ccs-segmented-control ccs-sub-tabs" role="tablist" aria-label={t("settings.modelRouting")}>
              <button className={configSection === "providers" ? "is-active" : ""} onClick={() => setConfigSection("providers")} type="button">
                {t("settings.providers")}
              </button>
              <button className={configSection === "aliases" ? "is-active" : ""} onClick={() => setConfigSection("aliases")} type="button">
                {t("settings.aliases")}
              </button>
              <button className={configSection === "entrypoints" ? "is-active" : ""} onClick={() => setConfigSection("entrypoints")} type="button">
                {t("settings.entrypoints")}
              </button>
              <button className={configSection === "pricing" ? "is-active" : ""} onClick={() => setConfigSection("pricing")} type="button">
                {t("settings.pricing")}
              </button>
              <button className={configSection === "ratios" ? "is-active" : ""} onClick={() => setConfigSection("ratios")} type="button">
                {t("settings.ratios")}
              </button>
            </div>
          )}

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
                    <button className="secondary danger" onClick={() => void deleteProvider(name)} disabled={configBusy}>{t("common.delete")}</button>
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
              <input placeholder={t("ccswitch.simple.description")} value={providerForm.description} onChange={(event) => setProviderForm({ ...providerForm, description: event.target.value })} />
              <label className="inline-checkbox">
                <input type="checkbox" checked={providerForm.responsesApi} onChange={(event) => setProviderForm({ ...providerForm, responsesApi: event.target.checked })} disabled={providerForm.type === "mock"} />
                Responses API
              </label>
              <button onClick={() => void saveProviderDraft()} disabled={configBusy}>{providerForm.editingName ? t("config.updateProvider") : t("config.addProvider")}</button>
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
                    <button className="secondary" onClick={() => void setActiveAlias(name)} disabled={configBusy}>{t("config.setActive")}</button>
                    <button className="secondary danger" onClick={() => void deleteAlias(name)} disabled={configBusy}>{t("common.delete")}</button>
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
              <input placeholder={t("ccswitch.simple.description")} value={aliasForm.description} onChange={(event) => setAliasForm({ ...aliasForm, description: event.target.value })} />
              <button onClick={() => void saveAliasDraft()} disabled={configBusy}>{aliasForm.editingName ? t("config.updateAlias") : t("config.addAlias")}</button>
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

          {configSection === "ratios" && renderRatioMonitor()}

          {isRoutingSection(configSection) && (
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
          )}
        </CcSwitchSettingsPage>
      ) : (
        <CcSwitchShell
          brand={<ModelGateBrand />}
          headerAccessory={(
            <div className="topbar-token-summary" aria-label={`Token total for ${topbarUsageLabel}`}>
              <span className="topbar-token-value">{topbarTokenLabel}</span>
              <button
                className="topbar-token-range"
                data-tauri-no-drag
                onClick={cycleTopbarUsageRange}
                title="Change token window"
                type="button"
              >
                {topbarUsageLabel}
              </button>
            </div>
          )}
          onOpenSettings={() => openSettings()}
          onStartServer={() => void handleStartServer()}
          onStopServer={() => void handleStopServer()}
          serverBusy={serverControlBusy}
          serverLifecycle={serverLifecycle}
          settingsActive={false}
          settingsLabel={t("settings.title")}
          title={t("app.title")}
        >
          <section className="home-dashboard">
            <nav className="home-sidebar" aria-label="Home sections">
              {homeNavItems.map(({ id, label, Icon }) => (
                <button
                  aria-current={homeSection === id ? "page" : undefined}
                  aria-label={label}
                  className={homeSection === id ? "home-sidebar-item active" : "home-sidebar-item"}
                  key={id}
                  onClick={() => setHomeSection(id)}
                  title={label}
                  type="button"
                >
                  <Icon aria-hidden="true" />
                </button>
              ))}
            </nav>
            <section className="home-content">
              {homeSection === "providers" ? (
                <section className="home-section-panel" id="account-switcher">
                  <AccountSwitcher
                    accounts={aliasesList}
                    activeAliasName={displayActiveAliasName}
                    connection={connection}
                    configWarnings={displayConfigWarnings}
                    message={message}
                    switchingAlias={busyAction?.startsWith("switch:") ? busyAction.slice("switch:".length) : null}
                    onAlreadyActive={() => setMessage(t("switcher.alreadyActive"))}
                    onDeleteAccount={(alias) => void handleDeleteAccount(alias)}
                    onEditAccount={handleEditAccount}
                    onGoToIntegrations={() => openSettings("integrations")}
                    onSelectAccount={(alias) => void handleSwitch(alias)}
                  />
                </section>
              ) : (
                <section className="home-section-panel home-usage-panel" id="usage-overview">
                  <UsageOverview
                    activeModel={activeAlias?.model}
                    disconnected={disconnected}
                  />
                </section>
              )}
            </section>
          </section>
        </CcSwitchShell>
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
      <CcSwitchProviderEditModal
        alias={editingAlias}
        busy={editSaving}
        message={editMessage}
        messageBad={editMessageBad}
        open={Boolean(editAliasName && editingAlias)}
        providerNames={providerNames}
        onClose={() => setEditAliasName(null)}
        onSave={(patch) => void handleSaveProviderEdit(patch)}
      />
      <CcSwitchConfirmModal
        busy={busyAction?.startsWith("delete:") ?? false}
        checkboxDefault={deleteProviderOrphaned}
        checkboxLabel={deleteProviderOrphaned && deletingAlias
          ? t("providerDelete.orphanProvider", { provider: deletingAlias.provider })
          : undefined}
        confirmLabel={t("common.delete")}
        message={deleteAliasName ? t("providerDelete.message", { alias: deleteAliasName }) : ""}
        open={Boolean(deleteAliasName && deletingAlias)}
        title={t("providerDelete.title")}
        onCancel={() => setDeleteAliasName(null)}
        onConfirm={(checked) => void confirmDeleteAccount(checked)}
      />
    </>
  );
}
