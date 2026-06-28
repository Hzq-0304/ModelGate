# ModelGate

ModelGate is a local OpenAI-compatible gateway for routing large-model requests and switching providers. Codex can talk to ModelGate as a local OpenAI-compatible endpoint, while ModelGate routes requests to mock or upstream OpenAI-compatible providers.

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
```

Run the compiled server:

```bash
npm start
```

## Codex Local Endpoint

Configure Codex with:

```text
Base URL: http://127.0.0.1:11435/v1
API Key: modelgate-local
Model: codex-main
```

Codex still only needs the local endpoint. Provider API keys and upstream URLs stay in ModelGate config.

## Providers

The default config uses the `mock` provider, so ModelGate can run without external API keys.

To use an OpenAI-compatible provider, configure an alias and provider in `examples/modelgate.config.yaml` or another file passed through `MODELGATE_CONFIG`:

```yaml
active: codex-main

aliases:
  codex-main:
    provider: deepseek
    model: deepseek-chat

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
