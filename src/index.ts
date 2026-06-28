import { createServer } from "./server/createServer.js";
import { loadConfig } from "./config/loadConfig.js";
import { logger } from "./utils/logger.js";

try {
  const config = await loadConfig();
  const server = await createServer(config);

  await server.listen({
    host: config.server.host,
    port: config.server.port
  });

  logger.info(`ModelGate listening on http://${config.server.host}:${config.server.port}`);
} catch (error) {
  logger.error("Failed to start ModelGate", error);
  process.exit(1);
}
