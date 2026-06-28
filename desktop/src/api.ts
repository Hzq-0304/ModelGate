import { invoke } from "@tauri-apps/api/core";

const baseUrl = "http://127.0.0.1:11435";

export type HealthResponse = {
  ok: boolean;
  name: string;
};

export type StatusResponse = {
  name: string;
  active: string;
  entrypoints: Record<string, {
    use: string;
    resolved: string;
  }>;
};

export type AliasesResponse = {
  active: string;
  aliases: Array<{
    name: string;
    provider: string;
    model: string;
  }>;
};

type SwitchResponse = {
  ok: boolean;
  active: string;
};

export type ServerProcessStatus = {
  endpoint: string;
  reachable: boolean;
  managed: boolean;
  running: boolean;
  pid?: number;
  mode: "external" | "managed" | "stopped" | "unknown";
  message?: string;
};

type ErrorResponse = {
  error?: {
    message?: string;
  };
};

async function parseJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null) as T | ErrorResponse | null;

  if (!response.ok) {
    const message = json && typeof json === "object" && "error" in json && json.error?.message
      ? json.error.message
      : `ModelGate returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

export function getBaseUrl() {
  return baseUrl;
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function unavailableServerProcessStatus(): ServerProcessStatus {
  return {
    endpoint: baseUrl,
    reachable: false,
    managed: false,
    running: false,
    mode: "unknown",
    message: "Server process control is only available in the desktop app."
  };
}

export async function getHealth() {
  const response = await fetch(`${baseUrl}/health`);
  return parseJson<HealthResponse>(response);
}

export async function getStatus() {
  const response = await fetch(`${baseUrl}/admin/status`);
  return parseJson<StatusResponse>(response);
}

export async function getAliases() {
  const response = await fetch(`${baseUrl}/admin/aliases`);
  return parseJson<AliasesResponse>(response);
}

export async function switchAlias(active: string) {
  const response = await fetch(`${baseUrl}/admin/switch`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ active })
  });

  return parseJson<SwitchResponse>(response);
}

export async function reloadConfig() {
  const response = await fetch(`${baseUrl}/admin/reload`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: "{}"
  });

  return parseJson<SwitchResponse>(response);
}

export async function getServerProcessStatus() {
  if (!isTauriRuntime()) {
    return unavailableServerProcessStatus();
  }

  return invoke<ServerProcessStatus>("get_server_process_status");
}

export async function startServerProcess() {
  if (!isTauriRuntime()) {
    throw new Error("Server process control is only available in the desktop app.");
  }

  return invoke<ServerProcessStatus>("start_server_process");
}

export async function stopServerProcess() {
  if (!isTauriRuntime()) {
    throw new Error("Server process control is only available in the desktop app.");
  }

  return invoke<ServerProcessStatus>("stop_server_process");
}

export async function restartServerProcess() {
  if (!isTauriRuntime()) {
    throw new Error("Server process control is only available in the desktop app.");
  }

  return invoke<ServerProcessStatus>("restart_server_process");
}
