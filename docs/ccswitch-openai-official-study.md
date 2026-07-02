# CC Switch OpenAI Official Study

## 1. CC Switch database fields

CC Switch stores app providers in the `providers` table. For Codex rows the important columns are:

- `id`: provider id.
- `app_type`: `codex`.
- `name`: display name such as `OpenAI Official`.
- `settings_config`: JSON object.
- `category`: often `official` for official presets.
- `meta`: provider metadata such as managed auth binding.

For Codex, `settings_config` has this shape:

```json
{
  "auth": {},
  "config": "TOML string"
}
```

Third-party Codex providers keep API-key style credentials in `auth.OPENAI_API_KEY`. Some live Codex configs may also carry a provider-scoped token in `config` as `experimental_bearer_token`, either top-level or under `[model_providers.<id>]`.

The `OpenAI Official` preset in CC Switch is not a plain OpenAI API-key preset. It is seeded as an official Codex provider with `auth: {}` and an empty `config` by default. Official ChatGPT/Codex login material normally lives in Codex `auth.json`; CC Switch also has its own Codex OAuth account store at its app data path as `codex_oauth_auth.json`.

## 2. How Codex references it

Codex official auth is routed by Codex itself through `auth.json`. CC Switch can write config-only routing for third-party providers, and for official shared-session behavior it uses a `custom` provider table with:

- `name = "OpenAI"`
- `requires_openai_auth = true`
- `wire_api = "responses"`
- `supports_websockets = true`

For CC Switch managed Codex OAuth, requests use a dynamic access token derived from CC Switch's stored refresh token. The proxy sends:

- `Authorization: Bearer <access_token>`
- `ChatGPT-Account-Id: <account_id>` when an account id is known
- `originator: cc-switch`

ModelGate must not implement the login/device-code flow. It can only import references to credentials CC Switch already has, or use a user-provided environment-variable fallback.

## 3. Fields imported into ModelGate

ModelGate now imports OpenAI Official as an OpenAI-compatible provider with an explicit auth object:

```yaml
providers:
  openai-official:
    type: openai-compatible
    base_url: https://api.openai.com/v1
    api_key: ${OPENAI_API_KEY}
    auth:
      type: ccswitch
      source: CC Switch OpenAI Official
      app: codex
      db_path: C:\Users\...\ .cc-switch\cc-switch.db
      provider_id: <cc-switch provider id>
      credential_ref: ccswitch://providers/codex/<provider id>/auth
      credential_path: /auth/OPENAI_API_KEY
      fallback_env: OPENAI_API_KEY
      header: Authorization
      scheme: Bearer
```

If CC Switch has a key-like Codex credential (`auth.OPENAI_API_KEY` or `experimental_bearer_token`), the import marks the candidate as a CC Switch credential reference. If no usable credential is found, ModelGate still imports safely and keeps `${OPENAI_API_KEY}` as a fallback.

## 4. Forwarding strategy

OpenAI-compatible forwarding now calls `resolveProviderAuth(provider)` rather than assuming `Authorization: Bearer <api_key>`.

Supported auth forms:

- Legacy `api_key: ${ENV}`.
- `auth.type = env`.
- `auth.type = ccswitch` with a credential reference and optional env fallback.
- `auth.type = static-header-ref` for header values supplied by a safe reference or env variable.

When a CC Switch credential reference cannot be resolved, startup still succeeds. Runtime requests return a structured `missing_credential` JSON error.

## 5. Sensitive data rules

ModelGate does not copy browser cookies, does not implement OpenAI web login, and does not ask for an OpenAI account password.

The desktop UI shows only masked previews and credential source labels. Plaintext tokens are not written to normal YAML by default. If a detached ModelGate setup needs a copied token later, that must be an explicit user action with clear UI warning; this release keeps the safer reference/fallback design.
