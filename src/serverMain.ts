import { createServer } from "./server/createServer.js";
import { loadConfig } from "./config/loadConfig.js";
import { RuntimeState } from "./runtime/state.js";
import { logger } from "./utils/logger.js";

export async function startModelGateServer() {
  const config = await loadConfig();
  const runtime = new RuntimeState(config);
  const server = await createServer(runtime);

  await server.listen({
    host: config.server.host,
    port: config.server.port
  });

  logger.info(`ModelGate listening on http://${config.server.host}:${config.server.port}`);
}

