import { getConfigPathFromEnv, loadConfig } from "../config/loadConfig.js";
import type { ModelGateConfig } from "../config/schema.js";
import { RatioSourceManager } from "../ratio-sources/ratioSourceManager.js";
import { createRequestLogStore } from "./requestLog.js";
import { createUsageStore } from "./usageStore.js";

export type EntrypointStatus = {
  use: string;
  resolved: string;
};

export class RuntimeState {
  #config: ModelGateConfig;
  #activeAlias: string;
  readonly requestLogs = createRequestLogStore(200);
  readonly usageStore = createUsageStore();
  readonly ratioSources: RatioSourceManager;
  readonly configPath?: string;

  constructor(config: ModelGateConfig, configPath = getConfigPathFromEnv()) {
    this.#config = config;
    this.#activeAlias = config.active;
    this.configPath = configPath;
    this.ratioSources = new RatioSourceManager(configPath);
  }

  get config() {
    return this.#config;
  }

  get activeAlias() {
    return this.#activeAlias;
  }

  switchActive(aliasName: string) {
    this.assertAliasExists(aliasName);
    this.#activeAlias = aliasName;
  }

  async reload() {
    const nextConfig = await loadConfig({ configPath: this.configPath });
    const previousActive = this.#activeAlias;

    this.#config = nextConfig;
    this.#activeAlias = nextConfig.aliases[previousActive] ? previousActive : nextConfig.active;
  }

  assertAliasExists(aliasName: string) {
    if (!this.#config.aliases[aliasName]) {
      throw new Error(`Alias "${aliasName}" is not configured`);
    }
  }

  resolveEntrypoints(): Record<string, EntrypointStatus> {
    return Object.fromEntries(
      Object.entries(this.#config.entrypoints).map(([name, entrypoint]) => [
        name,
        {
          use: entrypoint.use,
          resolved: entrypoint.use === "active" ? this.#activeAlias : entrypoint.use
        }
      ])
    );
  }
}
