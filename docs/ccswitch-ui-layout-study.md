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

- compact header with `ModelGate`, `Codex / Logs / Advanced`, language, server status, server action, and Settings;
- single-column alias/provider list;
- current alias shown only by blue border and pale blue card background;
- each card shows an avatar, name, short status badge, URL/description, provider, and model;
- edit/delete/set-active actions are tucked behind a small `...` menu;
- Usage Overview moved away from the Home page and shown with Logs.

## 4. Removed Elements

- Large "current account" card.
- Large disconnected red panel on the Home page.
- Quick Start block on the Home page.
- Right-side selected-item detail panel.
- Alias / provider / model three-box layout inside cards.
- Always-visible large Edit / Delete / Set Active buttons on every card.

## 5. Preserved Elements

- Active alias switching.
- Offline display of local aliases/providers.
- Missing-auth warning status.
- Edit alias/provider entry point.
- Delete alias/provider entry point.
- Settings entry and grouped Settings page.
- CC Switch import and Codex import under Settings.
- Server start/stop control, now as a compact header action.
