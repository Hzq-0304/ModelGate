# Desktop server startup root cause

## True cause

The release server runtime was not self-contained. It contained `dist/index.js`, but that file imports runtime dependencies such as `fastify`, `yaml`, and `zod`. The release runtime only worked if `node_modules` was present nearby or if Node could walk upward to the repository root and find `E:\Hzq Program\ModelGate\node_modules`.

In an installed desktop environment that repository parent directory is absent. The managed Node process can exit immediately with an error like:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'fastify'
```

The old desktop status model also discarded useful process diagnostics. It did not keep stderr, spawn command, or exit code in the returned status, so the frontend could show a generic not-running state instead of an actionable failure.

## Reproduction path

The problem was reproduced by copying the release runtime to a temporary directory and removing `node_modules`:

```powershell
$src = 'E:\Hzq Program\ModelGate\release\modelgate-v0.1.6\modelgate-server'
$dst = Join-Path $env:TEMP 'modelgate-server-no-node-modules-test'
Remove-Item -Recurse -Force $dst -ErrorAction SilentlyContinue
Copy-Item -Recurse $src $dst
Remove-Item -Recurse -Force (Join-Path $dst 'node_modules')
Set-Location -LiteralPath $dst
node dist/index.js
```

That process exited before `/health` could succeed because dependencies were not available.

## Involved files

- `src/index.ts`
- `src/serverMain.ts`
- `src/config/loadConfig.ts`
- `scripts/prepare-desktop-server.mjs`
- `scripts/prepare-release.mjs`
- `desktop/src-tauri/src/server_process.rs`
- `desktop/src/api.ts`
- `desktop/src/features/server-control/ServerControl.tsx`
- `desktop/src/App.tsx`

## Fix

The server startup path was changed from a dependency-tree runtime to a bundled runtime:

```text
modelgate-server/
  modelgate-server.cjs
  examples/
  package.json
  package-lock.json
  README.md
  RELEASE_NOTES.md
```

`esbuild` now bundles the Node backend into:

```text
dist-server/modelgate-server.cjs
```

The desktop runtime preparation copies that bundle into the Tauri resource and local release runtime. `server_process.rs` now starts:

```text
node modelgate-server.cjs
```

and only falls back to:

```text
node dist/index.js
```

for development or compatibility layouts.

The process manager now records:

- server root;
- config path;
- command;
- pid;
- exit code;
- last error;
- startup log;
- recent stderr.

It also keeps the state as `failed` when the child exits before `/health` succeeds.

## Validation method

Validation must include an isolated runtime test that does not depend on the repository root:

```powershell
$version = (node -p "require('./package.json').version")
$src = "E:\Hzq Program\ModelGate\release\modelgate-v$version\modelgate-server"
$dst = Join-Path $env:TEMP "modelgate-server-isolated-test"

Remove-Item -Recurse -Force $dst -ErrorAction SilentlyContinue
Copy-Item -Recurse $src $dst
Remove-Item -Recurse -Force (Join-Path $dst 'node_modules') -ErrorAction SilentlyContinue

Set-Location -LiteralPath $dst
node .\modelgate-server.cjs
```

The server must respond to:

```text
http://127.0.0.1:11435/health
```

Final validation for this change copied `release/modelgate-v0.1.6/modelgate-server` to `%TEMP%\modelgate-server-isolated-test`, removed any `node_modules` directory, started `node .\modelgate-server.cjs`, and confirmed `/health` returned `ok`.
