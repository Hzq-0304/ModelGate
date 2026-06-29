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
npm run cli -- logs
npm run cli -- logs -- --limit 20
npm run cli -- logs -- --clear
npm run cli -- stats
npm run cli -- presets
npm run cli -- test active
npm run cli -- test alias mock-main
npm run cli -- test alias mock-main -- --stream
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
curl http://127.0.0.1:11435/admin/provider-presets
curl -X POST http://127.0.0.1:11435/admin/test/active \
  -H "Content-Type: application/json" \
  -d '{"stream":false}'
curl -X POST http://127.0.0.1:11435/admin/test/alias \
  -H "Content-Type: application/json" \
  -d '{"alias":"mock-main","stream":false}'
curl -X POST http://127.0.0.1:11435/admin/test/provider \
  -H "Content-Type: application/json" \
  -d '{"provider":"mock","model":"mock-codex-model","stream":false}'
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
- view request logs and request stats
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
- add common OpenAI-compatible providers from built-in presets
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

### Provider Presets

The Configuration tab includes **Add from Preset** for common OpenAI-compatible providers. The first preset library includes OpenAI, DeepSeek, Qwen / DashScope compatible mode, GLM / Zhipu AI, OpenRouter, SiliconFlow, Moonshot / Kimi, Mistral, Groq, and Together AI.

Preset entries include provider name, base URL, suggested alias, suggested environment variable name, and a default upstream model. They do not include API keys and never ask for plaintext API keys. When saved, ModelGate writes an environment variable reference such as:

```yaml
providers:
  deepseek:
    type: openai-compatible
    base_url: https://api.deepseek.com/v1
    api_key: ${DEEPSEEK_API_KEY}

aliases:
  deepseek-main:
    provider: deepseek
    model: deepseek-chat
```

Use the preset flow:

1. Open **Configuration**
2. Click **Add from Preset**
3. Search and select a provider
4. Review or edit provider name, alias name, base URL, env var name, and upstream model
5. Optionally check **Set as active after adding**
6. Click **Add Provider**

ModelGate validates the merged config, saves YAML, reloads the server, and refreshes the dashboard/configuration data. Existing provider and alias names are not overwritten by default; conflicting names are automatically changed to names like `deepseek-2` and `deepseek-main-2`.

Set the referenced environment variable before using the provider:

```powershell
$env:DEEPSEEK_API_KEY="your-api-key"
npm run dev
```

Preset default models are starter templates and may change over time. Verify the model name with your provider before production use.

Admin API:

```bash
curl http://127.0.0.1:11435/admin/provider-presets
```

CLI:

```bash
modelgate presets
```

Roadmap:

```text
modelgate add-provider deepseek
```

### Connectivity Diagnostics

ModelGate can test a provider, alias, or the current active alias on demand. Diagnostics are useful after adding a provider or alias because they check the route, environment-variable backed API key, base URL, upstream model, and chat completion behavior before Codex uses the route.

Diagnostics never run automatically at startup and never batch-test every provider. You must click a button or run a CLI command. For OpenAI-compatible providers, each test sends one tiny real request with this fixed prompt:

```text
Reply with exactly: OK
```

The request uses a small token limit and may still create a very small provider charge. Mock provider diagnostics do not make network requests.

Admin API:

```bash
curl -X POST http://127.0.0.1:11435/admin/test/active \
  -H "Content-Type: application/json" \
  -d '{"stream":false}'

curl -X POST http://127.0.0.1:11435/admin/test/alias \
  -H "Content-Type: application/json" \
  -d '{"alias":"deepseek-main","stream":true}'

curl -X POST http://127.0.0.1:11435/admin/test/provider \
  -H "Content-Type: application/json" \
  -d '{"provider":"deepseek","model":"deepseek-chat","stream":false}'
```

CLI:

```bash
modelgate test active
modelgate test active --stream
modelgate test alias deepseek-main
modelgate test alias deepseek-main --stream
modelgate test provider deepseek --model deepseek-chat
```

Desktop:

- Dashboard: use **Test Active** or **Test Active Stream**
- Configuration: use **Test** on provider rows
- Configuration: use **Test** or **Test Stream** on alias rows

Diagnostics return check names, pass/fail status, HTTP status when available, duration, and a short error summary. They do not display API keys, do not log the `Authorization` header, and do not store full upstream responses. Diagnostic requests are marked as `diagnostic` in request logs.

### Import From CC Switch

The Configuration tab includes **Import from CC Switch** for read-only provider import.

ModelGate scans CC Switch data without modifying it:

- does not modify the CC Switch SQLite database
- does not modify CC Switch settings
- does not modify Codex, Claude, Gemini, OpenCode, or other live configs
- imports only provider, endpoint, and model-related data
- does not import MCP servers, skills, prompts, or usage logs

The desktop app first looks for:

```text
~/.cc-switch/cc-switch.db
```

On Windows this resolves to:

```text
C:\Users\<User>\.cc-switch\cc-switch.db
```

You can also choose a database manually with **Select cc-switch.db**. The scanner opens SQLite in read-only mode and uses a best-effort schema scan, so it can handle CC Switch schema changes more gracefully.

API keys are never imported as plaintext. If a key or token is detected, ModelGate only shows a masked preview and suggests an environment variable name. The saved ModelGate YAML uses this form:

```yaml
providers:
  deepseek:
    type: openai-compatible
    base_url: https://api.deepseek.com/v1
    api_key: ${DEEPSEEK_API_KEY}
```

Set the environment variable before using the provider:

```powershell
$env:DEEPSEEK_API_KEY="your-api-key"
npm run dev
```

Import flow:

1. Auto-detect or select `cc-switch.db`
2. Preview candidates
3. Edit provider name, base URL, env name, model, or alias
4. Choose merge strategy
5. Click **Import Selected**
6. ModelGate validates and saves its own YAML config, then reloads

Future:

- `ccswitch://` deep link import
- SQL backup import
- JSON import
- multi-model alias generation

### Request Logs

ModelGate keeps a lightweight in-memory request log for `/v1/chat/completions`. It stores the latest 200 entries and clears them on restart.

Logs include routing and timing metadata:

- requested model
- resolved alias
- provider
- upstream model
- stream / non-stream
- status code
- duration
- short error summary
- prompt character count
- response character count for non-stream responses when available

Logs are sanitized by default:

- no `Authorization` header
- no provider API key
- no full prompt content
- upstream error summaries are truncated

Admin API:

```bash
curl http://127.0.0.1:11435/admin/logs
curl http://127.0.0.1:11435/admin/logs?limit=20
curl -X DELETE http://127.0.0.1:11435/admin/logs
curl http://127.0.0.1:11435/admin/stats
```

CLI:

```bash
modelgate logs
modelgate logs --limit 20
modelgate logs --clear
modelgate stats
modelgate presets
```

The desktop app includes a **Logs** tab with request stats, provider counts, recent requests, refresh, and clear actions. The tab refreshes every 3 seconds while active.

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
- provider presets through the local admin API, CLI, and desktop Configuration tab
- provider, alias, and active alias connectivity diagnostics
