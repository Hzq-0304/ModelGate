import { z } from "zod";

export const mockProviderSchema = z.object({
  type: z.literal("mock")
});

export const openAICompatibleProviderSchema = z.object({
  type: z.literal("openai-compatible"),
  base_url: z.string().url(),
  api_key: z.string().min(1)
});

export const providerSchema = z.discriminatedUnion("type", [
  mockProviderSchema,
  openAICompatibleProviderSchema
]);

export const aliasSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1)
});

export const modelGateConfigSchema = z.object({
  server: z.object({
    host: z.string().default("127.0.0.1"),
    port: z.coerce.number().int().positive().default(11435)
  }).default({}),
  active: z.string().min(1).default("codex-main"),
  aliases: z.record(aliasSchema).default({
    "codex-main": {
      provider: "mock",
      model: "mock-codex-model"
    }
  }),
  providers: z.record(providerSchema).default({
    mock: {
      type: "mock"
    }
  })
});

export type ModelGateConfig = z.infer<typeof modelGateConfigSchema>;
export type ProviderConfig = z.infer<typeof providerSchema>;
export type AliasConfig = z.infer<typeof aliasSchema>;
