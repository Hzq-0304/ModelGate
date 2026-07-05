import { normalizeModelName } from "../normalize/normalizeModelName.js";
import { RatioSourceError, type RatioGroup, type RatioModel } from "../types.js";

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseJsonOption(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new RatioSourceError("parser_error", `Invalid JSON option value: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseRatioMap(value: unknown): Record<string, number> {
  const record = asRecord(parseJsonOption(value));
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const model = normalizeModelName(key);
    const ratio = numberValue(raw);
    if (!model || ratio === undefined || ratio < 0) {
      continue;
    }
    result[model] = ratio;
  }
  return result;
}

export function parseGroupRatioMap(value: unknown): Record<string, number> {
  const record = asRecord(parseJsonOption(value));
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const group = normalizeModelName(key);
    const ratio = numberValue(raw);
    if (!group || ratio === undefined || ratio < 0) {
      continue;
    }
    result[group] = ratio;
  }
  return result;
}

export function parseDescriptionMap(value: unknown): Record<string, string> {
  const record = asRecord(parseJsonOption(value));
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    const group = normalizeModelName(key);
    const description = stringValue(raw);
    if (group && description) {
      result[group] = description;
    }
  }
  return result;
}

export function groupsFromRatioMap(
  sourceId: string,
  groupRatios: Record<string, number>,
  descriptions: Record<string, string> = {}
): RatioGroup[] {
  const entries = Object.entries(groupRatios);
  const groups: Array<[string, number]> = entries.length > 0 ? entries : [["default", 1]];
  return groups.map(([groupId, groupRatio], index) => ({
    sourceId,
    groupId,
    name: groupId,
    description: descriptions[groupId],
    sourceOrder: index,
    groupRatio,
    models: []
  }));
}

export function attachModelRatios(
  groups: RatioGroup[],
  modelRatios: Record<string, number>,
  fetchedAt: string,
  modelToGroups?: Map<string, Set<string>>
): RatioGroup[] {
  const allModels = Object.entries(modelRatios);

  return groups.map((group) => {
    const effectiveGroupRatio = group.groupRatio ?? 1;
    const models: RatioModel[] = allModels
      .filter(([model]) => {
        if (!modelToGroups) {
          return true;
        }
        const enabledGroups = modelToGroups.get(model);
        return !enabledGroups || enabledGroups.has("all") || enabledGroups.has(group.groupId);
      })
      .map(([model, ratio]) => ({
        model,
        ratio: roundRatio(ratio * effectiveGroupRatio),
        sourceValue: {
          model_ratio: ratio,
          group_ratio: effectiveGroupRatio
        },
        fetchedAt
      }));

    return {
      ...group,
      models,
      unsupportedReason: models.length > 0 ? undefined : group.unsupportedReason
    };
  });
}

export function roundRatio(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function ensureModels(groups: RatioGroup[], message = "No model ratio data was found.") {
  if (!groups.some((group) => group.models.length > 0)) {
    throw new RatioSourceError("no_model_ratio", message);
  }
}
