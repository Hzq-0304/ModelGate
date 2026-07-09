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
  const cookie = request.headers.cookie ?? "";

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

  if (url.pathname === "/new-secure/api/user/login") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const login = JSON.parse(body || "{}") as { username?: string; email?: string; password?: string };
      if ((login.username === "admin@example.com" || login.email === "admin@example.com") && login.password === "correct-password") {
        response.writeHead(200, {
          "content-type": "application/json",
          "set-cookie": "session=new-secure-session; Path=/; HttpOnly"
        });
        response.end(JSON.stringify({ success: true, data: { username: "admin@example.com" } }));
        return;
      }
      json(response, 200, { success: false, message: "unauthorized" });
    });
    return;
  }
  if (url.pathname === "/new-secure/api/ratio_config" || url.pathname === "/new-secure/api/pricing") {
    if (!cookie.includes("session=new-secure-session")) {
      json(response, 401, { success: false, message: "unauthorized" });
      return;
    }
    json(response, 200, {
      success: true,
      data: [
        { model_name: "gpt-secure", quota_type: 0, model_ratio: 1.25, enable_groups: ["default"] }
      ],
      group_ratio: { default: 1 },
      usable_group: { default: "Secure New API group" }
    });
    return;
  }

  if (url.pathname === "/new-token/api/user/login") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const login = JSON.parse(body || "{}") as { username?: string; email?: string; password?: string };
      if ((login.username === "admin@example.com" || login.email === "admin@example.com") && login.password === "correct-password") {
        json(response, 200, { success: true, data: { accessToken: "new-compatible-access-token" } });
        return;
      }
      json(response, 200, { success: false, message: "unauthorized" });
    });
    return;
  }
  if (url.pathname === "/new-token/api/ratio_config" || url.pathname === "/new-token/api/pricing") {
    if (auth !== "Bearer new-compatible-access-token") {
      json(response, 401, { success: false, message: "unauthorized" });
      return;
    }
    json(response, 200, {
      success: true,
      data: [
        { model_name: "gpt-compatible", quota_type: 0, model_ratio: 1.5, enable_groups: ["default"] }
      ],
      group_ratio: { default: 1 },
      usable_group: { default: "Compatible New API group" }
    });
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

  if (url.pathname === "/one-secure/api/user/login") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const login = JSON.parse(body || "{}") as { username?: string; email?: string; password?: string };
      if ((login.username === "admin@example.com" || login.email === "admin@example.com") && login.password === "correct-password") {
        response.writeHead(200, {
          "content-type": "application/json",
          "set-cookie": "session=one-secure-session; Path=/; HttpOnly"
        });
        response.end(JSON.stringify({ success: true, data: { username: "admin@example.com" } }));
        return;
      }
      json(response, 200, { success: false, message: "unauthorized" });
    });
    return;
  }
  if (url.pathname === "/one-secure/api/option/") {
    if (!cookie.includes("session=one-secure-session")) {
      json(response, 401, { success: false, message: "unauthorized" });
      return;
    }
    json(response, 200, {
      success: true,
      data: [
        { key: "ModelRatio", value: JSON.stringify({ "gpt-secure-one": 1.75 }) },
        { key: "GroupRatio", value: JSON.stringify({ default: 1 }) }
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

  if (url.pathname === "/sub-secure/api/v1/auth/login") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const login = JSON.parse(body || "{}") as { email?: string; password?: string };
      if (login.email === "admin@example.com" && login.password === "correct-password") {
        json(response, 200, { data: { access_token: "sub2-secure-token" } });
        return;
      }
      json(response, 401, { success: false, message: "unauthorized" });
    });
    return;
  }
  if (url.pathname.startsWith("/sub-secure/api/v1/")) {
    if (auth !== "Bearer sub2-secure-token") {
      json(response, 401, { success: false, message: "unauthorized" });
      return;
    }
    json(response, 200, {
      data: [
        { id: 1, name: "secure", description: "Secure Sub2API group", rate_multiplier: 0.9, sort_order: 1 }
      ]
    });
    return;
  }

  if (url.pathname.startsWith("/sub-auth/api/v1/")) {
    json(response, 401, { success: false, message: "unauthorized" });
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
    assert.equal(sub2Source.status, "ok");
    assert.equal(sub2Source.lastErrorCode, undefined);
    assert.equal(manager.getGroups(sub2.id)[1]?.description, "VIP Sub2API group");
    assert.equal(manager.getGroups(sub2.id)[1]?.groupRatio, 0.7);
    assert.equal(manager.getGroups(sub2.id)[1]?.models.length, 0);

    const sub2Auth = manager.createSource({
      name: "Fixture Sub2API Auth",
      baseUrl: `${fixture.baseUrl}/sub-auth`,
      type: "sub2api"
    });
    const sub2AuthSource = await manager.refreshSource(sub2Auth.id);
    assert.equal(sub2AuthSource.status, "failed");
    assert.equal(sub2AuthSource.lastErrorCode, "authentication_required");
    assert.match(sub2AuthSource.lastError ?? "", /Bearer/);
    assert.match(sub2AuthSource.lastError ?? "", /auth_token/);

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

      const cookieCredentialResponse = await fetch(`${baseUrl}/admin/ratio-sources/credential`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: `${fixture.baseUrl}/sub-secure`,
          tokenEnv: "SUB2_SECURE_RATIO_TOKEN",
          mode: "cookie",
          cookie: "auth_token=sub2-secure-token; theme=dark"
        })
      });
      assert.equal(cookieCredentialResponse.status, 200);
      const cookieCredential = await cookieCredentialResponse.json() as { tokenEnv: string; token?: string };
      assert.equal(cookieCredential.tokenEnv, "SUB2_SECURE_RATIO_TOKEN");
      assert.equal(cookieCredential.token, undefined);

      const passwordCredentialResponse = await fetch(`${baseUrl}/admin/ratio-sources/credential`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: `${fixture.baseUrl}/sub-secure`,
          tokenEnv: "SUB2_SECURE_RATIO_TOKEN",
          mode: "password",
          email: "admin@example.com",
          password: "correct-password",
          returnToken: true
        })
      });
      assert.equal(passwordCredentialResponse.status, 200);
      const passwordCredential = await passwordCredentialResponse.json() as { tokenEnv: string; token?: string };
      assert.equal(passwordCredential.tokenEnv, "SUB2_SECURE_RATIO_TOKEN");
      assert.equal(passwordCredential.token, "sub2-secure-token");

      const newApiCredentialResponse = await fetch(`${baseUrl}/admin/ratio-sources/credential`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: `${fixture.baseUrl}/new-secure`,
          type: "new-api",
          tokenEnv: "NEW_API_SECURE_RATIO_TOKEN",
          mode: "password",
          email: "admin@example.com",
          password: "correct-password",
          returnToken: true
        })
      });
      assert.equal(newApiCredentialResponse.status, 200);
      const newApiCredential = await newApiCredentialResponse.json() as { tokenEnv: string; token?: string };
      assert.equal(newApiCredential.tokenEnv, "NEW_API_SECURE_RATIO_TOKEN");
      assert.match(newApiCredential.token ?? "", /^cookie:/);

      const newApiCookieCredentialResponse = await fetch(`${baseUrl}/admin/ratio-sources/credential`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: `${fixture.baseUrl}/new-secure`,
          type: "new-api",
          tokenEnv: "NEW_API_COOKIE_RATIO_TOKEN",
          mode: "cookie",
          cookie: "auth_token=new-secure-session; theme=dark",
          returnToken: true
        })
      });
      assert.equal(newApiCookieCredentialResponse.status, 200);
      const newApiCookieCredential = await newApiCookieCredentialResponse.json() as { tokenEnv: string; token?: string };
      assert.equal(newApiCookieCredential.tokenEnv, "NEW_API_COOKIE_RATIO_TOKEN");
      assert.equal(newApiCookieCredential.token, "cookie:auth_token=new-secure-session; theme=dark");

      const newApiSecureCreateResponse = await fetch(`${baseUrl}/admin/ratio-sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Secure New API",
          baseUrl: `${fixture.baseUrl}/new-secure`,
          type: "new-api",
          auth: { type: "bearer", token_env: "NEW_API_SECURE_RATIO_TOKEN" }
        })
      });
      assert.equal(newApiSecureCreateResponse.status, 201);
      const newApiSecureCreated = await newApiSecureCreateResponse.json() as { source: { id: string } };
      const newApiSecureRefreshResponse = await fetch(`${baseUrl}/admin/ratio-sources/${newApiSecureCreated.source.id}/refresh`, {
        method: "POST"
      });
      assert.equal(newApiSecureRefreshResponse.status, 200);

      const compatibleCredentialResponse = await fetch(`${baseUrl}/admin/ratio-sources/credential`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: `${fixture.baseUrl}/new-token`,
          type: "new-api-compatible",
          tokenEnv: "NEW_COMPATIBLE_RATIO_TOKEN",
          mode: "password",
          email: "admin@example.com",
          password: "correct-password",
          returnToken: true
        })
      });
      assert.equal(compatibleCredentialResponse.status, 200);
      const compatibleCredential = await compatibleCredentialResponse.json() as { tokenEnv: string; token?: string };
      assert.equal(compatibleCredential.tokenEnv, "NEW_COMPATIBLE_RATIO_TOKEN");
      assert.equal(compatibleCredential.token, "new-compatible-access-token");

      const compatibleCreateResponse = await fetch(`${baseUrl}/admin/ratio-sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Compatible New API",
          baseUrl: `${fixture.baseUrl}/new-token`,
          type: "new-api-compatible",
          auth: { type: "bearer", token_env: "NEW_COMPATIBLE_RATIO_TOKEN" }
        })
      });
      assert.equal(compatibleCreateResponse.status, 201);
      const compatibleCreated = await compatibleCreateResponse.json() as { source: { id: string } };
      const compatibleRefreshResponse = await fetch(`${baseUrl}/admin/ratio-sources/${compatibleCreated.source.id}/refresh`, {
        method: "POST"
      });
      assert.equal(compatibleRefreshResponse.status, 200);

      const oneApiCredentialResponse = await fetch(`${baseUrl}/admin/ratio-sources/credential`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: `${fixture.baseUrl}/one-secure`,
          type: "one-api",
          tokenEnv: "ONE_API_SECURE_RATIO_TOKEN",
          mode: "password",
          email: "admin@example.com",
          password: "correct-password",
          returnToken: true
        })
      });
      assert.equal(oneApiCredentialResponse.status, 200);
      const oneApiCredential = await oneApiCredentialResponse.json() as { tokenEnv: string; token?: string };
      assert.equal(oneApiCredential.tokenEnv, "ONE_API_SECURE_RATIO_TOKEN");
      assert.match(oneApiCredential.token ?? "", /^cookie:/);

      const oneApiSecureCreateResponse = await fetch(`${baseUrl}/admin/ratio-sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Secure One API",
          baseUrl: `${fixture.baseUrl}/one-secure`,
          type: "one-api",
          auth: { type: "bearer", token_env: "ONE_API_SECURE_RATIO_TOKEN" }
        })
      });
      assert.equal(oneApiSecureCreateResponse.status, 201);
      const oneApiSecureCreated = await oneApiSecureCreateResponse.json() as { source: { id: string } };
      const oneApiSecureRefreshResponse = await fetch(`${baseUrl}/admin/ratio-sources/${oneApiSecureCreated.source.id}/refresh`, {
        method: "POST"
      });
      assert.equal(oneApiSecureRefreshResponse.status, 200);

      const networkCredentialResponse = await fetch(`${baseUrl}/admin/ratio-sources/credential`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: "missing-sub2api.invalid",
          tokenEnv: "SUB2_MISSING_RATIO_TOKEN",
          mode: "password",
          email: "admin@example.com",
          password: "correct-password"
        })
      });
      assert.equal(networkCredentialResponse.status, 502);
      const networkCredential = await networkCredentialResponse.json() as { error: { type: string; message: string } };
      assert.equal(networkCredential.error.type, "network_error");
      assert.match(networkCredential.error.message, /Network request failed/);

      const secureCreateResponse = await fetch(`${baseUrl}/admin/ratio-sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Secure Sub2API",
          baseUrl: `${fixture.baseUrl}/sub-secure`,
          type: "sub2api",
          auth: { type: "bearer", token_env: "SUB2_SECURE_RATIO_TOKEN" }
        })
      });
      assert.equal(secureCreateResponse.status, 201);
      const secureCreated = await secureCreateResponse.json() as { source: { id: string } };
      const secureRefreshResponse = await fetch(`${baseUrl}/admin/ratio-sources/${secureCreated.source.id}/refresh`, {
        method: "POST"
      });
      assert.equal(secureRefreshResponse.status, 200);
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
