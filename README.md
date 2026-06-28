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

ModelGate reads config from `examples/modelgate.config.yaml` by default. Override it with `MODELGATE_CONFIG`:

```bash
MODEL_GATE_CONFIG=./modelgate.config.yaml npm run dev
```

PowerShell:

```powershell
$env:MODELGATE_CONFIG="E:\Hzq Program\ModelGate\examples\modelgate.config.yaml"
npm run dev
```

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

Keep provider API keys in environment variables instead of YAML. The desktop app and admin API are designed to show `${ENV_NAME}` or `***`, never the real API key.

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

The desktop app can manage a local ModelGate server process when it is running from a local repository environment. It still does not bundle a Node.js runtime into the desktop app.

Development option 1, start the server yourself:

```bash
npm run dev
```

Then start the desktop app:

```bash
npm run dev:desktop
```

Development option 2, start only the desktop app and use **Start Server** in the Server Control panel:

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

The Server Control panel can start the server for local development. It prefers:

```text
Start Server -> node dist/index.js
```

If `dist/index.js` does not exist, it falls back to:

```text
Start Server -> npm run dev
```

If the desktop app cannot find the repository root, set `MODEL_GATE_ROOT` before starting it:

```powershell
$env:MODEL_GATE_ROOT="E:\Hzq Program\ModelGate"
npm run dev:desktop
```

If the server was started outside the desktop app, the panel shows it as `External`. ModelGate Desktop will not stop external processes; stop them from the terminal or your process manager.

Build the desktop UI only:

```bash
npm run build:desktop-ui
```

Build the Windows desktop app:

```bash
npm run build:desktop
```

On Windows, ModelGate defaults to the NSIS installer target. It does not build MSI by default, so normal desktop builds should not depend on WiX.

You can also run the explicit NSIS build command:

```bash
npm run build:desktop:nsis
```

Common output locations:

```text
desktop/src-tauri/target/release/
desktop/src-tauri/target/release/bundle/nsis/
```

If you only need to run the app directly, use the release executable from `desktop/src-tauri/target/release/`. The NSIS installer is written under `desktop/src-tauri/target/release/bundle/nsis/`.

If you manually enable MSI packaging, install WiX or ensure Tauri can download and verify the WiX tooling.

Desktop app features:

- view connection status
- start, stop, and restart a managed local server process
- view active alias
- view entrypoint resolution
- view alias list
- switch active alias
- reload config
- manage providers, aliases, entrypoints, and active alias
- validate config and save YAML with automatic reload
- copy Codex configuration

Current desktop limitations:

- server process management depends on local Node.js and npm
- the first version does not bundle Node.js into the desktop app
- managed server startup is intended for local repository development
- provider API keys are not shown or managed in the desktop UI

### Desktop Configuration Management

Open the **Configuration** tab to edit the config file used by the running server.

The desktop app can:

- view the current config file path
- view providers, aliases, and entrypoints
- add, edit, or delete OpenAI-compatible providers
- add, edit, or delete aliases
- add, edit, or delete entrypoints
- set the active alias
- validate config before saving
- save YAML and call `/admin/reload`

Provider API keys are entered as environment variable names. For example, enter `DEEPSEEK_API_KEY`; ModelGate writes this to YAML as:

```yaml
providers:
  deepseek:
    type: openai-compatible
    base_url: https://api.deepseek.com/v1
    api_key: ${DEEPSEEK_API_KEY}
```

PowerShell example:

```powershell
$env:DEEPSEEK_API_KEY="your-api-key"
$env:QWEN_API_KEY="your-api-key"
npm run dev
```

Add a DeepSeek provider:

```yaml
providers:
  deepseek:
    type: openai-compatible
    base_url: https://api.deepseek.com/v1
    api_key: ${DEEPSEEK_API_KEY}
```

Add a Qwen provider:

```yaml
providers:
  qwen:
    type: openai-compatible
    base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
    api_key: ${QWEN_API_KEY}
```

Add aliases for those providers:

```yaml
aliases:
  deepseek-main:
    provider: deepseek
    model: deepseek-chat

  qwen-main:
    provider: qwen
    model: qwen-plus
```

The configuration admin API is intended for local use only. Do not expose ModelGate to public networks or untrusted LANs.

## Troubleshooting

### WiX timeout / MSI bundle failed

ModelGate does not build MSI by default. The default Windows desktop target is NSIS.

If you still see WiX-related errors, check that `desktop/src-tauri/tauri.conf.json` does not set `bundle.targets` to `"all"` or `"msi"`. If you do need MSI output, configure WiX locally or retry with network access that can download the WiX tooling.

### NSIS download timeout

The default Windows installer target is NSIS. If the release executable is built but bundling fails while downloading NSIS or `nsis_tauri_utils.dll`, the local network or security software interrupted Tauri's tool download. Retry with stable GitHub access, or install/cache the NSIS tooling required by Tauri.

### WebView2

Tauri desktop apps on Windows depend on Microsoft Edge WebView2 Runtime. Most Windows 10/11 systems already include it or can install it automatically. If the desktop app fails to run because WebView2 is missing, install Microsoft Edge WebView2 Runtime and try again.

### Server Control cannot find the repository

Server Control searches for a directory containing `package.json` and `src/index.ts`. If it cannot find ModelGate, set `MODEL_GATE_ROOT` to the repository root before launching the desktop app.

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
