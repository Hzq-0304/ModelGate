import Fastify from "fastify";
import type { ModelGateConfig } from "../config/schema.js";
import { registerModelRouter } from "../router/modelRouter.js";

export async function createServer(config: ModelGateConfig) {
  const server = Fastify({
    logger: false
  });

  server.get("/health", async () => ({
    ok: true,
    name: "ModelGate"
  }));

  await registerModelRouter(server, config);

  return server;
}
