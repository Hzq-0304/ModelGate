import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/loadConfig.js";
import { RatioSourceManager } from "../src/ratio-sources/ratioSourceManager.js";
import { RuntimeState } from "../src/runtime/state.js";
import { createServer } from "../src/server/createServer.js";

const tempDir = mkdtempSync(join(tmpdir(), "modelgate-ratio-sources-"));
const previousRatioDir = process.env.MODELGATE_RATIO_DIR;
const previousOneApiToken = process.env.ONE_API_RATIO_TOKEN;
process.env.MODELGATE_RATIO_DIR = join(tempDir, "ratio-data");

let slowPricingRequests = 0;
let flakyFail = false;

function json(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers
  });
  response.end(JSON.stringify(body));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://fixture.local");
  const auth = request.headers.authorization ?? "";

  if (url.pathname === "/new/api/ratio_config") {
    json(response, 403, { success: false, message: "ratio config disabled" });
    return;
  }
  if (url.pathname === "/new/api/pricing") {
    json(response, 200, {
      success: true,
      data: [
        { model_name: "gpt-5.5", quota_type: 0, model_ratio: 1, enable_groups: ["default", "vip"] },
        { model_name: "claude-opus-4-1", quota_type: 0, model_ratio: 2.5, enable_groups: ["vip"] },
        { model_name: "fixed-price", quota_type: 1, model_price: 10, enable_groups: ["default"] }
      ],
      group_ratio: { default: 1, vip: 0.8 },
      usable_group: { default: "Default group", vip: "VIP relay group" }
    }, { etag: "new-v1" });
    return;
  }

  if (url.pathname === "/new-cache/api/ratio_config") {
    if (request.headers["if-none-match"] === "cache-v1") {
      response.writeHead(304, { etag: "cache-v1" });
      response.end();
      return;
    }
    json(response, 200, {
      success: true,
      data: {
        model_ratio: { "gpt-cache": 1.2 }
      }
    }, { etag: "cache-v1" });
    return;
  }

  if (url.pathname === "/one/api/option/") {
    if (auth !== "Bearer one-api-token") {
      json(response, 401, { success: false, message: "unauthorized" });
      return;
    }
    json(response, 200, {
      success: true,
      data: [
        { key: "ModelRatio", value: JSON.stringify({ "gpt-5.5": 1.5, "claude-opus-4-1": 3 }) },
        { key: "GroupRatio", value: JSON.stringify({ default: 1, vip: 0.5 }) }
      ]
    });
    return;
  }

  if (url.pathname === "/sub/api/v1/admin/groups/all") {
    json(response, 200, {
      data: [
        { id: 1, name: "default", description: "Standard Sub2API group", rate_multiplier: 1, sort_order: 1 },
        { id: 2, name: "vip", description: "VIP Sub2API group", rate_multiplier: 0.7, sort_order: 2 }
      ]
    });
    return;
  }

  if (url.pathname === "/flaky/api/ratio_config") {
    json(response, 404, { success: false });
    return;
  }
  if (url.pathname === "/flaky/api/pricing") {
    if (flakyFail) {
      json(response, 500, { success: false, message: "temporary failure" });
      return;
    }
    json(response, 200, {
      success: true,
      data: [
        { model_name: "gpt-flaky", quota_type: 0, model_ratio: 2, enable_groups: ["default"] }
      ],
      group_ratio: { default: 1 },
      usable_group: { default: "Flaky default" }
    });
    return;
  }

  if (url.pathname === "/slow/api/ratio_config") {
    json(response, 404, { success: false });
    return;
  }
  if (url.pathname === "/slow/api/pricing") {
    slowPricingRequests += 1;
    void wait(250).then(() => json(response, 200, {
      success: true,
      data: [
        { model_name: "gpt-slow", quota_type: 0, model_ratio: 4, enable_groups: ["default"] }
      ],
      group_ratio: { default: 1 }
    }));
    return;
  }

  if (url.pathname === "/timeout/api/ratio_config" || url.pathname === "/timeout/api/pricing") {
    void wait(11_000).then(() => json(response, 200, { success: true, data: [] }));
    return;
  }

  json(response, 404, { success: false, message: "not found" });
}

async function listenFixture() {
  const server = createHttpServer(route);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

async function withModelGate(configPath: string, callback: (baseUrl: string, runtime: RuntimeState) => Promise<void>) {
  const config = await loadConfig({ configPath });
  const runtime = new RuntimeState(config, configPath);
  const server = await createServer(runtime);
  await server.listen({ host: "127.0.0.1", port: 0 });
  try {
    const address = server.server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    await callback(`http://127.0.0.1:${port}`, runtime);
  } finally {
    await server.close();
  }
}

async function main() {
  const fixture = await listenFixture();
  try {
    const configPath = join(tempDir, "modelgate.config.yaml");
    writeFileSync(configPath, `server:
  host: 127.0.0.1
  port: 11435
active: hardyai
aliases:
  hardyai:
    provider: hardyai
    model: gpt-5.5
  opus:
    provider: hardyai
    model: claude-opus-4-1
providers:
  hardyai:
    type: mock
`, "utf8");

    const manager = new RatioSourceManager(configPath);

    const newApi = manager.createSource({
      name: "Fixture New API",
      baseUrl: `${fixture.baseUrl}/new`,
      type: "new-api"
    });
    const refreshedNewApi = await manager.refreshSource(newApi.id);
    assert.equal(refreshedNewApi.status, "ok");
    const vip = manager.getGroups(newApi.id).find((group) => group.groupId === "vip");
    assert.equal(vip?.description, "VIP relay group");
    assert.equal(vip?.models.find((model) => model.model === "gpt-5.5")?.ratio, 0.8);
    assert.equal(vip?.models.find((model) => model.model === "claude-opus-4-1")?.ratio, 2);

    const cached = manager.createSource({
      name: "Cached New API",
      baseUrl: `${fixture.baseUrl}/new-cache`,
      type: "new-api-compatible"
    });
    await manager.refreshSource(cached.id);
    const cachedAgain = await manager.refreshSource(cached.id);
    assert.equal(cachedAgain.status, "ok");
    assert.equal(manager.getGroups(cached.id)[0]?.models[0]?.model, "gpt-cache");

    process.env.ONE_API_RATIO_TOKEN = "one-api-token";
    const oneApi = manager.createSource({
      name: "Fixture One API",
      baseUrl: `${fixture.baseUrl}/one`,
      type: "one-api",
      auth: { type: "bearer", token_env: "ONE_API_RATIO_TOKEN" }
    });
    await manager.refreshSource(oneApi.id);
    const oneVip = manager.getGroups(oneApi.id).find((group) => group.groupId === "vip");
    assert.equal(oneVip?.models.find((model) => model.model === "gpt-5.5")?.ratio, 0.75);

    delete process.env.ONE_API_RATIO_TOKEN;
    const authFailed = manager.createSource({
      name: "One API Auth Failure",
      baseUrl: `${fixture.baseUrl}/one`,
      type: "one-api",
      auth: { type: "bearer", token_env: "ONE_API_RATIO_TOKEN" }
    });
    const authFailedSource = await manager.refreshSource(authFailed.id);
    assert.equal(authFailedSource.status, "failed");
    assert.equal(authFailedSource.lastErrorCode, "authentication_required");

    const sub2 = manager.createSource({
      name: "Fixture Sub2API",
      baseUrl: `${fixture.baseUrl}/sub`,
      type: "sub2api"
    });
    const sub2Source = await manager.refreshSource(sub2.id);
    assert.equal(sub2Source.status, "warning");
    assert.equal(sub2Source.lastErrorCode, "no_model_ratio");
    assert.equal(manager.getGroups(sub2.id)[1]?.description, "VIP Sub2API group");
    assert.equal(manager.getGroups(sub2.id)[1]?.models.length, 0);

    const flaky = manager.createSource({
      name: "Fixture Flaky",
      baseUrl: `${fixture.baseUrl}/flaky`,
      type: "new-api"
    });
    await manager.refreshSource(flaky.id);
    flakyFail = true;
    const failedButCached = await manager.refreshSource(flaky.id);
    assert.equal(failedButCached.status, "warning");
    assert.equal(manager.getGroups(flaky.id)[0]?.models[0]?.model, "gpt-flaky");

    const slow = manager.createSource({
      name: "Fixture Slow",
      baseUrl: `${fixture.baseUrl}/slow`,
      type: "new-api"
    });
    await Promise.all([manager.refreshSource(slow.id), manager.refreshSource(slow.id)]);
    assert.equal(slowPricingRequests, 1);

    const stale = manager.createSource({
      name: "Fixture Stale",
      baseUrl: `${fixture.baseUrl}/new`,
      type: "new-api",
      refreshIntervalMinutes: 180
    });
    assert.equal(manager.isSourceStale(stale, new Date()), true);
    const fresh = {
      ...stale,
      lastSuccessAt: new Date().toISOString()
    };
    assert.equal(manager.isSourceStale(fresh, new Date()), false);

    const timeout = manager.createSource({
      name: "Fixture Timeout",
      baseUrl: `${fixture.baseUrl}/timeout`,
      type: "new-api"
    });
    const timedOut = await manager.refreshSource(timeout.id);
    assert.equal(timedOut.status, "failed");
    assert.equal(timedOut.lastErrorCode, "timeout");

    await withModelGate(configPath, async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/admin/ratio-sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Server New API",
          baseUrl: `${fixture.baseUrl}/new`,
          type: "new-api"
        })
      });
      assert.equal(createResponse.status, 201);
      const created = await createResponse.json() as { source: { id: string } };

      const refreshResponse = await fetch(`${baseUrl}/admin/ratio-sources/${created.source.id}/refresh`, {
        method: "POST"
      });
      assert.equal(refreshResponse.status, 200);

      const bindResponse = await fetch(`${baseUrl}/admin/ratio-bindings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bindings: {
            hardyai: {
              sourceId: created.source.id,
              groupId: "vip"
            }
          }
        })
      });
      assert.equal(bindResponse.status, 200);

      const bindings = await fetch(`${baseUrl}/admin/ratio-bindings`).then((response) => response.json()) as {
        bindings: Array<{ alias: string; status: string; currentRatio?: number }>;
      };
      const hardyai = bindings.bindings.find((binding) => binding.alias === "hardyai");
      assert.equal(hardyai?.status, "bound");
      assert.equal(hardyai?.currentRatio, 0.8);
    });

    console.log("ratio source smoke tests passed");
  } finally {
    await fixture.close();
  }
}

try {
  await main();
} finally {
  if (previousRatioDir === undefined) {
    delete process.env.MODELGATE_RATIO_DIR;
  } else {
    process.env.MODELGATE_RATIO_DIR = previousRatioDir;
  }
  if (previousOneApiToken === undefined) {
    delete process.env.ONE_API_RATIO_TOKEN;
  } else {
    process.env.ONE_API_RATIO_TOKEN = previousOneApiToken;
  }
  rmSync(tempDir, { recursive: true, force: true });
}
