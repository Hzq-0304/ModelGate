import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ModelGateConfig, PricingConfig } from "../config/schema.js";

export type UsageRange = "today" | "24h" | "7d" | "all";
export type UsageKindFilter = "normal" | "diagnostic" | "all";
export type UsageGroupBy = "alias" | "provider" | "model";
export type UsageApiType = "chat_completions" | "responses";
export type UsagePath = "/v1/chat/completions" | "/v1/responses";
export type UsageKind = "normal" | "diagnostic";
export type UsageFallbackMode = "direct_responses" | "responses_to_chat";

export type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
};

export type UsageRecord = TokenUsage & {
  id: string;
  timestamp: string;
  api_type: UsageApiType;
  path: UsagePath;
  kind: UsageKind;
  requested_model?: string;
  resolved_alias?: string;
  provider?: string;
  upstream_model?: string;
  fallback_mode?: UsageFallbackMode;
  stream: boolean;
  ok: boolean;
  status_code?: number;
  duration_ms?: number;
  original_cost_usd?: number;
  actual_cost_usd?: number;
  estimated_cost_usd?: number;
  cost_ratio?: number;
  cost_available: boolean;
};

export type UsageSummary = {
  range: UsageRange;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  requests: number;
  success: number;
  failed: number;
  original_cost_usd?: number;
  actual_cost_usd?: number;
  estimated_cost_usd?: number;
  cost_available: boolean;
  by_alias: Record<string, UsageSummaryGroup>;
  by_provider: Record<string, UsageSummaryGroup>;
  by_model: Record<string, UsageSummaryGroup>;
};

export type UsageSummaryGroup = TokenUsage & {
  requests: number;
  success: number;
  failed: number;
  original_cost_usd?: number;
  actual_cost_usd?: number;
  estimated_cost_usd?: number;
  cost_available: boolean;
};

export type UsageGroupSummary = UsageSummaryGroup & {
  key: string;
  label: string;
  alias?: string;
  provider?: string;
  model?: string;
};

export type UsageGroupedSummary = {
  range: UsageRange;
  kind: UsageKindFilter;
  group_by: UsageGroupBy;
  groups: UsageGroupSummary[];
};

export type UsageTimelineBucket = "hour" | "day";

export type UsageTimelinePoint = {
  time: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  original_cost_usd?: number;
  actual_cost_usd?: number;
  estimated_cost_usd?: number;
  cost_available: boolean;
  requests: number;
};

export type UsageRecordFilters = {
  range?: UsageRange;
  kind?: UsageKindFilter;
  alias?: string;
  provider?: string;
  model?: string;
  limit?: number;
};

const defaultUsagePath = ".modelgate/usage.jsonl";

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampNonNegative(value: number) {
  return Math.max(0, value);
}

function rangeStart(range: UsageRange) {
  if (range === "all") {
    return undefined;
  }

  const now = new Date();
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }

  return now.getTime() - (range === "24h" ? 24 : 7 * 24) * 60 * 60 * 1000;
}

function inRange(record: UsageRecord, range: UsageRange) {
  const start = rangeStart(range);
  if (start === undefined) {
    return true;
  }

  const timestamp = new Date(record.timestamp).getTime();
  return Number.isFinite(timestamp) && timestamp >= start;
}

function addTokens(target: TokenUsage, source: TokenUsage) {
  target.input_tokens = (target.input_tokens ?? 0) + (source.input_tokens ?? 0);
  target.output_tokens = (target.output_tokens ?? 0) + (source.output_tokens ?? 0);
  target.cached_tokens = (target.cached_tokens ?? 0) + (source.cached_tokens ?? 0);
  target.reasoning_tokens = (target.reasoning_tokens ?? 0) + (source.reasoning_tokens ?? 0);
  target.total_tokens = (target.total_tokens ?? 0) + (source.total_tokens ?? 0);
}

function createGroup(): UsageSummaryGroup {
  return {
    requests: 0,
    success: 0,
    failed: 0,
    input_tokens: 0,
    output_tokens: 0,
    cached_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
    cost_available: false
  };
}

function addRecordToGroup(group: UsageSummaryGroup, record: UsageRecord) {
  group.requests += 1;
  if (record.ok) {
    group.success += 1;
  } else {
    group.failed += 1;
  }
  addTokens(group, record);
  addCost(group, record);
}

function costFields(record: UsageRecord) {
  const estimated = numberField(record.estimated_cost_usd);
  const original = numberField(record.original_cost_usd) ?? estimated;
  const actual = numberField(record.actual_cost_usd) ?? estimated ?? original;

  return {
    original,
    actual
  };
}

function addCost(
  target: {
    original_cost_usd?: number;
    actual_cost_usd?: number;
    estimated_cost_usd?: number;
    cost_available: boolean;
  },
  record: UsageRecord
) {
  const cost = costFields(record);
  if (!record.cost_available || typeof cost.original !== "number" || typeof cost.actual !== "number") {
    return;
  }

  target.cost_available = true;
  target.original_cost_usd = (target.original_cost_usd ?? 0) + cost.original;
  target.actual_cost_usd = (target.actual_cost_usd ?? 0) + cost.actual;
  target.estimated_cost_usd = target.actual_cost_usd;
}

function bucketStart(date: Date, bucket: UsageTimelineBucket) {
  const next = new Date(date);
  if (bucket === "day") {
    next.setHours(0, 0, 0, 0);
  } else {
    next.setMinutes(0, 0, 0);
  }
  return next;
}

function safeRecord(value: unknown): UsageRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as UsageRecord;
  if (
    typeof record.id !== "string" ||
    typeof record.timestamp !== "string" ||
    (record.api_type !== "chat_completions" && record.api_type !== "responses") ||
    (record.path !== "/v1/chat/completions" && record.path !== "/v1/responses") ||
    (record.kind !== "normal" && record.kind !== "diagnostic") ||
    typeof record.stream !== "boolean" ||
    typeof record.ok !== "boolean" ||
    typeof record.cost_available !== "boolean"
  ) {
    return null;
  }

  const cost = costFields(record);
  return {
    ...record,
    original_cost_usd: cost.original,
    actual_cost_usd: cost.actual,
    estimated_cost_usd: cost.actual ?? record.estimated_cost_usd,
    cost_ratio: numberField(record.cost_ratio)
  };
}

function readRecords(path: string) {
  if (!existsSync(path)) {
    return [];
  }

  const raw = readFileSync(path, "utf8");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return safeRecord(JSON.parse(line));
      } catch {
        return null;
      }
    })
    .filter((record): record is UsageRecord => record !== null);
}

function aliasKey(record: UsageRecord) {
  return record.resolved_alias ?? record.requested_model ?? "unknown";
}

function providerKey(record: UsageRecord) {
  return record.provider ?? "unknown";
}

function modelKey(record: UsageRecord) {
  return `${record.provider ?? "unknown"}/${record.upstream_model ?? "unknown"}`;
}

function groupKey(record: UsageRecord, groupBy: UsageGroupBy) {
  if (groupBy === "provider") {
    return providerKey(record);
  }
  if (groupBy === "model") {
    return modelKey(record);
  }
  return aliasKey(record);
}

function toGroupSummary(key: string, group: UsageSummaryGroup, groupBy: UsageGroupBy, sample?: UsageRecord): UsageGroupSummary {
  const base = {
    key,
    label: key,
    ...group
  };

  if (groupBy === "provider") {
    return {
      ...base,
      provider: key
    };
  }
  if (groupBy === "model") {
    return {
      ...base,
      provider: sample?.provider,
      model: sample?.upstream_model
    };
  }
  return {
    ...base,
    alias: key,
    provider: sample?.provider,
    model: sample?.upstream_model
  };
}

export function extractChatUsage(json: unknown): TokenUsage {
  if (!json || typeof json !== "object") {
    return {};
  }

  const usage = (json as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return {};
  }

  const typed = usage as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown };
    completion_tokens_details?: { reasoning_tokens?: unknown };
  };

  return {
    input_tokens: numberField(typed.prompt_tokens),
    output_tokens: numberField(typed.completion_tokens),
    total_tokens: numberField(typed.total_tokens),
    cached_tokens: numberField(typed.prompt_tokens_details?.cached_tokens),
    reasoning_tokens: numberField(typed.completion_tokens_details?.reasoning_tokens)
  };
}

export function extractResponsesUsage(json: unknown): TokenUsage {
  if (!json || typeof json !== "object") {
    return {};
  }

  const usage = (json as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return {};
  }

  const typed = usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown };
    output_tokens_details?: { reasoning_tokens?: unknown };
  };

  return {
    input_tokens: numberField(typed.input_tokens),
    output_tokens: numberField(typed.output_tokens),
    total_tokens: numberField(typed.total_tokens),
    cached_tokens: numberField(typed.input_tokens_details?.cached_tokens),
    reasoning_tokens: numberField(typed.output_tokens_details?.reasoning_tokens)
  };
}

export function estimateUsageCost(
  config: ModelGateConfig,
  provider?: string,
  model?: string,
  usage: TokenUsage = {},
  costRatio?: number
) {
  if (!provider || !model) {
    return {
      cost_available: false as const
    };
  }

  const pricing = findPricing(config, provider, model);
  if (!pricing) {
    return {
      cost_available: false as const
    };
  }

  if (usage.input_tokens === undefined && usage.output_tokens === undefined) {
    return {
      cost_available: false as const
    };
  }

  const inputTokens = usage.input_tokens ?? 0;
  const cachedTokens = Math.min(inputTokens, usage.cached_tokens ?? 0);
  const outputTokens = usage.output_tokens ?? 0;
  const nonCachedInputTokens = clampNonNegative(inputTokens - cachedTokens);
  const cachedPrice = pricing.cached_input_per_million ?? pricing.input_per_million;
  const original_cost_usd =
    nonCachedInputTokens / 1_000_000 * pricing.input_per_million +
    cachedTokens / 1_000_000 * cachedPrice +
    outputTokens / 1_000_000 * pricing.output_per_million;
  const normalizedRatio = typeof costRatio === "number" && Number.isFinite(costRatio) && costRatio >= 0
    ? costRatio
    : undefined;
  const actual_cost_usd = original_cost_usd * (normalizedRatio ?? 1);

  return {
    cost_available: true as const,
    original_cost_usd,
    actual_cost_usd,
    estimated_cost_usd: actual_cost_usd,
    cost_ratio: normalizedRatio
  };
}

function findPricing(config: ModelGateConfig, provider: string, model: string): PricingConfig | undefined {
  return config.pricing[`${provider}/${model}`] ?? config.pricing[`${provider}/*`];
}

export function createUsageStore(path = resolve(process.cwd(), defaultUsagePath)) {
  function addUsageRecord(record: UsageRecord) {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  }

  function listUsageRecords(filters: UsageRecordFilters = {}) {
    const range = filters.range ?? "all";
    const kind = filters.kind ?? "all";
    const limit = filters.limit === undefined ? undefined : Math.max(0, Math.min(filters.limit, 1000));
    const alias = filters.alias?.trim();
    const provider = filters.provider?.trim();
    const model = filters.model?.trim();

    return readRecords(path)
      .filter((record) => inRange(record, range))
      .filter((record) => kind === "all" || record.kind === kind)
      .filter((record) => !alias || record.resolved_alias === alias || record.requested_model === alias)
      .filter((record) => !provider || record.provider === provider)
      .filter((record) => !model || record.upstream_model === model || record.requested_model === model || record.resolved_alias === model)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  function getUsageSummary(range: UsageRange = "today", kind: UsageKindFilter = "all"): UsageSummary {
    const records = listUsageRecords({ range, kind });
    const summary: UsageSummary = {
      range,
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      reasoning_tokens: 0,
      requests: records.length,
      success: records.filter((record) => record.ok).length,
      failed: records.filter((record) => !record.ok).length,
      cost_available: false,
      by_alias: {},
      by_provider: {},
      by_model: {}
    };

    for (const record of records) {
      addTokens(summary, record);
      addCost(summary, record);

      const nextAliasKey = aliasKey(record);
      const nextProviderKey = providerKey(record);
      const nextModelKey = modelKey(record);
      const aliasGroup = summary.by_alias[nextAliasKey] ?? createGroup();
      const providerGroup = summary.by_provider[nextProviderKey] ?? createGroup();
      const modelGroup = summary.by_model[nextModelKey] ?? createGroup();

      addRecordToGroup(aliasGroup, record);
      addRecordToGroup(providerGroup, record);
      addRecordToGroup(modelGroup, record);

      summary.by_alias[nextAliasKey] = aliasGroup;
      summary.by_provider[nextProviderKey] = providerGroup;
      summary.by_model[nextModelKey] = modelGroup;
    }

    summary.input_tokens = summary.input_tokens ?? 0;
    summary.output_tokens = summary.output_tokens ?? 0;
    summary.cached_tokens = summary.cached_tokens ?? 0;
    summary.reasoning_tokens = summary.reasoning_tokens ?? 0;
    summary.total_tokens = summary.total_tokens ?? 0;

    return summary;
  }

  function getUsageGroups(
    range: UsageRange = "today",
    groupBy: UsageGroupBy = "alias",
    kind: UsageKindFilter = "all",
    filters: Omit<UsageRecordFilters, "range" | "kind" | "limit"> = {}
  ): UsageGroupedSummary {
    const records = listUsageRecords({ range, kind, ...filters });
    const groups = new Map<string, UsageSummaryGroup>();
    const samples = new Map<string, UsageRecord>();

    for (const record of records) {
      const key = groupKey(record, groupBy);
      const group = groups.get(key) ?? createGroup();
      addRecordToGroup(group, record);
      groups.set(key, group);
      if (!samples.has(key)) {
        samples.set(key, record);
      }
    }

    return {
      range,
      kind,
      group_by: groupBy,
      groups: [...groups.entries()]
        .map(([key, group]) => toGroupSummary(key, group, groupBy, samples.get(key)))
        .sort((a, b) => b.requests - a.requests || a.key.localeCompare(b.key))
    };
  }

  function getUsageTimeline(range: Exclude<UsageRange, "all"> = "today", bucket: UsageTimelineBucket = "hour") {
    const records = listUsageRecords({ range, kind: "all" });
    const points = new Map<string, UsageTimelinePoint>();

    for (const record of records) {
      const timestamp = new Date(record.timestamp);
      if (Number.isNaN(timestamp.getTime())) {
        continue;
      }

      const key = bucketStart(timestamp, bucket).toISOString();
      const point = points.get(key) ?? {
        time: key,
        input_tokens: 0,
        output_tokens: 0,
        cached_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: 0,
        cost_available: false,
        requests: 0
      };

      point.requests += 1;
      addTokens(point, record);
      addCost(point, record);
      point.input_tokens = point.input_tokens ?? 0;
      point.output_tokens = point.output_tokens ?? 0;
      point.cached_tokens = point.cached_tokens ?? 0;
      point.reasoning_tokens = point.reasoning_tokens ?? 0;
      point.total_tokens = point.total_tokens ?? 0;
      points.set(key, point);
    }

    return {
      range,
      bucket,
      points: [...points.values()].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    };
  }

  function clearUsageRecords() {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "", "utf8");
  }

  return {
    addUsageRecord,
    listUsageRecords,
    getUsageSummary,
    getUsageGroups,
    getUsageTimeline,
    clearUsageRecords
  };
}
