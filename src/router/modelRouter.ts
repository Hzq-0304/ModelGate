import type { FastifyInstance } from "fastify";
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
import type { RequestLogEntry } from "../runtime/requestLog.js";
import type { RuntimeState } from "../runtime/state.js";

type ResolveModelRouteResult =
  | { route: ResolvedModelRoute }
  | { error: string };

function truncate(value: string, maxLength = 300) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function contentLength(value: unknown): number {
  if (typeof value === "string") {
    return value.length;
  }

  if (value === null || value === undefined) {
    return 0;
  }

  return JSON.stringify(value).length;
}

function promptChars(body: ChatCompletionRequestBody) {
  return (body.messages ?? []).reduce((total, message) => total + contentLength(message.content), 0);
}

function resolveModelRoute(runtime: RuntimeState, requestedModel?: string): ResolveModelRouteResult {
  const config = runtime.config;
  const entrypoint = requestedModel ? config.entrypoints[requestedModel] : undefined;
  const aliasName = entrypoint
    ? entrypoint.use === "active"
      ? runtime.activeAlias
      : entrypoint.use
    : requestedModel && config.aliases[requestedModel]
      ? requestedModel
      : runtime.activeAlias;
  const alias = config.aliases[aliasName];

  if (!alias) {
    return {
      error: `Unable to resolve model "${requestedModel ?? runtime.activeAlias}"; active alias "${runtime.activeAlias}" is not configured`
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

export async function registerModelRouter(server: FastifyInstance, runtime: RuntimeState) {
  server.get("/v1/models", async () => createModelList(runtime.config));

  server.post<{ Body: ChatCompletionRequestBody }>("/v1/chat/completions", async (request, reply) => {
    const body = request.body ?? {};
    const startedAt = new Date();
    const startedMs = Date.now();
    const stream = Boolean(body.stream);
    const baseLog = {
      id: crypto.randomUUID(),
      kind: "normal" as const,
      started_at: startedAt.toISOString(),
      method: "POST" as const,
      path: "/v1/chat/completions" as const,
      requested_model: body.model,
      stream,
      prompt_chars: promptChars(body)
    };
    const addLog = (details: Partial<RequestLogEntry>) => {
      const finishedMs = Date.now();
      runtime.requestLogs.addRequestLog({
        ...baseLog,
        finished_at: new Date(finishedMs).toISOString(),
        duration_ms: finishedMs - startedMs,
        ok: false,
        ...details
      });
    };
    const resolved = resolveModelRoute(runtime, body.model);

    if ("error" in resolved) {
      addLog({
        status_code: 400,
        ok: false,
        error_type: "invalid_request_error",
        error_message: truncate(resolved.error)
      });
      return reply
        .status(400)
        .send(createOpenAICompatibleError(resolved.error));
    }

    const { route } = resolved;

    if (route.provider.type === "mock") {
      if (!body.stream) {
        const response = createMockChatCompletion(route.requestedModel);
        addLog({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 200,
          ok: true,
          response_chars: JSON.stringify(response).length
        });
        return response;
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
      addLog({
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 200,
        ok: true
      });
      return;
    }

    let upstream: Response;

    try {
      upstream = await forwardOpenAICompatibleChatCompletion(body, route.provider, route.upstreamModel);
    } catch (error) {
      addLog({
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 502,
        ok: false,
        error_type: "upstream_error",
        error_message: truncate(`Failed to reach upstream provider "${route.providerName}": ${getErrorMessage(error)}`)
      });
      return reply
        .status(502)
        .send(createOpenAICompatibleError(`Failed to reach upstream provider "${route.providerName}": ${getErrorMessage(error)}`, "upstream_error"));
    }

    if (!upstream.ok) {
      const upstreamError = await readUpstreamError(upstream);
      addLog({
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: upstream.status,
        ok: false,
        error_type: upstreamError.error.type,
        error_message: truncate(upstreamError.error.message)
      });
      return reply.status(upstream.status).send(upstreamError);
    }

    if (body.stream) {
      try {
        await sendOpenAICompatibleStream(upstream, reply);
        addLog({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: upstream.status,
          ok: true
        });
      } catch (error) {
        addLog({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: upstream.status || 502,
          ok: false,
          error_type: "stream_error",
          error_message: truncate(getErrorMessage(error))
        });
        throw error;
      }
      return;
    }

    const json = await upstream.json().catch((error: unknown) => error);

    if (json instanceof Error) {
      addLog({
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 502,
        ok: false,
        error_type: "upstream_error",
        error_message: truncate(`Upstream provider "${route.providerName}" returned invalid JSON: ${getErrorMessage(json)}`)
      });
      return reply
        .status(502)
        .send(createOpenAICompatibleError(`Upstream provider "${route.providerName}" returned invalid JSON: ${getErrorMessage(json)}`, "upstream_error"));
    }

    addLog({
      resolved_alias: route.aliasName,
      provider: route.providerName,
      upstream_model: route.upstreamModel,
      status_code: upstream.status,
      ok: true,
      response_chars: JSON.stringify(json).length
    });
    return reply.status(upstream.status).send(json);
  });
}
