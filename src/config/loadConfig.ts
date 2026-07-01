import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { envPattern } from "./env.js";
import { modelGateConfigSchema, type ModelGateConfig } from "./schema.js";

export const defaultConfigPath = "examples/modelgate.config.yaml";

export type LoadConfigOptions = {
  configPath?: string;
  resolveEnv?: boolean;
};

export function getConfigPathFromEnv() {
  return process.env.MODELGATE_CONFIG ?? process.env.MODEL_GATE_CONFIG;
}

export function resolveConfigPath(configPath = getConfigPathFromEnv()) {
  return resolve(process.cwd(), configPath ?? defaultConfigPath);
}

export function expandEnv(value: unknown, path = "config"): unknown {
  if (typeof value === "string") {
    return value.replace(envPattern, (_match, name: string) => {
      const envValue = process.env[name];

      if (envValue === undefined) {
        throw new Error(`Missing environment variable ${name} referenced at ${path}`);
      }

      return envValue;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => expandEnv(item, `${path}[${index}]`));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, expandEnv(item, `${path}.${key}`)])
    );
  }

  return value;
}

export async function loadConfig(configPathOrOptions: string | LoadConfigOptions | undefined = getConfigPathFromEnv()): Promise<ModelGateConfig> {
  const options = typeof configPathOrOptions === "object"
    ? configPathOrOptions
    : { configPath: configPathOrOptions };
  const resolvedPath = resolveConfigPath(options.configPath);

  if (!existsSync(resolvedPath)) {
    return modelGateConfigSchema.parse({});
  }

  const raw = readFileSync(resolvedPath, "utf8");
  const parsed = YAML.parse(raw);
  const expanded = options.resolveEnv ? expandEnv(parsed ?? {}) : parsed ?? {};

  return modelGateConfigSchema.parse(expanded);
}
