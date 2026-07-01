import type { FastifyReply } from "fastify";
import { resolveProviderApiKey, type MissingEnvWarning } from "../config/env.js";
import type { ModelGateConfig } from "../config/schema.js";
import type {
  ChatCompletionRequestBody,
  OpenAICompatibleError,
  OpenAICompatibleProviderConfig,
  ResponsesRequestBody
} from "./types.js";

type Delta = {
  role?: "assistant";
  content?: string;
};

export function createModelList(config: ModelGateConfig) {
  const now = Math.floor(Date.now() / 1000);
  const models = new Map<string, { id: string; owned_by: string }>();

  for (const [id, alias] of Object.entries(config.aliases)) {
    models.set(id, { id, owned_by: alias.provider });
  }

  for (const id of Object.keys(config.entrypoints)) {
    models.set(id, { id, owned_by: "modelgate" });
  }

  return {
    object: "list",
    data: [...models.values()].map((model) => ({
      id: model.id,
      object: "model",
      created: now,
      owned_by: model.owned_by
    }))
  };
}

export function createMockChatCompletion(model: string) {
  const created = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-mock-${crypto.randomUUID()}`;

  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "ModelGate mock response."
        },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 4,
      total_tokens: 4
    }
  };
}

export function createMockChatCompletionChunk(
  model: string,
  delta: Delta,
  finishReason: "stop" | null = null
) {
  const created = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-mock-${crypto.randomUUID()}`;

  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason
      }
    ]
  };
}

export function createMockResponse(model: string) {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: `resp_mock_${crypto.randomUUID()}`,
    object: "response",
    created_at: created,
    status: "completed",
    model,
    output: [
      {
        id: `msg_mock_${crypto.randomUUID()}`,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "Hello from ModelGate mock responses provider."
          }
        ]
      }
    ],
    usage: {
      input_tokens: 0,
      output_tokens: 7,
      total_tokens: 7
    }
  };
}

export function createOpenAICompatibleError(
  message: string,
  type = "invalid_request_error",
  code: string | null = null,
  extra: Partial<OpenAICompatibleError["error"]> = {}
): OpenAICompatibleError {
  return {
    error: {
      message,
      type,
      code,
      ...extra
    }
  };
}

export function createMissingEnvError(warning: MissingEnvWarning): OpenAICompatibleError {
  return createOpenAICompatibleError(
    warning.message,
    "missing_environment_variable",
    null,
    {
      provider: warning.provider,
      env: warning.envName
    }
  );
}

export async function forwardOpenAICompatibleChatCompletion(
  body: ChatCompletionRequestBody,
  provider: OpenAICompatibleProviderConfig,
  providerName: string,
  upstreamModel: string
): Promise<Response> {
  const upstreamBody = {
    ...body,
    model: upstreamModel
  };
  const baseUrl = provider.base_url.replace(/\/+$/, "");
  const apiKey = resolveProviderApiKey(providerName, provider);

  if (!apiKey.ok) {
    throw new MissingProviderEnvironmentError(apiKey.warning);
  }

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(upstreamBody)
  });
}

export async function forwardOpenAICompatibleResponse(
  body: ResponsesRequestBody,
  provider: OpenAICompatibleProviderConfig,
  providerName: string,
  upstreamModel: string
): Promise<Response> {
  const upstreamBody = {
    ...body,
    model: upstreamModel
  };
  const baseUrl = provider.base_url.replace(/\/+$/, "");
  const apiKey = resolveProviderApiKey(providerName, provider);

  if (!apiKey.ok) {
    throw new MissingProviderEnvironmentError(apiKey.warning);
  }

  return fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(upstreamBody)
  });
}

export class MissingProviderEnvironmentError extends Error {
  readonly warning: MissingEnvWarning;

  constructor(warning: MissingEnvWarning) {
    super(warning.message);
    this.name = "MissingProviderEnvironmentError";
    this.warning = warning;
  }
}

export async function readUpstreamError(response: Response): Promise<OpenAICompatibleError> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => null);

    if (json && typeof json === "object" && "error" in json) {
      return json as OpenAICompatibleError;
    }

    return createOpenAICompatibleError(JSON.stringify(json), "upstream_error");
  }

  const text = await response.text().catch(() => "");
  return createOpenAICompatibleError(
    text || `Upstream provider returned HTTP ${response.status}`,
    "upstream_error"
  );
}

export async function sendOpenAICompatibleStream(
  response: Response,
  reply: FastifyReply,
  onEventData?: (data: unknown) => void
) {
  if (!response.body) {
    reply
      .status(502)
      .send(createOpenAICompatibleError("Upstream response did not include a stream body", "upstream_error"));
    return;
  }

  reply.hijack();
  reply.raw.writeHead(response.status, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const text = decoder.decode(value, { stream: true });
      reply.raw.write(value);

      if (!onEventData) {
        continue;
      }

      buffer += text;
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) {
            continue;
          }

          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") {
            continue;
          }

          try {
            onEventData(JSON.parse(data));
          } catch {
            // Ignore non-JSON SSE payloads while preserving the upstream stream.
          }
        }
      }
    }
  } finally {
    reply.raw.end();
    await reader.cancel().catch(() => undefined);
  }
}
