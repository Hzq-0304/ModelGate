import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const baseUrl = "http://127.0.0.1:11435";

export type HealthResponse = {
  ok: boolean;
  name: string;
};

export type StatusResponse = {
  name: string;
  active: string;
  entrypoints: Record<string, {
    use: string;
    resolved: string;
  }>;
};

export type AliasesResponse = {
  active: string;
  aliases: Array<{
    name: string;
    provider: string;
    model: string;
  }>;
};

type SwitchResponse = {
  ok: boolean;
  active: string;
};

export type ServerProcessStatus = {
  endpoint: string;
  reachable: boolean;
  managed: boolean;
  running: boolean;
  pid?: number;
  mode: "external" | "managed" | "stopped" | "unknown";
  message?: string;
};

export type ProviderConfig =
  | {
    type: "mock";
  }
  | {
    type: "openai-compatible";
    base_url: string;
    api_key: string;
    api_key_resolved?: boolean;
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
  }>;
  providers: Record<string, ProviderConfig>;
};

export type AdminConfigResponse = {
  path: string;
  config: EditableConfig;
};

export type ConfigValidationResponse = {
  ok: boolean;
  errors?: string[];
  warnings: string[];
  active?: string;
};

export type RequestLogEntry = {
  id: string;
  kind?: "normal" | "diagnostic";
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
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
  source_table?: string;
  source_id?: string;
  name: string;
  provider_name: string;
  provider_type: "openai-compatible" | "unknown";
  base_url?: string;
  api_key_env?: string;
  api_key_detected: boolean;
  api_key_preview?: string;
  model?: string;
  models: string[];
  suggested_modelgate_provider: string;
  suggested_modelgate_alias: string;
  suggested_env_name: string;
  complete: boolean;
  warnings: string[];
};

export type CcSwitchScanResult = {
  path: string;
  candidates: CcSwitchImportCandidate[];
  warnings: string[];
};

type ErrorResponse = {
  error?: {
    message?: string;
  };
};

async function parseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null) as T | ErrorResponse | null;

  if (!response.ok) {
    const message = json && typeof json === "object" && "error" in json && json.error?.message
      ? json.error.message
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
    running: false,
    mode: "unknown",
    message: "Server process control is only available in the desktop app."
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

export async function getProviderPresets() {
  const response = await fetch(`${baseUrl}/admin/provider-presets`);
  return parseJson<{ presets: ProviderPreset[] }>(response);
}

export async function testProvider(provider: string, model?: string, stream = false) {
  const response = await fetch(`${baseUrl}/admin/test/provider`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ provider, model, stream })
  });

  return parseJson<DiagnosticResult>(response);
}

export async function testAlias(alias: string, stream = false) {
  const response = await fetch(`${baseUrl}/admin/test/alias`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ alias, stream })
  });

  return parseJson<DiagnosticResult>(response);
}

export async function testActive(stream = false) {
  const response = await fetch(`${baseUrl}/admin/test/active`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ stream })
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

export async function scanCcSwitchDatabase() {
  if (!isTauriRuntime()) {
    throw new Error("CC Switch import is only available in the desktop app.");
  }

  return invoke<CcSwitchScanResult>("scan_ccswitch_database");
}

export async function selectAndScanCcSwitchDatabase() {
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
    path: selected
  });
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
