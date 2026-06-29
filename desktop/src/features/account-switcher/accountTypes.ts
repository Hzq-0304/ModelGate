export type ConnectionState = "checking" | "connected" | "disconnected";

export type AccountAlias = {
  name: string;
  provider: string;
  model: string;
};

export type EntrypointStatusMap = Record<string, {
  use: string;
  resolved: string;
}>;

export function formatAliasTitle(alias: string) {
  return alias
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
