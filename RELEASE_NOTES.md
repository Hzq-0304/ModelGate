# ModelGate v0.2.0-rc.1

## Highlights

- Pre-release build for the v0.2.0 line.
- Includes the refreshed icon-only home navigation and Model Gate logo treatment.

## Notes

- This is a pre-release installer intended for validation before v0.2.0.
- This release still requires Node.js to be installed and available in PATH.

# ModelGate v0.1.9

## Highlights

- Maintenance release after validating startup, CC Switch snapshot import, ratio sources, usage cost accounting, TypeScript builds, and Tauri/Rust checks.
- Refreshed desktop installer and local release packaging for v0.1.9.

## Notes

- This release supersedes v0.1.8 for all desktop users.
- This release still requires Node.js to be installed and available in PATH.

# ModelGate v0.1.8

## Highlights

- Added CC Switch snapshot-based import.
- ModelGate now copies a local CC Switch configuration snapshot and resolves Codex providers from that snapshot.
- Added `auth.type = ccswitch-snapshot` for providers imported from CC Switch.
- Improved OpenAI Official and HardyAI authentication detection from CC Switch.
- Reduced incorrect fallback to `${OPENAI_API_KEY}` / `${HARDYAI_API_KEY}`.
- Added source metadata and `source_config_hash` for duplicate import detection.
- Duplicate imports are now detected by configuration fingerprint instead of display name only.
- Added offline config support so providers and aliases can be viewed, imported, edited, and deleted when the backend server is not running.
- Added provider card actions: set active, edit, delete, and copy info.
- Refactored the desktop main screen into a CC Switch-style compact provider list.
- Moved secondary actions into Settings, leaving the main screen focused on provider switching.

## Fixes

- Fixed imported HardyAI configs being incorrectly reported as missing `HARDYAI_API_KEY`.
- Fixed imported OpenAI Official configs being incorrectly reported as missing `OPENAI_API_KEY` when CC Switch auth is available.
- Fixed repeated CC Switch imports creating duplicate `-2` / `-3` providers.
- Fixed service stop behavior for desktop-managed servers.
- External servers are no longer accidentally stopped by the desktop app.
- Kept missing environment variables and missing credentials as warnings instead of backend startup failures.

## Safety

- CC Switch original database and config files are not modified.
- CC Switch snapshots are stored locally in ModelGate app data/config directories.
- Plaintext tokens are not displayed in the UI.
- CC Switch credential issues return warnings or structured JSON errors instead of crashing the backend.
- Windows builds still avoid extra console windows.

## Notes

- This release supersedes v0.1.7 for all desktop users.
- This release still requires Node.js to be installed and available in PATH.

# ModelGate v0.1.7

## Highlights

- Added a self-contained server bundle for packaged desktop builds.
- Packaged runtime now uses `modelgate-server.cjs` instead of relying on `dist/index.js` and external `node_modules`.
- Fixed the issue where Start Server entered starting state but ended as not running in installed builds.
- Added isolated runtime validation to ensure the packaged server can run outside the repository.
- Improved server startup diagnostics with command, root, config path, pid, exit code, and stderr details.
- Refactored desktop routing, Settings, and Server Control organization after studying CC Switch structure.

## Fixes

- Fixed false-positive release smoke tests caused by Node resolving dependencies from the repository root.
- Fixed packaged server startup failure caused by missing runtime dependencies.
- Fixed server process state falling back to stopped without useful error details.
- Kept compatibility for `MODELGATE_CONFIG` / `MODEL_GATE_CONFIG`.
- Kept compatibility for `MODELGATE_ROOT` / `MODEL_GATE_ROOT`.

## Safety

- Windows builds still avoid extra console windows.
- CC Switch database remains read-only during import.
- Plaintext API keys are not saved.

## Notes

- This release supersedes v0.1.6 for all desktop users.
- This release still requires Node.js to be installed and available in PATH.

# ModelGate v0.1.6

## Highlights

- Refactored the desktop server startup flow.
- Start Server no longer blocks or freezes the desktop app.
- Added explicit server process states: stopped, starting, running, stopping, failed, and external-running.
- Added startup timeout and health check timeout.
- Prevented duplicate server launches from repeated clicks.
- Stop and Restart now run through non-blocking flows.
- Packaged desktop builds now prefer the bundled `modelgate-server` runtime instead of requiring the repository root.
- First startup copies the example config into a user-writable app config directory.
- Improved diagnostics for startup failures.

## Fixes

- Fixed CC Switch import error details so backend validation errors are shown clearly.
- Fixed invalid placeholder base URLs from CC Switch imports before submitting config.
- Fixed Settings icon by replacing unstable Unicode/emoji rendering with an SVG icon.
- Kept OpenAI Official detection with default `https://api.openai.com/v1` and `${OPENAI_API_KEY}`.

## Safety

- Windows builds still avoid extra console windows.
- CC Switch database is still opened read-only.
- Plaintext API keys are not saved.
- ModelGate does not modify CC Switch settings.

## Notes

- This release supersedes v0.1.5 for desktop users.
- This release still requires Node.js to be installed and available in PATH.

# ModelGate v0.1.5

## Improvements

- Changed CC Switch import into a modal workflow.
- Home page `Import from CC Switch` now opens the import modal directly instead of navigating away.
- Simplified the import list to show only name, description, checkbox, and edit action.
- Added an edit dialog for import details, including alias, model, provider, base URL, environment variable name, and description.
- Improved OpenAI Official detection from CC Switch.
- OpenAI Official now defaults to `https://api.openai.com/v1` when CC Switch does not provide an explicit base URL.
- OpenAI Official now defaults to `${OPENAI_API_KEY}`.

## Safety

- CC Switch database is still opened read-only.
- ModelGate still does not modify CC Switch settings.
- Plaintext API keys are not saved.

# ModelGate v0.1.4

## Highlights

- Simplified the CC Switch Codex import flow.
- Home page `Import from CC Switch` now automatically scans the local CC Switch database.
- Import now focuses only on Codex model configurations.
- Users can select which Codex models to import.
- Imported providers and aliases keep the order from CC Switch.
- Descriptions from CC Switch are copied into ModelGate provider / alias descriptions.
- ModelGate-managed CC Switch entries are skipped by default.

## Safety

- CC Switch database is opened read-only.
- ModelGate does not modify CC Switch settings or live tool configs.
- Plaintext API keys are not saved.
- API keys are saved as environment variable references such as `${OPENAI_API_KEY}`.

## Notes

- This release supersedes v0.1.3 for CC Switch import usability.

# ModelGate v0.1.3

## Fixes

- Added a visible Quick Start section to the desktop Home page.
- Added direct Home page actions for:
  - Start ModelGate Server
  - Import from CC Switch
  - Import to Codex
  - Configure Providers
- Made Import to Codex clearer by showing the local endpoint, local API key, model name, copy actions, and CC Switch deep link action.
- Kept CC Switch import/export available under Configuration -> Integrations with clearer labels.
- Confirmed the Windows desktop app no longer opens an extra console window.

## Notes

- This release supersedes v0.1.2 for desktop usability.
- ModelGate still does not modify the CC Switch database.
- ModelGate still does not store plaintext provider API keys.

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
