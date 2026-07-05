export type RatioSourceType =
  | "new-api"
  | "one-api"
  | "sub2api"
  | "new-api-compatible";

export type RatioSourceStatus =
  | "never"
  | "fetching"
  | "ok"
  | "warning"
  | "failed";

export type RatioSourceErrorCode =
  | "unsupported_site"
  | "authentication_required"
  | "authentication_failed"
  | "endpoint_not_found"
  | "invalid_response"
  | "timeout"
  | "network_error"
  | "parser_error"
  | "no_model_ratio";

export type RatioSourceAuth =
  | { type: "none" }
  | { type: "bearer"; token_env: string }
  | { type: "api-token"; token_env: string; header?: string; scheme?: string };

export type RatioSource = {
  id: string;
  name: string;
  baseUrl: string;
  type: RatioSourceType;
  enabled: boolean;
  refreshIntervalMinutes: number;
  auth?: RatioSourceAuth;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  nextRefreshAt?: string;
  status: RatioSourceStatus;
  lastError?: string;
  lastErrorCode?: RatioSourceErrorCode;
};

export type RatioModel = {
  model: string;
  ratio: number;
  sourceValue?: unknown;
  fetchedAt: string;
};

export type RatioGroup = {
  sourceId: string;
  groupId: string;
  name: string;
  description?: string;
  sourceOrder: number;
  models: RatioModel[];
  groupRatio?: number;
  unsupportedReason?: "no_model_ratio";
};

export type RatioBinding = {
  sourceId: string;
  groupId: string;
};

export type RatioSourceProbeResult = {
  ok: boolean;
  type?: RatioSourceType;
  message?: string;
  errorCode?: RatioSourceErrorCode;
};

export type RatioFetchContext = {
  etag?: string;
  lastModified?: string;
  previousGroups?: RatioGroup[];
};

export type RatioFetchResult = {
  groups: RatioGroup[];
  notModified?: boolean;
  etag?: string;
  lastModified?: string;
  warning?: string;
  warningCode?: RatioSourceErrorCode;
};

export interface RatioSourceAdapter {
  type: RatioSourceType;
  probe(source: RatioSource): Promise<RatioSourceProbeResult>;
  fetchGroups(source: RatioSource): Promise<RatioGroup[]>;
  fetchModelRatios(source: RatioSource, groups: RatioGroup[], context?: RatioFetchContext): Promise<RatioFetchResult>;
}

export type RatioCacheEntry = {
  sourceId: string;
  groups: RatioGroup[];
  fetchedAt?: string;
  etag?: string;
  lastModified?: string;
};

export type RatioSourcesFile = {
  schema_version: 1;
  sources: RatioSource[];
};

export type RatioCacheFile = {
  schema_version: 1;
  entries: Record<string, RatioCacheEntry>;
};

export type RatioBindingItem = {
  alias: string;
  provider: string;
  model: string;
  binding?: RatioBinding;
  currentRatio?: number;
  sourceName?: string;
  groupName?: string;
  status: "bound" | "unbound" | "missing_source" | "missing_group" | "missing_model_ratio" | "unsupported";
};

export class RatioSourceError extends Error {
  readonly code: RatioSourceErrorCode;
  readonly statusCode?: number;

  constructor(code: RatioSourceErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = "RatioSourceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
