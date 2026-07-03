import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { MissingCredentialWarning } from "./env.js";

export type CcSwitchSnapshotAuthConfig = {
  type: "ccswitch-snapshot";
  source?: string;
  app?: string;
  snapshot_id: string;
  snapshot_path?: string;
  provider_id: string;
  credential_id?: string;
  credential_ref?: string;
  credential_path?: string;
  fallback_env?: string;
  header?: string;
  scheme?: string;
};

type SnapshotProviderAuth = {
  provider_id?: string;
  app?: string;
  credential_id?: string;
  credential_ref?: string;
  credential_path?: string;
  headers?: Record<string, unknown>;
  token?: unknown;
  value?: unknown;
  scheme?: unknown;
};

type SnapshotAuthIndex = {
  schema_version?: number;
  snapshot_id?: string;
  providers?: Record<string, SnapshotProviderAuth>;
};

export type SnapshotAuthResolution =
  | {
    ok: true;
    headers: Record<string, string>;
    secret?: string;
  }
  | {
    ok: false;
    warning: MissingCredentialWarning;
  };

function sourceName(auth: CcSwitchSnapshotAuthConfig) {
  return auth.source?.trim() || "CC Switch snapshot";
}

function createWarning(
  providerName: string,
  auth: CcSwitchSnapshotAuthConfig,
  message: string
): MissingCredentialWarning {
  const credentialId = auth.credential_ref
    ?? auth.credential_id
    ?? auth.credential_path
    ?? auth.provider_id
    ?? auth.snapshot_id;

  return {
    type: "missing_credential",
    provider: providerName,
    path: `providers.${providerName}.auth`,
    source: sourceName(auth),
    credential_id: credentialId,
    env: auth.fallback_env,
    envName: auth.fallback_env,
    message
  };
}

export function resolveSnapshotPath(auth: CcSwitchSnapshotAuthConfig) {
  if (auth.snapshot_path?.trim()) {
    return isAbsolute(auth.snapshot_path)
      ? auth.snapshot_path
      : resolve(process.cwd(), auth.snapshot_path);
  }

  const root = process.env.MODELGATE_SNAPSHOT_DIR
    ?? process.env.MODEL_GATE_SNAPSHOT_DIR
    ?? process.env.MODELGATE_CONFIG_DIR
    ?? process.env.MODEL_GATE_CONFIG_DIR;

  if (root?.trim()) {
    return join(root, "ccswitch-snapshots", auth.snapshot_id);
  }

  return undefined;
}

export function snapshotAuthIndexPath(auth: CcSwitchSnapshotAuthConfig) {
  const snapshotPath = resolveSnapshotPath(auth);
  return snapshotPath ? join(snapshotPath, "auth", "provider-auth.json") : undefined;
}

export function hasSnapshotAuthIndex(auth: CcSwitchSnapshotAuthConfig) {
  const authIndexPath = snapshotAuthIndexPath(auth);
  return Boolean(authIndexPath && existsSync(authIndexPath));
}

function readSnapshotAuthIndex(auth: CcSwitchSnapshotAuthConfig): SnapshotAuthIndex {
  const authIndexPath = snapshotAuthIndexPath(auth);
  if (!authIndexPath) {
    throw new Error("Snapshot path is not configured.");
  }
  if (!existsSync(authIndexPath)) {
    throw new Error(`Snapshot auth index not found: ${authIndexPath}`);
  }

  return JSON.parse(readFileSync(authIndexPath, "utf8")) as SnapshotAuthIndex;
}

function headerValue(value: string, scheme?: string) {
  const trimmed = value.trim();
  const prefix = scheme?.trim();
  return prefix ? `${prefix} ${trimmed}` : trimmed;
}

function authHeaderName(auth: CcSwitchSnapshotAuthConfig) {
  return auth.header?.trim() || "Authorization";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pickProviderAuth(index: SnapshotAuthIndex, auth: CcSwitchSnapshotAuthConfig) {
  const providers = index.providers ?? {};
  const candidates = [
    auth.provider_id,
    auth.credential_id,
    auth.credential_ref,
    `${auth.app ?? "codex"}:${auth.provider_id}`
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const entry = providers[candidate];
    if (entry) {
      return entry;
    }
  }

  return Object.values(providers).find((entry) => {
    return entry.provider_id === auth.provider_id
      || entry.credential_id === auth.credential_id
      || entry.credential_ref === auth.credential_ref
      || entry.credential_path === auth.credential_path;
  });
}

export function resolveCcSwitchSnapshotAuth(
  providerName: string,
  auth: CcSwitchSnapshotAuthConfig
): SnapshotAuthResolution {
  const snapshotPath = resolveSnapshotPath(auth);
  if (!snapshotPath) {
    return {
      ok: false,
      warning: createWarning(
        providerName,
        auth,
        `Provider ${providerName} uses a CC Switch snapshot, but snapshot_path or MODELGATE_SNAPSHOT_DIR is not configured.`
      )
    };
  }

  let index: SnapshotAuthIndex;
  try {
    index = readSnapshotAuthIndex(auth);
  } catch (error) {
    return {
      ok: false,
      warning: createWarning(
        providerName,
        auth,
        `Provider ${providerName} requires ${sourceName(auth)} credential, but the snapshot auth index is not available. ${error instanceof Error ? error.message : String(error)}`
      )
    };
  }

  const entry = pickProviderAuth(index, auth);
  if (!entry) {
    return {
      ok: false,
      warning: createWarning(
        providerName,
        auth,
        `Provider ${providerName} requires ${sourceName(auth)} credential for ${auth.provider_id}, but it was not found in the snapshot.`
      )
    };
  }

  const headers = Object.fromEntries(
    Object.entries(entry.headers ?? {})
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => [key, String(value).trim()])
  );

  const explicitHeader = headers[authHeaderName(auth)];
  if (explicitHeader) {
    return {
      ok: true,
      headers,
      secret: explicitHeader.replace(/^Bearer\s+/i, "")
    };
  }

  const token = stringValue(entry.token) ?? stringValue(entry.value);
  if (token) {
    const header = authHeaderName(auth);
    const value = headerValue(token, auth.scheme ?? stringValue(entry.scheme));
    return {
      ok: true,
      headers: {
        ...headers,
        [header]: value
      },
      secret: token
    };
  }

  return {
    ok: false,
    warning: createWarning(
      providerName,
      auth,
      `Provider ${providerName} requires ${sourceName(auth)} credential for ${auth.provider_id}, but the snapshot entry does not include a usable header.`
    )
  };
}
