# HeroUI mapping — what to reach for

**The mandate: never hand-roll a `<div>` / `<button>` / `<table>` / `<input>` when a HeroUI v3
primitive exists.** HeroUI runs on React Aria, so focus management, keyboard navigation and ARIA come
for free. Rebuilding them by hand is a regression, not a redesign.

> Cautionary tale: the `network` feature was first built with raw HTML and had 1/8 components on
> HeroUI while the rest of the app used it in 18 files. It was migrated to 8/8. Do not recreate that
> drift; when you find a feature on raw HTML, prefer migrating it.

## Stack

- HeroUI v3 (`@heroui/react`, `@heroui/styles`, `^3.2.x`) on Tailwind CSS v4 and React Aria.
- No provider is needed in v3. Use compound components (`Card.Content`, `Tabs.Tab`, `Table.Row`).
- Use `onPress`, not `onClick`, on HeroUI interactive components.
- For exact APIs, fetch live docs through the `heroui-react` skill
  (`node scripts/get_component_docs.mjs <Component>`). The installed version may be ahead of that
  skill's cache; the installed code and its docs win.

## The table

| Need | Use | Do NOT |
|---|---|---|
| Heading / body text | `Typography` (`foundations/typography.md`) | raw `<h1>` / `<p>`; imports from unverified stale `node_modules` |
| Text or search filter | `SearchField` (`.Group/.SearchIcon/.Input/.ClearButton`) or `Input` | raw `<input>` |
| Single-select filter row | `ToggleButtonGroup` + `ToggleButton` (a radiogroup: `role="radio"`, `disallowEmptySelection`) | rows of `<button>` pills |
| Dropdown select | `Select` + `ListBox` + `ListBox.Item` | raw `<select>` |
| Tabbed sections | `Tabs` (`.ListContainer/.List/.Tab/.Panel`, `selectedKey` / `onSelectionChange`) | a `<button>` tab strip |
| Data grid / log table | `Table` (`.ScrollContainer/.Content/.Header/.Column/.Body/.Row/.Cell`); see `tables.md` | raw `<table>` (except the loading placeholder, `patterns/loading-empty-error.md`) |
| Card / panel container | `Card` (`.Content`) or `Surface` (`variant="default\|secondary\|tertiary"`) | a bordered `<div>` |
| Inline status banner | `Alert` (`status="default\|accent\|success\|warning\|danger"`, `.Indicator/.Content/.Title/.Description`) | a colored `<div>` |
| Secondary or per-row action | an icon-only `Button` (`isIconOnly`, `aria-label`) inside a `Tooltip` that names the action (see below) | a text-only button repeated on every row |
| Primary action (Create, Save, Submit) | a `Button` with its text, an icon optional | hiding the main action behind an icon |
| Dismiss / close | `CloseButton` (`onPress`, `aria-label`) | `<button>×` |
| Tag / badge | `Chip variant="soft"` (`chips.md`) | a styled `<span>`; a bordered or outlined pill |
| Scrollable region | `ScrollShadow` or `Table.ScrollContainer` | an `overflow-auto` div, unless you need raw scroll control |
| Large static list | `useProgressiveListWindow` (`patterns/lists.md`) | a full mapped column; ListBox virtualization |
| Large live list | the panel's own window + `isNearListBottom` (`patterns/lists.md`) | `useProgressiveListWindow` |
| Status column in a list row | a `shrink-0` fixed-width slot with a one-word tag (`patterns/lists.md`) | a full sentence inline next to the name |
| Unresolved request, nothing loaded yet | a shape-mirroring skeleton in a status region, or `LoadingBars` (`shared/ui/LoadingBars/`) for uniform bars | a "Loading…" sentence, a lone `Spinner`, a skeleton without `role="status"` |
| Refetching with rows on screen | keep the rows: `aria-busy` plus a discreet hint in the surface's status line | swapping in a skeleton on every keystroke |
| Resolved-empty result | `AirisEmptyState` (`airis-empty-state.md`) | a bare "No results" line; an empty state while the request is unresolved |
| Detail pane before a selection | `AwaitingSelectionPane` (`awaiting-selection-pane.md`) | the mascot; skeleton shapes; a plain sentence |
| Failed request | the surface's error `Alert` | an empty state or a skeleton |

## Icon-only buttons with a tooltip

This is a preference with nuance, not an absolute rule. Secondary actions, especially the ones that
repeat on every row or sit together in a group (folder, restore, more actions), work better as an
icon-only button with a tooltip: icons keep the group compact and the rows aligned, and the tooltip
carries the words. Primary actions keep their text, because the user must find them without
hovering: Create, Save, Submit, a login button. An icon may sit next to that text. Existing text
buttons are not converted retroactively; apply this when a surface is designed or touched.

- `Button isIconOnly` with an `aria-label` that names the action and its target
  (`More actions for Dr. Stone`), so screen readers and tests get the full name.
- Wrap it in `Tooltip` with `Tooltip.Content showArrow` + `Tooltip.Arrow`; the tooltip text is the
  short action name (`More actions`). Reference: `IntakeRowMoreMenu.tsx`.
- The icon comes from the `@iconify/react` set the surface already uses.

## Toast feedback

`toast` from `@heroui/react` (`toast.success` / `danger` / `warning` / `info`).

- Backend notifications flow through `use-notification-toasts`, the only `notification.push`
  subscriber (see the `app-notification-pipeline` skill).
- Local imperative feedback (clipboard copy confirmations) is called directly in the hook's mutation
  callback, with English copy such as "Folder path copied to clipboard".
- Hook test mock: a `vi.hoisted` toast object plus
  `vi.mock('@heroui/react', () => ({ toast: toastMock }))` (see `use-chapter-schedule-panel.test.ts`).

## Shared presentation components

Reusable presentation-only controls live in `frontend/src/shared/ui/`. Extract a shared component
when a pattern (for example Label/Input/Select) appears three or more times. A stateful widget used by
several features lives in `frontend/src/shared/<domain>/`.
