# ModelGate

ModelGate is a local OpenAI-compatible gateway for routing large-model requests and switching providers. This repository currently contains the initial runnable project skeleton.

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

## Current Stage

ModelGate is in the initialization stage. The default provider is `mock`, and `/v1/chat/completions` returns mock OpenAI-compatible responses instead of forwarding requests upstream.
