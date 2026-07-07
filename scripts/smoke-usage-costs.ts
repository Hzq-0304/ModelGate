import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelGateConfig } from "../src/config/schema.js";
import { createUsageStore, estimateUsageCost, type UsageRecord } from "../src/runtime/usageStore.js";

const tempDir = mkdtempSync(join(tmpdir(), "modelgate-usage-costs-"));

const config: ModelGateConfig = {
  server: {
    host: "127.0.0.1",
    port: 11435
  },
  active: "main",
  entrypoints: {},
  aliases: {
    main: {
      provider: "openai",
      model: "gpt-test"
    }
  },
  providers: {
    openai: {
      type: "mock"
    }
  },
  pricing: {
    "openai/gpt-test": {
      input_per_million: 10,
      cached_input_per_million: 1,
      output_per_million: 20
    }
  }
};

try {
  const usage = {
    input_tokens: 2_000_000,
    cached_tokens: 500_000,
    output_tokens: 1_000_000,
    total_tokens: 3_000_000
  };
  const cost = estimateUsageCost(config, "openai", "gpt-test", usage, 0.25);

  assert.equal(cost.cost_available, true);
  assert.equal(cost.original_cost_usd, 35.5);
  assert.equal(cost.actual_cost_usd, 8.875);
  assert.equal(cost.estimated_cost_usd, 8.875);
  assert.equal(cost.cost_ratio, 0.25);

  const usagePath = join(tempDir, "usage.jsonl");
  const store = createUsageStore(usagePath);
  const now = new Date().toISOString();
  const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const baseRecord = {
    id: "new-cost",
    timestamp: now,
    api_type: "chat_completions" as const,
    path: "/v1/chat/completions" as const,
    kind: "normal" as const,
    requested_model: "main",
    resolved_alias: "main",
    provider: "openai",
    upstream_model: "gpt-test",
    stream: false,
    ok: true,
    status_code: 200,
    ...usage,
    ...cost
  };

  store.addUsageRecord(baseRecord);

  const oldRecord: UsageRecord = {
    id: "old-cost",
    timestamp: twentyMinutesAgo,
    api_type: "chat_completions",
    path: "/v1/chat/completions",
    kind: "normal",
    provider: "openai",
    upstream_model: "legacy",
    stream: false,
    ok: true,
    input_tokens: 1000,
    output_tokens: 1000,
    total_tokens: 2000,
    estimated_cost_usd: 3,
    cost_available: true
  };
  appendFileSync(usagePath, `${JSON.stringify(oldRecord)}\n`, "utf8");

  const secondaryRecord: UsageRecord = {
    ...baseRecord,
    id: "secondary-cost",
    resolved_alias: "secondary",
    requested_model: "secondary",
    upstream_model: "gpt-secondary",
    input_tokens: 100,
    output_tokens: 100,
    total_tokens: 200,
    original_cost_usd: 2,
    actual_cost_usd: 1,
    estimated_cost_usd: 1,
    cost_ratio: 0.5
  };
  store.addUsageRecord(secondaryRecord);

  const records = store.listUsageRecords({ range: "all" });
  assert.equal(records.length, 3);
  assert.equal(records.find((record) => record.id === "old-cost")?.actual_cost_usd, 3);
  assert.equal(records.find((record) => record.id === "old-cost")?.original_cost_usd, 3);
  assert.equal(store.listUsageRecords({ range: "all", alias: "main" }).length, 1);
  assert.equal(store.listUsageRecords({ range: "all", alias: "secondary" }).length, 1);

  const summary = store.getUsageSummary("all");
  assert.equal(summary.original_cost_usd, 40.5);
  assert.equal(summary.actual_cost_usd, 12.875);
  assert.equal(summary.estimated_cost_usd, 12.875);
  assert.equal(summary.by_alias.main.actual_cost_usd, 8.875);
  assert.equal(summary.by_alias.secondary.actual_cost_usd, 1);
  assert.equal(summary.by_alias.unknown.actual_cost_usd, 3);
  assert.equal(summary.by_provider.openai.original_cost_usd, 40.5);
  assert.equal(summary.by_model["openai/gpt-test"].actual_cost_usd, 8.875);

  const tenMinuteSummary = store.getUsageSummary("10m");
  assert.equal(tenMinuteSummary.total_tokens, 3_000_200);
  assert.equal(tenMinuteSummary.by_alias.unknown, undefined);

  const thirtyMinuteSummary = store.getUsageSummary("30m");
  assert.equal(thirtyMinuteSummary.total_tokens, 3_002_200);
  assert.equal(thirtyMinuteSummary.by_alias.unknown.total_tokens, 2000);

  const aliasGroups = store.getUsageGroups("all", "alias");
  assert.deepEqual(aliasGroups.groups.map((group) => group.key), ["main", "secondary", "unknown"]);
  assert.equal(aliasGroups.groups[0].actual_cost_usd, 8.875);

  const timeline = store.getUsageTimeline("today", "hour");
  assert.equal(timeline.points.length, 1);
  assert.equal(timeline.points[0].original_cost_usd, 40.5);
  assert.equal(timeline.points[0].actual_cost_usd, 12.875);

  console.log("Usage cost smoke test passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
