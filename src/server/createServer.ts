import Fastify from "fastify";
import { registerAdminRouter } from "../router/adminRouter.js";
import { registerModelRouter } from "../router/modelRouter.js";
import type { RuntimeState } from "../runtime/state.js";

export async function createServer(runtime: RuntimeState) {
  const server = Fastify({
    logger: false
  });

  server.get("/health", async () => ({
    ok: true,
    name: "ModelGate"
  }));

  await registerModelRouter(server, runtime);
  await registerAdminRouter(server, runtime);

  return server;
}
