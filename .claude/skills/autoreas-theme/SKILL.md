---
name: autoreas-theme
description: "Living design-system guide for the autoreas-bridge frontend. Use BEFORE building or refactoring ANY UI under frontend/src — it tells you which HeroUI v3 component to use instead of hand-rolling divs/buttons/tables, the project's semantic color tokens, and the domain/level color conventions. Keywords: theme, design system, UI, rebrand, restyle, frontend component, HeroUI, Tailwind, styling, feature UI."
metadata:
  author: autoreas-bridge
  version: "1.0.2"
  scope: project
  updates: living
---

# autoreas-bridge — Theme & Design System (living)

This is the project's UI source of truth. **The mandate: never hand-roll a `<div>`/`<button>`/`<table>`/`<input>` when a HeroUI v3 primitive exists.** HeroUI runs on React Aria — you get focus management, keyboard nav, and ARIA for free. Rebuilding that by hand is a regression, not a redesign.

> Cautionary tale: the `network` feature was originally built with raw HTML and had **1/8** components on HeroUI while the rest of the app used it in 18 files. It was migrated to **8/8**. Do NOT recreate that drift. If you find a feature on raw HTML, prefer migrating it to HeroUI.

## Stack (verified)

- **HeroUI v3** (`@heroui/react`, `@heroui/styles` — `^3.2.x`) on **Tailwind CSS v4** + **React Aria**.
- `frontend/src/style.css` is just: `@import "tailwindcss";` then `@import "@heroui/styles";` (order matters). **No theme overrides** — tokens are HeroUI defaults.
- **No provider** needed (v3). Use **compound components** (`Card.Content`, `Tabs.Tab`, `Table.Row`). Use **`onPress`**, not `onClick`, on HeroUI interactive components.
- For exact component APIs, fetch live docs via the `heroui-react` skill (`node scripts/get_component_docs.mjs <Component>`). The repo version may be ahead of that skill's cache — **code/docs of the installed version win**.

## Component mapping — what to reach for

| Need | Use (HeroUI v3) | Do NOT |
|------|-----------------|--------|
| Heading / body text | `Typography` (`type="h1".."h6" \| "body" \| "body-sm" \| "code"`, `color="muted"`) | raw `<h1>/<p>` |
| Text / search filter | `SearchField` (`.Group/.SearchIcon/.Input/.ClearButton`) or `Input` | raw `<input>` |
| Single-select filter row | `ToggleButtonGroup` + `ToggleButton` (renders a **radiogroup** → `role="radio"`, `disallowEmptySelection`) | rows of `<button>` pills |
| Dropdown select | `Select` + `ListBox` + `ListBox.Item` | raw `<select>` |
| Tabbed sections | `Tabs` (`.ListContainer/.List/.Tab/.Panel`, `selectedKey`/`onSelectionChange`) | `<button>` tab strip |
| Data grid / log table | `Table` (`.ScrollContainer/.Content/.Header/.Column/.Body/.Row/.Cell`) | raw `<table>` |
| Card / panel container | `Card` (`.Content`) or `Surface` (`variant="default\|secondary\|tertiary"`) | bordered `<div>` |
| Inline status banner | `Alert` (`status="default\|accent\|success\|warning\|danger"`, `.Indicator/.Content/.Title/.Description`) | colored `<div>` |
| Dismiss / close | `CloseButton` (`onPress`, `aria-label`) | `<button>×` |
| Tag / badge | `Chip` (`color=... size="sm" variant="soft\|tertiary"`, plain text child) | styled `<span>` |
| Scrollable region | `ScrollShadow` or `Table.ScrollContainer` | `overflow-auto` div (unless you need raw scroll control) |

## Color conventions (semantic, NOT raw colors)

Semantic tokens in use: `accent`, `success`, `warning`, `danger`, `default`, plus `foreground`, `muted`, `default-400/500`, `content1`, `divider`. Soft variants exist (`*-soft`). Always pass `color="success"` etc. to HeroUI components — never hardcode hex/oklch. White-alpha utilities (`bg-white/[0.03]`) are used for subtle hover/surfaces.

**Log LEVEL → color** (mirror across the app — `ObservabilityPanel` and `network`):
`info → success` · `warn → warning` · `error → danger` · `debug → accent` · default → `default`.

**Runtime DOMAIN → color**:
`anime → success` · `sync → accent` · `websocket → warning` · `api → danger` · `bus → default` · default → `default`.

These mappings live in `*-panel.helpers.ts` (`getNetworkLevelColor`, `getNetworkDomainColor`, etc.). Reuse the helper; don't re-derive the switch.

## Architecture constraints (from CLAUDE.md — enforced)

- `.tsx` under `features/` are **dumb UI only**: no Wails calls, no `useEffect`, no business logic. Logic goes in `use-*.ts` hooks (strict anatomy) and pure `*.helpers.ts` (every exported helper has JSDoc).
- Every prop in `*Props` interfaces is `readonly`. Routes/`app/**` are composition-only.
- **TDD is mandatory** for helpers and hooks (colocated `__tests__/`). Files over 500 lines get refactored.

## Testing notes (React Aria in jsdom)

- React Aria `usePress` **responds to native `.click()` / `fireEvent.click`** (virtual press) — selection, tab change, and `CloseButton.onPress` fire without `@testing-library/user-event` (not installed).
- A single-select `ToggleButtonGroup` exposes its options as **`role="radio"`**, not `role="button"`. Query accordingly.
- **`Table.ScrollContainer` scrolls HORIZONTALLY only** (`@apply scrollbar overflow-x-auto`). For a vertical/live feed: wrap the `Table` in your own `overflow-y-auto` scroller (ref + `onScroll` go there) with `[scrollbar-gutter:stable]` so the scrollbar does NOT cover the secondary-variant rounded header corner. On `ScrollContainer` use **`overflow-x-clip`** (NOT `overflow-x-hidden`) + `w-full` on `Table.Content`.
  - **CSS overflow promotion gotcha:** if one axis is `hidden`/`auto`/`scroll` and the other is `visible`, the `visible` axis is promoted to `auto` — silently turning `ScrollContainer` into a competing vertical scroller that steals scroll and breaks your wrapper's stick-to-bottom. `clip` is exempt from this promotion, so `overflow-x-clip` keeps the Y axis truly `visible` and leaves your wrapper as the sole scroller. Never put `max-h` on `ScrollContainer`.

## Keeping this skill alive

This is a **living** document. When you establish a new UI convention, adopt a new HeroUI component, change a token mapping, or hit a non-obvious React-Aria gotcha — **update this file** and bump `version`. Add a line to the changelog.

### Changelog
- `1.0.2` — Deepened the scroll guidance: use `overflow-x-clip` (not `hidden`) on `ScrollContainer` to avoid CSS overflow promotion creating a competing scroller; add `[scrollbar-gutter:stable]` to the wrapper so the scrollbar doesn't cover the rounded header corner.
- `1.0.1` — Corrected `Table.ScrollContainer` scroll guidance: it's horizontal-only; use an own `overflow-y-auto` wrapper for vertical/live feeds and `overflow-x-hidden`+`w-full` to avoid a stray horizontal scrollbar. Fixed broken stick-to-bottom + unwanted horizontal scroll in the network table.
- `1.0.0` — Initial guide. Captured stack, component mapping, level/domain color conventions, and React-Aria-in-jsdom testing notes after the `network` feature migration to HeroUI (1/8 → 8/8).
