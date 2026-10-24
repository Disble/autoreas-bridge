# Bridge design system

This folder is the detailed design system of the Bridge frontend (`frontend/src`). The
`autoreas-theme` skill (`.claude/skills/autoreas-theme/SKILL.md`, mirrored byte for byte in
`.agents/skills/autoreas-theme/SKILL.md`) carries only the fundamentals and links here for
everything else. When the two disagree, the code wins; fix the document in the same unit.

## File map

| Path | Read it when |
|---|---|
| `foundations/color-tokens.md` | Choosing a color: semantic tokens, log level and runtime domain maps, anime `estado` labels and colors, brand and action hierarchy |
| `foundations/chart-palette.md` | Drawing a chart with `@nivo/bar`, which needs literal hex values |
| `foundations/typography.md` | Rendering text with `Typography`, or coloring text |
| `foundations/layout.md` | A card widens the page, leaves dead space, or packs variable-height cards; cover slots; split panels |
| `foundations/iconography.md` | Adding an icon or an icon-only button: the Solar set and its variants, the action-to-icon vocabulary, action-group order |
| `components/heroui-mapping.md` | Before writing any element: which HeroUI v3 primitive to use, the stack, toasts |
| `components/tables.md` | Sizing, scrolling or sticking a HeroUI `Table` to the bottom |
| `components/chips.md` | Rendering a tag, badge or status chip |
| `components/airis-empty-state.md` | Using `AirisEmptyState`: kinds, sizes, container sizing, actions |
| `components/lookup-modal.md` | Building a search-and-pick modal on the shared `LookupModal` parts |
| `components/awaiting-selection-pane.md` | A master/detail pane before a row is selected |
| `patterns/loading-empty-error.md` | Any surface that loads data: the exclusive states, the status region, skeletons, debounce, tests |
| `patterns/empty-states.md` | Deciding which kind of emptiness a surface shows, its copy and action, and the mascot catalog |
| `patterns/lists.md` | A list that may reach 100 rows, or a status column in a row |
| `patterns/activity-change-lines.md` | Showing a recorded change (episode, state, season grade) on any Activity surface |
| `airis/splash-screen.md` | Changing the loading splash in `index.html` or regenerating its sprite |
| `process/mockup-fidelity-and-pricing.md` | Drawing a mockup or proposing a UI change |
| `process/verifying-design-claims.md` | Proving a layout or render claim: layout fixtures, `layout:smoke`, `render:smoke`, jsdom testing notes |
| `process/changelog.md` | Why a rule exists; the history of the design system |

Related documents kept where they are:

- `airis/character.md` and `airis/turnaround.webp` — the Airis character contract for new or redrawn mascot artwork.
- `download-watcher-unified-phases.md` — the download watcher phase design (backend, referenced from `internal/download`).

## Rules that live elsewhere

These are enforced by `CLAUDE.md` and its linters; they are restated here only so a design reader
meets them:

- `.tsx` files under `features/` are dumb UI: no Wails calls, no effects, no business logic. Logic
  lives in `use-*.ts` hooks and pure `*.helpers.ts`.
- Every `*Props` property is `readonly`; `App.tsx` and `app/**` only compose.
- Helpers and hooks are test-first, colocated in `__tests__/`. Files stay at or below 500 effective
  lines.

## Naming and structure

- One topic per file, kebab-case filenames, grouped in four folders:
  - `foundations/` — values that everything else uses (color, type, space and layout mechanics).
  - `components/` — one shared component or HeroUI primitive family per file.
  - `patterns/` — rules that combine components across surfaces.
  - `process/` — how designs are proposed, priced and verified.
- Keep each file focused and under about 300 lines; split by topic rather than growing one file.
- Describe techniques by content shape, not by which screen uses them today; screens churn, patterns
  do not. Name a screen only as evidence or as a reference implementation.
- Every measured number names how it was measured. A claim about code names the file it lives in.

## Adding to the design system

1. Put the detail in the right folder here, or add a new kebab-case file and list it in the file map.
2. If the change is fundamental (a rule every UI change must know), add one line to the skill and
   keep the skill's "Read next" list in sync with the file map above.
3. Keep `.claude/skills/autoreas-theme/SKILL.md` and `.agents/skills/autoreas-theme/SKILL.md`
   identical (`cmp` them) and bump the skill version.
4. Add an entry to `process/changelog.md` saying what changed and why.
5. Source JSDoc may cite these paths (for example `docs/design/patterns/empty-states.md`); renaming
   or moving a file means updating those citations in the same unit.
