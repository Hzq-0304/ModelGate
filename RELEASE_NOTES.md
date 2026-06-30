# ModelGate v0.1.2

## Fixes

- Made CC Switch import/export easier to find under Configuration -> Integrations.
- Added clearer CC Switch integration cards.
- Improved empty-state guidance for importing providers.
- Hid the extra Windows console window when launching the managed server from the desktop app.

## Notes

- ModelGate still does not modify the CC Switch database.
- ModelGate still does not store plaintext provider API keys.

# ModelGate v0.1.1

## Highlights

- Refined desktop UI for a cleaner management experience.
- Improved Home page layout with separated Account Switcher and Usage Overview.
- Improved disconnected-state guidance.
- Improved Configuration page structure.
- Improved CC Switch import reliability.
- Added or improved CC Switch scan report.
- Kept API key handling safe: no plaintext provider API keys are displayed or saved.

## Fixes

- Fixed unreliable CC Switch provider import behavior.
- Reduced desktop UI clutter.
- Improved readability of Chinese / English UI labels where applicable.

## Notes

- ModelGate still does not modify the CC Switch database.
- ModelGate still stores provider API keys as environment variable references such as `${DEEPSEEK_API_KEY}`.
- The desktop app still requires local Node.js/npm for server process management in this release.

# ModelGate v0.1.0

## Highlights

- Local OpenAI-compatible gateway
- Chat Completions API support
- Responses API compatibility
- Runtime alias hot-switching
- Desktop account switcher
- Desktop configuration management
- Desktop usage overview
- Request logs and stats
- Provider presets
- CC Switch import/export
- Provider connectivity diagnostics
- Desktop UI language settings for English and Simplified Chinese
- Windows desktop build with NSIS installer

## Requirements

- Windows 10/11
- Node.js is required for the current server process manager
- ModelGate desktop currently starts the local Node server from the project or release directory
- Provider API keys should be configured through environment variables

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build backend:

   ```bash
   npm run build
   ```

3. Start ModelGate server or use desktop Advanced -> Start Server:

   ```bash
   npm run start
   ```

4. Configure Codex:

   ```text
   Base URL: http://127.0.0.1:11435/v1
   API Key: modelgate-local
   Model: codex-main
   ```

## Release Directory Usage

The local release package under `release/modelgate-v0.1.0/` contains the built Node server and desktop artifacts.

To run the Node server from the release directory:

```bash
npm install --omit=dev
npm run start
```

## Notes

- API keys are not stored in plaintext by ModelGate config management
- Usage records do not store prompts, responses, Authorization headers, or provider API keys
- Estimated cost requires user-provided pricing config
- The current desktop app does not bundle a Node.js runtime
- Desktop Server Control requires local Node.js/npm and a ModelGate project or release directory
- ModelGate is intended for local use; do not expose it directly to public networks or untrusted LANs
