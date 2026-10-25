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

Secondary actions, especially the ones that repeat on every row or sit together in a group (folder,
restore, more actions), work better as an icon-only button with a tooltip: icons keep the group
compact and the rows aligned, and the tooltip carries the words. Primary actions keep their text,
because the user must find them without hovering: Create, Save, Submit, Open schedule editor. An
icon may sit next to that text. Which level a button takes is in `foundations/color-tokens.md`,
"Brand and action hierarchy".

**A button with only an icon always has a tooltip, and it always goes through
`shared/ui/IconActionButton/IconActionButton.tsx`.** ESLint fails on `isIconOnly` anywhere else
(`frontend/eslint.config.js`); the named exceptions are the component itself, `HelpTooltip`, the
Catalog view toggle and Today's primary "+" stepper, which builds the same tooltip shape by hand.

- **One shape.** A 32 px round button (`size="sm"`), an 18 px glyph, `variant="tertiary"` by default
  or `ghost` for a tertiary-level action. The tooltip has an arrow, opens after 300 ms on hover
  (HeroUI's default is 1.5 s), shows on keyboard focus, and still shows while the button is disabled
  (a `Tooltip.Trigger` wraps the button).
- **The words.** `tooltip` is the short action name, verb first (`Set download folder`). `ariaLabel`
  adds the target (`Set download folder for Dr. Stone`), so screen readers and tests get the full
  name. A disabled button appends `disabledReason` after " · " (`Remove · An anime must stay on at
  least one day`). Extra data, such as a path, goes on a second muted line through `detail`, never
  instead of the name and never as a native `title`.
- **Tone.** `tone` tints the glyph on hover by meaning (`accent`, `success`, `warning`, `danger`);
  `isTinted` keeps the tint at rest (Intake's folder once the row overrides it).
- **Triggers.** Without `onPress` it works as the trigger of an enclosing `Modal` or `Dropdown`
  (`LookupTrigger`'s icon variant, `IntakeRowMoreMenu`, Today's status button). `onContextMenu`
  takes the secondary click and prevents the browser menu (desktop page/folder actions copy).
- The icon comes from the `@iconify/react` set the surface already uses; the set, its variants and
  the action-to-icon vocabulary (Edit, Repeat, Restore, Delete…) are in `foundations/iconography.md`.

## External URLs open in the default browser

Every external URL opens through the bridge (`openAnimePage` and its siblings), which hands it to
the system default browser. Never an `<a href target="_blank">`: in the Wails WebView that opens an
internal window. A URL shown as text is a HeroUI `Link` with `onPress` and no `href` (role link,
keyboard reachable), its failure a danger toast and its success silent. Reference: Anime Detail's
Page field (`AnimeDetailGeneralData.tsx`).

## Toast feedback

`toast` from `@heroui/react` (`toast.success` / `danger` / `warning` / `info`).

- Backend notifications flow through `use-notification-toasts`, the only `notification.push`
  subscriber (see the `app-notification-pipeline` skill).
- Local imperative feedback (clipboard copy confirmations) is called directly in the hook's mutation
  callback, with English copy such as "Folder path copied to clipboard".
- The result of a user action is a toast called from the hook callback: a submit that saved
  (`success`), changed nothing (`info`), hit a conflict (`warning`), failed, threw, or timed out
  (`danger`). It never lingers as an `Alert`. References: Seasons' Confirm selection
  (`use-selection-board.ts`) and the Editor's Save, Deactivate, Restore and Repeat
  (`use-anime-editor-record.ts`, `use-anime-editor-lifecycle-actions.ts`, mapped by
  `toAnimeEditorToastKind`).
- `Alert` is reserved for state that persists on the surface: the screen or record did not load
  (`status="danger"`), or validation blocks the action. An action blocked by validation shows that
  `Alert` only; it does not also toast.
- Hook test mock: a `vi.hoisted` toast object plus
  `vi.mock('@heroui/react', () => ({ toast: toastMock }))` (see `use-chapter-schedule-panel.test.ts`).

## Shared presentation components

Reusable presentation-only controls live in `frontend/src/shared/ui/`. Extract a shared component
when a pattern (for example Label/Input/Select) appears three or more times. A stateful widget used by
several features lives in `frontend/src/shared/<domain>/`.
