# CC Switch routing and backend study

## 1. Page and route organization

CC Switch keeps the top-level view selection in `src/App.tsx`, but view metadata and feature code are split into focused modules. Major pages are implemented under `src/components/*`, with Settings under `src/components/settings/*` and provider workflows under `src/components/providers/*`.

The important pattern for ModelGate is not the exact route library, but the separation of responsibilities:

- top-level app state decides which page is visible;
- page-specific code lives in feature folders;
- navigation items are data-driven instead of being scattered through JSX;
- long feature panels such as Settings are split into sections and hooks.

## 2. Settings and navigation organization

CC Switch uses a dedicated `SettingsPage` component with tab metadata and independent sections. Settings-related async work is handled through hooks such as `useSettings`, `useSettingsForm`, and directory/settings helpers. This keeps the top-level app from owning every individual settings field.

The useful ModelGate pattern is:

- keep Settings grouping metadata outside `App.tsx`;
- make Settings a feature boundary;
- let each heavy panel own its display and error details;
- keep the header responsible only for navigation and global controls.

## 3. Tauri command wrapping

CC Switch wraps frontend Tauri calls in `src/lib/api/*` modules instead of calling `invoke` directly everywhere. Rust commands are split under `src-tauri/src/commands/*` and re-exported through `commands/mod.rs`, while `lib.rs` registers the final command list.

ModelGate already had a small `desktop/src/api.ts`. The change from CC Switch worth carrying forward is to keep command details behind typed frontend API functions and move command-specific UI into feature components such as Server Control.

## 4. Async state and error handling

CC Switch uses explicit async state, query invalidation, and toast/detail messages. Long operations are not treated as a single blocking UI call; the UI shows progress and then refreshes state. Errors are extracted and shown in user-visible messages, with more detail logged or available in feature panels.

The ModelGate startup flow should follow the same approach:

- `start_server_process` returns quickly with `starting`;
- a background monitor updates process state;
- frontend polling reads status every short interval;
- failures remain `failed`, with root, command, exit code, config path, and stderr details.

## 5. Patterns suitable for ModelGate

The following CC Switch patterns fit ModelGate:

- typed API wrapper around Tauri commands;
- command-oriented feature components;
- route/settings metadata in small files;
- long-running work represented as explicit states;
- detailed but collapsible error diagnostics;
- Rust command modules with clear state ownership.

Patterns not copied:

- CC Switch's full React Query stack, because ModelGate is smaller and already uses simple local state;
- CC Switch's full multi-app settings system, because ModelGate currently has a narrower scope;
- business-specific provider/import logic.

## 6. ModelGate changes in this round

This round applies the study in three places:

- server runtime packaging now creates an independent `modelgate-server.cjs` bundle;
- desktop server startup now prefers the bundle and reports `failed` with diagnostics instead of silently falling back to stopped;
- frontend organization adds route/settings metadata and a dedicated `ServerControl` feature component so startup state and failure details are not embedded in the main app body.

