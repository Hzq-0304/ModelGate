import { fetchRatioJson } from "../http.js";
import { RatioSourceError, type RatioFetchContext, type RatioFetchResult, type RatioGroup, type RatioSource, type RatioSourceAdapter, type RatioSourceProbeResult } from "../types.js";
import { asArray, asRecord, numberValue, stringValue } from "./common.js";

function dataArray(json: unknown) {
  const root = asRecord(json);
  if (Array.isArray(json)) {
    return json;
  }
  if (root.data !== undefined) {
    return asArray(root.data);
  }
  if (root.items !== undefined) {
    return asArray(root.items);
  }
  return [];
}

function parseSub2ApiGroups(source: RatioSource, json: unknown): RatioGroup[] {
  const groups = dataArray(json);
  return groups.map((item, index) => {
    const row = asRecord(item);
    const id = stringValue(row.id) ?? String(numberValue(row.id) ?? stringValue(row.name) ?? `group-${index + 1}`);
    const name = stringValue(row.name) ?? id;
    const groupRatio = numberValue(row.rate_multiplier);
    return {
      sourceId: source.id,
      groupId: id,
      name,
      description: stringValue(row.description),
      sourceOrder: numberValue(row.sort_order) ?? index,
      groupRatio,
      models: [],
      unsupportedReason: "no_model_ratio" as const
    };
  });
}

async function fetchSub2Groups(source: RatioSource, context?: RatioFetchContext): Promise<RatioFetchResult> {
  const paths = [
    "/api/v1/admin/groups/all?include_inactive=false",
    "/api/v1/groups/available"
  ];
  let lastError: unknown;

  for (const path of paths) {
    try {
      const response = await fetchRatioJson(source, path, {
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
      const groups = parseSub2ApiGroups(source, response.json);
      if (groups.length > 0) {
        return {
          groups,
          etag: response.headers.get("etag") ?? undefined,
          lastModified: response.headers.get("last-modified") ?? undefined,
          warning: "Sub2API exposes group rate_multiplier, but no group -> model -> ratio map was found.",
          warningCode: "no_model_ratio"
        };
      }
      lastError = new RatioSourceError("invalid_response", "Sub2API groups endpoint returned no groups.");
    } catch (error) {
      lastError = error;
      if (error instanceof RatioSourceError && (error.code === "authentication_required" || error.code === "authentication_failed")) {
        break;
      }
    }
  }

  if (lastError instanceof RatioSourceError) {
    throw lastError;
  }
  throw new RatioSourceError("no_model_ratio", "Sub2API did not expose model ratio data.");
}

export const sub2ApiAdapter: RatioSourceAdapter = {
  type: "sub2api",

  async probe(source: RatioSource): Promise<RatioSourceProbeResult> {
    try {
      const result = await fetchSub2Groups(source);
      return {
        ok: true,
        type: "sub2api",
        message: result.warning
      };
    } catch (error) {
      return {
        ok: false,
        type: "sub2api",
        message: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof RatioSourceError ? error.code : "network_error"
      };
    }
  },

  async fetchGroups(source: RatioSource): Promise<RatioGroup[]> {
    return (await fetchSub2Groups(source)).groups;
  },

  async fetchModelRatios(source: RatioSource, _groups: RatioGroup[], context?: RatioFetchContext): Promise<RatioFetchResult> {
    return fetchSub2Groups(source, context);
  }
};
