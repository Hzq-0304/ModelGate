# CC Switch Study Notes

Reference repository: `.reference/cc-switch` at `61d7ac0`.

These notes document what ModelGate learned from CC Switch without copying source, assets, icons, or branding.

## UI Structure

- `src/App.tsx` keeps the top-level desktop shell. It stores active app and current view in localStorage, then renders a fixed header, app switcher, toolbar actions, and a scrollable content area.
- Main views include providers, settings, prompts, skills, MCP, agents, universal providers, sessions, workspace, and app-specific OpenClaw / Hermes pages.
- `src/components/AppSwitcher.tsx` is a compact app selector. It presents app choices as icon-plus-label segmented buttons and collapses labels when the toolbar is compact.
- `src/components/providers/ProviderList.tsx` organizes provider management around a search/filter toolbar, empty state, sortable provider cards, current-provider highlighting, and per-card actions.
- `src/components/providers/ProviderCard.tsx` is the repeated provider surface. It keeps provider state and actions in a bounded card instead of one long form.
- `src/components/settings/SettingsPage.tsx` uses settings tabs so unrelated configuration does not occupy one long page.
- `src/components/usage/UsageDashboard.tsx` uses a dashboard pattern: title/filter toolbar, summary hero, trend chart, and tabs for request logs, provider stats, and model stats.
- The visual style is a light desktop management UI: pale background, white cards, subtle borders, blue primary actions, muted helper text, compact tables, and clear toolbar grouping.

## SQLite Schema

The current schema is created in `.reference/cc-switch/src-tauri/src/database/schema.rs`.

`providers`:

```text
id TEXT NOT NULL
app_type TEXT NOT NULL
name TEXT NOT NULL
settings_config TEXT NOT NULL
website_url TEXT
category TEXT
created_at INTEGER
sort_index INTEGER
notes TEXT
icon TEXT
icon_color TEXT
meta TEXT NOT NULL DEFAULT '{}'
is_current BOOLEAN NOT NULL DEFAULT 0
in_failover_queue BOOLEAN NOT NULL DEFAULT 0
PRIMARY KEY (id, app_type)
```

`provider_endpoints`:

```text
id INTEGER PRIMARY KEY AUTOINCREMENT
provider_id TEXT NOT NULL
app_type TEXT NOT NULL
url TEXT NOT NULL
added_at INTEGER
FOREIGN KEY (provider_id, app_type) REFERENCES providers(id, app_type)
```

Provider rows are read in `.reference/cc-switch/src-tauri/src/database/dao/providers.rs`. `settings_config` is parsed from JSON text. `meta` is also JSON text and may hold custom endpoints, API format, provider type, usage script config, auth binding, and other app-specific metadata.

## Credential And Model Shapes

`Provider::resolve_usage_credentials` in `.reference/cc-switch/src-tauri/src/provider.rs` shows the per-app credential shapes:

- Codex: API key is in `settings_config.auth.OPENAI_API_KEY`. Base URL and default model are inside `settings_config.config`, a TOML string. The TOML contains `model = "..."` and `[model_providers.<name>] base_url = "..."`.
- Claude / Claude Desktop: values are in `settings_config.env`. Base URL is `ANTHROPIC_BASE_URL`. API key can be `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, or `GOOGLE_API_KEY`. Models can be `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, and `ANTHROPIC_DEFAULT_OPUS_MODEL`.
- Gemini: values are in `settings_config.env`. Base URL is `GOOGLE_GEMINI_BASE_URL`; key is `GEMINI_API_KEY` or `GOOGLE_API_KEY`; model is `GEMINI_MODEL`.
- OpenCode: values are under `settings_config.options`. Base URL is `baseURL`, key is `apiKey`, and models are in `settings_config.models`.
- OpenClaw: flat camelCase fields: `baseUrl`, `apiKey`, `api`, and `models`.
- Hermes: flat snake_case fields: `base_url`, `api_key`, `api_mode`, and `models`.

`provider_endpoints` stores additional URLs for a provider. The first configured URL can be used as a fallback source when the primary base URL is not directly present in `settings_config`.

## Deep Link Import Flow

`.reference/cc-switch/src-tauri/src/deeplink/provider.rs` parses `ccswitch://v1/import?resource=provider...` requests. It validates required provider fields, merges optional inline config, builds a CC Switch `Provider`, and delegates writes to `ProviderService`.

The same file documents conversion targets:

- `build_codex_settings`: writes `auth.OPENAI_API_KEY` and a Codex TOML `config` string.
- `build_claude_settings`: writes `env.ANTHROPIC_AUTH_TOKEN`, `env.ANTHROPIC_BASE_URL`, and Claude model env keys.
- `build_gemini_settings`: writes Gemini env keys.
- `build_opencode_settings`: writes `options.baseURL`, `options.apiKey`, and `models`.
- `build_additive_app_settings`: writes OpenClaw camelCase fields.
- `build_hermes_settings`: writes Hermes snake_case fields.

ModelGate import is intentionally read-only and does not call CC Switch write paths.

## ModelGate Import Decisions

- Prefer the deterministic parser when `providers` includes `id`, `app_type`, `name`, and `settings_config`.
- Read `provider_endpoints` for supplemental endpoint URLs.
- Return a scan report with detected tables, columns, row counts, parser name, candidate count, skipped ModelGate-managed count, and warnings.
- Hide ModelGate-managed providers by default. Detection uses notes containing `modelgate-managed=true`, local ModelGate endpoint URLs, or `codex-main` plus `modelgate-local`.
- Never expose or save plaintext API keys. The desktop UI receives only `api_key_detected` and a masked preview, then writes `${ENV_NAME}` into ModelGate YAML.
- Fall back to the heuristic scanner only when the current schema is missing or the deterministic parser fails.
