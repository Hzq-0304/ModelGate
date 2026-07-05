# Ratio Source Study

This document records the adapter boundary for ModelGate Ratio Monitor. The feature must read model-ratio data from relay systems through their real JSON APIs, not by guessing HTML tables.

## New API

Studied repository: `.reference/ratio-sources/new-api`.

Relevant implementation:

- `router/api-router.go` registers `GET /api/pricing` and `GET /api/ratio_config`.
- `controller/ratio_config.go` implements `GetRatioConfig`.
- `setting/ratio_setting/exposed_cache.go` builds exposed data with `model_ratio`, `completion_ratio`, `cache_ratio`, `create_cache_ratio`, and `model_price`.
- `controller/pricing.go` implements `GetPricing` and returns `data` pricing rows plus `group_ratio` and `usable_group`.
- `controller/group.go` implements `GET /api/group/` and authenticated user group endpoints.

Model ratio source:

- Preferred: `GET /api/ratio_config`.
- Fallback: `GET /api/pricing`.

Group information:

- `GET /api/pricing` returns `group_ratio` and `usable_group` when the pricing module is accessible.
- `GET /api/user/self/groups` can return group descriptions for the authenticated user.
- `GET /api/group/` returns group names, but is admin-protected in current New API.

Authentication:

- `GET /api/ratio_config` is public only when `ExposeRatioEnabled` is enabled; otherwise it returns 403.
- `GET /api/pricing` is controlled by the New API header navigation module and may be public or require login depending on site settings.
- ModelGate therefore supports optional Bearer/API token credentials and reports `authentication_required` or `authentication_failed` instead of trying to bypass login, CAPTCHA, Cloudflare, or WAF.

Compatibility notes:

- New API can expose two shapes:
  - ratio config shape: `{ success, data: { model_ratio, group_ratio?, ... } }`
  - pricing shape: `{ success, data: [{ model_name, model_ratio, enable_groups, ... }], group_ratio, usable_group }`
- `model_price` is fixed-price data and is not stored by Ratio Monitor v1 because the requested scope is model倍率 only.

## One API

Studied repository: `.reference/ratio-sources/one-api`.

Relevant implementation:

- `router/api.go` registers `GET /api/option/` behind `RootAuth`.
- `web/default/src/components/OperationSetting.js` reads `/api/option/` and edits `ModelRatio`, `GroupRatio`, and `CompletionRatio`.
- `controller/group.go` exposes `GET /api/group/`, but it is admin-protected in the current router.
- `relay/billing/ratio/model.go` and `relay/billing/ratio/group.go` contain the runtime maps and JSON serialization helpers.

Model ratio source:

- Preferred: `GET /api/option/` with authorized root/admin credential, extracting the `ModelRatio` option value.

Group information:

- Preferred: `GET /api/option/` with `GroupRatio`.
- `GET /api/group/` can return group names but is admin-protected and does not include descriptions.

Authentication:

- The real configurable ratio endpoint is not public. ModelGate requires a user-provided Bearer/API token if a site protects `/api/option/`.

Compatibility notes:

- One API stores ratio values as JSON strings in option rows.
- Group descriptions are not present in the studied One API endpoints. ModelGate preserves group names and leaves description empty.

## Sub2API

Studied repository: `.reference/ratio-sources/sub2api`.

Relevant implementation:

- `frontend/src/api/groups.ts` calls `GET /groups/available` and `GET /groups/rates`.
- `frontend/src/api/channels.ts` calls `GET /channels/available`.
- `frontend/src/api/admin/groups.ts` calls `GET /admin/groups` and `GET /admin/groups/all`.
- `backend/internal/server/routes/user.go` registers authenticated `/api/v1/groups/available`, `/api/v1/groups/rates`, and `/api/v1/channels/available`.
- `backend/internal/handler/admin/group_handler.go` exposes admin group rows containing `rate_multiplier`.

Model ratio source:

- No public model-ratio map equivalent to New API/One API was found in the studied code.
- Sub2API uses group/account/channel pricing and `rate_multiplier`; model pricing is price data, not a model倍率 map.

Group information:

- Preferred authenticated user endpoint: `GET /api/v1/groups/available`.
- Preferred admin endpoint when token permits: `GET /api/v1/admin/groups/all`.
- `GET /api/v1/channels/available` also includes groups and supported models, but the pricing fields are fixed prices, not model倍率.

Authentication:

- The group endpoints are authenticated. ModelGate requires a user-provided token.

Compatibility notes:

- Ratio Monitor v1 records Sub2API group names/descriptions/order and marks model ratios as unsupported/no_model_ratio unless a future Sub2API version exposes a true `group -> model -> ratio` JSON API.
- ModelGate does not convert fixed token prices into arbitrary model倍率 for Sub2API v1.

## New API Compatible

This adapter uses the same JSON API strategy as New API:

1. `GET /api/ratio_config`
2. `GET /api/pricing`

It exists for sites that fork or rebrand New API while preserving those API shapes. The user must still choose this type explicitly.

## Public vs Authenticated Interfaces

Public or optionally public:

- New API `/api/ratio_config` when exposure is enabled.
- New API `/api/pricing` when the pricing module allows public access.

Usually authenticated:

- One API `/api/option/`.
- One API `/api/group/`.
- Sub2API `/api/v1/groups/available`, `/api/v1/groups/rates`, `/api/v1/admin/groups/all`.

ModelGate will not bypass challenge pages or login protection. Sites requiring authentication must be configured with a token credential supplied by the user.

## Adapter Policy

- Prefer JSON APIs used by the upstream projects.
- Do not execute remote JavaScript.
- Do not scrape balances, recharge records, packages, usage records, notices, users, channel health, or request logs.
- Store only `group -> model -> ratio`, source status, timestamps, and fetch metadata.
- Keep last known good data when refresh fails.
