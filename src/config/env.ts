import type { ModelGateConfig, ProviderConfig } from "./schema.js";

export type MissingEnvWarning = {
  type: "missing_env";
  provider?: string;
  path: string;
  env: string;
  envName: string;
  message: string;
};

export type ConfigWarning = MissingEnvWarning;

export type ProviderApiKeyResolution =
  | { ok: true; apiKey: string; envName?: string }
  | { ok: false; warning: MissingEnvWarning };

type ProviderApiKeyConfig =
  | { type: "mock" }
  | { type: "openai-compatible"; api_key: string };

export const envPattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
export const envOnlyPattern = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

export function findEnvReferences(value: string) {
  return [...value.matchAll(envPattern)].map((match) => match[1]);
}

export function createMissingEnvWarning(path: string, envName: string, provider?: string): MissingEnvWarning {
  return {
    type: "missing_env",
    provider,
    path,
    env: envName,
    envName,
    message: provider
      ? `Provider ${provider} requires environment variable ${envName}, but it is not set.`
      : `Environment variable ${envName} is not set.`
  };
}

export function collectConfigWarnings(config: ModelGateConfig): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  for (const [providerName, provider] of Object.entries(config.providers)) {
    if (provider.type !== "openai-compatible") {
      continue;
    }

    for (const envName of findEnvReferences(provider.api_key)) {
      if (!process.env[envName]) {
        warnings.push(createMissingEnvWarning(`providers.${providerName}.api_key`, envName, providerName));
      }
    }
  }

  return warnings;
}

export function resolveEnvReferences(value: string, path: string, provider?: string) {
  let missing: MissingEnvWarning | undefined;
  const resolved = value.replace(envPattern, (_match, envName: string) => {
    const envValue = process.env[envName];

    if (!envValue) {
      missing = createMissingEnvWarning(path, envName, provider);
      return "";
    }

    return envValue;
  });

  return missing ? { ok: false as const, warning: missing } : { ok: true as const, value: resolved };
}

export function resolveProviderApiKey(providerName: string, provider: ProviderApiKeyConfig): ProviderApiKeyResolution {
  if (provider.type !== "openai-compatible") {
    return { ok: true, apiKey: "" };
  }

  const path = `providers.${providerName}.api_key`;
  const resolved = resolveEnvReferences(provider.api_key, path, providerName);

  if (!resolved.ok) {
    return {
      ok: false,
      warning: {
        ...resolved.warning,
        message: `Provider ${providerName} requires environment variable ${resolved.warning.envName}, but it is not set.`
      }
    };
  }

  return {
    ok: true,
    apiKey: resolved.value,
    envName: provider.api_key.match(envOnlyPattern)?.[1]
  };
}
