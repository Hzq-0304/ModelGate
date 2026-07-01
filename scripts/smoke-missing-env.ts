import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/loadConfig.js";
import { createServer } from "../src/server/createServer.js";
import { RuntimeState } from "../src/runtime/state.js";

const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;

const tempDir = mkdtempSync(join(tmpdir(), "modelgate-missing-env-"));
const configPath = join(tempDir, "modelgate.config.yaml");

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

try {
  const config = await loadConfig({ configPath });
  assert.equal(config.providers["openai-official"]?.type, "openai-compatible");
  assert.equal(config.providers["openai-official"]?.api_key, "${OPENAI_API_KEY}");

  const runtime = new RuntimeState(config, configPath);
  const server = await createServer(runtime);
  await server.listen({ host: "127.0.0.1", port: 0 });

  try {
    const baseUrl = `http://127.0.0.1:${server.server.address() && typeof server.server.address() === "object" ? server.server.address().port : 0}`;

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

    console.log("missing-env startup smoke test passed");
  } finally {
    await server.close();
  }
} finally {
  if (previousOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = previousOpenAiApiKey;
  }

  rmSync(tempDir, { recursive: true, force: true });
}
