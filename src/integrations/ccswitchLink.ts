import type { RuntimeState } from "../runtime/state.js";

export type CcSwitchApp = "codex" | "claude" | "gemini" | "opencode" | "openclaw";

export type CcSwitchProviderLink = {
  url: string;
  provider: {
    name: string;
    app: CcSwitchApp;
    endpoint: string;
    api_key: string;
    model: string;
    notes: string;
    enabled: boolean;
  };
};

const validApps = new Set<CcSwitchApp>(["codex", "claude", "gemini", "opencode", "openclaw"]);
const localApiKey = "modelgate-local";
const defaultProviderName = "ModelGate Local";
const managedNotes = "Managed by ModelGate. modelgate-managed=true";

export function isCcSwitchApp(value: string): value is CcSwitchApp {
  return validApps.has(value as CcSwitchApp);
}

export function defaultCcSwitchModel(runtime: RuntimeState) {
  if (runtime.config.entrypoints["codex-main"]) {
    return "codex-main";
  }

  const firstEntrypoint = Object.keys(runtime.config.entrypoints)[0];
  return firstEntrypoint ?? runtime.activeAlias;
}

export function defaultModelGateEndpoint(runtime: RuntimeState) {
  const { host, port } = runtime.config.server;
  const endpointHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return `http://${endpointHost}:${port}/v1`;
}

export function createCcSwitchProviderLink(
  runtime: RuntimeState,
  app: CcSwitchApp = "codex",
  overrides: Partial<CcSwitchProviderLink["provider"]> = {}
): CcSwitchProviderLink {
  const provider = {
    name: overrides.name ?? defaultProviderName,
    app: overrides.app ?? app,
    endpoint: overrides.endpoint ?? defaultModelGateEndpoint(runtime),
    api_key: localApiKey,
    model: overrides.model ?? defaultCcSwitchModel(runtime),
    notes: overrides.notes ?? managedNotes,
    enabled: overrides.enabled ?? true
  };
  const params = new URLSearchParams({
    resource: "provider",
    app: provider.app,
    name: provider.name,
    endpoint: provider.endpoint,
    apiKey: provider.api_key,
    model: provider.model,
    notes: provider.notes,
    enabled: String(provider.enabled)
  });

  return {
    url: `ccswitch://v1/import?${params.toString()}`,
    provider
  };
}
