# CC Switch Config Snapshot Study

## 1. What Makes Up A CC Switch Config

CC Switch stores its app state primarily in its app config directory. In the local reference build, the default app config directory is `~/.cc-switch`, and the primary database is `~/.cc-switch/cc-switch.db`.

For Codex, relevant local files can include:

- `~/.cc-switch/cc-switch.db`
- `~/.codex/auth.json`
- `codex_oauth_auth.json` under the CC Switch app config directory or platform app-data directory, when OAuth login is used

ModelGate now treats these files as a local snapshot source. It does not write to the original CC Switch database or auth files.

## 2. SQLite Files

The important SQLite file is `cc-switch.db`.

Current CC Switch schema uses a `providers` table with fields such as:

- `id`
- `app_type`
- `name`
- `settings_config`
- `notes`
- `category`
- `meta`
- optional ordering fields such as `sort_index`, `created_at`, and `id`

`provider_endpoints` can provide endpoint URL hints, and `credentials` can provide credential ids or paths.

## 3. Auth JSON Files

Codex auth can come from JSON files such as `~/.codex/auth.json`. CC Switch also has `codex_oauth_auth.json` for OAuth-style Codex auth. ModelGate copies these files into the snapshot when present.

The non-sensitive manifest records which files were copied or missing. Runtime credential material is kept only inside the user-writable snapshot directory and is not shown in the UI.

## 4. Codex Provider Mapping

For Codex rows, `providers.settings_config` commonly contains:

- an `auth` object, often with `OPENAI_API_KEY`
- a `config` TOML string
- `model_provider`
- `model`
- `[model_providers.<name>]` sections with `base_url`, `wire_api`, and related fields

ModelGate reads Codex rows in CC Switch order and creates one ModelGate provider plus one alias per selected Codex config. The alias model comes from the Codex `model`, and the provider endpoint comes from `base_url` or `provider_endpoints`.

## 5. OpenAI Official Auth

OpenAI Official can be represented by CC Switch as a Codex official provider row and may use local Codex auth or OAuth state instead of a plain environment variable. ModelGate no longer assumes `OPENAI_API_KEY` is missing just because an environment variable is not set.

If a snapshot contains a usable `OPENAI_API_KEY`, ModelGate can generate a snapshot runtime auth entry. If only OAuth login material exists, ModelGate keeps the provider as snapshot-auth sourced and reports a missing snapshot credential only when that provider is used or diagnosed.

## 6. HardyAI Auth

HardyAI can store its key in `providers.settings_config.auth.OPENAI_API_KEY`. Older ModelGate imports converted this into `${HARDYAI_API_KEY}`, which made a working CC Switch provider look broken after import.

The snapshot import now copies CC Switch data first and stores ModelGate config as:

```yaml
auth:
  type: ccswitch-snapshot
  snapshot_id: snapshot-...
  snapshot_path: ...
  provider_id: hardyai-...
  credential_path: /auth/OPENAI_API_KEY
```

The backend reads the snapshot runtime auth index at request time and sends the required upstream header without requiring `HARDYAI_API_KEY`.

## 7. Sensitive Fields Never Shown In UI

The UI must not display plaintext values for:

- `OPENAI_API_KEY`
- access tokens
- refresh tokens
- id tokens
- bearer tokens
- authorization headers
- cookies
- OAuth account secrets

ModelGate may show a masked preview only when useful. The snapshot manifest is non-sensitive; the runtime auth index is local app data and must not be committed or uploaded.

## 8. ModelGate Snapshot Strategy

ModelGate saves snapshots under the desktop app config directory:

```text
<ModelGate app config dir>/ccswitch-snapshots/<snapshot_id>/
  cc-switch.db
  auth/
    auth.json
    codex_oauth_auth.json
    provider-auth.json
  manifest.json
```

`provider-auth.json` is a ModelGate runtime index derived from the copied snapshot. It exists because the Node backend is self-contained and should not depend on native SQLite bindings at runtime.

The YAML config stores only snapshot references and metadata:

- `auth.type = ccswitch-snapshot`
- `snapshot_id`
- `snapshot_path`
- `provider_id`
- `credential_path`
- `metadata.imported_from = ccswitch`
- `metadata.source_config_hash`

Startup remains non-blocking. Missing snapshot files or credentials produce warnings and structured request-time errors, not backend crashes.
