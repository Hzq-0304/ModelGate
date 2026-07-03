# CC Switch UI Reuse Study

## 1. License

The local reference repository at `.reference/cc-switch` includes an MIT License:

- copyright holder: Jason Young
- license: MIT
- package metadata also declares `"license": "MIT"`

The MIT License permits using, copying, modifying, merging, publishing, distributing, sublicensing, and selling copies of the software, provided the copyright and permission notice are included with substantial portions.

## 2. Reusable Layout And Style Ideas

ModelGate can reuse the following ideas from CC Switch:

- compact desktop shell with a thin top header;
- provider list as the primary screen;
- one-column provider cards;
- active item highlighted by border and pale background rather than repeated summary panels;
- compact badge styling;
- actions hidden behind a small action button;
- Settings as the place for secondary flows.

## 3. Content Not Copied

ModelGate does not copy CC Switch brand identity:

- no CC Switch name in the UI shell;
- no CC Switch logo or proprietary image assets;
- no partner logos or extracted brand artwork;
- no unrelated app-specific provider business logic.

## 4. Reused Structure In ModelGate

This change reuses the structure and interaction density, not a wholesale source copy:

- `ModelGate` title plus a single Settings icon in the header;
- main screen dedicated to the Codex provider/alias list;
- cards with avatar, provider name, short URL/description, small badges, and `...` actions;
- active alias indicated by a blue border and pale blue background;
- service control, integrations, model routing, records, advanced tools, and language moved into Settings.

## 5. Reimplemented Parts

The ModelGate implementation remains native to this codebase:

- React components keep ModelGate i18n and local state flow;
- existing Tauri commands and admin APIs are preserved;
- CC Switch snapshot import, `ccswitch-snapshot` auth, and source-hash duplicate detection remain ModelGate-specific;
- Settings drawer uses ModelGate's existing forms and panels rather than copying CC Switch's dependency-heavy Radix/Tailwind component stack.
