import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import YAML from "yaml";

const baseUrl = "http://127.0.0.1:11435";

export type HealthResponse = {
  ok: boolean;
  name: string;
  capabilities?: {
    chat_completions: boolean;
    responses: boolean;
  };
};

export type StatusResponse = {
  name: string;
  active: string;
  entrypoints: Record<string, {
    use: string;
    resolved: string;
  }>;
  config_warnings?: ConfigWarning[];
};

export type ConfigWarning = {
  type: "missing_env" | "missing_credential";
  provider?: string;
  path: string;
  env?: string;
  envName?: string;
  source?: string;
  credential_id?: string;
  message: string;
};

export type AliasesResponse = {
  active: string;
  aliases: Array<{
    name: string;
    provider: string;
    model: string;
    description?: string;
  }>;
};

type SwitchResponse = {
  ok: boolean;
  active: string;
};

export type ServerProcessStatus = {
  status: "stopped" | "starting" | "running" | "stopping" | "failed" | "external-running";
  endpoint: string;
  reachable: boolean;
  managed: boolean;
  canStop: boolean;
  running: boolean;
  pid?: number;
  mode: "external" | "managed" | "stopped" | "starting" | "stopping" | "failed" | "unknown";
  message?: string;
  startedAt?: string;
  lastError?: string;
  startupLog?: string[];
  recentStderr?: string[];
  root?: string;
  configPath?: string;
  command?: string;
  exitCode?: string;
};

export type ProviderConfig =
  | {
    type: "mock";
    description?: string;
  }
  | {
    type: "openai-compatible";
    base_url: string;
    api_key?: string;
    auth?: {
      type: "env";
      header?: string;
      scheme?: string;
      env: string;
    } | {
      type: "ccswitch";
      source: string;
      app?: string;
      db_path?: string;
      provider_id?: string;
      credential_ref?: string;
      credential_path?: string;
      fallback_env?: string;
      header?: string;
      scheme?: string;
    } | {
      type: "static-header-ref";
      header?: string;
      scheme?: string;
      value_ref?: string;
      value_env?: string;
      value?: string;
    };
    responses_api?: boolean;
    api_key_resolved?: boolean;
    description?: string;
  };

export type EditableConfig = {
  server: {
    host: string;
    port: number;
  };
  active: string;
  entrypoints: Record<string, {
    use: string;
  }>;
  aliases: Record<string, {
    provider: string;
    model: string;
    description?: string;
  }>;
  providers: Record<string, ProviderConfig>;
  pricing?: Record<string, {
    input_per_million: number;
    output_per_million: number;
    cached_input_per_million?: number;
  }>;
};

export type AdminConfigResponse = {
  path: string;
  config: EditableConfig;
  config_warnings?: ConfigWarning[];
};

export type OfflineConfigResponse = AdminConfigResponse;

type OfflineConfigTextResponse = {
  path: string;
  raw: string;
};

export type ConfigValidationResponse = {
  ok: boolean;
  errors?: string[];
  warnings: string[];
  active?: string;
  path?: string;
};

export type RequestLogEntry = {
  id: string;
  kind?: "normal" | "diagnostic";
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
  api_type?: "chat_completions" | "responses";
  fallback_mode?: "direct_responses" | "responses_to_chat";
  requested_model?: string;
  resolved_alias?: string;
  provider?: string;
  upstream_model?: string;
  stream: boolean;
  status_code?: number;
  ok: boolean;
  error_type?: string;
  error_message?: string;
};

export type RequestStats = {
  total: number;
  success: number;
  failed: number;
  stream: number;
  non_stream: number;
  avg_duration_ms: number;
  by_provider: Record<string, number>;
};

export type UsageRange = "today" | "24h" | "7d" | "all";

export type UsageRecord = {
  id: string;
  timestamp: string;
  api_type: "chat_completions" | "responses";
  path: "/v1/chat/completions" | "/v1/responses";
  kind: "normal" | "diagnostic";
  requested_model?: string;
  resolved_alias?: string;
  provider?: string;
  upstream_model?: string;
  fallback_mode?: "direct_responses" | "responses_to_chat";
  stream: boolean;
  ok: boolean;
  status_code?: number;
  duration_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
  cost_available: boolean;
};

export type UsageSummary = {
  range: UsageRange;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  requests: number;
  success: number;
  failed: number;
  estimated_cost_usd?: number;
  cost_available: boolean;
  by_provider: Record<string, {
    requests: number;
    total_tokens: number;
    estimated_cost_usd?: number;
    cost_available: boolean;
  }>;
  by_model: Record<string, {
    requests: number;
    total_tokens: number;
    estimated_cost_usd?: number;
    cost_available: boolean;
  }>;
};

export type UsageTimeline = {
  range: Exclude<UsageRange, "all">;
  bucket: "hour" | "day";
  points: Array<{
    time: string;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    reasoning_tokens: number;
    total_tokens: number;
    estimated_cost_usd?: number;
    cost_available: boolean;
    requests: number;
  }>;
};

export type ProviderPreset = {
  id: string;
  display_name: string;
  provider_name: string;
  type: "openai-compatible";
  base_url: string;
  default_model: string;
  suggested_alias: string;
  suggested_env_name: string;
  notes?: string;
  models?: string[];
};

export type DiagnosticCheck = {
  name: string;
  ok: boolean;
  message?: string;
};

export type DiagnosticResult = {
  ok: boolean;
  target: "provider" | "alias" | "active";
  api_type?: "chat_completions" | "responses";
  fallback_mode?: "direct_responses" | "responses_to_chat";
  provider?: string;
  alias?: string;
  model?: string;
  stream: boolean;
  duration_ms: number;
  status_code?: number;
  checks: DiagnosticCheck[];
  message?: string;
  error_message?: string;
};

export type CcSwitchDatabaseDetection = {
  found: boolean;
  path?: string;
  message?: string;
};

export type CcSwitchImportCandidate = {
  id: string;
  db_path?: string;
  source_table?: string;
  source_id?: string;
  app: string;
  name: string;
  provider_name: string;
  provider_type: "openai-compatible" | "unknown";
  base_url?: string;
  description?: string;
  api_key_env?: string;
  api_key_detected: boolean;
  api_key_preview?: string;
  auth_type?: "env" | "ccswitch" | "static-header-ref";
  auth_source?: string;
  auth_status?: "imported" | "fallback" | "missing";
  credential_ref?: string;
  credential_path?: string;
  model?: string;
  models: string[];
  suggested_modelgate_provider: string;
  suggested_modelgate_alias: string;
  suggested_env_name: string;
  complete: boolean;
  modelgate_managed: boolean;
  warnings: string[];
};

export type CcSwitchImportReport = {
  dbPath: string;
  tables: Array<{
    name: string;
    rowCount?: number;
    columns: string[];
  }>;
  candidatesFound: number;
  skippedModelGateManaged: number;
  warnings: string[];
  parser: "ccswitch-current-schema" | "heuristic";
};

export type CcSwitchScanResult = {
  path: string;
  candidates: CcSwitchImportCandidate[];
  skipped_modelgate_managed: number;
  warnings: string[];
  report: CcSwitchImportReport;
};

export type CcSwitchProviderLink = {
  url: string;
  provider: {
    name: string;
    app: string;
    endpoint: string;
    api_key: string;
    model: string;
    notes: string;
    enabled: boolean;
  };
};

function errorDetailFromJson(json: unknown): string | null {
  if (!json || typeof json !== "object") {
    return null;
  }

  const record = json as Record<string, unknown>;
  const nestedError = record.error;
  if (nestedError && typeof nestedError === "object") {
    const message = (nestedError as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  } else if (typeof nestedError === "string" && nestedError.trim()) {
    return nestedError.trim();
  }

  for (const key of ["message", "error_description"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  for (const key of ["errors", "issues", "details"] as const) {
    const value = record[key];
    if (Array.isArray(value) && value.length > 0) {
      return value
        .map((item) => typeof item === "string" ? item : JSON.stringify(item))
        .join(" ");
    }
  }

  try {
    return JSON.stringify(json);
  } catch {
    return null;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const detail = errorDetailFromJson(json) ?? text.trim();
    const message = detail
      ? `ModelGate returned HTTP ${response.status}: ${detail}`
      : `ModelGate returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

export function getBaseUrl() {
  return baseUrl;
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function unavailableServerProcessStatus(): ServerProcessStatus {
  return {
    endpoint: baseUrl,
    reachable: false,
    managed: false,
    canStop: false,
    running: false,
    mode: "unknown",
    status: "failed",
    message: "Server process control is only available in the desktop app."
  };
}

const envRefPattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeConfigObject(value: unknown): EditableConfig {
  const record = objectRecord(value);
  const server = objectRecord(record.server);

  return {
    server: {
      host: typeof server.host === "string" ? server.host : "127.0.0.1",
      port: typeof server.port === "number" ? server.port : Number(server.port ?? 11435)
    },
    active: typeof record.active === "string" ? record.active : "codex-main",
    entrypoints: Object.keys(objectRecord(record.entrypoints)).length > 0
      ? objectRecord(record.entrypoints) as EditableConfig["entrypoints"]
      : {},
    aliases: Object.keys(objectRecord(record.aliases)).length > 0
      ? objectRecord(record.aliases) as EditableConfig["aliases"]
      : {
        "codex-main": {
          provider: "mock",
          model: "mock-codex-model"
        }
      },
    providers: Object.keys(objectRecord(record.providers)).length > 0
      ? objectRecord(record.providers) as EditableConfig["providers"]
      : {
        mock: {
          type: "mock"
        }
      },
    pricing: objectRecord(record.pricing) as EditableConfig["pricing"]
  };
}

function collectEnvRefs(value: string) {
  return [...value.matchAll(envRefPattern)].map((match) => match[1]);
}

function missingEnvWarning(path: string, envName: string, provider?: string): ConfigWarning {
  return {
    type: "missing_env",
    provider,
    path,
    env: envName,
    envName,
    message: provider
      ? `Provider ${provider} requires environment variable ${envName}, but it is not set.`
      : `Environment variable ${envName} is not set.`
  };
}

function missingCredentialWarning(
  path: string,
  source: string,
  provider?: string,
  credentialId?: string,
  fallbackEnv?: string
): ConfigWarning {
  return {
    type: "missing_credential",
    provider,
    path,
    source,
    credential_id: credentialId,
    env: fallbackEnv,
    envName: fallbackEnv,
    message: provider
      ? `Provider ${provider} requires ${source} credential${fallbackEnv ? ` or environment variable ${fallbackEnv}` : ""}, but it is not available.`
      : `${source} credential is not available.`
  };
}

async function checkEnvironmentVariables(names: string[]) {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0 || !isTauriRuntime()) {
    return {} as Record<string, boolean>;
  }

  return invoke<Record<string, boolean>>("check_environment_variables", { names: unique });
}

async function collectOfflineConfigWarnings(config: EditableConfig) {
  const envNames: string[] = [];
  const pending: Array<() => ConfigWarning | null> = [];
  let envStatus: Record<string, boolean> = {};

  for (const [providerName, provider] of Object.entries(config.providers)) {
    if (provider.type !== "openai-compatible") {
      continue;
    }

    if (provider.auth?.type === "env") {
      const envName = provider.auth.env;
      envNames.push(envName);
      pending.push(() => envStatus[envName]
        ? null
        : missingEnvWarning(`providers.${providerName}.auth.env`, envName, providerName));
      continue;
    }

    if (provider.auth?.type === "static-header-ref") {
      if (provider.auth.value) {
        continue;
      }
      if (provider.auth.value_env) {
        const valueEnv = provider.auth.value_env;
        envNames.push(valueEnv);
        pending.push(() => envStatus[valueEnv]
          ? null
          : missingEnvWarning(`providers.${providerName}.auth.value_env`, valueEnv, providerName));
      } else {
        const valueRef = provider.auth.value_ref;
        pending.push(() => missingCredentialWarning(
          `providers.${providerName}.auth.value_ref`,
          "static-header-ref",
          providerName,
          valueRef
        ));
      }
      continue;
    }

    if (provider.auth?.type === "ccswitch") {
      const hasReference = Boolean(provider.auth.credential_ref || provider.auth.credential_path || provider.auth.provider_id);
      if (hasReference) {
        continue;
      }

      const fallbackEnv = provider.auth.fallback_env;
      const source = provider.auth.source;
      const credentialRef = provider.auth.credential_ref ?? provider.auth.provider_id;
      if (fallbackEnv) {
        envNames.push(fallbackEnv);
      }
      pending.push(() => fallbackEnv && envStatus[fallbackEnv]
        ? null
        : missingCredentialWarning(
          `providers.${providerName}.auth`,
          source,
          providerName,
          credentialRef,
          fallbackEnv
        ));
      continue;
    }

    if (provider.api_key) {
      for (const envName of collectEnvRefs(provider.api_key)) {
        envNames.push(envName);
        pending.push(() => envStatus[envName]
          ? null
          : missingEnvWarning(`providers.${providerName}.api_key`, envName, providerName));
      }
    }
  }

  envStatus = await checkEnvironmentVariables(envNames);
  return pending.map((create) => create()).filter(Boolean) as ConfigWarning[];
}

async function validateConfigOfflineLocal(config: EditableConfig): Promise<ConfigValidationResponse> {
  const errors: string[] = [];
  const providers = config.providers ?? {};
  const aliases = config.aliases ?? {};

  if (!config.active) {
    errors.push("active alias is required.");
  } else if (!aliases[config.active]) {
    errors.push(`Active alias "${config.active}" is not configured in aliases.`);
  }

  for (const [name, alias] of Object.entries(aliases)) {
    if (!alias.provider) {
      errors.push(`Alias "${name}" is missing provider.`);
    } else if (!providers[alias.provider]) {
      errors.push(`Alias "${name}" uses missing provider "${alias.provider}".`);
    }
    if (!alias.model) {
      errors.push(`Alias "${name}" is missing model.`);
    }
  }

  const configWarnings = await collectOfflineConfigWarnings(config);

  return {
    ok: errors.length === 0,
    errors,
    warnings: configWarnings.map((warning) => warning.message)
  };
}

export async function getHealth() {
  const response = await fetch(`${baseUrl}/health`);
  return parseJson<HealthResponse>(response);
}

export async function getStatus() {
  const response = await fetch(`${baseUrl}/admin/status`);
  return parseJson<StatusResponse>(response);
}

export async function getAliases() {
  const response = await fetch(`${baseUrl}/admin/aliases`);
  return parseJson<AliasesResponse>(response);
}

export async function switchAlias(active: string) {
  const response = await fetch(`${baseUrl}/admin/switch`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ active })
  });

  return parseJson<SwitchResponse>(response);
}

export async function reloadConfig() {
  const response = await fetch(`${baseUrl}/admin/reload`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: "{}"
  });

  return parseJson<SwitchResponse>(response);
}

export async function getAdminConfig() {
  const response = await fetch(`${baseUrl}/admin/config`);
  return parseJson<AdminConfigResponse>(response);
}

export async function validateAdminConfig(config: EditableConfig) {
  const response = await fetch(`${baseUrl}/admin/config/validate`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ config })
  });

  return parseJson<ConfigValidationResponse>(response);
}

export async function saveAdminConfig(config: EditableConfig) {
  const response = await fetch(`${baseUrl}/admin/config`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ config })
  });

  return parseJson<ConfigValidationResponse>(response);
}

export async function getModelGateConfigPath() {
  if (!isTauriRuntime()) {
    throw new Error("Offline config access is only available in the desktop app.");
  }

  return invoke<string>("get_modelgate_config_path");
}

export async function readModelGateConfig() {
  if (!isTauriRuntime()) {
    throw new Error("Offline config access is only available in the desktop app.");
  }

  const result = await invoke<OfflineConfigTextResponse>("read_modelgate_config");
  const parsed = YAML.parse(result.raw) ?? {};
  const config = normalizeConfigObject(parsed);
  return {
    path: result.path,
    config,
    config_warnings: await collectOfflineConfigWarnings(config)
  } satisfies OfflineConfigResponse;
}

export async function writeModelGateConfig(config: EditableConfig) {
  if (!isTauriRuntime()) {
    throw new Error("Offline config access is only available in the desktop app.");
  }

  const validation = await validateConfigOfflineLocal(config);
  if (!validation.ok) {
    return validation;
  }

  const response = await invoke<ConfigValidationResponse>("write_modelgate_config", {
    raw: YAML.stringify(config, {
      indent: 2,
      lineWidth: 0
    })
  });

  return {
    ...response,
    warnings: validation.warnings
  };
}

export async function validateModelGateConfigOffline(config: EditableConfig) {
  if (!isTauriRuntime()) {
    throw new Error("Offline config access is only available in the desktop app.");
  }

  return validateConfigOfflineLocal(config);
}

export async function getRequestLogs(limit = 50) {
  const response = await fetch(`${baseUrl}/admin/logs?limit=${encodeURIComponent(String(limit))}`);
  return parseJson<{ logs: RequestLogEntry[] }>(response);
}

export async function clearRequestLogs() {
  const response = await fetch(`${baseUrl}/admin/logs`, {
    method: "DELETE"
  });
  return parseJson<{ ok: boolean }>(response);
}

export async function getRequestStats() {
  const response = await fetch(`${baseUrl}/admin/stats`);
  return parseJson<RequestStats>(response);
}

export async function getUsageSummary(range: UsageRange = "today") {
  const response = await fetch(`${baseUrl}/admin/usage/summary?range=${encodeURIComponent(range)}`);
  return parseJson<UsageSummary>(response);
}

export async function getUsageTimeline(range: Exclude<UsageRange, "all"> = "today", bucket: "hour" | "day" = "hour") {
  const params = new URLSearchParams({
    range,
    bucket
  });
  const response = await fetch(`${baseUrl}/admin/usage/timeline?${params.toString()}`);
  return parseJson<UsageTimeline>(response);
}

export async function getUsageRecords(params: {
  range?: UsageRange;
  limit?: number;
  provider?: string;
  model?: string;
} = {}) {
  const search = new URLSearchParams({
    range: params.range ?? "all",
    limit: String(params.limit ?? 10)
  });
  if (params.provider) {
    search.set("provider", params.provider);
  }
  if (params.model) {
    search.set("model", params.model);
  }
  const response = await fetch(`${baseUrl}/admin/usage/records?${search.toString()}`);
  return parseJson<{ records: UsageRecord[] }>(response);
}

export async function getProviderPresets() {
  const response = await fetch(`${baseUrl}/admin/provider-presets`);
  return parseJson<{ presets: ProviderPreset[] }>(response);
}

export async function getCcSwitchLink(app = "codex") {
  const response = await fetch(`${baseUrl}/admin/ccswitch-link?app=${encodeURIComponent(app)}`);
  return parseJson<CcSwitchProviderLink>(response);
}

export async function testProvider(provider: string, model?: string, stream = false, apiType: "chat_completions" | "responses" = "chat_completions") {
  const response = await fetch(`${baseUrl}/admin/test/provider`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ provider, model, stream, api_type: apiType })
  });

  return parseJson<DiagnosticResult>(response);
}

export async function testAlias(alias: string, stream = false, apiType: "chat_completions" | "responses" = "chat_completions") {
  const response = await fetch(`${baseUrl}/admin/test/alias`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ alias, stream, api_type: apiType })
  });

  return parseJson<DiagnosticResult>(response);
}

export async function testActive(stream = false, apiType: "chat_completions" | "responses" = "chat_completions") {
  const response = await fetch(`${baseUrl}/admin/test/active`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ stream, api_type: apiType })
  });

  return parseJson<DiagnosticResult>(response);
}

export async function detectCcSwitchDatabase() {
  if (!isTauriRuntime()) {
    return {
      found: false,
      message: "CC Switch import is only available in the desktop app."
    } satisfies CcSwitchDatabaseDetection;
  }

  return invoke<CcSwitchDatabaseDetection>("detect_ccswitch_database");
}

export async function scanCcSwitchDatabase(showManaged = false) {
  if (!isTauriRuntime()) {
    throw new Error("CC Switch import is only available in the desktop app.");
  }

  return invoke<CcSwitchScanResult>("scan_ccswitch_database", { showManaged });
}

export async function selectAndScanCcSwitchDatabase(showManaged = false) {
  if (!isTauriRuntime()) {
    throw new Error("CC Switch import is only available in the desktop app.");
  }

  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "SQLite database",
        extensions: ["db", "sqlite", "sqlite3"]
      }
    ]
  });

  if (!selected || Array.isArray(selected)) {
    return null;
  }

  return invoke<CcSwitchScanResult>("scan_selected_ccswitch_database", {
    path: selected,
    showManaged
  });
}

export async function openCcSwitchDeepLink(url: string) {
  if (!isTauriRuntime()) {
    throw new Error("Opening CC Switch is only available in the desktop app.");
  }

  return invoke<string>("open_ccswitch_deep_link", { url });
}

export async function getServerProcessStatus() {
  if (!isTauriRuntime()) {
    return unavailableServerProcessStatus();
  }

  return invoke<ServerProcessStatus>("get_server_process_status");
}

export async function startServerProcess() {
  if (!isTauriRuntime()) {
    throw new Error("Server process control is only available in the desktop app.");
  }

  return invoke<ServerProcessStatus>("start_server_process");
}

export async function stopServerProcess() {
  if (!isTauriRuntime()) {
    throw new Error("Server process control is only available in the desktop app.");
  }

  return invoke<ServerProcessStatus>("stop_server_process");
}

export async function restartServerProcess() {
  if (!isTauriRuntime()) {
    throw new Error("Server process control is only available in the desktop app.");
  }

  return invoke<ServerProcessStatus>("restart_server_process");
}
