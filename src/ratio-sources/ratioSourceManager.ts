import { randomUUID } from "node:crypto";
import type { ModelGateConfig } from "../config/schema.js";
import { getRatioSourceAdapter } from "./registry.js";
import { normalizeBaseUrl } from "./normalize/normalizeBaseUrl.js";
import { findModelRatio } from "./normalize/normalizeModelName.js";
import { RatioSourceError, type RatioBinding, type RatioBindingItem, type RatioCacheEntry, type RatioGroup, type RatioSource, type RatioSourceAuth, type RatioSourceErrorCode, type RatioSourceType } from "./types.js";
import { RatioSourceStore } from "./ratioSourceStore.js";

const defaultRefreshIntervalMinutes = 180;
const refreshTimeoutMs = 60_000;
const sourceIdPattern = /^[A-Za-z0-9_-]+$/;
const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type RatioSourceInput = {
  id?: string;
  name?: string;
  baseUrl?: string;
  type?: RatioSourceType;
  enabled?: boolean;
  refreshIntervalMinutes?: number;
  auth?: RatioSourceAuth;
};

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `ratio-${randomUUID().slice(0, 8)}`;
}

function uniqueId(base: string, existing: Set<string>) {
  let candidate = slugify(base);
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${slugify(base)}-${index}`;
    index += 1;
  }
  return candidate;
}

function normalizeAuth(auth: RatioSourceAuth | undefined): RatioSourceAuth | undefined {
  if (!auth || auth.type === "none") {
    return { type: "none" };
  }
  if (auth.type === "bearer") {
    if (!auth.token_env || !envNamePattern.test(auth.token_env)) {
      throw new RatioSourceError("authentication_required", "Bearer auth requires a valid token_env.");
    }
    return { type: "bearer", token_env: auth.token_env };
  }
  if (!auth.token_env || !envNamePattern.test(auth.token_env)) {
    throw new RatioSourceError("authentication_required", "API token auth requires a valid token_env.");
  }
  return {
    type: "api-token",
    token_env: auth.token_env,
    header: auth.header?.trim() || "Authorization",
    scheme: auth.scheme?.trim()
  };
}

function normalizeSourceInput(input: RatioSourceInput, existing: RatioSource[] = []): RatioSource {
  if (!input.name?.trim()) {
    throw new RatioSourceError("invalid_response", "Ratio source name is required.");
  }
  if (!input.baseUrl?.trim()) {
    throw new RatioSourceError("unsupported_site", "Ratio source URL is required.");
  }
  if (!input.type) {
    throw new RatioSourceError("unsupported_site", "Ratio source type is required.");
  }

  const id = input.id?.trim()
    ? input.id.trim()
    : uniqueId(input.name, new Set(existing.map((source) => source.id)));

  if (!sourceIdPattern.test(id)) {
    throw new RatioSourceError("invalid_response", "Ratio source id may only contain letters, numbers, '-' and '_'.");
  }

  const minutes = Number(input.refreshIntervalMinutes ?? defaultRefreshIntervalMinutes);
  return {
    id,
    name: input.name.trim(),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    type: input.type,
    enabled: input.enabled ?? true,
    refreshIntervalMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.max(1, Math.round(minutes)) : defaultRefreshIntervalMinutes,
    auth: normalizeAuth(input.auth),
    status: "never"
  };
}

function nextRefreshAt(source: RatioSource, from = new Date()) {
  return new Date(from.getTime() + source.refreshIntervalMinutes * 60_000).toISOString();
}

function timeoutPromise(): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new RatioSourceError("timeout", "Ratio source refresh exceeded 60 seconds.")), refreshTimeoutMs);
  });
}

function errorCode(error: unknown): RatioSourceErrorCode {
  return error instanceof RatioSourceError ? error.code : "network_error";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class RatioSourceManager {
  readonly store: RatioSourceStore;
  #inFlight = new Map<string, Promise<RatioSource>>();

  constructor(configPath?: string) {
    this.store = new RatioSourceStore(configPath);
  }

  listSources() {
    return this.store.readSources();
  }

  getCacheEntries() {
    return this.store.readCacheEntries();
  }

  getCacheEntry(sourceId: string): RatioCacheEntry | undefined {
    return this.getCacheEntries()[sourceId];
  }

  getGroups(sourceId: string): RatioGroup[] {
    return this.getCacheEntry(sourceId)?.groups ?? [];
  }

  createSource(input: RatioSourceInput) {
    const sources = this.listSources();
    const source = normalizeSourceInput(input, sources);
    if (sources.some((candidate) => candidate.id === source.id)) {
      throw new RatioSourceError("invalid_response", `Ratio source "${source.id}" already exists.`);
    }
    this.store.writeSources([...sources, source]);
    return source;
  }

  updateSource(id: string, patch: RatioSourceInput) {
    const sources = this.listSources();
    const index = sources.findIndex((source) => source.id === id);
    if (index < 0) {
      throw new RatioSourceError("endpoint_not_found", `Ratio source "${id}" was not found.`);
    }

    const previous = sources[index];
    const next = {
      ...previous,
      ...normalizeSourceInput({
        ...previous,
        ...patch,
        id
      }, sources.filter((source) => source.id !== id)),
      lastAttemptAt: previous.lastAttemptAt,
      lastSuccessAt: previous.lastSuccessAt,
      nextRefreshAt: previous.nextRefreshAt,
      status: previous.status,
      lastError: previous.lastError,
      lastErrorCode: previous.lastErrorCode
    };

    sources[index] = next;
    this.store.writeSources(sources);
    return next;
  }

  deleteSource(id: string) {
    const sources = this.listSources();
    const nextSources = sources.filter((source) => source.id !== id);
    this.store.writeSources(nextSources);

    const cache = this.getCacheEntries();
    delete cache[id];
    this.store.writeCacheEntries(cache);
  }

  isSourceStale(source: RatioSource, now = new Date()) {
    if (!source.enabled) {
      return false;
    }
    if (!source.lastSuccessAt) {
      return true;
    }
    return now.getTime() - new Date(source.lastSuccessAt).getTime() >= source.refreshIntervalMinutes * 60_000;
  }

  nextDueSource(now = new Date()) {
    return this.listSources()
      .filter((source) => this.isSourceStale(source, now))
      .sort((a, b) => (a.nextRefreshAt ?? "").localeCompare(b.nextRefreshAt ?? ""))[0];
  }

  async refreshSource(id: string) {
    const current = this.#inFlight.get(id);
    if (current) {
      return current;
    }

    const task = this.#refreshSource(id).finally(() => {
      this.#inFlight.delete(id);
    });
    this.#inFlight.set(id, task);
    return task;
  }

  async #refreshSource(id: string) {
    const sources = this.listSources();
    const source = sources.find((candidate) => candidate.id === id);
    if (!source) {
      throw new RatioSourceError("endpoint_not_found", `Ratio source "${id}" was not found.`);
    }

    const startedAt = new Date();
    this.#mergeSource({
      ...source,
      status: "fetching",
      lastAttemptAt: startedAt.toISOString(),
      lastError: undefined,
      lastErrorCode: undefined
    });

    const adapter = getRatioSourceAdapter(source.type);
    const previousCache = this.getCacheEntry(source.id);

    try {
      const result = await Promise.race([
        adapter.fetchModelRatios(source, previousCache?.groups ?? [], {
          etag: previousCache?.etag,
          lastModified: previousCache?.lastModified,
          previousGroups: previousCache?.groups
        }),
        timeoutPromise()
      ]);

      const now = new Date();
      const groups = result.groups.map((group) => ({
        ...group,
        sourceId: source.id
      }));
      const cache = this.getCacheEntries();
      cache[source.id] = {
        sourceId: source.id,
        groups,
        fetchedAt: result.notModified ? previousCache?.fetchedAt : now.toISOString(),
        etag: result.etag,
        lastModified: result.lastModified
      };
      this.store.writeCacheEntries(cache);

      const next: RatioSource = {
        ...source,
        status: result.warning ? "warning" : "ok",
        lastAttemptAt: startedAt.toISOString(),
        lastSuccessAt: now.toISOString(),
        nextRefreshAt: nextRefreshAt(source, now),
        lastError: result.warning,
        lastErrorCode: result.warningCode
      };
      this.#mergeSource(next);
      return next;
    } catch (error) {
      const now = new Date();
      const next: RatioSource = {
        ...source,
        status: previousCache ? "warning" : "failed",
        lastAttemptAt: startedAt.toISOString(),
        nextRefreshAt: nextRefreshAt(source, now),
        lastError: errorMessage(error),
        lastErrorCode: errorCode(error)
      };
      this.#mergeSource(next);
      return next;
    }
  }

  #mergeSource(source: RatioSource) {
    const sources = this.listSources();
    const index = sources.findIndex((candidate) => candidate.id === source.id);
    if (index >= 0) {
      sources[index] = source;
    } else {
      sources.push(source);
    }
    this.store.writeSources(sources);
  }

  buildBindings(config: ModelGateConfig): RatioBindingItem[] {
    const sources = new Map(this.listSources().map((source) => [source.id, source]));
    const cache = this.getCacheEntries();

    return Object.entries(config.aliases).map(([aliasName, alias]) => {
      const binding = alias.ratio_binding;
      if (!binding) {
        return {
          alias: aliasName,
          provider: alias.provider,
          model: alias.model,
          status: "unbound"
        };
      }

      const source = sources.get(binding.source_id);
      if (!source) {
        return {
          alias: aliasName,
          provider: alias.provider,
          model: alias.model,
          binding: {
            sourceId: binding.source_id,
            groupId: binding.group_id
          },
          status: "missing_source"
        };
      }

      const group = cache[source.id]?.groups.find((candidate) => candidate.groupId === binding.group_id);
      if (!group) {
        return {
          alias: aliasName,
          provider: alias.provider,
          model: alias.model,
          binding: {
            sourceId: binding.source_id,
            groupId: binding.group_id
          },
          sourceName: source.name,
          status: "missing_group"
        };
      }

      if (group.unsupportedReason === "no_model_ratio") {
        return {
          alias: aliasName,
          provider: alias.provider,
          model: alias.model,
          binding: {
            sourceId: binding.source_id,
            groupId: binding.group_id
          },
          sourceName: source.name,
          groupName: group.name,
          status: "unsupported"
        };
      }

      const currentRatio = findModelRatio(group.models, alias.model);
      return {
        alias: aliasName,
        provider: alias.provider,
        model: alias.model,
        binding: {
          sourceId: binding.source_id,
          groupId: binding.group_id
        },
        currentRatio,
        sourceName: source.name,
        groupName: group.name,
        status: currentRatio === undefined ? "missing_model_ratio" : "bound"
      };
    });
  }
}
