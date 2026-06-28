export type ProviderType = "mock" | "openai-compatible";

export type ProviderConfig = {
  type: ProviderType | string;
  baseUrl?: string;
  apiKey?: string;
};

export type ModelAlias = {
  provider: string;
  model: string;
};
