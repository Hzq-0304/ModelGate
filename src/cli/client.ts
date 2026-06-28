export type AdminStatus = {
  name: string;
  active: string;
  entrypoints: Record<string, {
    use: string;
    resolved: string;
  }>;
};

export type AdminAliases = {
  active: string;
  aliases: Array<{
    name: string;
    provider: string;
    model: string;
  }>;
};

type SwitchResult = {
  ok: boolean;
  active: string;
};

type ErrorResponse = {
  error?: {
    message?: string;
  };
};

const defaultBaseUrl = "http://127.0.0.1:11435";

function getBaseUrl() {
  return (process.env.MODEL_GATE_URL ?? process.env.MODELGATE_URL ?? defaultBaseUrl).replace(/\/+$/, "");
}

async function parseResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null) as ErrorResponse | T | null;

  if (!response.ok) {
    const message = json && typeof json === "object" && "error" in json && json.error?.message
      ? json.error.message
      : `ModelGate returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

export async function getStatus() {
  const response = await fetch(`${getBaseUrl()}/admin/status`);
  return parseResponse<AdminStatus>(response);
}

export async function getAliases() {
  const response = await fetch(`${getBaseUrl()}/admin/aliases`);
  return parseResponse<AdminAliases>(response);
}

export async function switchAlias(active: string) {
  const response = await fetch(`${getBaseUrl()}/admin/switch`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ active })
  });

  return parseResponse<SwitchResult>(response);
}

export async function reloadConfig() {
  const response = await fetch(`${getBaseUrl()}/admin/reload`, {
    method: "POST"
  });

  return parseResponse<SwitchResult>(response);
}
