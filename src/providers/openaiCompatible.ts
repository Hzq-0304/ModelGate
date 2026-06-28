import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { FastifyReply } from "fastify";
import type { ModelGateConfig } from "../config/schema.js";
import type {
  ChatCompletionRequestBody,
  OpenAICompatibleError,
  OpenAICompatibleProviderConfig
} from "./types.js";

type Delta = {
  role?: "assistant";
  content?: string;
};

export function createModelList(config: ModelGateConfig) {
  const now = Math.floor(Date.now() / 1000);

  return {
    object: "list",
    data: Object.entries(config.aliases).map(([id, alias]) => ({
      id,
      object: "model",
      created: now,
      owned_by: alias.provider
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

export function createOpenAICompatibleError(
  message: string,
  type = "invalid_request_error",
  code: string | null = null
): OpenAICompatibleError {
  return {
    error: {
      message,
      type,
      code
    }
  };
}

export async function forwardOpenAICompatibleChatCompletion(
  body: ChatCompletionRequestBody,
  provider: OpenAICompatibleProviderConfig,
  upstreamModel: string
): Promise<Response> {
  const upstreamBody = {
    ...body,
    model: upstreamModel
  };
  const baseUrl = provider.base_url.replace(/\/+$/, "");

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.api_key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(upstreamBody)
  });
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

export async function sendOpenAICompatibleStream(response: Response, reply: FastifyReply) {
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

  await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), reply.raw);
}
