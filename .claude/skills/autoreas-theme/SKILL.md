---
name: autoreas-theme
description: "Design-system fundamentals for the autoreas-bridge frontend, with an index into docs/design for the detail. Use BEFORE building or refactoring ANY UI under frontend/src: which HeroUI v3 component to use instead of hand-rolling divs/buttons/tables, semantic color tokens, chips, the loading/empty/error states, empty-state kinds and the mascot, and mockup fidelity and pricing. Keywords: theme, design system, UI, rebrand, restyle, frontend component, HeroUI, Tailwind, styling, feature UI, empty state, skeleton, mockup."
metadata:
  author: autoreas-bridge
  version: "2.4.0"
  scope: project
  updates: living
---

# autoreas-bridge — design system fundamentals

This skill holds only the rules every UI change must know. The detail lives in `docs/design/`
(index: `docs/design/README.md`). When code and docs disagree, the code wins; fix the doc in the
same unit.

## 1. HeroUI first

Never hand-roll a `<div>` / `<button>` / `<table>` / `<input>` when a HeroUI v3 primitive exists.
HeroUI runs on React Aria; rebuilding focus, keyboard and ARIA by hand is a regression. Use compound
components (`Card.Content`, `Tabs.Tab`) and `onPress`, not `onClick`. No provider is needed. The
installed package wins over docs: verify exports in `node_modules` when versions drift.

| Need | Use | Do NOT |
|---|---|---|
| Text | `Typography` (`color` is only `default` or `muted`) | raw `<h1>` / `<p>` |
| Search / filter | `SearchField`, `Input`; `ToggleButtonGroup` for a single-select row | raw `<input>`, `<button>` pills |
| Select / tabs | `Select` + `ListBox`; `Tabs` | raw `<select>`, a `<button>` tab strip |
| Table | `Table` | raw `<table>` (except a loading placeholder) |
| Container | `Card` or `Surface` | a bordered `<div>` |
| Banner / error | `Alert` | a colored `<div>` |
| Tag / badge | `Chip variant="soft"` | a styled `<span>`, an outlined pill |
| Long list | `useProgressiveListWindow` (static) or `isNearListBottom` (live) | rendering every row |
| Loading | shape-mirroring skeleton in a status region, or `LoadingBars` | a "Loading…" sentence, a lone `Spinner` |
| Resolved empty | `AirisEmptyState` | a bare "No results" line |
| Detail pane, nothing selected | `AwaitingSelectionPane` | the mascot, skeleton shapes |
| Secondary / per-row action | icon-only `Button` (`isIconOnly`, `aria-label`) inside a `Tooltip` naming the action | a text-only button repeated on every row |
| Primary action (Create, Save) | `Button` with its text, an icon optional | hiding it behind an icon |

Secondary actions prefer icon-only buttons with a tooltip; primary actions keep their text. A
preference, not a retroactive rule (`components/heroui-mapping.md`).

## 2. Semantic colors, never raw values

Pass `color="accent" | "success" | "warning" | "danger" | "default"` to HeroUI components; use
semantic utilities (`text-warning`) elsewhere. No hex or oklch in components; the nivo chart palette
is the only literal-hex exception. Reuse the helper that owns a mapping (level, domain, `estado`)
instead of re-deriving it. Port Legacy's intent, never its colors. Primary action = `accent`, one per
cluster; secondary for the paired counterpart or an undo.

## 3. Chips are soft

Every chip is `variant="soft"`, `size="sm"`, semantic `color`, no border. An icon only when it
carries meaning, with `Chip.Label`. Other variants move to `soft` when their file is next touched.

## 4. Loading, empty and error are exclusive

| State | Render |
|---|---|
| Unresolved, nothing loaded | Skeleton mirroring the content's shape, in `role="status"` with `aria-live="polite"` and `aria-labelledby` an `sr-only` label |
| Refetching with rows on screen | The rows, `aria-busy`, a discreet hint |
| Resolved empty | An empty-state kind (below) |
| Failed | The surface's `Alert` |

The placeholder replaces the content; gate content on the request, not on `rows.length`. Every
loading test asserts the negative (real rows absent while loading). Table placeholders are a plain
`<table>`, never rows inside a React Aria `Table`.

## 5. Empty-state kinds

| Kind | When | Art | Action |
|---|---|---|---|
| `first-run` | Nothing exists yet | mascot | primary, creates the first thing |
| `waiting-on-step` | An earlier step has produced nothing | mascot, smaller | primary, opens that step |
| `filtered` | Search or filters hide every row | icon | secondary "Clear", only if a reset exists |
| `caught-up` | Empty means done | success icon | usually none |
| `awaiting-selection` | Detail pane before a pick | `AwaitingSelectionPane` | none |

`size` is placement (`card`, `section`, `row`); the art size follows the container. One alignment
axis: art left, copy left-aligned. **At most one mascot per screen**; rows always use an icon. Copy
never repeats the chrome, and the action is the real next step through a callback the surface
already has.

## 6. Mockups are faithful and priced

Mockups copy the real UI: real chips, labels and controls with their real meaning. Never invent a
case by copying badly; anything new is labelled as an improvement proposal. Price every behavior
change: `$` UI only · `$$` rewire an existing callback · `$$$` new logic (TDD + mutation) · `$$$$`
new contract (navigation, keyboard registry, Go/Wails).

## 7. Page chrome

Every screen titles itself with `shared/ui/PageHeader`: title, optional adornment chip, actions
on the right, and no subtitle. Section tabs go under the title and are as wide as their labels
(`w-fit max-w-full whitespace-nowrap`), and a filter bar's search field takes the free width; a tab panel repeats no heading of its own (`foundations/layout.md`).

## 8. UI changes update existing tests

A UI change tightens the test that already covers that element; it never adds a new `it`. A new
test is only for genuinely new functionality. Pure class or layout tweaks need no new case at all.

## 9. Prove layout in a browser

jsdom has no layout engine. Layout claims go through `bun --cwd="frontend" run layout:smoke`
(fixtures in `frontend/scripts/layout-fixtures/`); render claims through `render:smoke`.

## Read next

- `docs/design/README.md` — the index, naming convention and how to add to the design system.
- `docs/design/foundations/color-tokens.md` — semantic tokens, level/domain/`estado` maps, brand and action hierarchy.
- `docs/design/foundations/chart-palette.md` — literal hex for `@nivo/bar` charts.
- `docs/design/foundations/typography.md` — `Typography`, text color, hidden-text naming.
- `docs/design/foundations/layout.md` — containment, filling height, masonry-lite, split panels, cover slots.
- `docs/design/components/heroui-mapping.md` — the full "what to reach for" table, stack, toasts.
- `docs/design/components/tables.md` — `Table` width, scrolling and stick-to-bottom.
- `docs/design/components/chips.md` — chip rules and examples.
- `docs/design/components/airis-empty-state.md` — `AirisEmptyState` API, sizes, container sizing.
- `docs/design/components/awaiting-selection-pane.md` — the pane before a selection, and where it is used.
- `docs/design/patterns/loading-empty-error.md` — the states in full: status region, skeletons, debounce, tests.
- `docs/design/patterns/empty-states.md` — choosing a kind, copy, actions, the mascot catalog and adding a pose.
- `docs/design/patterns/lists.md` — progressive windows (static vs live) and status columns.
- `docs/design/process/mockup-fidelity-and-pricing.md` — drawing and pricing a proposal.
- `docs/design/process/verifying-design-claims.md` — layout fixtures, smoke runs, jsdom testing notes.
- `docs/design/process/changelog.md` — why each rule exists.
- `docs/design/airis/character.md` — the Airis character contract for new artwork.

## Keeping it alive

A new convention goes into `docs/design/` first. Add a line here only if every UI change must know
it; keep this file and `.agents/skills/autoreas-theme/SKILL.md` byte-identical, bump `version`, and
log the change in `docs/design/process/changelog.md`.
