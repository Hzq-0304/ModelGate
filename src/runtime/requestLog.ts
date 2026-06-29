export type RequestLogEntry = {
  id: string;
  kind?: "normal" | "diagnostic";
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
  method: "POST";
  path: "/v1/chat/completions";
  requested_model?: string;
  resolved_alias?: string;
  provider?: string;
  upstream_model?: string;
  stream: boolean;
  status_code?: number;
  ok: boolean;
  error_type?: string;
  error_message?: string;
  prompt_preview?: string;
  prompt_chars?: number;
  response_chars?: number;
};

export type RequestStats = {
  total: number;
  success: number;
  failed: number;
  stream: number;
  non_stream: number;
  avg_duration_ms: number;
  by_provider: Record<string, number>;
};

export type RequestLogStore = ReturnType<typeof createRequestLogStore>;

export function createRequestLogStore(maxEntries = 200) {
  const entries: RequestLogEntry[] = [];

  function addRequestLog(entry: RequestLogEntry) {
    entries.unshift(entry);

    if (entries.length > maxEntries) {
      entries.length = maxEntries;
    }
  }

  function listRequestLogs(limit = 50) {
    const safeLimit = Math.max(0, Math.min(limit, maxEntries));
    return entries.slice(0, safeLimit);
  }

  function clearRequestLogs() {
    entries.length = 0;
  }

  function getRequestStats(): RequestStats {
    const durations = entries
      .map((entry) => entry.duration_ms)
      .filter((duration): duration is number => typeof duration === "number");

    return {
      total: entries.length,
      success: entries.filter((entry) => entry.ok).length,
      failed: entries.filter((entry) => !entry.ok).length,
      stream: entries.filter((entry) => entry.stream).length,
      non_stream: entries.filter((entry) => !entry.stream).length,
      avg_duration_ms: durations.length > 0
        ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
        : 0,
      by_provider: entries.reduce<Record<string, number>>((counts, entry) => {
        const provider = entry.provider ?? "unknown";
        counts[provider] = (counts[provider] ?? 0) + 1;
        return counts;
      }, {})
    };
  }

  return {
    addRequestLog,
    listRequestLogs,
    clearRequestLogs,
    getRequestStats
  };
}
