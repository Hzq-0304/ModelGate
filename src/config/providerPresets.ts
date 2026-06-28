export type ProviderPreset = {
  id: string;
  display_name: string;
  provider_name: string;
  type: "openai-compatible";
  base_url: string;
  default_model: string;
  suggested_alias: string;
  suggested_env_name: string;
  notes?: string;
  models?: string[];
};

export const providerPresets: ProviderPreset[] = [
  {
    id: "openai",
    display_name: "OpenAI",
    provider_name: "openai",
    type: "openai-compatible",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4.1",
    suggested_alias: "openai-main",
    suggested_env_name: "OPENAI_API_KEY",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o"]
  },
  {
    id: "deepseek",
    display_name: "DeepSeek",
    provider_name: "deepseek",
    type: "openai-compatible",
    base_url: "https://api.deepseek.com/v1",
    default_model: "deepseek-chat",
    suggested_alias: "deepseek-main",
    suggested_env_name: "DEEPSEEK_API_KEY",
    models: ["deepseek-chat", "deepseek-reasoner"]
  },
  {
    id: "qwen",
    display_name: "Qwen / DashScope",
    provider_name: "qwen",
    type: "openai-compatible",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    default_model: "qwen-plus",
    suggested_alias: "qwen-main",
    suggested_env_name: "QWEN_API_KEY",
    notes: "Uses DashScope compatible mode.",
    models: ["qwen-plus", "qwen-max", "qwen-turbo"]
  },
  {
    id: "glm",
    display_name: "GLM / Zhipu AI",
    provider_name: "glm",
    type: "openai-compatible",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    default_model: "glm-4-plus",
    suggested_alias: "glm-main",
    suggested_env_name: "GLM_API_KEY",
    models: ["glm-4-plus", "glm-4-air", "glm-4-flash"]
  },
  {
    id: "openrouter",
    display_name: "OpenRouter",
    provider_name: "openrouter",
    type: "openai-compatible",
    base_url: "https://openrouter.ai/api/v1",
    default_model: "openai/gpt-4.1",
    suggested_alias: "openrouter-main",
    suggested_env_name: "OPENROUTER_API_KEY",
    models: ["openai/gpt-4.1", "anthropic/claude-3.5-sonnet", "google/gemini-2.5-pro"]
  },
  {
    id: "siliconflow",
    display_name: "SiliconFlow",
    provider_name: "siliconflow",
    type: "openai-compatible",
    base_url: "https://api.siliconflow.cn/v1",
    default_model: "deepseek-ai/DeepSeek-V3",
    suggested_alias: "siliconflow-main",
    suggested_env_name: "SILICONFLOW_API_KEY",
    models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct", "meta-llama/Meta-Llama-3.1-70B-Instruct"]
  },
  {
    id: "moonshot",
    display_name: "Moonshot / Kimi",
    provider_name: "moonshot",
    type: "openai-compatible",
    base_url: "https://api.moonshot.cn/v1",
    default_model: "moonshot-v1-8k",
    suggested_alias: "moonshot-main",
    suggested_env_name: "MOONSHOT_API_KEY",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"]
  },
  {
    id: "mistral",
    display_name: "Mistral",
    provider_name: "mistral",
    type: "openai-compatible",
    base_url: "https://api.mistral.ai/v1",
    default_model: "mistral-large-latest",
    suggested_alias: "mistral-main",
    suggested_env_name: "MISTRAL_API_KEY",
    models: ["mistral-large-latest", "mistral-small-latest", "open-mixtral-8x22b"]
  },
  {
    id: "groq",
    display_name: "Groq",
    provider_name: "groq",
    type: "openai-compatible",
    base_url: "https://api.groq.com/openai/v1",
    default_model: "llama-3.3-70b-versatile",
    suggested_alias: "groq-main",
    suggested_env_name: "GROQ_API_KEY",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"]
  },
  {
    id: "together",
    display_name: "Together AI",
    provider_name: "together",
    type: "openai-compatible",
    base_url: "https://api.together.xyz/v1",
    default_model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    suggested_alias: "together-main",
    suggested_env_name: "TOGETHER_API_KEY",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct-Turbo"]
  }
];
