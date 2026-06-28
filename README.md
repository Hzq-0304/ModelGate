# ModelGate

ModelGate is a local OpenAI-compatible gateway for routing large-model requests and hot-switching upstream providers. Codex can keep using one local model name, while ModelGate decides which real provider and model receive new requests.

ModelGate is intended for local use by default. Do not expose it directly to public networks or untrusted LANs.

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

The local service listens on `127.0.0.1:11435` by default.

## Build

```bash
npm run build
npm start
```

## Codex Local Endpoint

Configure Codex with:

```text
Base URL: http://127.0.0.1:11435/v1
API Key: modelgate-local
Model: codex-main
```

Codex continues to send `model: codex-main`. ModelGate treats `codex-main` as a public entrypoint and resolves it to the current runtime active alias.

## Entrypoints And Aliases

`entrypoints` are public model names for clients. `aliases` are internal routes to a provider and upstream model.

```yaml
active: mock-main

entrypoints:
  codex-main:
    use: active
  codex-fast:
    use: qwen-main

aliases:
  mock-main:
    provider: mock
    model: mock-codex-model

  qwen-main:
    provider: qwen
    model: qwen-plus
```

When `entrypoints.codex-main.use` is `active`, switching the active alias changes where later `codex-main` requests go. Streams already in progress keep using the route they resolved when the request started.

## Providers

The default config uses the `mock` provider, so ModelGate can run without external API keys.

OpenAI-compatible providers can be configured like this:

```yaml
providers:
  deepseek:
    type: openai-compatible
    base_url: https://api.deepseek.com/v1
    api_key: ${DEEPSEEK_API_KEY}

  qwen:
    type: openai-compatible
    base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
    api_key: ${QWEN_API_KEY}

  openrouter:
    type: openai-compatible
    base_url: https://openrouter.ai/api/v1
    api_key: ${OPENROUTER_API_KEY}
```

Set environment variables before starting ModelGate:

```bash
export DEEPSEEK_API_KEY="your-api-key"
export QWEN_API_KEY="your-api-key"
export OPENROUTER_API_KEY="your-api-key"
```

On Windows PowerShell:

```powershell
$env:DEEPSEEK_API_KEY = "your-api-key"
```

If a config references `${ENV_NAME}` and that environment variable is missing, ModelGate fails fast with a clear error.

## CLI

After building, the package exposes a `modelgate` command. During development, use:

```bash
npm run cli -- status
npm run cli -- aliases
npm run cli -- switch mock-main
npm run cli -- reload
```

The CLI connects to `http://127.0.0.1:11435` by default. Override it with:

```bash
MODEL_GATE_URL=http://127.0.0.1:11435 modelgate status
```

Example output:

```text
ModelGate is running
Active alias: mock-main

Entrypoints:
  codex-main -> active -> mock-main
```

## Admin API

Admin endpoints are intended for local requests only:

```bash
curl http://127.0.0.1:11435/admin/status
curl http://127.0.0.1:11435/admin/aliases
curl -X POST http://127.0.0.1:11435/admin/switch \
  -H "Content-Type: application/json" \
  -d '{"active":"mock-main"}'
curl -X POST http://127.0.0.1:11435/admin/reload
```

`/admin/reload` reloads the config file. It preserves the current active alias if that alias still exists in the new config; otherwise it falls back to the new config's `active`.

## Desktop App

ModelGate also includes a local desktop management interface built with Tauri v2, React, TypeScript, Vite, and plain CSS. The desktop app is a management panel only; it does not call upstream model providers and does not manage provider API keys.

The first version does not bundle or auto-start the Node.js ModelGate server. Use two terminals during development.

Terminal 1, start the ModelGate server:

```bash
npm run dev
```

Terminal 2, start the desktop app:

```bash
npm run dev:desktop
```

The desktop app connects to:

```text
http://127.0.0.1:11435
```

If the server is not running, the app shows:

```text
ModelGate server is not running.
Start it with: npm run dev
```

Build the desktop UI only:

```bash
npm run build:desktop-ui
```

Build the Tauri desktop app:

```bash
npm run build:desktop
```

On Windows, Tauri packaging may need WiX tooling. If the build reaches Rust compilation and then fails while downloading or verifying WiX, install WiX or retry with working network access.

Desktop app features:

- view connection status
- view active alias
- view entrypoint resolution
- view alias list
- switch active alias
- reload config
- copy Codex configuration

Current desktop limitations:

- the desktop app does not auto-start the Node.js server
- start ModelGate server manually before opening the desktop app
- provider API keys are not shown or managed in the desktop UI

## Verify

Non-stream request:

```bash
curl http://127.0.0.1:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer modelgate-local" \
  -d '{
    "model": "codex-main",
    "messages": [
      { "role": "user", "content": "Say hello from ModelGate." }
    ]
  }'
```

Stream request:

```bash
curl http://127.0.0.1:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer modelgate-local" \
  -d '{
    "model": "codex-main",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Say hello from ModelGate in stream mode." }
    ]
  }'
```

## Supported

- `/v1/models`
- `/v1/chat/completions`
- stream and non-stream chat completions
- `mock` provider
- `openai-compatible` provider forwarding
- runtime active alias switching
- config reload through the local admin API
