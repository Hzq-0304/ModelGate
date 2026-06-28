import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  getDisplayConfigPath,
  readConfigObject,
  sanitizeConfigForAdmin,
  validateConfigObject,
  writeConfigObject
} from "../config/configManager.js";
import { createOpenAICompatibleError } from "../providers/openaiCompatible.js";
import type { RuntimeState } from "../runtime/state.js";

type SwitchBody = {
  active?: string;
};

type ConfigBody = {
  config?: unknown;
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
      model: alias.model
    }))
  }));

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
