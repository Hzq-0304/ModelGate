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

function groupRows(json: unknown) {
  const rows: unknown[] = [];

  for (const item of dataArray(json)) {
    const row = asRecord(item);
    const directGroups = asArray(row.groups);
    const platforms = asArray(row.platforms);

    if (
      row.rate_multiplier !== undefined
      || row.rateMultiplier !== undefined
      || row.group_id !== undefined
      || (row.id !== undefined && row.name !== undefined && platforms.length === 0 && directGroups.length === 0)
    ) {
      rows.push(item);
    }

    rows.push(...directGroups);
    for (const platform of platforms) {
      rows.push(...asArray(asRecord(platform).groups));
    }
  }

  return rows;
}

function parseSub2ApiGroups(source: RatioSource, json: unknown): RatioGroup[] {
  const groups = groupRows(json);
  return groups.map((item, index) => {
    const row = asRecord(item);
    const id = stringValue(row.id)
      ?? stringValue(row.group_id)
      ?? String(numberValue(row.id) ?? numberValue(row.group_id) ?? stringValue(row.name) ?? `group-${index + 1}`);
    const name = stringValue(row.name) ?? id;
    const groupRatio = numberValue(row.rate_multiplier)
      ?? numberValue(row.rateMultiplier)
      ?? numberValue(row.rate)
      ?? numberValue(row.multiplier);
    return {
      sourceId: source.id,
      groupId: id,
      name,
      description: stringValue(row.description) ?? stringValue(row.platform) ?? stringValue(row.subscription_type),
      sourceOrder: numberValue(row.sort_order) ?? index,
      groupRatio,
      models: []
    };
  });
}

function sub2AuthError(source: RatioSource, error: RatioSourceError) {
  if (!source.auth || source.auth.type === "none") {
    return new RatioSourceError(
      "authentication_required",
      "Sub2API group endpoints require a logged-in JWT. Set authentication to Bearer and provide the site's auth_token via an environment variable.",
      error.statusCode
    );
  }

  return new RatioSourceError(
    error.code,
    "Sub2API rejected the configured credential. Refresh the site's auth_token and update the ratio source environment variable.",
    error.statusCode
  );
}

async function fetchSub2Groups(source: RatioSource, context?: RatioFetchContext): Promise<RatioFetchResult> {
  const paths = [
    "/api/v1/groups/available",
    "/api/v1/channels/available",
    "/api/v1/admin/groups/all",
    "/api/v1/admin/groups/all?include_inactive=true"
  ];
  let lastError: unknown;
  let authError: RatioSourceError | null = null;

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
          lastModified: response.headers.get("last-modified") ?? undefined
        };
      }
      lastError = new RatioSourceError("invalid_response", "Sub2API groups endpoint returned no groups.");
    } catch (error) {
      lastError = error;
      if (error instanceof RatioSourceError && (error.code === "authentication_required" || error.code === "authentication_failed")) {
        authError = error;
      }
    }
  }

  if (authError) {
    throw sub2AuthError(source, authError);
  }
  if (lastError instanceof RatioSourceError) {
    throw lastError;
  }
  throw new RatioSourceError("no_model_ratio", "Sub2API did not expose group ratio data.");
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
