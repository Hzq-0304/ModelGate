import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { modelGateConfigSchema, type ModelGateConfig } from "./schema.js";

const defaultConfigPath = "examples/modelgate.config.yaml";
const envPattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function expandEnv(value: unknown, path = "config"): unknown {
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

export async function loadConfig(configPath = process.env.MODELGATE_CONFIG): Promise<ModelGateConfig> {
  const resolvedPath = resolve(process.cwd(), configPath ?? defaultConfigPath);

  if (!existsSync(resolvedPath)) {
    return modelGateConfigSchema.parse({});
  }

  const raw = readFileSync(resolvedPath, "utf8");
  const parsed = YAML.parse(raw);
  const expanded = expandEnv(parsed ?? {});

  return modelGateConfigSchema.parse(expanded);
}
