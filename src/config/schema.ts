import { z } from "zod";

export const providerSchema = z.object({
  type: z.string().min(1)
});

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
