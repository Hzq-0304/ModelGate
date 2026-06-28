import { loadConfig } from "../config/loadConfig.js";
import type { ModelGateConfig } from "../config/schema.js";

export type EntrypointStatus = {
  use: string;
  resolved: string;
};

export class RuntimeState {
  #config: ModelGateConfig;
  #activeAlias: string;
  readonly configPath?: string;

  constructor(config: ModelGateConfig, configPath = process.env.MODELGATE_CONFIG) {
    this.#config = config;
    this.#activeAlias = config.active;
    this.configPath = configPath;
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
    const nextConfig = await loadConfig(this.configPath);
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
