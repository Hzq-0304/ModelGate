export type AdminStatus = {
  name: string;
  active: string;
  entrypoints: Record<string, {
    use: string;
    resolved: string;
  }>;
};

export type AdminAliases = {
  active: string;
  aliases: Array<{
    name: string;
    provider: string;
    model: string;
  }>;
};

type SwitchResult = {
  ok: boolean;
  active: string;
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

export type UsageRange = "10m" | "30m" | "1h" | "12h" | "1d" | "today" | "24h" | "7d" | "all";
export type UsageGroupBy = "alias" | "provider" | "model";

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
  original_cost_usd?: number;
  actual_cost_usd?: number;
  estimated_cost_usd?: number;
  cost_ratio?: number;
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
  original_cost_usd?: number;
  actual_cost_usd?: number;
  estimated_cost_usd?: number;
  cost_available: boolean;
};

export type UsageGroupSummary = {
  key: string;
  label: string;
  alias?: string;
  provider?: string;
  model?: string;
  requests: number;
  success: number;
  failed: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  original_cost_usd?: number;
  actual_cost_usd?: number;
  estimated_cost_usd?: number;
  cost_available: boolean;
};

export type UsageGroupedSummary = {
  range: UsageRange;
  kind: "normal" | "diagnostic" | "all";
  group_by: UsageGroupBy;
  groups: UsageGroupSummary[];
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

type ErrorResponse = {
  error?: {
    message?: string;
  };
};

const defaultBaseUrl = "http://127.0.0.1:11435";

function getBaseUrl() {
  return (process.env.MODEL_GATE_URL ?? process.env.MODELGATE_URL ?? defaultBaseUrl).replace(/\/+$/, "");
}

async function parseResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null) as ErrorResponse | T | null;

  if (!response.ok) {
    const message = json && typeof json === "object" && "error" in json && json.error?.message
      ? json.error.message
      : `ModelGate returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

export async function getStatus() {
  const response = await fetch(`${getBaseUrl()}/admin/status`);
  return parseResponse<AdminStatus>(response);
}

export async function getAliases() {
  const response = await fetch(`${getBaseUrl()}/admin/aliases`);
  return parseResponse<AdminAliases>(response);
}

export async function switchAlias(active: string) {
  const response = await fetch(`${getBaseUrl()}/admin/switch`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ active })
  });

  return parseResponse<SwitchResult>(response);
}

export async function reloadConfig() {
  const response = await fetch(`${getBaseUrl()}/admin/reload`, {
    method: "POST"
  });

  return parseResponse<SwitchResult>(response);
}

export async function getLogs(limit = 50) {
  const response = await fetch(`${getBaseUrl()}/admin/logs?limit=${encodeURIComponent(String(limit))}`);
  return parseResponse<{ logs: RequestLogEntry[] }>(response);
}

export async function clearLogs() {
  const response = await fetch(`${getBaseUrl()}/admin/logs`, {
    method: "DELETE"
  });
  return parseResponse<{ ok: boolean }>(response);
}

export async function getStats() {
  const response = await fetch(`${getBaseUrl()}/admin/stats`);
  return parseResponse<RequestStats>(response);
}

export async function getUsageSummary(range: UsageRange = "today") {
  const response = await fetch(`${getBaseUrl()}/admin/usage/summary?range=${encodeURIComponent(range)}`);
  return parseResponse<UsageSummary>(response);
}

export async function getUsageGroups(range: UsageRange = "today", groupBy: UsageGroupBy = "alias") {
  const params = new URLSearchParams({
    range,
    group_by: groupBy
  });
  const response = await fetch(`${getBaseUrl()}/admin/usage/groups?${params.toString()}`);
  return parseResponse<UsageGroupedSummary>(response);
}

export async function getUsageRecords(range: UsageRange = "all", limit = 50) {
  const params = new URLSearchParams({
    range,
    limit: String(limit)
  });
  const response = await fetch(`${getBaseUrl()}/admin/usage/records?${params.toString()}`);
  return parseResponse<{ records: UsageRecord[] }>(response);
}

export async function getProviderPresets() {
  const response = await fetch(`${getBaseUrl()}/admin/provider-presets`);
  return parseResponse<{ presets: ProviderPreset[] }>(response);
}

export async function getCcSwitchLink(app = "codex") {
  const response = await fetch(`${getBaseUrl()}/admin/ccswitch-link?app=${encodeURIComponent(app)}`);
  return parseResponse<CcSwitchProviderLink>(response);
}

export async function testProvider(provider: string, model?: string, stream = false, apiType: "chat_completions" | "responses" = "chat_completions") {
  const response = await fetch(`${getBaseUrl()}/admin/test/provider`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ provider, model, stream, api_type: apiType })
  });

  return parseResponse<DiagnosticResult>(response);
}

export async function testAlias(alias: string, stream = false, apiType: "chat_completions" | "responses" = "chat_completions") {
  const response = await fetch(`${getBaseUrl()}/admin/test/alias`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ alias, stream, api_type: apiType })
  });

  return parseResponse<DiagnosticResult>(response);
}

export async function testActive(stream = false, apiType: "chat_completions" | "responses" = "chat_completions") {
  const response = await fetch(`${getBaseUrl()}/admin/test/active`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ stream, api_type: apiType })
  });

  return parseResponse<DiagnosticResult>(response);
}
