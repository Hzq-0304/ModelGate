import { readConfigObject } from "../config/configManager.js";
import type { ProviderConfig } from "../config/schema.js";
import type { RuntimeState } from "./state.js";

const diagnosticPrompt = "Reply with exactly: OK";
const envOnlyPattern = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const timeoutMs = 30_000;
const maxSummaryLength = 300;

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

type ResolvedDiagnosticTarget = {
  target: "provider" | "alias" | "active";
  providerName: string;
  aliasName?: string;
  model: string;
  provider: ProviderConfig;
  checks: DiagnosticCheck[];
};

function truncate(value: string, maxLength = maxSummaryLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function redact(value: string, secrets: Array<string | undefined>) {
  return secrets
    .filter((secret): secret is string => typeof secret === "string" && secret.length >= 4)
    .reduce((current, secret) => current.split(secret).join("[redacted]"), value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function rawProviderApiKey(runtime: RuntimeState, providerName: string) {
  const rawConfig = readConfigObject(runtime.configPath);

  if (!rawConfig || typeof rawConfig !== "object" || !("providers" in rawConfig)) {
    return undefined;
  }

  const providers = (rawConfig as { providers?: Record<string, unknown> }).providers;
  const provider = providers?.[providerName];

  if (!provider || typeof provider !== "object" || !("api_key" in provider)) {
    return undefined;
  }

  return (provider as { api_key?: unknown }).api_key;
}

function apiKeyCheck(runtime: RuntimeState, providerName: string, provider: ProviderConfig) {
  if (provider.type === "mock") {
    return {
      check: {
        name: "env_api_key",
        ok: true,
        message: "Mock provider does not require an API key."
      } satisfies DiagnosticCheck,
      apiKey: undefined,
      envName: undefined
    };
  }

  const rawKey = rawProviderApiKey(runtime, providerName);
  if (typeof rawKey === "string") {
    const match = rawKey.match(envOnlyPattern);
    if (match) {
      const envName = match[1];
      const value = process.env[envName];
      return value === undefined
        ? {
          check: {
            name: "env_api_key",
            ok: false,
            message: `Environment variable ${envName} is not set.`
          } satisfies DiagnosticCheck,
          apiKey: undefined,
          envName
        }
        : {
          check: {
            name: "env_api_key",
            ok: true,
            message: `${envName} is set.`
          } satisfies DiagnosticCheck,
          apiKey: value,
          envName
        };
    }

    if (rawKey === "***") {
      return {
        check: {
          name: "env_api_key",
          ok: false,
          message: "Provider API key is masked and cannot be used for diagnostics. Save it as an environment variable reference."
        } satisfies DiagnosticCheck,
        apiKey: undefined,
        envName: undefined
      };
    }
  }

  return provider.api_key === "***"
    ? {
      check: {
        name: "env_api_key",
        ok: false,
        message: "Provider API key is masked and cannot be used for diagnostics. Save it as an environment variable reference."
      } satisfies DiagnosticCheck,
      apiKey: undefined,
      envName: undefined
    }
    : {
      check: {
        name: "env_api_key",
        ok: true,
        message: "Provider API key is configured."
      } satisfies DiagnosticCheck,
      apiKey: provider.api_key,
      envName: undefined
    };
}

function validBaseUrlCheck(provider: ProviderConfig): DiagnosticCheck {
  if (provider.type === "mock") {
    return {
      name: "base_url",
      ok: true,
      message: "Mock provider does not require a base URL."
    };
  }

  try {
    new URL(provider.base_url);
    return {
      name: "base_url",
      ok: true,
      message: "Base URL is valid."
    };
  } catch {
    return {
      name: "base_url",
      ok: false,
      message: "Base URL is not a valid URL."
    };
  }
}

function createFailureResult(target: ResolvedDiagnosticTarget, stream: boolean, startedMs: number, checks: DiagnosticCheck[], error: string): DiagnosticResult {
  return {
    ok: false,
    target: target.target,
    provider: target.providerName,
    alias: target.aliasName,
    model: target.model,
    stream,
    duration_ms: Date.now() - startedMs,
    checks,
    error_message: truncate(error)
  };
}

async function upstreamErrorSummary(response: Response, apiKey?: string) {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = contentType.includes("application/json")
    ? JSON.stringify(await response.json().catch(() => null))
    : await response.text().catch(() => "");
  const summary = raw && raw !== "null"
    ? raw
    : `Upstream returned HTTP ${response.status} ${response.statusText}`.trim();

  return truncate(redact(summary, [apiKey]));
}

async function runOpenAICompatibleTest(
  target: ResolvedDiagnosticTarget,
  apiKey: string,
  stream: boolean,
  startedMs: number,
  checks: DiagnosticCheck[]
): Promise<DiagnosticResult> {
  if (target.provider.type !== "openai-compatible") {
    throw new Error("Provider is not openai-compatible");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const baseUrl = target.provider.base_url.replace(/\/+$/, "");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: target.model,
        messages: [
          {
            role: "user",
            content: diagnosticPrompt
          }
        ],
        max_tokens: 8,
        stream
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const summary = await upstreamErrorSummary(response, apiKey);
      const message = `Upstream returned HTTP ${response.status} ${response.statusText}. ${summary}`.trim();
      const nextChecks = [
        ...checks,
        {
          name: "chat_completion",
          ok: false,
          message: truncate(message)
        }
      ];

      return {
        ok: false,
        target: target.target,
        provider: target.providerName,
        alias: target.aliasName,
        model: target.model,
        stream,
        duration_ms: Date.now() - startedMs,
        status_code: response.status,
        checks: nextChecks,
        error_message: truncate(message)
      };
    }

    if (stream) {
      const reader = response.body?.getReader();
      if (!reader) {
        const message = "Upstream stream response did not include a readable body.";
        return {
          ok: false,
          target: target.target,
          provider: target.providerName,
          alias: target.aliasName,
          model: target.model,
          stream,
          duration_ms: Date.now() - startedMs,
          status_code: response.status,
          checks: [
            ...checks,
            {
              name: "chat_completion",
              ok: false,
              message
            }
          ],
          error_message: message
        };
      }

      const chunk = await reader.read();
      await reader.cancel().catch(() => undefined);

      if (chunk.done || !chunk.value || chunk.value.length === 0) {
        const message = "Upstream stream ended before sending data.";
        return {
          ok: false,
          target: target.target,
          provider: target.providerName,
          alias: target.aliasName,
          model: target.model,
          stream,
          duration_ms: Date.now() - startedMs,
          status_code: response.status,
          checks: [
            ...checks,
            {
              name: "chat_completion",
              ok: false,
              message
            }
          ],
          error_message: message
        };
      }
    } else {
      await response.text().catch(() => "");
    }

    return {
      ok: true,
      target: target.target,
      provider: target.providerName,
      alias: target.aliasName,
      model: target.model,
      stream,
      duration_ms: Date.now() - startedMs,
      status_code: response.status,
      checks: [
        ...checks,
        {
          name: "chat_completion",
          ok: true,
          message: stream ? "Received stream data." : "Received a successful chat completion response."
        }
      ],
      message: stream ? "Stream diagnostic passed." : "Provider test passed."
    };
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? `Diagnostic timed out after ${timeoutMs / 1000}s.`
      : `Failed to reach upstream provider: ${getErrorMessage(error)}`;
    const summary = truncate(redact(message, [apiKey]));

    return {
      ok: false,
      target: target.target,
      provider: target.providerName,
      alias: target.aliasName,
      model: target.model,
      stream,
      duration_ms: Date.now() - startedMs,
      status_code: 502,
      checks: [
        ...checks,
        {
          name: "chat_completion",
          ok: false,
          message: summary
        }
      ],
      error_message: summary
    };
  } finally {
    clearTimeout(timeout);
  }
}

function findFirstModelForProvider(runtime: RuntimeState, providerName: string) {
  return Object.values(runtime.config.aliases).find((alias) => alias.provider === providerName)?.model;
}

function resolveProviderTarget(runtime: RuntimeState, providerName: string, model?: string): ResolvedDiagnosticTarget | DiagnosticResult {
  const startedMs = Date.now();
  const provider = runtime.config.providers[providerName];
  const checks: DiagnosticCheck[] = [
    {
      name: "provider_exists",
      ok: Boolean(provider),
      message: provider ? `Provider ${providerName} exists.` : `Provider ${providerName} is not configured.`
    }
  ];

  if (!provider) {
    return {
      ok: false,
      target: "provider",
      provider: providerName,
      model,
      stream: false,
      duration_ms: Date.now() - startedMs,
      checks,
      error_message: `Provider ${providerName} is not configured.`
    };
  }

  const resolvedModel = model ?? findFirstModelForProvider(runtime, providerName);
  checks.push({
    name: "model_resolved",
    ok: Boolean(resolvedModel),
    message: resolvedModel ? `Using model ${resolvedModel}.` : "No model was provided and no alias uses this provider."
  });

  if (!resolvedModel) {
    return {
      ok: false,
      target: "provider",
      provider: providerName,
      stream: false,
      duration_ms: Date.now() - startedMs,
      checks,
      error_message: "A model is required to test this provider."
    };
  }

  return {
    target: "provider",
    providerName,
    model: resolvedModel,
    provider,
    checks
  };
}

function resolveAliasTarget(runtime: RuntimeState, aliasName: string, target: "alias" | "active"): ResolvedDiagnosticTarget | DiagnosticResult {
  const startedMs = Date.now();
  const alias = runtime.config.aliases[aliasName];
  const checks: DiagnosticCheck[] = [
    {
      name: "alias_exists",
      ok: Boolean(alias),
      message: alias ? `Alias ${aliasName} exists.` : `Alias ${aliasName} is not configured.`
    }
  ];

  if (!alias) {
    return {
      ok: false,
      target,
      alias: aliasName,
      stream: false,
      duration_ms: Date.now() - startedMs,
      checks,
      error_message: `Alias ${aliasName} is not configured.`
    };
  }

  const provider = runtime.config.providers[alias.provider];
  checks.push({
    name: "provider_exists",
    ok: Boolean(provider),
    message: provider ? `Provider ${alias.provider} exists.` : `Provider ${alias.provider} is not configured.`
  });

  if (!provider) {
    return {
      ok: false,
      target,
      provider: alias.provider,
      alias: aliasName,
      model: alias.model,
      stream: false,
      duration_ms: Date.now() - startedMs,
      checks,
      error_message: `Provider ${alias.provider} is not configured.`
    };
  }

  return {
    target,
    providerName: alias.provider,
    aliasName,
    model: alias.model,
    provider,
    checks
  };
}

async function runDiagnostic(runtime: RuntimeState, target: ResolvedDiagnosticTarget, stream: boolean, startedMs: number): Promise<DiagnosticResult> {
  const baseUrl = validBaseUrlCheck(target.provider);
  const apiKey = apiKeyCheck(runtime, target.providerName, target.provider);
  const checks = [...target.checks, baseUrl, apiKey.check];

  if (!baseUrl.ok) {
    return createFailureResult(target, stream, startedMs, checks, baseUrl.message ?? "Base URL is invalid.");
  }

  if (!apiKey.check.ok) {
    return createFailureResult(target, stream, startedMs, checks, apiKey.check.message ?? "API key is not available.");
  }

  if (target.provider.type === "mock") {
    return {
      ok: true,
      target: target.target,
      provider: target.providerName,
      alias: target.aliasName,
      model: target.model,
      stream,
      duration_ms: Date.now() - startedMs,
      status_code: 200,
      checks: [
        ...checks,
        {
          name: "chat_completion",
          ok: true,
          message: stream ? "Mock stream diagnostic passed." : "Mock provider test passed."
        }
      ],
      message: "Mock provider test passed."
    };
  }

  return runOpenAICompatibleTest(target, apiKey.apiKey ?? target.provider.api_key, stream, startedMs, checks);
}

export async function testProvider(runtime: RuntimeState, providerName: string, model?: string, stream = false) {
  const startedMs = Date.now();
  const target = resolveProviderTarget(runtime, providerName, model);
  if ("ok" in target) {
    return {
      ...target,
      stream
    };
  }

  return runDiagnostic(runtime, target, stream, startedMs);
}

export async function testAlias(runtime: RuntimeState, aliasName: string, stream = false) {
  const startedMs = Date.now();
  const target = resolveAliasTarget(runtime, aliasName, "alias");
  if ("ok" in target) {
    return {
      ...target,
      stream
    };
  }

  return runDiagnostic(runtime, target, stream, startedMs);
}

export async function testActiveAlias(runtime: RuntimeState, stream = false) {
  const startedMs = Date.now();
  const target = resolveAliasTarget(runtime, runtime.activeAlias, "active");
  if ("ok" in target) {
    return {
      ...target,
      stream
    };
  }

  return runDiagnostic(runtime, target, stream, startedMs);
}

export function addDiagnosticLog(runtime: RuntimeState, result: DiagnosticResult) {
  runtime.requestLogs.addRequestLog({
    id: crypto.randomUUID(),
    kind: "diagnostic",
    started_at: new Date(Date.now() - result.duration_ms).toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: result.duration_ms,
    method: "POST",
    path: "/v1/chat/completions",
    requested_model: result.alias ?? result.model,
    resolved_alias: result.alias,
    provider: result.provider,
    upstream_model: result.model,
    stream: result.stream,
    status_code: result.status_code,
    ok: result.ok,
    error_type: result.ok ? undefined : "diagnostic_error",
    error_message: result.error_message,
    prompt_preview: diagnosticPrompt,
    prompt_chars: diagnosticPrompt.length
  });
}
