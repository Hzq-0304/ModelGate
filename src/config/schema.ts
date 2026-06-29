import { z } from "zod";

const namePattern = /^[A-Za-z0-9_-]+$/;

export const mockProviderSchema = z.object({
  type: z.literal("mock")
});

export const openAICompatibleProviderSchema = z.object({
  type: z.literal("openai-compatible"),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  responses_api: z.boolean().default(false)
});

export const providerSchema = z.discriminatedUnion("type", [
  mockProviderSchema,
  openAICompatibleProviderSchema
]);

export const aliasSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1)
});

export const entrypointSchema = z.object({
  use: z.string().min(1)
});

export const pricingSchema = z.object({
  input_per_million: z.coerce.number().nonnegative(),
  output_per_million: z.coerce.number().nonnegative(),
  cached_input_per_million: z.coerce.number().nonnegative().optional()
});

export const modelGateConfigSchema = z.object({
  server: z.object({
    host: z.string().default("127.0.0.1"),
    port: z.coerce.number().int().positive().default(11435)
  }).default({}),
  active: z.string().min(1).default("codex-main"),
  entrypoints: z.record(entrypointSchema).default({}),
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
  }),
  pricing: z.record(pricingSchema).default({})
}).superRefine((config, context) => {
  for (const name of Object.keys(config.providers)) {
    if (!namePattern.test(name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providers", name],
        message: `Provider name "${name}" may only contain letters, numbers, "-" and "_"`
      });
    }
  }

  for (const [name, alias] of Object.entries(config.aliases)) {
    if (!namePattern.test(name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aliases", name],
        message: `Alias name "${name}" may only contain letters, numbers, "-" and "_"`
      });
    }

    if (!config.providers[alias.provider]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aliases", name, "provider"],
        message: `Alias "${name}" uses missing provider "${alias.provider}"`
      });
    }
  }

  for (const name of Object.keys(config.entrypoints)) {
    if (!namePattern.test(name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entrypoints", name],
        message: `Entrypoint name "${name}" may only contain letters, numbers, "-" and "_"`
      });
    }
  }

  if (!config.aliases[config.active]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["active"],
      message: `Active alias "${config.active}" is not configured in aliases`
    });
  }

  for (const [name, entrypoint] of Object.entries(config.entrypoints)) {
    if (entrypoint.use !== "active" && !config.aliases[entrypoint.use]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entrypoints", name, "use"],
        message: `Entrypoint "${name}" uses missing alias "${entrypoint.use}"`
      });
    }
  }

  for (const key of Object.keys(config.pricing)) {
    const [provider, model, extra] = key.split("/");
    if (!provider || !model || extra !== undefined || (model === "*" ? false : model.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pricing", key],
        message: `Pricing key "${key}" must use provider/model or provider/*`
      });
    }
  }
});

export type ModelGateConfig = z.infer<typeof modelGateConfigSchema>;
export type ProviderConfig = z.infer<typeof providerSchema>;
export type AliasConfig = z.infer<typeof aliasSchema>;
export type EntrypointConfig = z.infer<typeof entrypointSchema>;
export type PricingConfig = z.infer<typeof pricingSchema>;
