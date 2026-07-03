# CC Switch UI Layout Study

## 1. CC Switch Provider List Layout

CC Switch keeps the primary provider view focused on a single vertical list. The header is compact, with the app name, app switcher, toolbar actions, and settings entry in one row. Provider cards are dense but readable: an icon, provider name, a URL or short description, a few small badges, and compact actions that appear on hover or in the action area.

The selected provider is not repeated in a large summary panel. It is indicated in the list itself through a blue border, subtle blue background, and small visual emphasis.

## 2. ModelGate UI Problems

The previous ModelGate Home page mixed too many jobs in the first screen:

- a large server warning block;
- a Quick Start button group;
- a separate Account Switcher hero card;
- a right-side detail panel;
- repeated alias/provider/model field boxes inside each card;
- Usage Overview below the switcher.

This made the desktop app feel like a backend admin form instead of a focused switching tool.

## 3. Adopted Layout

ModelGate now treats the Codex Home page as a provider/alias switcher:

- minimal header with only `ModelGate`, a small server status dot, and a Settings icon (no tabs, language dropdown, endpoint text, or server buttons in the header);
- single-column alias/provider list as the only thing on the main screen;
- current alias shown only by a blue border, pale blue card background, and a small blue dot (no "current"/"in use" text);
- each card shows drag dots, an avatar, the display name (falling back to the alias key), a URL/description line, and a `provider / model` metadata row;
- the card body does not switch providers; hover/focus reveals a compact toolbar with Set Active, Edit, Copy, and Delete;
- Edit opens a dedicated provider/alias modal and Delete opens a confirmation modal — neither navigates to Settings;
- server control, imports, model routing, logs, usage, diagnostics, and language all live inside the Settings drawer.

## 4. Removed Elements

- Large "current account" card.
- Large disconnected red panel on the Home page.
- Quick Start block on the Home page.
- Right-side selected-item detail panel.
- Alias / provider / model three-box layout inside cards.
- Always-visible large Edit / Delete / Set Active buttons on every card.
- Codex / Logs / Advanced tabs, language selector, and server buttons in the header.
- Edit jumping to the Settings page and `window.confirm` delete prompts.

## 5. Preserved Elements

- Active alias switching (offline and online).
- Offline display of local aliases/providers.
- Missing-auth warning status.
- Edit alias/provider through a modal.
- Delete alias/provider through a confirmation modal.
- Copy provider/alias info.
- Settings entry and grouped Settings drawer.
- CC Switch import and Codex import under Settings.
- Server start/stop/restart control inside Settings.
