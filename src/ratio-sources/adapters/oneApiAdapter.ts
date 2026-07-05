import { fetchRatioJson } from "../http.js";
import { RatioSourceError, type RatioFetchContext, type RatioFetchResult, type RatioGroup, type RatioSource, type RatioSourceAdapter, type RatioSourceProbeResult } from "../types.js";
import { asArray, asRecord, attachModelRatios, groupsFromRatioMap, parseGroupRatioMap, parseRatioMap, stringValue } from "./common.js";

function parseOptions(source: RatioSource, json: unknown, fetchedAt: string): RatioGroup[] {
  const root = asRecord(json);
  if (root.success === false) {
    throw new RatioSourceError("invalid_response", stringValue(root.message) || "One API option endpoint returned success=false.");
  }

  const options: Record<string, unknown> = {};
  for (const item of asArray(root.data)) {
    const row = asRecord(item);
    const key = stringValue(row.key);
    if (!key) {
      continue;
    }
    options[key] = row.value;
  }

  const modelRatios = parseRatioMap(options.ModelRatio);
  const groupRatios = parseGroupRatioMap(options.GroupRatio);
  const groups = groupsFromRatioMap(source.id, groupRatios);
  return attachModelRatios(groups, modelRatios, fetchedAt);
}

async function fetchOneApiGroups(source: RatioSource, context?: RatioFetchContext): Promise<RatioFetchResult> {
  const response = await fetchRatioJson(source, "/api/option/", {
    etag: context?.etag,
    lastModified: context?.lastModified,
    allowNotModified: true
  });
  if (response.notModified && context?.previousGroups) {
    return {
      groups: context.previousGroups,
      notModified: true,
      etag: context.etag,
      lastModified: context.lastModified
    };
  }

  const groups = parseOptions(source, response.json, new Date().toISOString());
  if (!groups.some((group) => group.models.length > 0)) {
    throw new RatioSourceError("no_model_ratio", "One API option response did not include ModelRatio data.");
  }
  return {
    groups,
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined
  };
}

export const oneApiAdapter: RatioSourceAdapter = {
  type: "one-api",

  async probe(source: RatioSource): Promise<RatioSourceProbeResult> {
    try {
      await fetchOneApiGroups(source);
      return { ok: true, type: "one-api" };
    } catch (error) {
      return {
        ok: false,
        type: "one-api",
        message: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof RatioSourceError ? error.code : "network_error"
      };
    }
  },

  async fetchGroups(source: RatioSource): Promise<RatioGroup[]> {
    return (await fetchOneApiGroups(source)).groups;
  },

  async fetchModelRatios(source: RatioSource, _groups: RatioGroup[], context?: RatioFetchContext): Promise<RatioFetchResult> {
    return fetchOneApiGroups(source, context);
  }
};
