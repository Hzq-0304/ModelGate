import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/loadConfig.js";
import { createServer } from "../src/server/createServer.js";
import { RuntimeState } from "../src/runtime/state.js";

const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
const previousImportedToken = process.env.CCSWITCH_IMPORTED_TOKEN;
const previousResponsesDirectToken = process.env.RESPONSES_DIRECT_TOKEN;
delete process.env.OPENAI_API_KEY;

const tempDir = mkdtempSync(join(tmpdir(), "modelgate-missing-env-"));

async function withModelGate(configPath: string, callback: (baseUrl: string) => Promise<void>) {
  const config = await loadConfig({ configPath });
  const runtime = new RuntimeState(config, configPath);
  const server = await createServer(runtime);
  await server.listen({ host: "127.0.0.1", port: 0 });

  try {
    const address = server.server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await server.close();
  }
}

async function testLegacyMissingEnv() {
  const configPath = join(tempDir, "legacy-missing-env.yaml");

  writeFileSync(configPath, `server:
  host: 127.0.0.1
  port: 11435

active: codex-main

aliases:
  codex-main:
    provider: openai-official
    model: gpt-4.1-mini

providers:
  openai-official:
    type: openai-compatible
    base_url: https://api.openai.com/v1
    api_key: \${OPENAI_API_KEY}
`, "utf8");

  const config = await loadConfig({ configPath });
  assert.equal(config.providers["openai-official"]?.type, "openai-compatible");
  assert.equal(config.providers["openai-official"]?.api_key, "${OPENAI_API_KEY}");

  await withModelGate(configPath, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.name, "ModelGate");

    const status = await fetch(`${baseUrl}/admin/status`).then((response) => response.json());
    assert.equal(status.active, "codex-main");
    assert.equal(status.config_warnings?.[0]?.type, "missing_env");
    assert.equal(status.config_warnings?.[0]?.provider, "openai-official");
    assert.equal(status.config_warnings?.[0]?.env, "OPENAI_API_KEY");

    const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "codex-main",
        messages: [{ role: "user", content: "hello" }]
      })
    });
    const chatJson = await chatResponse.json();
    assert.equal(chatResponse.status, 400);
    assert.equal(chatJson.error.type, "missing_environment_variable");
    assert.equal(chatJson.error.provider, "openai-official");
    assert.equal(chatJson.error.env, "OPENAI_API_KEY");

    const responsesResponse = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "codex-main",
        input: "hello"
      })
    });
    const responsesJson = await responsesResponse.json();
    assert.equal(responsesResponse.status, 400);
    assert.equal(responsesJson.error.type, "missing_environment_variable");

    const largeResponsesResponse = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "codex-main",
        input: "x".repeat(70 * 1024 * 1024)
      })
    });
    const largeResponsesJson = await largeResponsesResponse.json();
    assert.equal(largeResponsesResponse.status, 400);
    assert.equal(largeResponsesJson.error.type, "missing_environment_variable");
  });
}

async function testCcSwitchImportedReferenceDoesNotWarnAsOpenAiEnv() {
  const configPath = join(tempDir, "ccswitch-imported-reference.yaml");

  writeFileSync(configPath, `server:
  host: 127.0.0.1
  port: 11435

active: codex-main

aliases:
  codex-main:
    provider: openai-official
    model: gpt-5.5

providers:
  openai-official:
    type: openai-compatible
    base_url: https://api.openai.com/v1
    auth:
      type: ccswitch
      source: CC Switch OpenAI Official
      app: codex
      provider_id: openai-official
      credential_ref: ccswitch://providers/codex/openai-official/auth
      credential_path: /auth/OPENAI_API_KEY
      fallback_env: OPENAI_API_KEY
      header: Authorization
      scheme: Bearer
`, "utf8");

  await withModelGate(configPath, async (baseUrl) => {
    const status = await fetch(`${baseUrl}/admin/status`).then((response) => response.json());
    assert.equal(status.config_warnings?.length ?? 0, 0);

    const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "codex-main",
        messages: [{ role: "user", content: "hello" }]
      })
    });
    const chatJson = await chatResponse.json();
    assert.equal(chatResponse.status, 400);
    assert.equal(chatJson.error.type, "missing_credential");
    assert.equal(chatJson.error.provider, "openai-official");
    assert.equal(chatJson.error.source, "CC Switch OpenAI Official");
    assert.notEqual(chatJson.error.type, "missing_environment_variable");
    assert.notEqual(chatJson.error.env, "OPENAI_API_KEY");
  });
}

async function testCcSwitchHardyAiReferenceDoesNotWarnAsHardyEnv() {
  delete process.env.HARDYAI_API_KEY;
  const configPath = join(tempDir, "ccswitch-hardyai-reference.yaml");

  writeFileSync(configPath, `server:
  host: 127.0.0.1
  port: 11435

active: hardyai

aliases:
  hardyai:
    provider: hardyai
    model: gpt-5.5
    description: HardyAI imported from CC Switch
    metadata:
      imported_from: ccswitch
      source_app: codex
      source_provider_id: hardyai-1782220605678
      source_config_hash: hash-hardyai
      source_fingerprint: fingerprint-hardyai

providers:
  hardyai:
    type: openai-compatible
    base_url: https://api.hardyapi.online
    api_key: \${HARDYAI_API_KEY}
    auth:
      type: ccswitch
      source: CC Switch provider_settings
      app: codex
      provider_id: hardyai-1782220605678
      credential_id: hardyai-1782220605678
      credential_ref: ccswitch://providers/codex/hardyai-1782220605678/auth
      credential_path: /auth/OPENAI_API_KEY
      fallback_env: HARDYAI_API_KEY
      header: Authorization
      scheme: Bearer
    description: HardyAI imported from CC Switch
    metadata:
      imported_from: ccswitch
      source_app: codex
      source_provider_id: hardyai-1782220605678
      source_config_hash: hash-hardyai
      source_fingerprint: fingerprint-hardyai
`, "utf8");

  const config = await loadConfig({ configPath });
  const provider = config.providers.hardyai;
  assert.equal(provider?.type, "openai-compatible");
  assert.equal(provider?.auth?.type, "ccswitch");
  assert.equal(provider?.auth?.credential_id, "hardyai-1782220605678");
  assert.equal(provider?.metadata?.source_config_hash, "hash-hardyai");

  await withModelGate(configPath, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
    assert.equal(health.ok, true);

    const status = await fetch(`${baseUrl}/admin/status`).then((response) => response.json());
    assert.equal(status.config_warnings?.length ?? 0, 0);
    assert.notEqual(status.config_warnings?.[0]?.env, "HARDYAI_API_KEY");

    const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "hardyai",
        messages: [{ role: "user", content: "hello" }]
      })
    });
    const chatJson = await chatResponse.json();
    assert.equal(chatResponse.status, 400);
    assert.equal(chatJson.error.type, "missing_credential");
    assert.equal(chatJson.error.provider, "hardyai");
    assert.equal(chatJson.error.credential_id, "ccswitch://providers/codex/hardyai-1782220605678/auth");
    assert.notEqual(chatJson.error.type, "missing_environment_variable");
    assert.notEqual(chatJson.error.env, "HARDYAI_API_KEY");
  });
}

async function testCcSwitchMissingCredentialWarningWithoutReference() {
  const configPath = join(tempDir, "ccswitch-missing-credential-warning.yaml");

  writeFileSync(configPath, `server:
  host: 127.0.0.1
  port: 11435

active: codex-main

aliases:
  codex-main:
    provider: openai-official
    model: gpt-5.5

providers:
  openai-official:
    type: openai-compatible
    base_url: https://api.openai.com/v1
    auth:
      type: ccswitch
      source: CC Switch OpenAI Official
      app: codex
      fallback_env: OPENAI_API_KEY
      header: Authorization
      scheme: Bearer
`, "utf8");

  await withModelGate(configPath, async (baseUrl) => {
    const status = await fetch(`${baseUrl}/admin/status`).then((response) => response.json());
    assert.equal(status.config_warnings?.[0]?.type, "missing_credential");
    assert.equal(status.config_warnings?.[0]?.provider, "openai-official");
    assert.equal(status.config_warnings?.[0]?.source, "CC Switch OpenAI Official");
    assert.equal(status.config_warnings?.[0]?.env, "OPENAI_API_KEY");
  });
}

async function testImportedCredentialHeader() {
  process.env.CCSWITCH_IMPORTED_TOKEN = "ccswitch-token";
  let seenAuthorization = "";
  let seenModel = "";

  const upstream = createHttpServer((request, response) => {
    seenAuthorization = request.headers.authorization ?? "";
    let raw = "";
    request.on("data", (chunk) => {
      raw += String(chunk);
    });
    request.on("end", () => {
      seenModel = JSON.parse(raw).model;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: seenModel,
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));

  try {
    const address = upstream.address();
    const upstreamPort = address && typeof address === "object" ? address.port : 0;
    const configPath = join(tempDir, "imported-credential-header.yaml");
    writeFileSync(configPath, `server:
  host: 127.0.0.1
  port: 11435

active: codex-main

aliases:
  codex-main:
    provider: openai-official
    model: gpt-5.5

providers:
  openai-official:
    type: openai-compatible
    base_url: http://127.0.0.1:${upstreamPort}/v1
    auth:
      type: static-header-ref
      header: Authorization
      scheme: Bearer
      value_env: CCSWITCH_IMPORTED_TOKEN
`, "utf8");

    await withModelGate(configPath, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "codex-main",
          messages: [{ role: "user", content: "hello" }]
        })
      });
      assert.equal(response.status, 200);
      await response.json();
      assert.equal(seenAuthorization, "Bearer ccswitch-token");
      assert.equal(seenModel, "gpt-5.5");
    });
  } finally {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
}

async function testResponsesDirectForwardingByDefault() {
  process.env.RESPONSES_DIRECT_TOKEN = "responses-token";
  let seenPath = "";
  let seenAuthorization = "";
  let seenModel = "";
  let sawResponsesOnlyField = false;
  let sawInputImage = false;
  let sawInputFile = false;

  const upstream = createHttpServer((request, response) => {
    seenPath = request.url ?? "";
    seenAuthorization = request.headers.authorization ?? "";
    let raw = "";
    request.on("data", (chunk) => {
      raw += String(chunk);
    });
    request.on("end", () => {
      const body = JSON.parse(raw || "{}") as { model?: string; input?: unknown; text?: unknown };
      seenModel = body.model ?? "";
      sawResponsesOnlyField = typeof body.text === "object" && body.text !== null;
      const firstMessage = Array.isArray(body.input) ? body.input[0] as { content?: unknown } | undefined : undefined;
      const content = Array.isArray(firstMessage?.content) ? firstMessage.content as Array<Record<string, unknown>> : [];
      sawInputImage = content.some((part) => part.type === "input_image" && part.image_url === "data:image/png;base64,aGVsbG8=");
      sawInputFile = content.some((part) => part.type === "input_file" && part.filename === "note.txt" && part.file_data === "data:text/plain;base64,aGVsbG8=");
      const responseBody = {
        id: "resp-test",
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: seenModel,
        output: [
          {
            id: "msg-test",
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "ok" }]
          }
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
      };
      if (body.stream) {
        response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
        response.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "ok" })}\n\n`);
        response.write(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: responseBody })}\n\n`);
        response.end("data: [DONE]\n\n");
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(responseBody));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));

  try {
    const address = upstream.address();
    const upstreamPort = address && typeof address === "object" ? address.port : 0;
    const configPath = join(tempDir, "responses-direct-default.yaml");
    writeFileSync(configPath, `server:
  host: 127.0.0.1
  port: 11435

active: codex-main

aliases:
  codex-main:
    provider: relay
    model: gpt-5.5

providers:
  relay:
    type: openai-compatible
    base_url: http://127.0.0.1:${upstreamPort}/v1
    auth:
      type: static-header-ref
      header: Authorization
      scheme: Bearer
      value_env: RESPONSES_DIRECT_TOKEN
`, "utf8");

    await withModelGate(configPath, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "codex-main",
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: "hello" },
                { type: "input_image", image_url: "data:image/png;base64,aGVsbG8=", detail: "low" },
                { type: "input_file", filename: "note.txt", file_data: "data:text/plain;base64,aGVsbG8=" }
              ]
            }
          ],
          text: { format: { type: "text" } },
          max_output_tokens: 8
        })
      });
      const json = await response.json() as { id?: string };
      assert.equal(response.status, 200);
      assert.equal(json.id, "resp-test");
      assert.equal(seenPath, "/v1/responses");
      assert.equal(seenAuthorization, "Bearer responses-token");
      assert.equal(seenModel, "gpt-5.5");
      assert.equal(sawResponsesOnlyField, true);
      assert.equal(sawInputImage, true);
      assert.equal(sawInputFile, true);

      const streamResponse = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "codex-main",
          input: "hello",
          stream: true
        })
      });
      assert.equal(streamResponse.status, 200);
      await streamResponse.text();

      const usageRecords = await fetch(`${baseUrl}/admin/usage/records?range=all&limit=1`)
        .then((usageResponse) => usageResponse.json()) as {
          records: Array<{ api_type?: string; stream?: boolean; total_tokens?: number; input_tokens?: number; output_tokens?: number }>;
        };
      assert.equal(usageRecords.records[0]?.api_type, "responses");
      assert.equal(usageRecords.records[0]?.stream, true);
      assert.equal(usageRecords.records[0]?.input_tokens, 1);
      assert.equal(usageRecords.records[0]?.output_tokens, 1);
      assert.equal(usageRecords.records[0]?.total_tokens, 2);
    });
  } finally {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
}

async function testResponsesImageFileFallbackToChatCompletions() {
  process.env.RESPONSES_DIRECT_TOKEN = "responses-token";
  let seenResponsesPath = "";
  let seenChatPath = "";
  let sawImageUrl = false;
  let sawFile = false;
  let sawTextFormatDropped = false;

  const upstream = createHttpServer((request, response) => {
    if (request.url === "/v1/responses") {
      seenResponsesPath = request.url;
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }

    seenChatPath = request.url ?? "";
    let raw = "";
    request.on("data", (chunk) => {
      raw += String(chunk);
    });
    request.on("end", () => {
      const body = JSON.parse(raw || "{}") as { messages?: Array<{ content?: unknown }>; text?: unknown };
      const content = Array.isArray(body.messages?.[0]?.content) ? body.messages?.[0]?.content as Array<Record<string, unknown>> : [];
      sawImageUrl = content.some((part) => {
        const image = part.image_url as { url?: unknown; detail?: unknown } | undefined;
        return part.type === "image_url" && image?.url === "data:image/png;base64,aGVsbG8=" && image.detail === "low";
      });
      sawFile = content.some((part) => {
        const file = part.file as { filename?: unknown; file_data?: unknown } | undefined;
        return part.type === "file" && file?.filename === "note.txt" && file.file_data === "data:text/plain;base64,aGVsbG8=";
      });
      sawTextFormatDropped = body.text === undefined;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "chatcmpl-fallback",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-5.5",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));

  try {
    const address = upstream.address();
    const upstreamPort = address && typeof address === "object" ? address.port : 0;
    const configPath = join(tempDir, "responses-image-file-fallback.yaml");
    writeFileSync(configPath, `server:
  host: 127.0.0.1
  port: 11435

active: codex-main

aliases:
  codex-main:
    provider: relay
    model: gpt-5.5

providers:
  relay:
    type: openai-compatible
    base_url: http://127.0.0.1:${upstreamPort}/v1
    auth:
      type: static-header-ref
      header: Authorization
      scheme: Bearer
      value_env: RESPONSES_DIRECT_TOKEN
`, "utf8");

    await withModelGate(configPath, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "codex-main",
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: "hello" },
                { type: "input_image", image_url: "data:image/png;base64,aGVsbG8=", detail: "low" },
                { type: "input_file", filename: "note.txt", file_data: "data:text/plain;base64,aGVsbG8=" }
              ]
            }
          ],
          text: { format: { type: "text" } },
          max_output_tokens: 8
        })
      });
      const json = await response.json() as { output?: Array<{ content?: Array<{ text?: string }> }> };
      assert.equal(response.status, 200);
      assert.equal(json.output?.[0]?.content?.[0]?.text, "ok");
      assert.equal(seenResponsesPath, "/v1/responses");
      assert.equal(seenChatPath, "/v1/chat/completions");
      assert.equal(sawImageUrl, true);
      assert.equal(sawFile, true);
      assert.equal(sawTextFormatDropped, true);
    });
  } finally {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
}

try {
  await testLegacyMissingEnv();
  await testCcSwitchImportedReferenceDoesNotWarnAsOpenAiEnv();
  await testCcSwitchHardyAiReferenceDoesNotWarnAsHardyEnv();
  await testCcSwitchMissingCredentialWarningWithoutReference();
  await testImportedCredentialHeader();
  await testResponsesDirectForwardingByDefault();
  await testResponsesImageFileFallbackToChatCompletions();

  console.log("startup/auth smoke tests passed");
} finally {
  if (previousOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = previousOpenAiApiKey;
  }
  if (previousImportedToken === undefined) {
    delete process.env.CCSWITCH_IMPORTED_TOKEN;
  } else {
    process.env.CCSWITCH_IMPORTED_TOKEN = previousImportedToken;
  }
  if (previousResponsesDirectToken === undefined) {
    delete process.env.RESPONSES_DIRECT_TOKEN;
  } else {
    process.env.RESPONSES_DIRECT_TOKEN = previousResponsesDirectToken;
  }

  rmSync(tempDir, { recursive: true, force: true });
}
