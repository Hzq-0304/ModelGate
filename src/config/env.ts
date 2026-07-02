import type { ModelGateConfig } from "./schema.js";

export type MissingEnvWarning = {
  type: "missing_env";
  provider?: string;
  path: string;
  env: string;
  envName: string;
  message: string;
};

export type MissingCredentialWarning = {
  type: "missing_credential";
  provider?: string;
  path: string;
  source?: string;
  credential_id?: string;
  env?: string;
  envName?: string;
  message: string;
};

export type ConfigWarning = MissingEnvWarning | MissingCredentialWarning;

export type ProviderApiKeyResolution =
  | { ok: true; apiKey: string; envName?: string }
  | { ok: false; warning: MissingEnvWarning };

export type ProviderAuthResolution =
  | {
    ok: true;
    headers: Record<string, string>;
    secret?: string;
    source: "api_key" | "env" | "ccswitch" | "static-header-ref";
    envName?: string;
  }
  | { ok: false; warning: ConfigWarning };

type ProviderApiKeyConfig =
  | { type: "mock" }
  | { type: "openai-compatible"; api_key?: string; auth?: ProviderAuthConfigLike };

type ProviderAuthConfigLike =
  | {
    type: "env";
    header?: string;
    scheme?: string;
    env: string;
  }
  | {
    type: "ccswitch";
    source: string;
    app?: string;
    db_path?: string;
    provider_id?: string;
    credential_ref?: string;
    credential_path?: string;
    fallback_env?: string;
    header?: string;
    scheme?: string;
  }
  | {
    type: "static-header-ref";
    header?: string;
    scheme?: string;
    value_ref?: string;
    value_env?: string;
    value?: string;
  };

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

export function createMissingCredentialWarning(
  path: string,
  source: string,
  provider?: string,
  credentialId?: string,
  fallbackEnv?: string
): MissingCredentialWarning {
  return {
    type: "missing_credential",
    provider,
    path,
    source,
    credential_id: credentialId,
    env: fallbackEnv,
    envName: fallbackEnv,
    message: provider
      ? `Provider ${provider} requires ${source} credential${fallbackEnv ? ` or environment variable ${fallbackEnv}` : ""}, but it is not available.`
      : `${source} credential is not available.`
  };
}

export function collectConfigWarnings(config: ModelGateConfig): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  for (const [providerName, provider] of Object.entries(config.providers)) {
    if (provider.type !== "openai-compatible") {
      continue;
    }

    if (provider.auth) {
      const warning = collectAuthWarning(providerName, provider.auth);
      if (warning) {
        warnings.push(warning);
      }
      continue;
    }

    if (!provider.api_key) {
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

  if (!provider.api_key) {
    return {
      ok: false,
      warning: createMissingEnvWarning(`providers.${providerName}.api_key`, "OPENAI_API_KEY", providerName)
    };
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

function headerValue(value: string, scheme?: string) {
  const trimmed = value.trim();
  const prefix = scheme?.trim();
  return prefix ? `${prefix} ${trimmed}` : trimmed;
}

function authHeaderName(auth: Pick<ProviderAuthConfigLike, "type"> & { header?: string }) {
  return auth.header?.trim() || "Authorization";
}

function collectAuthWarning(providerName: string, auth: ProviderAuthConfigLike): ConfigWarning | null {
  switch (auth.type) {
    case "env":
      return process.env[auth.env]
        ? null
        : createMissingEnvWarning(`providers.${providerName}.auth.env`, auth.env, providerName);
    case "static-header-ref": {
      if (auth.value) {
        return null;
      }
      if (auth.value_env) {
        return process.env[auth.value_env]
          ? null
          : createMissingEnvWarning(`providers.${providerName}.auth.value_env`, auth.value_env, providerName);
      }
      return createMissingCredentialWarning(
        `providers.${providerName}.auth.value_ref`,
        "static-header-ref",
        providerName,
        auth.value_ref
      );
    }
    case "ccswitch":
      if (hasCcSwitchReference(auth)) {
        return null;
      }
      if (auth.fallback_env && process.env[auth.fallback_env]) {
        return null;
      }
      return createMissingCredentialWarning(
        `providers.${providerName}.auth`,
        auth.source,
        providerName,
        auth.credential_ref ?? auth.provider_id,
        auth.fallback_env
      );
  }

  return null;
}

function hasCcSwitchReference(auth: Extract<ProviderAuthConfigLike, { type: "ccswitch" }>) {
  return Boolean(
    auth.credential_ref?.trim()
    || auth.credential_path?.trim()
    || auth.provider_id?.trim()
  );
}

export function resolveProviderAuth(providerName: string, provider: ProviderApiKeyConfig): ProviderAuthResolution {
  if (provider.type !== "openai-compatible") {
    return { ok: true, headers: {}, source: "api_key" };
  }

  if (provider.auth) {
    return resolveExplicitProviderAuth(providerName, provider.auth);
  }

  const apiKey = resolveProviderApiKey(providerName, provider);
  if (!apiKey.ok) {
    return apiKey;
  }

  return {
    ok: true,
    source: "api_key",
    envName: apiKey.envName,
    secret: apiKey.apiKey,
    headers: {
      Authorization: headerValue(apiKey.apiKey, "Bearer")
    }
  };
}

function resolveExplicitProviderAuth(providerName: string, auth: ProviderAuthConfigLike): ProviderAuthResolution {
  switch (auth.type) {
    case "env": {
      const value = process.env[auth.env];
      if (!value) {
        return {
          ok: false,
          warning: createMissingEnvWarning(`providers.${providerName}.auth.env`, auth.env, providerName)
        };
      }

      return {
        ok: true,
        source: "env",
        envName: auth.env,
        secret: value,
        headers: {
          [authHeaderName(auth)]: headerValue(value, auth.scheme)
        }
      };
    }
    case "static-header-ref": {
      const value = auth.value_env ? process.env[auth.value_env] : auth.value;
      if (!value) {
        const warning = auth.value_env
          ? createMissingEnvWarning(`providers.${providerName}.auth.value_env`, auth.value_env, providerName)
          : createMissingCredentialWarning(
            `providers.${providerName}.auth.value_ref`,
            "static-header-ref",
            providerName,
            auth.value_ref
          );
        return { ok: false, warning };
      }

      return {
        ok: true,
        source: "static-header-ref",
        envName: auth.value_env,
        secret: value,
        headers: {
          [authHeaderName(auth)]: headerValue(value, auth.scheme)
        }
      };
    }
    case "ccswitch": {
      const hasReference = hasCcSwitchReference(auth);
      const value = auth.fallback_env ? process.env[auth.fallback_env] : undefined;
      if (!value) {
        return {
          ok: false,
          warning: createMissingCredentialWarning(
            `providers.${providerName}.auth`,
            auth.source,
            providerName,
            auth.credential_ref ?? auth.provider_id,
            hasReference ? undefined : auth.fallback_env
          )
        };
      }

      return {
        ok: true,
        source: "ccswitch",
        envName: auth.fallback_env,
        secret: value,
        headers: {
          [authHeaderName(auth)]: headerValue(value, auth.scheme)
        }
      };
    }
  }

  return {
    ok: false,
    warning: createMissingCredentialWarning(`providers.${providerName}.auth`, "unknown", providerName)
  };
}
