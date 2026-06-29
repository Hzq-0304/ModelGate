export type ProviderType = "mock" | "openai-compatible";

export type MockProviderConfig = {
  type: "mock";
};

export type OpenAICompatibleProviderConfig = {
  type: "openai-compatible";
  base_url: string;
  api_key: string;
  responses_api?: boolean;
};

export type ProviderConfig = MockProviderConfig | OpenAICompatibleProviderConfig;

export type ModelAlias = {
  provider: string;
  model: string;
};

export type ResolvedModelRoute = {
  aliasName: string;
  providerName: string;
  requestedModel: string;
  upstreamModel: string;
  provider: ProviderConfig;
};

export type ChatCompletionRequestBody = Record<string, unknown> & {
  model?: string;
  stream?: boolean;
  messages?: Array<{
    role: string;
    content?: unknown;
  }>;
};

export type ResponsesRequestBody = Record<string, unknown> & {
  model?: string;
  stream?: boolean;
  input?: unknown;
  instructions?: unknown;
  max_output_tokens?: unknown;
  temperature?: unknown;
  top_p?: unknown;
  tools?: unknown;
  tool_choice?: unknown;
};

export type OpenAICompatibleError = {
  error: {
    message: string;
    type: string;
    code: string | null;
  };
};
