import type { ModelGateConfig } from "../config/schema.js";

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
