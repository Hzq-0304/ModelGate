import type { FastifyInstance } from "fastify";
import type { ModelGateConfig } from "../config/schema.js";
import {
  createMockChatCompletion,
  createMockChatCompletionChunk,
  createModelList
} from "../providers/openaiCompatible.js";

type ChatCompletionRequest = {
  model: string;
  messages?: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content?: string | Array<unknown> | null;
  }>;
  stream?: boolean;
};

export async function registerModelRouter(server: FastifyInstance, config: ModelGateConfig) {
  server.get("/v1/models", async () => createModelList(config));

  server.post<{ Body: ChatCompletionRequest }>("/v1/chat/completions", async (request, reply) => {
    const body = request.body;
    const model = body?.model || config.active;

    if (!body?.stream) {
      return createMockChatCompletion(model);
    }

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    const chunks = [
      createMockChatCompletionChunk(model, { role: "assistant", content: "" }),
      createMockChatCompletionChunk(model, { content: "ModelGate mock response." }),
      createMockChatCompletionChunk(model, {}, "stop")
    ];

    for (const chunk of chunks) {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  });
}
