import type { FastifyInstance } from "fastify";
import type { ModelGateConfig } from "../config/schema.js";
import {
  createOpenAICompatibleError,
  createMockChatCompletion,
  createMockChatCompletionChunk,
  createModelList,
  forwardOpenAICompatibleChatCompletion,
  readUpstreamError,
  sendOpenAICompatibleStream
} from "../providers/openaiCompatible.js";
import type { ChatCompletionRequestBody, ResolvedModelRoute } from "../providers/types.js";

type ResolveModelRouteResult =
  | { route: ResolvedModelRoute }
  | { error: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resolveModelRoute(config: ModelGateConfig, requestedModel?: string): ResolveModelRouteResult {
  const aliasName = requestedModel && config.aliases[requestedModel] ? requestedModel : config.active;
  const alias = config.aliases[aliasName];

  if (!alias) {
    return {
      error: `Unable to resolve model alias "${requestedModel ?? config.active}"; active alias "${config.active}" is not configured`
    };
  }

  const provider = config.providers[alias.provider];

  if (!provider) {
    return {
      error: `Provider "${alias.provider}" for alias "${aliasName}" is not configured`
    };
  }

  return {
    route: {
      aliasName,
      providerName: alias.provider,
      requestedModel: requestedModel ?? aliasName,
      upstreamModel: alias.model,
      provider
    }
  };
}

export async function registerModelRouter(server: FastifyInstance, config: ModelGateConfig) {
  server.get("/v1/models", async () => createModelList(config));

  server.post<{ Body: ChatCompletionRequestBody }>("/v1/chat/completions", async (request, reply) => {
    const body = request.body ?? {};
    const resolved = resolveModelRoute(config, body.model);

    if ("error" in resolved) {
      return reply
        .status(400)
        .send(createOpenAICompatibleError(resolved.error));
    }

    const { route } = resolved;

    if (route.provider.type === "mock") {
      if (!body.stream) {
        return createMockChatCompletion(route.requestedModel);
      }

      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no"
      });

      const chunks = [
        createMockChatCompletionChunk(route.requestedModel, { role: "assistant", content: "" }),
        createMockChatCompletionChunk(route.requestedModel, { content: "ModelGate mock response." }),
        createMockChatCompletionChunk(route.requestedModel, {}, "stop")
      ];

      for (const chunk of chunks) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return;
    }

    let upstream: Response;

    try {
      upstream = await forwardOpenAICompatibleChatCompletion(body, route.provider, route.upstreamModel);
    } catch (error) {
      return reply
        .status(502)
        .send(createOpenAICompatibleError(`Failed to reach upstream provider "${route.providerName}": ${getErrorMessage(error)}`, "upstream_error"));
    }

    if (!upstream.ok) {
      return reply.status(upstream.status).send(await readUpstreamError(upstream));
    }

    if (body.stream) {
      await sendOpenAICompatibleStream(upstream, reply);
      return;
    }

    const json = await upstream.json().catch((error: unknown) => error);

    if (json instanceof Error) {
      return reply
        .status(502)
        .send(createOpenAICompatibleError(`Upstream provider "${route.providerName}" returned invalid JSON: ${getErrorMessage(json)}`, "upstream_error"));
    }

    return reply.status(upstream.status).send(json);
  });
}
