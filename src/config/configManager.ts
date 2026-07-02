import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import YAML from "yaml";
import {
  defaultConfigPath,
  resolveConfigPath
} from "./loadConfig.js";
import { collectConfigWarnings, envOnlyPattern } from "./env.js";
import { modelGateConfigSchema, type ModelGateConfig } from "./schema.js";

export type ConfigValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function getConfigFilePath(configPath?: string) {
  return resolveConfigPath(configPath);
}

export function getDisplayConfigPath(configPath?: string) {
  const resolved = getConfigFilePath(configPath);
  const display = relative(process.cwd(), resolved);
  return display && !display.startsWith("..") ? display : resolved;
}

export function readConfigObject(configPath?: string) {
  const resolved = getConfigFilePath(configPath);

  if (!existsSync(resolved)) {
    return modelGateConfigSchema.parse({});
  }

  const raw = readFileSync(resolved, "utf8");
  return YAML.parse(raw) ?? {};
}

function maskApiKey(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  return envOnlyPattern.test(value) ? value : "***";
}

function sanitizeAuthForAdmin(auth: unknown) {
  if (!auth || typeof auth !== "object") {
    return auth;
  }

  const record = auth as Record<string, unknown>;
  if (record.type === "static-header-ref" && typeof record.value === "string") {
    return {
      ...record,
      value: "***"
    };
  }

  return record;
}

function envResolved(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const match = value.match(envOnlyPattern);
  return match ? Boolean(process.env[match[1]]) : value.length > 0;
}

function authResolved(auth: unknown, fallbackApiKey: unknown) {
  if (!auth || typeof auth !== "object") {
    return envResolved(fallbackApiKey);
  }

  const record = auth as Record<string, unknown>;
  if (record.type === "env") {
    return typeof record.env === "string" && Boolean(process.env[record.env]);
  }
  if (record.type === "ccswitch") {
    return Boolean(record.credential_ref || record.credential_path || record.credential_id || record.provider_id);
  }
  if (record.type === "static-header-ref") {
    if (typeof record.value === "string" && record.value.trim()) {
      return true;
    }
    return typeof record.value_env === "string" && Boolean(process.env[record.value_env]);
  }

  return false;
}

function rawProviderApiKey(rawConfig: unknown, name: string, fallback: unknown) {
  if (!rawConfig || typeof rawConfig !== "object" || !("providers" in rawConfig)) {
    return fallback;
  }

  const providers = (rawConfig as { providers?: Record<string, unknown> }).providers;
  const provider = providers?.[name];

  if (!provider || typeof provider !== "object" || !("api_key" in provider)) {
    return fallback;
  }

  return (provider as { api_key?: unknown }).api_key ?? fallback;
}

export function sanitizeConfigForAdmin(rawConfig: unknown) {
  const config = modelGateConfigSchema.parse(rawConfig);

  return {
    ...config,
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([name, provider]) => {
        if (provider.type !== "openai-compatible") {
          return [name, provider];
        }

        const apiKey = rawProviderApiKey(rawConfig, name, provider.api_key);
        const auth = "auth" in provider ? sanitizeAuthForAdmin(provider.auth) : undefined;

        return [
          name,
          {
            ...provider,
            ...(auth ? { auth } : {}),
            api_key: maskApiKey(apiKey),
            api_key_resolved: authResolved(provider.auth, apiKey)
          }
        ];
      })
    )
  };
}

export function getConfigWarnings(config: ModelGateConfig) {
  return collectConfigWarnings(config);
}

export function validateConfigObject(rawConfig: unknown): ConfigValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const result = modelGateConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    errors.push(...result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    }));
  }

  if (rawConfig && typeof rawConfig === "object" && "providers" in rawConfig) {
    const providers = (rawConfig as { providers?: Record<string, unknown> }).providers ?? {};

    for (const [name, provider] of Object.entries(providers)) {
      if (!provider || typeof provider !== "object") {
        continue;
      }

      const typedProvider = provider as { type?: string; api_key?: unknown; auth?: unknown };
      if (typedProvider.type !== "openai-compatible") {
        continue;
      }

      if (typedProvider.auth) {
        continue;
      }

      if (typeof typedProvider.api_key !== "string") {
        continue;
      }

      const match = typedProvider.api_key.match(envOnlyPattern);
      if (!match) {
        errors.push(`Provider "${name}" api_key must be stored as an environment variable expression like \${ENV_NAME}.`);
        continue;
      }

      if (!process.env[match[1]]) {
        warnings.push(`Provider "${name}" requires environment variable ${match[1]}, but it is not set.`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

export function writeConfigObject(rawConfig: unknown, configPath?: string) {
  const validation = validateConfigObject(rawConfig);
  if (!validation.ok) {
    return validation;
  }

  const parsed = modelGateConfigSchema.parse(rawConfig);
  const resolved = getConfigFilePath(configPath);

  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(
    resolved,
    YAML.stringify(parsed, {
      indent: 2,
      lineWidth: 0
    }),
    "utf8"
  );

  return validation;
}

export { defaultConfigPath };
