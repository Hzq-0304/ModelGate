import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  getDisplayConfigPath,
  getConfigWarnings,
  readConfigObject,
  sanitizeConfigForAdmin,
  validateConfigObject,
  writeConfigObject
} from "../config/configManager.js";
import { providerPresets } from "../config/providerPresets.js";
import { createCcSwitchProviderLink, isCcSwitchApp } from "../integrations/ccswitchLink.js";
import { createOpenAICompatibleError } from "../providers/openaiCompatible.js";
import { RatioSourceError, type RatioBinding, type RatioSourceAuth, type RatioSourceType } from "../ratio-sources/types.js";
import { addDiagnosticLog, testActiveAlias, testAlias, testProvider } from "../runtime/diagnostics.js";
import type { RuntimeState } from "../runtime/state.js";
import type { UsageGroupBy, UsageKindFilter, UsageRange, UsageTimelineBucket } from "../runtime/usageStore.js";

type SwitchBody = {
  active?: string;
};

type RoutingBody = {
  enabled?: boolean;
};

type ConfigBody = {
  config?: unknown;
};

type RatioSourceBody = {
  id?: string;
  name?: string;
  baseUrl?: string;
  base_url?: string;
  type?: RatioSourceType;
  enabled?: boolean;
  refreshIntervalMinutes?: number;
  refresh_interval_minutes?: number;
  auth?: RatioSourceAuth;
};

type RatioCredentialBody = {
  baseUrl?: string;
  base_url?: string;
  tokenEnv?: string;
  token_env?: string;
  mode?: "cookie" | "password";
  cookie?: string;
  email?: string;
  password?: string;
};

type RatioSourceParams = {
  id: string;
};

type RatioBindingsBody = {
  bindings?: Record<string, {
    sourceId?: string;
    source_id?: string;
    groupId?: string;
    group_id?: string;
  } | null>;
};

type LogsQuery = {
  limit?: string;
};

type UsageSummaryQuery = {
  range?: string;
  kind?: string;
};

type UsageTimelineQuery = {
  range?: string;
  bucket?: string;
};

type UsageGroupsQuery = {
  range?: string;
  kind?: string;
  group_by?: string;
  alias?: string;
  provider?: string;
  model?: string;
};

type UsageRecordsQuery = {
  limit?: string;
  range?: string;
  kind?: string;
  alias?: string;
  provider?: string;
  model?: string;
};

const ratioCredentialEnvPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizeRatioCredentialBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RatioSourceError("unsupported_site", "Ratio source URL must use http or https.");
  }
  return url.toString().replace(/\/+$/, "");
}

function tokenFromCookieLike(value: string) {
  const trimmed = value.trim();
  const bearer = trimmed.match(/authorization\s*:\s*bearer\s+([A-Za-z0-9._-]+)/i)
    ?? trimmed.match(/bearer\s+([A-Za-z0-9._-]+)/i);
  if (bearer?.[1]) {
    return bearer[1];
  }

  for (const name of ["auth_token", "access_token", "token"]) {
    const match = trimmed.match(new RegExp(`(?:^|[;\\s])${name}=([^;\\s]+)`, "i"));
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  const jwt = trimmed.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return jwt?.[0] ?? "";
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function authTokenFromLoginResponse(json: unknown) {
  const root = jsonRecord(json);
  const data = jsonRecord(root.data);
  return stringField(root, "access_token")
    || stringField(root, "auth_token")
    || stringField(root, "token")
    || stringField(data, "access_token")
    || stringField(data, "auth_token")
    || stringField(data, "token");
}

async function loginSub2ApiCredential(baseUrl: string, email: string, password: string) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new RatioSourceError("authentication_failed", "Sub2API login rejected the supplied account credential.", response.status);
  }

  const root = jsonRecord(json);
  const data = jsonRecord(root.data);
  if (root.requires_2fa === true || data.requires_2fa === true) {
    throw new RatioSourceError("authentication_required", "Sub2API login requires two-factor authentication. Paste a browser login token instead.");
  }

  const token = authTokenFromLoginResponse(json);
  if (!token) {
    throw new RatioSourceError("invalid_response", "Sub2API login did not return an access token.");
  }
  return token;
}

async function resolveRatioCredential(body: RatioCredentialBody) {
  const baseUrl = normalizeRatioCredentialBaseUrl(String(body.baseUrl ?? body.base_url ?? ""));
  const tokenEnv = String(body.tokenEnv ?? body.token_env ?? "").trim();
  if (!ratioCredentialEnvPattern.test(tokenEnv)) {
    throw new RatioSourceError("authentication_required", "Ratio credential requires a valid environment variable name.");
  }

  let token = "";
  if (body.mode === "password") {
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    if (!email || !password) {
      throw new RatioSourceError("authentication_required", "Sub2API account and password are required.");
    }
    token = await loginSub2ApiCredential(baseUrl, email, password);
  } else {
    token = tokenFromCookieLike(body.cookie ?? "");
    if (!token) {
      throw new RatioSourceError("authentication_required", "Paste auth_token, a Bearer token, or a cookie containing auth_token.");
    }
  }

  process.env[tokenEnv] = token;
  return { tokenEnv };
}

type CcSwitchLinkQuery = {
  app?: string;
};

type TestProviderBody = {
  provider?: string;
  model?: string;
  stream?: boolean;
  api_type?: "chat_completions" | "responses";
};

type TestAliasBody = {
  alias?: string;
  stream?: boolean;
  api_type?: "chat_completions" | "responses";
};

type TestActiveBody = {
  stream?: boolean;
  api_type?: "chat_completions" | "responses";
};

function isLocalAddress(address?: string) {
  if (!address) {
    return false;
  }

  return ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"].includes(address);
}

function isLocalRequest(request: FastifyRequest) {
  return isLocalAddress(request.ip) || isLocalAddress(request.socket.remoteAddress);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function ratioAdminError(error: unknown) {
  const code = error instanceof RatioSourceError ? error.code : "invalid_response";
  const status = error instanceof RatioSourceError && error.statusCode
    ? error.statusCode
    : code === "endpoint_not_found"
      ? 404
      : code === "authentication_required" || code === "authentication_failed"
        ? 401
        : 400;
  return {
    status,
    body: {
      ok: false,
      error: {
        type: code,
        message: getErrorMessage(error)
      }
    }
  };
}

function normalizeRatioSourceBody(body: RatioSourceBody) {
  return {
    id: body.id,
    name: body.name,
    baseUrl: body.baseUrl ?? body.base_url,
    type: body.type,
    enabled: body.enabled,
    refreshIntervalMinutes: body.refreshIntervalMinutes ?? body.refresh_interval_minutes,
    auth: body.auth
  };
}

function normalizeBinding(value: NonNullable<RatioBindingsBody["bindings"]>[string]): RatioBinding | null {
  if (!value) {
    return null;
  }
  const sourceId = value.sourceId ?? value.source_id;
  const groupId = value.groupId ?? value.group_id;
  return sourceId && groupId ? { sourceId, groupId } : null;
}

function usageRange(value: string | undefined, fallback: UsageRange): UsageRange {
  return value === "10m"
    || value === "30m"
    || value === "1h"
    || value === "12h"
    || value === "1d"
    || value === "today"
    || value === "24h"
    || value === "7d"
    || value === "all"
    ? value
    : fallback;
}

function usageKind(value: string | undefined): UsageKindFilter {
  return value === "normal" || value === "diagnostic" || value === "all" ? value : "all";
}

function usageGroupBy(value: string | undefined): UsageGroupBy {
  return value === "provider" || value === "model" || value === "alias" ? value : "alias";
}

function timelineRange(value: string | undefined): Exclude<UsageRange, "all"> {
  const range = usageRange(value, "today");
  return range === "all" ? "today" : range;
}

function timelineBucket(value: string | undefined): UsageTimelineBucket {
  return value === "day" || value === "hour" ? value : "hour";
}

export async function registerAdminRouter(server: FastifyInstance, runtime: RuntimeState) {
  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/admin/")) {
      return;
    }

    if (!isLocalRequest(request)) {
      return reply
        .status(403)
        .send(createOpenAICompatibleError("Admin API only accepts local requests", "forbidden"));
    }
  });

  server.get("/admin/status", async () => ({
    name: "ModelGate",
    active: runtime.activeAlias,
    routing_enabled: runtime.routingEnabled,
    entrypoints: runtime.resolveEntrypoints(),
    config_warnings: getConfigWarnings(runtime.config)
  }));

  server.get("/admin/routing", async () => ({
    enabled: runtime.routingEnabled
  }));

  server.post<{ Body: RoutingBody }>("/admin/routing", async (request) => {
    const enabled = Boolean(request.body?.enabled);
    runtime.setRoutingEnabled(enabled);
    return { ok: true, enabled };
  });

  server.get("/admin/aliases", async () => ({
    active: runtime.activeAlias,
    aliases: Object.entries(runtime.config.aliases).map(([name, alias]) => ({
      name,
      provider: alias.provider,
      model: alias.model,
      description: alias.description
    }))
  }));

  server.get("/admin/provider-presets", async () => ({
    presets: providerPresets
  }));

  server.get("/admin/ratio-sources", async () => ({
    sources: runtime.ratioSources.listSources(),
    cache: runtime.ratioSources.getCacheEntries(),
    paths: runtime.ratioSources.store.paths
  }));

  server.post<{ Body: RatioCredentialBody }>("/admin/ratio-sources/credential", async (request, reply) => {
    try {
      const credential = await resolveRatioCredential(request.body ?? {});
      return {
        ok: true,
        tokenEnv: credential.tokenEnv
      };
    } catch (error) {
      const normalized = ratioAdminError(error);
      return reply.status(normalized.status).send(normalized.body);
    }
  });

  server.post<{ Body: RatioSourceBody }>("/admin/ratio-sources", async (request, reply) => {
    try {
      const source = runtime.ratioSources.createSource(normalizeRatioSourceBody(request.body ?? {}));
      return reply.status(201).send({
        ok: true,
        source
      });
    } catch (error) {
      const normalized = ratioAdminError(error);
      return reply.status(normalized.status).send(normalized.body);
    }
  });

  server.patch<{ Params: RatioSourceParams; Body: RatioSourceBody }>("/admin/ratio-sources/:id", async (request, reply) => {
    try {
      const source = runtime.ratioSources.updateSource(request.params.id, normalizeRatioSourceBody(request.body ?? {}));
      return {
        ok: true,
        source
      };
    } catch (error) {
      const normalized = ratioAdminError(error);
      return reply.status(normalized.status).send(normalized.body);
    }
  });

  server.delete<{ Params: RatioSourceParams }>("/admin/ratio-sources/:id", async (request, reply) => {
    try {
      runtime.ratioSources.deleteSource(request.params.id);
      return { ok: true };
    } catch (error) {
      const normalized = ratioAdminError(error);
      return reply.status(normalized.status).send(normalized.body);
    }
  });

  server.post<{ Params: RatioSourceParams }>("/admin/ratio-sources/:id/refresh", async (request, reply) => {
    try {
      const source = await runtime.ratioSources.refreshSource(request.params.id);
      return {
        ok: source.status === "ok" || source.status === "warning",
        source,
        groups: runtime.ratioSources.getGroups(source.id)
      };
    } catch (error) {
      const normalized = ratioAdminError(error);
      return reply.status(normalized.status).send(normalized.body);
    }
  });

  server.get<{ Params: RatioSourceParams }>("/admin/ratio-sources/:id/groups", async (request) => ({
    sourceId: request.params.id,
    groups: runtime.ratioSources.getGroups(request.params.id)
  }));

  server.get("/admin/ratio-bindings", async () => ({
    bindings: runtime.ratioSources.buildBindings(runtime.config)
  }));

  server.post<{ Body: RatioBindingsBody }>("/admin/ratio-bindings", async (request, reply) => {
    const rawBindings = request.body?.bindings ?? {};
    const rawConfig = readConfigObject(runtime.configPath) as Record<string, unknown>;
    const aliases = rawConfig.aliases && typeof rawConfig.aliases === "object"
      ? rawConfig.aliases as Record<string, Record<string, unknown>>
      : {};

    for (const [aliasName, rawBinding] of Object.entries(rawBindings)) {
      if (!aliases[aliasName]) {
        continue;
      }

      const binding = normalizeBinding(rawBinding);
      if (!binding) {
        delete aliases[aliasName].ratio_binding;
      } else {
        aliases[aliasName].ratio_binding = {
          source_id: binding.sourceId,
          group_id: binding.groupId
        };
      }
    }

    rawConfig.aliases = aliases;
    const validation = writeConfigObject(rawConfig, runtime.configPath);
    if (!validation.ok) {
      return reply.status(400).send(validation);
    }

    await runtime.reload();
    return {
      ok: true,
      warnings: validation.warnings,
      bindings: runtime.ratioSources.buildBindings(runtime.config)
    };
  });

  server.get<{ Querystring: CcSwitchLinkQuery }>("/admin/ccswitch-link", async (request, reply) => {
    const app = request.query.app ?? "codex";

    if (!isCcSwitchApp(app)) {
      return reply
        .status(400)
        .send(createOpenAICompatibleError(`Unsupported CC Switch app "${app}"`, "invalid_request_error"));
    }

    return createCcSwitchProviderLink(runtime, app);
  });

  server.post<{ Body: TestProviderBody }>("/admin/test/provider", async (request, reply) => {
    const provider = request.body?.provider;

    if (!provider) {
      return reply
        .status(400)
        .send(createOpenAICompatibleError("Request body must include provider"));
    }

    const result = await testProvider(runtime, provider, request.body?.model, Boolean(request.body?.stream), request.body?.api_type);
    addDiagnosticLog(runtime, result);
    return result;
  });

  server.post<{ Body: TestAliasBody }>("/admin/test/alias", async (request, reply) => {
    const alias = request.body?.alias;

    if (!alias) {
      return reply
        .status(400)
        .send(createOpenAICompatibleError("Request body must include alias"));
    }

    const result = await testAlias(runtime, alias, Boolean(request.body?.stream), request.body?.api_type);
    addDiagnosticLog(runtime, result);
    return result;
  });

  server.post<{ Body: TestActiveBody }>("/admin/test/active", async (request, reply) => {
    const result = await testActiveAlias(runtime, Boolean(request.body?.stream), request.body?.api_type);
    addDiagnosticLog(runtime, result);
    return reply.send(result);
  });

  server.get("/admin/config", async (_request, reply) => {
    try {
      const rawConfig = readConfigObject(runtime.configPath);
      return {
        path: getDisplayConfigPath(runtime.configPath),
        config: sanitizeConfigForAdmin(rawConfig),
        config_warnings: getConfigWarnings(runtime.config)
      };
    } catch (error) {
      return reply
        .status(400)
        .send(createOpenAICompatibleError(`Failed to read config: ${getErrorMessage(error)}`));
    }
  });

  server.post<{ Body: ConfigBody }>("/admin/config/validate", async (request) => {
    const config = request.body?.config ?? request.body;
    return validateConfigObject(config);
  });

  server.post<{ Body: ConfigBody }>("/admin/config", async (request, reply) => {
    const config = request.body?.config ?? request.body;
    const validation = writeConfigObject(config, runtime.configPath);

    if (!validation.ok) {
      return reply.status(400).send(validation);
    }

    try {
      await runtime.reload();
    } catch (error) {
      return reply
        .status(400)
        .send({
          ok: false,
          errors: [`Config saved but reload failed: ${getErrorMessage(error)}`],
          warnings: validation.warnings
        });
    }

    return {
      ok: true,
      warnings: validation.warnings,
      active: runtime.activeAlias
    };
  });

  server.get<{ Querystring: LogsQuery }>("/admin/logs", async (request) => {
    const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 50;
    return {
      logs: runtime.requestLogs.listRequestLogs(Number.isFinite(limit) ? limit : 50)
    };
  });

  server.delete("/admin/logs", async () => {
    runtime.requestLogs.clearRequestLogs();
    return {
      ok: true
    };
  });

  server.get("/admin/stats", async () => runtime.requestLogs.getRequestStats());

  server.get<{ Querystring: UsageSummaryQuery }>("/admin/usage/summary", async (request) => {
    const range = usageRange(request.query.range, "today");
    const kind = usageKind(request.query.kind);
    return runtime.usageStore.getUsageSummary(range, kind);
  });

  server.get<{ Querystring: UsageTimelineQuery }>("/admin/usage/timeline", async (request) => {
    const range = timelineRange(request.query.range);
    const bucket = timelineBucket(request.query.bucket);
    return runtime.usageStore.getUsageTimeline(range, bucket);
  });

  server.get<{ Querystring: UsageGroupsQuery }>("/admin/usage/groups", async (request) => {
    return runtime.usageStore.getUsageGroups(
      usageRange(request.query.range, "today"),
      usageGroupBy(request.query.group_by),
      usageKind(request.query.kind),
      {
        alias: request.query.alias,
        provider: request.query.provider,
        model: request.query.model
      }
    );
  });

  server.get<{ Querystring: UsageRecordsQuery }>("/admin/usage/records", async (request) => {
    const limit = Number.parseInt(request.query.limit ?? "50", 10);
    return {
      records: runtime.usageStore.listUsageRecords({
        range: usageRange(request.query.range, "all"),
        kind: usageKind(request.query.kind),
        alias: request.query.alias,
        provider: request.query.provider,
        model: request.query.model,
        limit: Number.isFinite(limit) ? limit : 50
      })
    };
  });

  server.delete("/admin/usage/records", async () => {
    runtime.usageStore.clearUsageRecords();
    return {
      ok: true
    };
  });

  server.post<{ Body: SwitchBody }>("/admin/switch", async (request, reply) => {
    const active = request.body?.active;

    if (!active) {
      return reply
        .status(400)
        .send(createOpenAICompatibleError("Request body must include active alias"));
    }

    try {
      runtime.switchActive(active);
    } catch (error) {
      return reply
        .status(400)
        .send(createOpenAICompatibleError(getErrorMessage(error)));
    }

    return {
      ok: true,
      active: runtime.activeAlias
    };
  });

  server.post("/admin/reload", async (_request, reply) => {
    try {
      await runtime.reload();
    } catch (error) {
      return reply
        .status(400)
        .send(createOpenAICompatibleError(`Failed to reload config: ${getErrorMessage(error)}`));
    }

    return {
      ok: true,
      active: runtime.activeAlias
    };
  });
}
