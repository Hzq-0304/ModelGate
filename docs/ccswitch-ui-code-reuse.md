# CC Switch UI Code Reuse Notes

## 1. License

The local reference repository at `.reference/cc-switch` declares the project license as MIT in both `LICENSE` and `package.json`.

MIT allows copying, modifying, and redistributing source code and UI implementation patterns, provided the copyright and permission notice are included in copies or substantial portions of the software.

## 2. CC Switch Source Files

The concrete CC Switch frontend files inspected and ported from are:

- Provider list source: `.reference/cc-switch/src/components/providers/ProviderList.tsx`
- Provider card source: `.reference/cc-switch/src/components/providers/ProviderCard.tsx`
- Hover actions/menu source: `.reference/cc-switch/src/components/providers/ProviderActions.tsx`
- Shell/header source: `.reference/cc-switch/src/App.tsx`
- Background, card, active, and border style source: `.reference/cc-switch/src/index.css`
- Settings panel source: `.reference/cc-switch/src/components/settings/SettingsPage.tsx`

The port keeps the UI structure and interaction model, then replaces CC Switch data dependencies with ModelGate aliases, providers, server status, and settings actions.

## 3. Ported UI Code / Structure / CSS

- Desktop shell density: a lightweight header, compact content padding, and a single primary list surface.
- Provider list structure: left drag handle, avatar, provider title, compact status badge, subtitle URL/description line, gray metadata row, current dot, and a hover-only actions toolbar.
- Provider card visual language: light border, 12px rounded card, subtle hover shadow, blue selected border, and soft selected gradient layer copied from the CC Switch active-card pattern.
- Hover action model: the card body no longer switches providers directly; the action toolbar appears on hover/focus and contains Set Active, Edit, Copy, and Delete.
- Toolbar/icon button style: restrained icon-sized settings button instead of large top-level actions.
- Settings drawer structure: compact grouped cards with short labels, light borders, small controls, and minimal explanatory text.
- Empty-state density: small centered empty state rather than a large dashboard panel.

The implementation keeps CC Switch's component layout and interaction shape, but uses plain CSS classes instead of importing CC Switch's Tailwind/Radix/framer-motion/dnd-kit runtime dependencies.

Direct class/style mappings used in ModelGate:

- CC Switch `relative overflow-hidden rounded-xl border border-border p-4 transition-all duration-300 bg-card text-card-foreground group`
  maps to ModelGate `.ccs-provider-card`.
- CC Switch `absolute inset-0 bg-gradient-to-r to-transparent transition-opacity duration-500 pointer-events-none`
  maps to ModelGate `.ccs-provider-active-layer`.
- CC Switch `flex min-w-0 flex-1 items-center gap-2`
  maps to ModelGate `.ccs-provider-left`.
- CC Switch `h-8 w-8 flex-shrink-0 rounded-lg bg-muted flex items-center justify-center border border-border group-hover:scale-105 transition-transform duration-300`
  maps to ModelGate `.ccs-provider-avatar`.
- CC Switch `flex items-center gap-1.5 flex-shrink-0 opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100`
  maps to ModelGate `.ccs-provider-actions`.
- CC Switch design tokens from `src/index.css` such as `--background`, `--card`, `--border`, `--muted`, and `--primary`
  map to ModelGate `--ccs-background`, `--ccs-card`, `--ccs-border`, `--ccs-muted`, and `--ccs-primary`.

## 4. Content Not Copied

The update does not copy:

- CC Switch brand name as ModelGate UI branding.
- CC Switch logo, app icon, screenshots, or proprietary visual assets.
- CC Switch-specific provider business logic, routing logic, auth flows, updater logic, or multi-app navigation.
- CC Switch project copywriting beyond generic interface concepts such as settings, provider, and status.

ModelGate keeps its own product name, local gateway semantics, configuration model, provider import behavior, i18n keys, and backend APIs.

## 5. ModelGate Target Files

New or updated ModelGate files that correspond to the reused structure:

- `desktop/src/features/ccswitch-style/CcSwitchShell.tsx`
- `desktop/src/features/ccswitch-style/CcSwitchProviderList.tsx`
- `desktop/src/features/ccswitch-style/CcSwitchProviderCard.tsx`
- `desktop/src/features/ccswitch-style/CcSwitchSettingsDrawer.tsx`
- `desktop/src/features/ccswitch-style/ccswitchStyle.css`
- `desktop/src/features/account-switcher/AccountSwitcher.tsx`
- `desktop/src/styles.css`
- `docs/ccswitch-ui-code-reuse.md`
- `NOTICE.md`

The previous `desktop/src/features/provider-list/*` ModelGate-only approximation was removed so the main screen is not styled by the old provider card CSS.

## 6. Attribution

Because the UI structure and CSS ideas are substantially based on CC Switch's MIT-licensed UI implementation, ModelGate includes attribution in `NOTICE.md`.

No additional README notice is required for local development, but release packages should keep `NOTICE.md` with the repository files.
