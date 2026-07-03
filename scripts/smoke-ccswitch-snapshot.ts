import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/loadConfig.js";
import { createServer } from "../src/server/createServer.js";
import { RuntimeState } from "../src/runtime/state.js";

const tempDir = mkdtempSync(join(tmpdir(), "modelgate-ccswitch-snapshot-"));

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

function writeSnapshot(snapshotId: string, providerId: string, token: string) {
  const snapshotPath = join(tempDir, "ccswitch-snapshots", snapshotId);
  const authDir = join(snapshotPath, "auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(join(snapshotPath, "cc-switch.db"), "snapshot-placeholder", "utf8");
  writeFileSync(join(snapshotPath, "manifest.json"), JSON.stringify({
    source: "ccswitch",
    snapshot_id: snapshotId,
    app: "codex",
    schema_version: 1
  }, null, 2), "utf8");
  writeFileSync(join(authDir, "provider-auth.json"), JSON.stringify({
    schema_version: 1,
    snapshot_id: snapshotId,
    providers: {
      [providerId]: {
        provider_id: providerId,
        app: "codex",
        credential_path: "/auth/OPENAI_API_KEY",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  }, null, 2), "utf8");
  return snapshotPath;
}

function writeConfig(configPath: string, baseUrl: string, snapshotId: string, snapshotPath: string, providerId: string) {
  writeFileSync(configPath, `server:
  host: 127.0.0.1
  port: 11435

active: hardyai

aliases:
  hardyai:
    provider: hardyai
    model: gpt-5.5
    metadata:
      imported_from: ccswitch
      source_config_hash: hash-hardyai

providers:
  hardyai:
    type: openai-compatible
    base_url: ${baseUrl}
    auth:
      type: ccswitch-snapshot
      source: CC Switch snapshot
      app: codex
      snapshot_id: ${snapshotId}
      snapshot_path: ${snapshotPath.replaceAll("\\", "\\\\")}
      provider_id: ${providerId}
      credential_path: /auth/OPENAI_API_KEY
      header: Authorization
      scheme: Bearer
    metadata:
      imported_from: ccswitch
      snapshot_id: ${snapshotId}
      source_provider_id: ${providerId}
      source_config_hash: hash-hardyai
`, "utf8");
}

async function testMissingSnapshotDoesNotBlockStartup() {
  const configPath = join(tempDir, "missing-snapshot.yaml");
  writeConfig(configPath, "https://api.example.invalid/v1", "missing-snapshot", join(tempDir, "missing-snapshot"), "hardyai-1");

  await withModelGate(configPath, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
    assert.equal(health.ok, true);

    const status = await fetch(`${baseUrl}/admin/status`).then((response) => response.json());
    assert.equal(status.config_warnings?.[0]?.type, "missing_credential");
    assert.equal(status.config_warnings?.[0]?.provider, "hardyai");

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "hardyai",
        messages: [{ role: "user", content: "hello" }]
      })
    });
    const json = await response.json();
    assert.equal(response.status, 400);
    assert.equal(json.error.type, "missing_credential");
    assert.equal(json.error.provider, "hardyai");
  });
}

async function testSnapshotHeaderForwarding() {
  const snapshotId = "snapshot-forwarding";
  const providerId = "hardyai-1782220605678";
  const token = "snapshot-token";
  const snapshotPath = writeSnapshot(snapshotId, providerId, token);
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
        id: "chatcmpl-snapshot",
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
    const configPath = join(tempDir, "snapshot-forwarding.yaml");
    writeConfig(configPath, `http://127.0.0.1:${upstreamPort}/v1`, snapshotId, snapshotPath, providerId);

    await withModelGate(configPath, async (baseUrl) => {
      const status = await fetch(`${baseUrl}/admin/status`).then((response) => response.json());
      assert.equal(status.config_warnings?.length ?? 0, 0);

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "hardyai",
          messages: [{ role: "user", content: "hello" }]
        })
      });
      assert.equal(response.status, 200);
      await response.json();
      assert.equal(seenAuthorization, `Bearer ${token}`);
      assert.equal(seenModel, "gpt-5.5");
    });
  } finally {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
}

try {
  await testMissingSnapshotDoesNotBlockStartup();
  await testSnapshotHeaderForwarding();
  console.log("ccswitch snapshot smoke tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
