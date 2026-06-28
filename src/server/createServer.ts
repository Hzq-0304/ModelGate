import Fastify from "fastify";
import { registerAdminRouter } from "../router/adminRouter.js";
import { registerModelRouter } from "../router/modelRouter.js";
import type { RuntimeState } from "../runtime/state.js";

export async function createServer(runtime: RuntimeState) {
  const server = Fastify({
    logger: false
  });

  server.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const isLocalOrigin = origin
      ? /^https?:\/\/(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?$/.test(origin)
      : false;

    if (origin && isLocalOrigin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "origin");
      reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
      reply.header("access-control-allow-headers", "content-type,authorization");
    }

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  server.get("/health", async () => ({
    ok: true,
    name: "ModelGate"
  }));

  await registerModelRouter(server, runtime);
  await registerAdminRouter(server, runtime);

  return server;
}
