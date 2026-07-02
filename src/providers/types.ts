export type ProviderType = "mock" | "openai-compatible";

export type MockProviderConfig = {
  type: "mock";
  description?: string;
  metadata?: Record<string, unknown>;
};

export type OpenAICompatibleProviderConfig = {
  type: "openai-compatible";
  base_url: string;
  api_key?: string;
  auth?: {
    type: "env";
    header?: string;
    scheme?: string;
    env: string;
  } | {
    type: "ccswitch";
    source: string;
    app?: string;
    db_path?: string;
    provider_id?: string;
    credential_id?: string;
    credential_ref?: string;
    credential_path?: string;
    fallback_env?: string;
    header?: string;
    scheme?: string;
  } | {
    type: "static-header-ref";
    header?: string;
    scheme?: string;
    value_ref?: string;
    value_env?: string;
    value?: string;
  };
  responses_api?: boolean;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderConfig = MockProviderConfig | OpenAICompatibleProviderConfig;

export type ModelAlias = {
  provider: string;
  model: string;
  description?: string;
  metadata?: Record<string, unknown>;
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
    provider?: string;
    env?: string;
    source?: string;
    credential_id?: string;
  };
};
