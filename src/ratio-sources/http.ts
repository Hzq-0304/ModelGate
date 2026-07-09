import { RatioSourceError, type RatioSource, type RatioSourceAuth } from "./types.js";

const maxBodyBytes = 10 * 1024 * 1024;
const requestTimeoutMs = 10_000;
const maxRedirects = 3;
export const cookieSecretPrefix = "cookie:";

function credentialFromEnv(auth: RatioSourceAuth | undefined): Record<string, string> {
  if (!auth || auth.type === "none") {
    return {};
  }

  const value = process.env[auth.token_env];
  if (!value) {
    throw new RatioSourceError("authentication_required", `Missing ratio source credential environment variable ${auth.token_env}.`);
  }

  if (value.startsWith(cookieSecretPrefix)) {
    return {
      Cookie: value.slice(cookieSecretPrefix.length).trim()
    };
  }

  if (auth.type === "bearer") {
    return {
      Authorization: `Bearer ${value}`
    };
  }

  const header = auth.header || "Authorization";
  const scheme = auth.scheme ?? "";
  return {
    [header]: scheme ? `${scheme} ${value}` : value
  };
}

function hasConfiguredCredential(auth: RatioSourceAuth | undefined) {
  return Boolean(auth && auth.type !== "none");
}

function errorForStatus(status: number, auth: RatioSourceAuth | undefined) {
  if (status === 401) {
    return hasConfiguredCredential(auth) ? "authentication_failed" : "authentication_required";
  }
  if (status === 403) {
    return "authentication_failed";
  }
  if (status === 404) {
    return "endpoint_not_found";
  }
  return "invalid_response";
}

export type RatioHttpResponse = {
  status: number;
  url: string;
  headers: Headers;
  body: string;
  json?: unknown;
  notModified: boolean;
};

export async function fetchRatioJson(
  source: RatioSource,
  path: string,
  options: {
    etag?: string;
    lastModified?: string;
    timeoutMs?: number;
    allowNotModified?: boolean;
  } = {}
): Promise<RatioHttpResponse> {
  const target = path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `${source.baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const url = new URL(target);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RatioSourceError("unsupported_site", "Ratio source URL must use http or https.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? requestTimeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: "application/json, text/plain;q=0.9",
      ...credentialFromEnv(source.auth)
    };
    if (options.etag) {
      headers["if-none-match"] = options.etag;
    }
    if (options.lastModified) {
      headers["if-modified-since"] = options.lastModified;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: controller.signal
    });

    if (response.status === 304 && options.allowNotModified) {
      return {
        status: response.status,
        url: response.url,
        headers: response.headers,
        body: "",
        notModified: true
      };
    }

    if (response.status >= 300 && response.status < 400) {
      throw new RatioSourceError("endpoint_not_found", "Ratio source redirected unexpectedly. Check the base URL.", response.status);
    }

    if (!response.ok) {
      throw new RatioSourceError(errorForStatus(response.status, source.auth), `Ratio source returned HTTP ${response.status}.`, response.status);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new RatioSourceError("invalid_response", "Ratio source returned an empty response body.");
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBodyBytes) {
        throw new RatioSourceError("invalid_response", "Ratio source response is too large.");
      }
      chunks.push(value);
    }

    const body = Buffer.concat(chunks).toString("utf8");
    try {
      return {
        status: response.status,
        url: response.url,
        headers: response.headers,
        body,
        json: JSON.parse(body),
        notModified: false
      };
    } catch (error) {
      throw new RatioSourceError("invalid_response", `Ratio source did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    if (error instanceof RatioSourceError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new RatioSourceError("timeout", "Ratio source request timed out.");
    }
    throw new RatioSourceError("network_error", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }
}

export function maxRefreshTimeout() {
  return maxRedirects * requestTimeoutMs * 2;
}
