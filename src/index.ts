import { startModelGateServer } from "./serverMain.js";
import { logger } from "./utils/logger.js";

void startModelGateServer().catch((error) => {
  logger.error("Failed to start ModelGate", error);
  process.exit(1);
});
