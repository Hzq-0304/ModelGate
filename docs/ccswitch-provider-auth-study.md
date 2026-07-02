# CC Switch Provider Auth Study

## 1. HardyAI auth location

The local CC Switch database stores the HardyAI Codex provider in the `providers` table:

- `app_type = codex`
- provider id similar to `hardyai-...`
- display name `HardyAI`
- `settings_config.auth.OPENAI_API_KEY` contains the usable API key
- `settings_config.config` contains the Codex TOML, including `model_provider`, `model`, `[model_providers.custom]`, `base_url`, `wire_api`, and `requires_openai_auth`

ModelGate must treat that row as a CC Switch credential source. It must not copy the plaintext key into YAML, and it must not fall back to `${HARDYAI_API_KEY}` when the CC Switch row already has auth material.

## 2. OpenAI Official auth location

OpenAI Official can be represented differently from third-party providers. Depending on the CC Switch mode, auth may be:

- in `settings_config.auth` as account/login material;
- in Codex `auth.json` or CC Switch OAuth storage;
- represented by `requires_openai_auth = true` in the Codex config;
- absent from the provider row, in which case ModelGate keeps an env fallback such as `${OPENAI_API_KEY}`.

ModelGate stores a non-secret `auth.type = ccswitch` reference when CC Switch has auth material or a reliable credential reference. If no reference exists, ModelGate falls back to env auth and reports a warning only for that provider.

## 3. Generic OpenAI-compatible auth locations

For Codex providers imported from CC Switch, credential material can appear in:

- explicit Codex provider credential references;
- `providers.settings_config.auth`, especially `OPENAI_API_KEY`;
- `providers.settings_config.config`, especially `experimental_bearer_token`, `api_key`, or provider-scoped header/token fields;
- `provider_endpoints` / future `credentials` tables when present;
- Codex `auth.json` / `codex_oauth_auth.json` when a provider can be associated with those files.

ModelGate imports references to these credentials, not plaintext secrets.

## 4. Why HardyAI was misreported as missing `HARDYAI_API_KEY`

The previous importer only promoted OpenAI Official rows to `auth.type = ccswitch`. A non-official Codex provider such as HardyAI could have `settings_config.auth.OPENAI_API_KEY`, but ModelGate still saved it as env auth:

```yaml
api_key: ${HARDYAI_API_KEY}
```

The UI then saw the missing local environment variable and reported `HARDYAI_API_KEY`, even though CC Switch itself had a usable credential.

## 5. New import priority

ModelGate now treats all Codex providers uniformly:

1. Prefer explicit CC Switch/Codex credential references.
2. Detect key or token material in `settings_config.auth`.
3. Detect bearer/API key material in `settings_config.config`.
4. Use provider endpoint / credential table metadata when available.
5. Keep OpenAI Official auth references when login material is present.
6. Only if no CC Switch credential evidence exists, fall back to `${PROVIDER_API_KEY}`.

Imported providers and aliases also receive non-secret metadata:

- `metadata.imported_from = ccswitch`
- `metadata.source_app`
- `metadata.source_provider_id`
- `metadata.source_config_hash`
- `metadata.source_fingerprint`
- `metadata.source_order`

The duplicate detector uses that metadata before it considers generated names, so importing the same CC Switch row again marks it as already imported instead of creating `-2` / `-3` copies by default.
