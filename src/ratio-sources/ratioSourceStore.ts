import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveConfigPath } from "../config/loadConfig.js";
import type { RatioCacheEntry, RatioCacheFile, RatioSource, RatioSourcesFile } from "./types.js";

function dataRoot(configPath?: string) {
  if (process.env.MODELGATE_RATIO_DIR) {
    return resolve(process.env.MODELGATE_RATIO_DIR);
  }
  if (process.env.MODELGATE_DATA_DIR) {
    return resolve(process.env.MODELGATE_DATA_DIR, "ratio");
  }
  return resolve(dirname(resolveConfigPath(configPath)), "ratio");
}

export function getRatioDataPaths(configPath?: string) {
  const root = dataRoot(configPath);
  return {
    root,
    sources: resolve(root, "sources.json"),
    cache: resolve(root, "cache.json")
  };
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) {
    return fallback;
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export class RatioSourceStore {
  readonly paths: ReturnType<typeof getRatioDataPaths>;

  constructor(configPath?: string) {
    this.paths = getRatioDataPaths(configPath);
  }

  readSources(): RatioSource[] {
    const file = readJson<RatioSourcesFile>(this.paths.sources, {
      schema_version: 1,
      sources: []
    });
    return Array.isArray(file.sources) ? file.sources : [];
  }

  writeSources(sources: RatioSource[]) {
    writeJson(this.paths.sources, {
      schema_version: 1,
      sources
    } satisfies RatioSourcesFile);
  }

  readCacheEntries(): Record<string, RatioCacheEntry> {
    const file = readJson<RatioCacheFile>(this.paths.cache, {
      schema_version: 1,
      entries: {}
    });
    return file.entries && typeof file.entries === "object" ? file.entries : {};
  }

  writeCacheEntries(entries: Record<string, RatioCacheEntry>) {
    writeJson(this.paths.cache, {
      schema_version: 1,
      entries
    } satisfies RatioCacheFile);
  }
}
