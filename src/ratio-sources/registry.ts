import type { RatioSourceAdapter, RatioSourceType } from "./types.js";
import { newApiAdapter } from "./adapters/newApiAdapter.js";
import { newApiCompatibleAdapter } from "./adapters/newApiCompatibleAdapter.js";
import { oneApiAdapter } from "./adapters/oneApiAdapter.js";
import { sub2ApiAdapter } from "./adapters/sub2ApiAdapter.js";

const adapters: Record<RatioSourceType, RatioSourceAdapter> = {
  "new-api": newApiAdapter,
  "one-api": oneApiAdapter,
  sub2api: sub2ApiAdapter,
  "new-api-compatible": newApiCompatibleAdapter
};

export function getRatioSourceAdapter(type: RatioSourceType) {
  return adapters[type];
}

export function listRatioSourceTypes(): RatioSourceType[] {
  return Object.keys(adapters) as RatioSourceType[];
}
