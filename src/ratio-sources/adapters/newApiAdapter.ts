import { fetchRatioJson } from "../http.js";
import { RatioSourceError, type RatioFetchContext, type RatioFetchResult, type RatioGroup, type RatioSource, type RatioSourceAdapter, type RatioSourceProbeResult } from "../types.js";
import { asArray, asRecord, attachModelRatios, groupsFromRatioMap, parseDescriptionMap, parseGroupRatioMap, parseRatioMap, stringValue, numberValue } from "./common.js";

function successData(json: unknown) {
  const root = asRecord(json);
  if (root.success === false) {
    throw new RatioSourceError("invalid_response", stringValue(root.message) || "Ratio source returned success=false.");
  }
  return "data" in root ? root.data : root;
}

function parseRatioConfig(source: RatioSource, json: unknown, fetchedAt: string): RatioGroup[] {
  const data = asRecord(successData(json));
  const modelRatios = parseRatioMap(data.model_ratio ?? data.ModelRatio);
  const groupRatios = parseGroupRatioMap(data.group_ratio ?? data.GroupRatio);
  const descriptions = parseDescriptionMap(data.usable_group ?? data.UserUsableGroups);

  const groups = groupsFromRatioMap(source.id, groupRatios, descriptions);
  return attachModelRatios(groups, modelRatios, fetchedAt);
}

function parsePricing(source: RatioSource, json: unknown, fetchedAt: string): RatioGroup[] {
  const root = asRecord(json);
  if (root.success === false) {
    throw new RatioSourceError("invalid_response", stringValue(root.message) || "Pricing endpoint returned success=false.");
  }

  const modelRatios: Record<string, number> = {};
  const modelToGroups = new Map<string, Set<string>>();
  for (const item of asArray(root.data)) {
    const row = asRecord(item);
    const modelName = stringValue(row.model_name);
    const ratio = numberValue(row.model_ratio);
    const quotaType = numberValue(row.quota_type);
    if (!modelName || ratio === undefined || ratio < 0 || quotaType === 1) {
      continue;
    }
    modelRatios[modelName.trim()] = ratio;

    const enabledGroups = asArray(row.enable_groups)
      .map((value) => stringValue(value)?.trim())
      .filter((value): value is string => Boolean(value));
    if (enabledGroups.length > 0) {
      modelToGroups.set(modelName.trim(), new Set(enabledGroups));
    }
  }

  const groupRatios = parseGroupRatioMap(root.group_ratio);
  const descriptions = parseDescriptionMap(root.usable_group);
  const groups = groupsFromRatioMap(source.id, groupRatios, descriptions);
  return attachModelRatios(groups, modelRatios, fetchedAt, modelToGroups);
}

async function fetchNewApiGroups(source: RatioSource, context?: RatioFetchContext): Promise<RatioFetchResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetchRatioJson(source, "/api/ratio_config", {
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
    const groups = parseRatioConfig(source, response.json, fetchedAt);
    if (groups.some((group) => group.models.length > 0)) {
      return {
        groups,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined
      };
    }
  } catch (error) {
    if (error instanceof RatioSourceError && !["authentication_failed", "authentication_required", "endpoint_not_found", "invalid_response"].includes(error.code)) {
      throw error;
    }
  }

  const response = await fetchRatioJson(source, "/api/pricing", {
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
  const groups = parsePricing(source, response.json, fetchedAt);
  if (!groups.some((group) => group.models.length > 0)) {
    throw new RatioSourceError("no_model_ratio", "New API response did not include model_ratio data.");
  }
  return {
    groups,
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined
  };
}

export const newApiAdapter: RatioSourceAdapter = {
  type: "new-api",

  async probe(source: RatioSource): Promise<RatioSourceProbeResult> {
    try {
      await fetchNewApiGroups(source);
      return { ok: true, type: "new-api" };
    } catch (error) {
      return {
        ok: false,
        type: "new-api",
        message: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof RatioSourceError ? error.code : "network_error"
      };
    }
  },

  async fetchGroups(source: RatioSource): Promise<RatioGroup[]> {
    return (await fetchNewApiGroups(source)).groups;
  },

  async fetchModelRatios(source: RatioSource, _groups: RatioGroup[], context?: RatioFetchContext): Promise<RatioFetchResult> {
    return fetchNewApiGroups(source, context);
  }
};
