import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { modelGateConfigSchema, type ModelGateConfig } from "./schema.js";

const defaultConfigPath = "examples/modelgate.config.yaml";

export async function loadConfig(configPath = process.env.MODELGATE_CONFIG): Promise<ModelGateConfig> {
  const resolvedPath = resolve(process.cwd(), configPath ?? defaultConfigPath);

  if (!existsSync(resolvedPath)) {
    return modelGateConfigSchema.parse({});
  }

  const raw = readFileSync(resolvedPath, "utf8");
  const parsed = YAML.parse(raw);

  return modelGateConfigSchema.parse(parsed ?? {});
}
