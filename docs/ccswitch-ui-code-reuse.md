# CC Switch UI Code Reuse Notes

## 1. License

The local reference repository at `.reference/cc-switch` declares the project license as MIT in both `LICENSE` and `package.json`.

MIT allows copying, modifying, and redistributing source code and UI implementation patterns, provided the copyright and permission notice are included in copies or substantial portions of the software.

## 2. Reused UI Code / Structure / CSS Ideas

This ModelGate update ports and rewrites the following CC Switch UI patterns:

- Desktop shell density: a lightweight header, compact content padding, and a single primary list surface.
- Provider list structure: left grip/avatar, provider title, compact status badge, subtitle URL/description line, gray metadata row, selected dot, and right-side action menu.
- Provider card visual language: light border, 12px rounded card, subtle hover shadow, blue selected border, and soft selected gradient layer.
- Toolbar/icon button style: restrained icon-sized settings button instead of large top-level actions.
- Settings drawer structure: compact grouped cards with short labels, light borders, small controls, and minimal explanatory text.
- Empty-state density: small centered empty state rather than a large dashboard panel.

The implementation is adapted for ModelGate's existing React/TypeScript code and CSS without importing CC Switch's Tailwind, Radix, framer-motion, dnd-kit, or business logic.

## 3. Content Not Copied

The update does not copy:

- CC Switch brand name as ModelGate UI branding.
- CC Switch logo, app icon, screenshots, or proprietary visual assets.
- CC Switch-specific provider business logic, routing logic, auth flows, updater logic, or multi-app navigation.
- CC Switch project copywriting beyond generic interface concepts such as settings, provider, and status.

ModelGate keeps its own product name, local gateway semantics, configuration model, provider import behavior, i18n keys, and backend APIs.

## 4. ModelGate Files

New or updated ModelGate files that correspond to the reused structure:

- `desktop/src/features/provider-list/ProviderList.tsx`
- `desktop/src/features/provider-list/ProviderCard.tsx`
- `desktop/src/features/provider-list/providerList.css`
- `desktop/src/features/account-switcher/AccountSwitcher.tsx`
- `desktop/src/styles.css`
- `docs/ccswitch-ui-code-reuse.md`
- `NOTICE.md`

## 5. Attribution

Because the UI structure and CSS ideas are substantially based on CC Switch's MIT-licensed UI implementation, ModelGate includes attribution in `NOTICE.md`.

No additional README notice is required for local development, but release packages should keep `NOTICE.md` with the repository files.
