import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  getDisplayConfigPath,
  readConfigObject,
  sanitizeConfigForAdmin,
  validateConfigObject,
  writeConfigObject
} from "../config/configManager.js";
import { providerPresets } from "../config/providerPresets.js";
import { createCcSwitchProviderLink, isCcSwitchApp } from "../integrations/ccswitchLink.js";
import { createOpenAICompatibleError } from "../providers/openaiCompatible.js";
import { addDiagnosticLog, testActiveAlias, testAlias, testProvider } from "../runtime/diagnostics.js";
import type { RuntimeState } from "../runtime/state.js";
import type { UsageKindFilter, UsageRange, UsageTimelineBucket } from "../runtime/usageStore.js";

type SwitchBody = {
  active?: string;
};

type ConfigBody = {
  config?: unknown;
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

type UsageRecordsQuery = {
  limit?: string;
  range?: string;
  kind?: string;
  provider?: string;
  model?: string;
};

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

function usageRange(value: string | undefined, fallback: UsageRange): UsageRange {
  return value === "today" || value === "24h" || value === "7d" || value === "all" ? value : fallback;
}

function usageKind(value: string | undefined): UsageKindFilter {
  return value === "normal" || value === "diagnostic" || value === "all" ? value : "all";
}

function timelineRange(value: string | undefined): Exclude<UsageRange, "all"> {
  return value === "24h" || value === "7d" || value === "today" ? value : "today";
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
    entrypoints: runtime.resolveEntrypoints()
  }));

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
        config: sanitizeConfigForAdmin(rawConfig)
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

  server.get<{ Querystring: UsageRecordsQuery }>("/admin/usage/records", async (request) => {
    const limit = Number.parseInt(request.query.limit ?? "50", 10);
    return {
      records: runtime.usageStore.listUsageRecords({
        range: usageRange(request.query.range, "all"),
        kind: usageKind(request.query.kind),
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
