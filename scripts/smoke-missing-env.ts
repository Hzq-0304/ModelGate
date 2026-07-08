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
        input: "x".repeat(2 * 1024 * 1024)
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

try {
  await testLegacyMissingEnv();
  await testCcSwitchImportedReferenceDoesNotWarnAsOpenAiEnv();
  await testCcSwitchHardyAiReferenceDoesNotWarnAsHardyEnv();
  await testCcSwitchMissingCredentialWarningWithoutReference();
  await testImportedCredentialHeader();

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

  rmSync(tempDir, { recursive: true, force: true });
}
