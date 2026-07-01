import type { FastifyInstance } from "fastify";
import {
  createOpenAICompatibleError,
  createMissingEnvError,
  createMockChatCompletion,
  createMockChatCompletionChunk,
  createMockResponse,
  createModelList,
  forwardOpenAICompatibleChatCompletion,
  forwardOpenAICompatibleResponse,
  MissingProviderEnvironmentError,
  readUpstreamError,
  sendOpenAICompatibleStream
} from "../providers/openaiCompatible.js";
import type { ChatCompletionRequestBody, ResolvedModelRoute, ResponsesRequestBody } from "../providers/types.js";
import type { RequestLogEntry } from "../runtime/requestLog.js";
import type { RuntimeState } from "../runtime/state.js";
import {
  estimateUsageCost,
  extractChatUsage,
  extractResponsesUsage,
  type TokenUsage,
  type UsageApiType,
  type UsageFallbackMode,
  type UsageKind,
  type UsagePath
} from "../runtime/usageStore.js";

type ResolveModelRouteResult =
  | { route: ResolvedModelRoute }
  | { error: string };

type UsageBase = {
  kind: UsageKind;
  api_type: UsageApiType;
  path: UsagePath;
  requested_model?: string;
  stream: boolean;
};

type UsageDetails = {
  resolved_alias?: string;
  provider?: string;
  upstream_model?: string;
  fallback_mode?: UsageFallbackMode;
  ok: boolean;
  status_code?: number;
};

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

function responsesPromptChars(body: ResponsesRequestBody) {
  return contentLength(body.instructions) + contentLength(body.input);
}

function writeUsageRecord(
  runtime: RuntimeState,
  base: UsageBase,
  startedMs: number,
  details: UsageDetails,
  usage: TokenUsage = {}
) {
  const finishedMs = Date.now();
  const cost = estimateUsageCost(runtime.config, details.provider, details.upstream_model, usage);

  runtime.usageStore.addUsageRecord({
    id: crypto.randomUUID(),
    timestamp: new Date(finishedMs).toISOString(),
    ...base,
    ...details,
    duration_ms: finishedMs - startedMs,
    ...usage,
    ...cost
  });
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

type ConversionResult =
  | { chatBody: ChatCompletionRequestBody }
  | { error: string };

function unsupportedResponsesFeature(message = "This Responses API feature is not supported by the chat completions fallback."): ConversionResult {
  return { error: message };
}

function normalizeResponseContent(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const typed = item as { type?: unknown; text?: unknown };
    if ((typed.type === "input_text" || typed.type === "output_text" || typed.type === "text") && typeof typed.text === "string") {
      parts.push(typed.text);
      continue;
    }

    return null;
  }

  return parts.join("");
}

function responsesInputToMessages(input: unknown): ConversionResult {
  if (typeof input === "string") {
    return {
      chatBody: {
        messages: [
          {
            role: "user",
            content: input
          }
        ]
      }
    };
  }

  if (!Array.isArray(input)) {
    return unsupportedResponsesFeature("Responses input must be a string or a simple message array for chat completions fallback.");
  }

  const messages: ChatCompletionRequestBody["messages"] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      return unsupportedResponsesFeature();
    }

    const typed = item as { role?: unknown; content?: unknown; type?: unknown };
    if (typed.type && typed.type !== "message") {
      return unsupportedResponsesFeature();
    }

    if (typeof typed.role !== "string") {
      return unsupportedResponsesFeature("Responses message items must include a role for chat completions fallback.");
    }

    const content = normalizeResponseContent(typed.content);
    if (content === null) {
      return unsupportedResponsesFeature();
    }

    messages.push({
      role: typed.role,
      content
    });
  }

  return { chatBody: { messages } };
}

function responsesToChatCompletionBody(body: ResponsesRequestBody, upstreamModel: string): ConversionResult {
  const unsupportedKeys = [
    "file_search",
    "computer_use",
    "reasoning",
    "response_format",
    "text",
    "modalities",
    "previous_response_id"
  ];

  for (const key of unsupportedKeys) {
    if (key in body) {
      return unsupportedResponsesFeature();
    }
  }

  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (tool && typeof tool === "object") {
        const type = (tool as { type?: unknown }).type;
        if (type === "file_search" || type === "computer_use") {
          return unsupportedResponsesFeature();
        }
      }
    }
  }

  const converted = responsesInputToMessages(body.input ?? "");
  if ("error" in converted) {
    return converted;
  }

  const messages = [...(converted.chatBody.messages ?? [])];
  if (typeof body.instructions === "string" && body.instructions.length > 0) {
    messages.unshift({
      role: "system",
      content: body.instructions
    });
  } else if (body.instructions !== undefined) {
    return unsupportedResponsesFeature("Responses instructions must be a string for chat completions fallback.");
  }

  const chatBody: ChatCompletionRequestBody = {
    model: upstreamModel,
    messages,
    stream: body.stream
  };

  if (body.max_output_tokens !== undefined) {
    chatBody.max_tokens = body.max_output_tokens;
  }
  if (body.temperature !== undefined) {
    chatBody.temperature = body.temperature;
  }
  if (body.top_p !== undefined) {
    chatBody.top_p = body.top_p;
  }
  if (body.tools !== undefined) {
    chatBody.tools = body.tools;
  }
  if (body.tool_choice !== undefined) {
    chatBody.tool_choice = body.tool_choice;
  }

  return { chatBody };
}

function chatCompletionToResponsesJson(chat: Record<string, unknown>, model: string) {
  const choice = Array.isArray(chat.choices) ? chat.choices[0] as { message?: { content?: unknown } } | undefined : undefined;
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : content === undefined ? "" : JSON.stringify(content);
  const usage = chat.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

  return {
    id: `resp_modelgate_${crypto.randomUUID()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [
      {
        id: `msg_modelgate_${crypto.randomUUID()}`,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text
          }
        ]
      }
    ],
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
      total_tokens: usage?.total_tokens ?? 0
    }
  };
}

function extractChatDelta(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const first = choices[0] as { delta?: { content?: unknown } };
  return typeof first.delta?.content === "string" ? first.delta.content : "";
}

async function sendResponsesFallbackStream(
  upstream: Response,
  reply: Parameters<typeof sendOpenAICompatibleStream>[1],
  model: string,
  onEventData?: (data: unknown) => void
) {
  if (!upstream.body) {
    reply.status(502).send(createOpenAICompatibleError("Upstream response did not include a stream body", "upstream_error"));
    return;
  }

  const responseId = `resp_modelgate_${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  reply.hijack();
  reply.raw.writeHead(upstream.status, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });

  const writeEvent = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  writeEvent("response.created", {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "in_progress",
    model
  });

  const reader = upstream.body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
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

          const parsed = JSON.parse(data) as unknown;
          onEventData?.(parsed);
          const delta = extractChatDelta(parsed);
          if (delta) {
            writeEvent("response.output_text.delta", { delta });
          }
        }
      }
    }

    writeEvent("response.completed", {
      id: responseId,
      object: "response",
      status: "completed",
      model
    });
    reply.raw.write("data: [DONE]\n\n");
  } catch (error) {
    writeEvent("response.failed", {
      id: responseId,
      object: "response",
      status: "failed",
      error: {
        type: "stream_error",
        message: truncate(getErrorMessage(error))
      }
    });
  } finally {
    reply.raw.end();
    await reader.cancel().catch(() => undefined);
  }
}

function sendMockResponseStream(reply: Parameters<typeof sendOpenAICompatibleStream>[1], model: string) {
  const response = createMockResponse(model);
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
  reply.raw.write(`event: response.created\ndata: ${JSON.stringify({ ...response, status: "in_progress", output: [] })}\n\n`);
  reply.raw.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ delta: "Hello from ModelGate mock responses provider." })}\n\n`);
  reply.raw.write(`event: response.completed\ndata: ${JSON.stringify(response)}\n\n`);
  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
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
      api_type: "chat_completions" as const,
      requested_model: body.model,
      stream,
      prompt_chars: promptChars(body)
    };
    const baseUsage = {
      kind: "normal" as const,
      path: "/v1/chat/completions" as const,
      api_type: "chat_completions" as const,
      requested_model: body.model,
      stream
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
    const addUsage = (details: UsageDetails, usage: TokenUsage = {}) => {
      writeUsageRecord(runtime, baseUsage, startedMs, details, usage);
    };
    const resolved = resolveModelRoute(runtime, body.model);

    if ("error" in resolved) {
      addLog({
        status_code: 400,
        ok: false,
        error_type: "invalid_request_error",
        error_message: truncate(resolved.error)
      });
      addUsage({
        status_code: 400,
        ok: false
      });
      return reply
        .status(400)
        .send(createOpenAICompatibleError(resolved.error));
    }

    const { route } = resolved;

    if (route.provider.type === "mock") {
      if (!body.stream) {
        const response = createMockChatCompletion(route.requestedModel);
        const usage = extractChatUsage(response);
        addLog({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 200,
          ok: true,
          response_chars: JSON.stringify(response).length
        });
        addUsage({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 200,
          ok: true
        }, usage);
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
      addUsage({
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
      upstream = await forwardOpenAICompatibleChatCompletion(body, route.provider, route.providerName, route.upstreamModel);
    } catch (error) {
      if (error instanceof MissingProviderEnvironmentError) {
        addLog({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 400,
          ok: false,
          error_type: "missing_environment_variable",
          error_message: truncate(error.message)
        });
        addUsage({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 400,
          ok: false
        });
        return reply.status(400).send(createMissingEnvError(error.warning));
      }

      addLog({
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 502,
        ok: false,
        error_type: "upstream_error",
        error_message: truncate(`Failed to reach upstream provider "${route.providerName}": ${getErrorMessage(error)}`)
      });
      addUsage({
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 502,
        ok: false
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
      addUsage({
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: upstream.status,
        ok: false
      });
      return reply.status(upstream.status).send(upstreamError);
    }

    if (body.stream) {
      let streamUsage: TokenUsage = {};
      try {
        await sendOpenAICompatibleStream(upstream, reply, (data) => {
          const nextUsage = extractChatUsage(data);
          if (Object.values(nextUsage).some((value) => value !== undefined)) {
            streamUsage = nextUsage;
          }
        });
        addLog({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: upstream.status,
          ok: true
        });
        addUsage({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: upstream.status,
          ok: true
        }, streamUsage);
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
        addUsage({
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: upstream.status || 502,
          ok: false
        }, streamUsage);
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
      addUsage({
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 502,
        ok: false
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
    addUsage({
      resolved_alias: route.aliasName,
      provider: route.providerName,
      upstream_model: route.upstreamModel,
      status_code: upstream.status,
      ok: true
    }, extractChatUsage(json));
    return reply.status(upstream.status).send(json);
  });

  server.post<{ Body: ResponsesRequestBody }>("/v1/responses", async (request, reply) => {
    const body = request.body ?? {};
    const startedAt = new Date();
    const startedMs = Date.now();
    const stream = Boolean(body.stream);
    const baseLog = {
      id: crypto.randomUUID(),
      kind: "normal" as const,
      started_at: startedAt.toISOString(),
      method: "POST" as const,
      path: "/v1/responses" as const,
      api_type: "responses" as const,
      requested_model: body.model,
      stream,
      prompt_chars: responsesPromptChars(body)
    };
    const baseUsage = {
      kind: "normal" as const,
      path: "/v1/responses" as const,
      api_type: "responses" as const,
      requested_model: body.model,
      stream
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
    const addUsage = (details: UsageDetails, usage: TokenUsage = {}) => {
      writeUsageRecord(runtime, baseUsage, startedMs, details, usage);
    };
    const resolved = resolveModelRoute(runtime, body.model);

    if ("error" in resolved) {
      addLog({
        status_code: 400,
        ok: false,
        error_type: "invalid_request_error",
        error_message: truncate(resolved.error)
      });
      addUsage({
        status_code: 400,
        ok: false
      });
      return reply
        .status(400)
        .send(createOpenAICompatibleError(resolved.error));
    }

    const { route } = resolved;

    if (route.provider.type === "mock") {
      const converted = responsesToChatCompletionBody(body, route.upstreamModel);
      if ("error" in converted) {
        addLog({
          fallback_mode: "responses_to_chat",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 400,
          ok: false,
          error_type: "unsupported_responses_feature",
          error_message: truncate(converted.error)
        });
        addUsage({
          fallback_mode: "responses_to_chat",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 400,
          ok: false
        });
        return reply
          .status(400)
          .send(createOpenAICompatibleError(converted.error, "unsupported_responses_feature"));
      }

      if (stream) {
        sendMockResponseStream(reply, route.upstreamModel);
        addLog({
          fallback_mode: "responses_to_chat",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 200,
          ok: true
        });
        addUsage({
          fallback_mode: "responses_to_chat",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 200,
          ok: true
        });
        return;
      }

      const response = createMockResponse(route.upstreamModel);
      const usage = extractResponsesUsage(response);
      addLog({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 200,
        ok: true,
        response_chars: JSON.stringify(response).length
      });
      addUsage({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 200,
        ok: true
      }, usage);
      return response;
    }

    if (route.provider.responses_api) {
      let upstream: Response;
      try {
        upstream = await forwardOpenAICompatibleResponse(body, route.provider, route.providerName, route.upstreamModel);
      } catch (error) {
        if (error instanceof MissingProviderEnvironmentError) {
          addLog({
            fallback_mode: "direct_responses",
            resolved_alias: route.aliasName,
            provider: route.providerName,
            upstream_model: route.upstreamModel,
            status_code: 400,
            ok: false,
            error_type: "missing_environment_variable",
            error_message: truncate(error.message)
          });
          addUsage({
            fallback_mode: "direct_responses",
            resolved_alias: route.aliasName,
            provider: route.providerName,
            upstream_model: route.upstreamModel,
            status_code: 400,
            ok: false
          });
          return reply.status(400).send(createMissingEnvError(error.warning));
        }

        addLog({
          fallback_mode: "direct_responses",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 502,
          ok: false,
          error_type: "upstream_error",
          error_message: truncate(`Failed to reach upstream provider "${route.providerName}": ${getErrorMessage(error)}`)
        });
        addUsage({
          fallback_mode: "direct_responses",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 502,
          ok: false
        });
        return reply
          .status(502)
          .send(createOpenAICompatibleError(`Failed to reach upstream provider "${route.providerName}": ${getErrorMessage(error)}`, "upstream_error"));
      }

      if (!upstream.ok) {
        const upstreamError = await readUpstreamError(upstream);
        addLog({
          fallback_mode: "direct_responses",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: upstream.status,
          ok: false,
          error_type: upstreamError.error.type,
          error_message: truncate(upstreamError.error.message)
        });
        addUsage({
          fallback_mode: "direct_responses",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: upstream.status,
          ok: false
        });
        return reply.status(upstream.status).send(upstreamError);
      }

      if (stream) {
        let streamUsage: TokenUsage = {};
        try {
          await sendOpenAICompatibleStream(upstream, reply, (data) => {
            const nextUsage = extractResponsesUsage(data);
            if (Object.values(nextUsage).some((value) => value !== undefined)) {
              streamUsage = nextUsage;
            }
          });
          addLog({
            fallback_mode: "direct_responses",
            resolved_alias: route.aliasName,
            provider: route.providerName,
            upstream_model: route.upstreamModel,
            status_code: upstream.status,
            ok: true
          });
          addUsage({
            fallback_mode: "direct_responses",
            resolved_alias: route.aliasName,
            provider: route.providerName,
            upstream_model: route.upstreamModel,
            status_code: upstream.status,
            ok: true
          }, streamUsage);
        } catch (error) {
          addLog({
            fallback_mode: "direct_responses",
            resolved_alias: route.aliasName,
            provider: route.providerName,
            upstream_model: route.upstreamModel,
            status_code: upstream.status || 502,
            ok: false,
            error_type: "stream_error",
            error_message: truncate(getErrorMessage(error))
          });
          addUsage({
            fallback_mode: "direct_responses",
            resolved_alias: route.aliasName,
            provider: route.providerName,
            upstream_model: route.upstreamModel,
            status_code: upstream.status || 502,
            ok: false
          }, streamUsage);
          throw error;
        }
        return;
      }

      const json = await upstream.json().catch((error: unknown) => error);
      if (json instanceof Error) {
        addLog({
          fallback_mode: "direct_responses",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 502,
          ok: false,
          error_type: "upstream_error",
          error_message: truncate(`Upstream provider "${route.providerName}" returned invalid JSON: ${getErrorMessage(json)}`)
        });
        addUsage({
          fallback_mode: "direct_responses",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 502,
          ok: false
        });
        return reply
          .status(502)
          .send(createOpenAICompatibleError(`Upstream provider "${route.providerName}" returned invalid JSON: ${getErrorMessage(json)}`, "upstream_error"));
      }

      addLog({
        fallback_mode: "direct_responses",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: upstream.status,
        ok: true,
        response_chars: JSON.stringify(json).length
      });
      addUsage({
        fallback_mode: "direct_responses",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: upstream.status,
        ok: true
      }, extractResponsesUsage(json));
      return reply.status(upstream.status).send(json);
    }

    const converted = responsesToChatCompletionBody(body, route.upstreamModel);
    if ("error" in converted) {
      addLog({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 400,
        ok: false,
        error_type: "unsupported_responses_feature",
        error_message: truncate(converted.error)
      });
      addUsage({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 400,
        ok: false
      });
      return reply
        .status(400)
        .send(createOpenAICompatibleError(converted.error, "unsupported_responses_feature"));
    }

    let upstream: Response;
    try {
      upstream = await forwardOpenAICompatibleChatCompletion(converted.chatBody, route.provider, route.providerName, route.upstreamModel);
    } catch (error) {
      if (error instanceof MissingProviderEnvironmentError) {
        addLog({
          fallback_mode: "responses_to_chat",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 400,
          ok: false,
          error_type: "missing_environment_variable",
          error_message: truncate(error.message)
        });
        addUsage({
          fallback_mode: "responses_to_chat",
          resolved_alias: route.aliasName,
          provider: route.providerName,
          upstream_model: route.upstreamModel,
          status_code: 400,
          ok: false
        });
        return reply.status(400).send(createMissingEnvError(error.warning));
      }

      addLog({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 502,
        ok: false,
        error_type: "upstream_error",
        error_message: truncate(`Failed to reach upstream provider "${route.providerName}": ${getErrorMessage(error)}`)
      });
      addUsage({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 502,
        ok: false
      });
      return reply
        .status(502)
        .send(createOpenAICompatibleError(`Failed to reach upstream provider "${route.providerName}": ${getErrorMessage(error)}`, "upstream_error"));
    }

    if (!upstream.ok) {
      const upstreamError = await readUpstreamError(upstream);
      addLog({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: upstream.status,
        ok: false,
        error_type: upstreamError.error.type,
        error_message: truncate(upstreamError.error.message)
      });
      addUsage({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: upstream.status,
        ok: false
      });
      return reply.status(upstream.status).send(upstreamError);
    }

    if (stream) {
      let streamUsage: TokenUsage = {};
      await sendResponsesFallbackStream(upstream, reply, route.requestedModel, (data) => {
        const nextUsage = extractChatUsage(data);
        if (Object.values(nextUsage).some((value) => value !== undefined)) {
          streamUsage = nextUsage;
        }
      });
      addLog({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: upstream.status,
        ok: true
      });
      addUsage({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: upstream.status,
        ok: true
      }, {
        input_tokens: streamUsage.input_tokens,
        output_tokens: streamUsage.output_tokens,
        cached_tokens: streamUsage.cached_tokens,
        reasoning_tokens: streamUsage.reasoning_tokens,
        total_tokens: streamUsage.total_tokens
      });
      return;
    }

    const json = await upstream.json().catch((error: unknown) => error);
    if (json instanceof Error) {
      addLog({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 502,
        ok: false,
        error_type: "upstream_error",
        error_message: truncate(`Upstream provider "${route.providerName}" returned invalid JSON: ${getErrorMessage(json)}`)
      });
      addUsage({
        fallback_mode: "responses_to_chat",
        resolved_alias: route.aliasName,
        provider: route.providerName,
        upstream_model: route.upstreamModel,
        status_code: 502,
        ok: false
      });
      return reply
        .status(502)
        .send(createOpenAICompatibleError(`Upstream provider "${route.providerName}" returned invalid JSON: ${getErrorMessage(json)}`, "upstream_error"));
    }

    const response = chatCompletionToResponsesJson(json as Record<string, unknown>, route.requestedModel);
    const usage = extractResponsesUsage(response);
    addLog({
      fallback_mode: "responses_to_chat",
      resolved_alias: route.aliasName,
      provider: route.providerName,
      upstream_model: route.upstreamModel,
      status_code: upstream.status,
      ok: true,
      response_chars: JSON.stringify(response).length
    });
    addUsage({
      fallback_mode: "responses_to_chat",
      resolved_alias: route.aliasName,
      provider: route.providerName,
      upstream_model: route.upstreamModel,
      status_code: upstream.status,
      ok: true
    }, usage);
    return reply.status(upstream.status).send(response);
  });

  server.get("/v1/responses/:id", async (_request, reply) => reply
    .status(404)
    .send(createOpenAICompatibleError("Persistent Responses API retrieval is not supported by ModelGate yet.", "not_supported")));

  server.delete("/v1/responses/:id", async (_request, reply) => reply
    .status(404)
    .send(createOpenAICompatibleError("Persistent Responses API deletion is not supported by ModelGate yet.", "not_supported")));
}
