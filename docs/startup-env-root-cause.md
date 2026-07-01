# Startup env root cause

## 1. Why missing `OPENAI_API_KEY` stopped the server

ModelGate previously expanded every `${ENV_NAME}` expression during `loadConfig()`. If a provider contained:

```yaml
providers:
  openai-official:
    type: openai-compatible
    api_key: ${OPENAI_API_KEY}
```

and `OPENAI_API_KEY` was not set, config loading threw before the Fastify server was created. The desktop process manager then saw the Node child exit with code 1.

## 2. Function that expanded env during startup

The strict expansion happened in `src/config/loadConfig.ts`:

```text
loadConfig -> expandEnv -> throw Missing environment variable ...
```

`src/serverMain.ts` calls `loadConfig()` before constructing `RuntimeState`, so the exception aborted startup.

## 3. Interfaces and flows depending on config load

These flows depend on config load or reload:

- process startup in `src/serverMain.ts`;
- runtime reload in `src/runtime/state.ts`;
- admin config read/write in `src/router/adminRouter.ts`;
- model routing in `src/router/modelRouter.ts`;
- diagnostics in `src/runtime/diagnostics.ts`;
- desktop Server Control, which starts the packaged Node runtime.

## 4. Why the old design did not fit ModelGate

ModelGate is a local gateway with many possible providers. It is normal for imported or inactive providers to reference API keys that are not configured yet. Treating one missing provider secret as a global startup failure makes unrelated aliases, mock provider testing, admin UI, and configuration repair unavailable.

## 5. New strategy

Startup and admin reads now use schema-level validation only. Provider API key env references remain as `${ENV_NAME}` in runtime config.

Missing provider secrets are represented as warnings:

```json
{
  "type": "missing_env",
  "provider": "openai-official",
  "path": "providers.openai-official.api_key",
  "env": "OPENAI_API_KEY"
}
```

Strict env resolution now happens only when a specific OpenAI-compatible provider is used for an upstream request or diagnostic.

If the selected provider is missing its API key, `/v1/chat/completions` and `/v1/responses` return an OpenAI-compatible JSON error with `type: "missing_environment_variable"` instead of crashing the process.

## 6. Validation

The smoke test `npm run test:startup-env` creates a temporary config where `openai-official` uses `${OPENAI_API_KEY}` while the env var is unset. It verifies:

- `loadConfig()` does not throw;
- the backend starts and `/health` responds;
- `/admin/status` returns a missing env warning;
- `/v1/chat/completions` returns a JSON missing env error;
- `/v1/responses` returns a JSON missing env error.
