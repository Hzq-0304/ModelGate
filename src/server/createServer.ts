import Fastify from "fastify";
import { registerAdminRouter } from "../router/adminRouter.js";
import { registerModelRouter } from "../router/modelRouter.js";
import { RatioRefreshScheduler } from "../runtime/ratioRefreshScheduler.js";
import type { RuntimeState } from "../runtime/state.js";

export const modelgateBodyLimitBytes = 64 * 1024 * 1024;

export async function createServer(runtime: RuntimeState) {
  const server = Fastify({
    logger: false,
    bodyLimit: modelgateBodyLimitBytes
  });
  const ratioScheduler = new RatioRefreshScheduler(runtime);

  server.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const isLocalOrigin = origin
      ? /^https?:\/\/(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?$/.test(origin)
      : false;

    if (origin && isLocalOrigin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "origin");
      reply.header("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
      reply.header("access-control-allow-headers", "content-type,authorization");
    }

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  server.get("/health", async () => ({
    ok: true,
    name: "ModelGate",
    capabilities: {
      chat_completions: true,
      responses: true
    }
  }));

  await registerModelRouter(server, runtime);
  await registerAdminRouter(server, runtime);

  server.addHook("onReady", async () => {
    ratioScheduler.start();
  });

  server.addHook("onClose", async () => {
    ratioScheduler.stop();
  });

  return server;
}
