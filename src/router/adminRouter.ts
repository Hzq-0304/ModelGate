import type { FastifyInstance, FastifyRequest } from "fastify";
import { createOpenAICompatibleError } from "../providers/openaiCompatible.js";
import type { RuntimeState } from "../runtime/state.js";

type SwitchBody = {
  active?: string;
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
