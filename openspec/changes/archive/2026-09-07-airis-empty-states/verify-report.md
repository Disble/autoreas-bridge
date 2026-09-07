# Verify Report — Airis Empty States

### Verdict

PASS

Verified by the orchestrating agent directly, not delegated (CLAUDE.md #3). Covers all four
planned work units: 1 (assets and shared shell, implemented in a previous session), 2 (async
error lifecycle), 3 (Today, Editor Library and Catalog surface states), 4 (routing, layout
fixture and release proof).

## Spec coverage

| Requirement | Where it is proved |
|---|---|
| Surface-specific Airis presentation — three distinct 512×512 transparent WebP | `scripts/check-airis-assets.mjs` (ffprobe codec + exact dimensions, `ffmpeg -vf alphaextract` for real alpha, cross-asset distinctness) and the layout fixture's decoded `naturalWidth`/`naturalHeight` |
| Asset is decorative and sized predictably | `AirisEmptyState.test.tsx` pins `alt=""`, `aria-hidden`, `width`/`height` 512, `loading=eager`, `decoding=async` |
| Empty-state exclusivity — never during loading or error | `EpisodeSchedulePanel.test.tsx` (loading and rejection cases), `AnimeEditorListPanel.test.tsx` (unresolved list), `CatalogPanel.test.tsx` (loading, error, and the list-visibility table) |
| Resolved non-empty takes precedence | `EpisodeSchedulePanel resolved-non-empty precedence`, `CatalogPanel list visibility`, and the visible-rows classifier cases |
| Supplied action has a discoverable name | Every empty-state test queries `getByRole('button', { name: 'Create an anime' })` or `'Clear search and filters'` verbatim; both names come from one shared constant |
| Today resolved-empty guidance names the day or lens, reaches `/editor/create`, keeps controls | `EpisodeSchedulePanel resolved-empty guidance` (four cases) plus `getEpisodeEmptyStateCopy` unit tests |
| Library empty-state truth and recovery | `classifyAnimeEditorEmptyState` unit tests (nine cases, including "no active criteria does not imply criteria-empty") and `AnimeEditorListPanel.test.tsx` (five cases) |
| Catalog empty-state truth and recovery | `classifyCatalogEmptyState` unit tests (per-filter table, whitespace query, error-before-classification) and `CatalogPanel.test.tsx` |
| Static `/editor/create` resolves before `/editor/:id` | `App.test.tsx` (both editor route cases), `AnimeEditorRoute.test.tsx` (initial tab), the source-order guard in `overview-surface-routing.test.ts`, and the `/#/editor/create` render-smoke marker |

## Gates (run by the orchestrator, actual output)

| Gate | Result |
|---|---|
| `bun --cwd=frontend run test` | 267 files / **2417 tests** passed (2395 before the change) |
| `bun --cwd=frontend run typecheck` | Clean |
| `bunx eslint <staged>` | 0 problems. Thirteen pre-existing JSDoc gaps in touched files were paid off, per the incremental policy in CLAUDE.md #6 |
| `bun --cwd=frontend run audit` | Only pre-existing findings remain: one `features/episodes` to `features/season` boundary violation and 54 duplicate clone groups, none introduced here. Two findings this change did raise were fixed: an unused-file report on the asset-checker test and an unused export of `hasActiveCatalogCriteria` |
| `fallow audit --gate` (changed code, via `dharness check`) | Clean. See "Complexity paid down" below for the five findings it raised and how each was closed |
| `bun --cwd=frontend run check:airis-assets` | "Validated 3 transparent 512x512 WebP Airis assets." |
| `bun --cwd=frontend run layout:smoke` | "every fixture lays out correctly at 1280x900 and 1600x1000" — 12 new checks, one verdict per composition |
| `bun --cwd=frontend run render:smoke` | Green on all six routes, `/#/editor/create` included |
| `bun --cwd=frontend run test:mutation:staged` | **83.57** against a break threshold of 80 (85.15 on the first run, 87.33 after survivors were addressed, 83.57 once the complexity refactors below widened the staged surface) |
| `lefthook run pre-commit` | **Green, exit 0** — all four groups: `quick`, `dharness`, `frontend-heavy`, and every Go job correctly skipped |

Every Go job skipped: this change stages no `.go` file.

## MUTATE step (CLAUDE.md #16)

The first staged Stryker run scored 85.15 and left observable survivors in the new code.
Each was closed with a test rather than tolerated:

| Survivor | Test that now kills it |
|---|---|
| Each filter operand in `hasActiveCatalogCriteria` | `classifyCatalogEmptyState criteria detection` — one case per filter field, plus a whitespace-only query |
| The visible-rows guard in the Library classifier | `classifyAnimeEditorEmptyState with visible rows` — visible rows under active criteria |
| The season-lens description string | `getEpisodeEmptyStateCopy` unit tests assert both title and description as literals |
| The zero-rows guard in the Today panel | `resolved-non-empty precedence` asserts no artwork and no action once rows arrive |
| The Today loading flag's initial value | `pre-selection loading` observes it before the season probe picks a day |
| The Catalog list-render condition | `CatalogPanel list visibility` — a four-case table plus the positive case |
| The Catalog Create action's navigation | A route-probe test replacing the mocked assertion |
| Library tab default | `AnimeEditorRoute` now asserts `aria-selected` rather than mere presence |

Three survivors remain in the changed code and are equivalent mutants, not gaps:
`useCallback` dependency arrays in `use-anime-editor-list.ts` and `use-catalog-panel.ts`
(replacing `[]` with a non-empty array changes nothing observable), and the `initialTab`
default in `AnimeEditorRoute.tsx`, where React Aria selects the first tab for any unmatched
`defaultSelectedKey`, so both values render the same Library tab.

## Complexity paid down

`dharness check` runs `fallow audit` scoped to the changed code, and it does not care that a
function was already complicated — touching it makes the finding new. Five fired, and all
five were closed by extracting rather than suppressing. Nothing was silenced with
`fallow-ignore`.

| Finding | Resolution |
|---|---|
| `useCatalogPanel` cognitive 19, plus one clone group of six lines at three instances | `use-catalog-filters.ts`: one generic field setter behind seven one-line control callbacks and the reset. The clone was those seven setters written out longhand |
| `useEpisodeSchedulePanel` cognitive 30 over 233 lines, 29 hooks | Decomposed into `use-episode-schedule-request.ts` (selection, request, resolution), `use-episode-day-counts.ts`, `use-episode-covers.ts`, `use-episode-desktop-actions.ts` and `use-episode-progress-commands.ts`. The panel hook is now a composition, matching `useAnimeEditorWorkspace`. It no longer appears in `fallow health` at all |
| `validateAssetDetails` CRAP 30 | Three named predicates behind one ordered contract list |
| `measureComposition` CRAP 182, then 72, then 30 | Split into `checkTheDecode`, `checkTheBox`, `isInside`, `queryCard`, `queryImage`, `hasDecodedImage` and `presence` |

No behavior changed in any of it: the same 100 episode tests and 70 catalog tests pass before
and after, and the layout smoke still reports all twelve checks at both viewports.

## Runtime validation beyond the gate (CLAUDE.md 18b)

| Check | Result |
|---|---|
| `bun --cwd=frontend run build` | 1,468.29 kB bundle / 446.23 kB gzip in 714 ms; all three WebP assets emitted |
| `wails build` | `build/bin/autoreas-bridge.exe`, 21 MB, in 18.3 s (re-run after the complexity refactors). Bindings regenerated and `frontend/wailsjs/` stayed clean |
| Dev server (`vite`, 5173) plus headless Edge `--dump-dom` | `/#/today` (502 KB), `/#/editor` (507 KB), `/#/editor/create` (514 KB) and `/#/catalog` (512 KB) all paint a populated `#root` |
| Dev server, new empty states | `/#/today` renders "Nothing scheduled for Monday" with **Create an anime**; `/#/editor` renders "Your library is empty" with **Create an anime**; `/#/catalog` renders "Your catalog is empty" with **Create an anime**; `/#/editor/create` renders the Create workspace |

One measurement needs its caveat recorded: at `--virtual-time-budget=8000` the Today route
still showed "Loading the schedule...". That is the harness, not the app — `waitForBindings`
gives the runtime 5 s and headless virtual time does not advance its wall-clock deadline in
step with the budget. At 30 s the route resolves to the Airis state, which is the value in
the table above.

## Drift recorded (CLAUDE.md #2)

`dharness/folder-ownership` was set to `error` in `frontend/doctor.config.json` while
`.dharness/eslint.config.js` had it `off`. The rule requires an `index.ts` barrel for any
module split into role files, which ADR-011 forbids, so it can never pass in this repository:
eight modules would fail it today. It had gone unnoticed because the `dharness` job lints
staged files only, and this is the first change to stage one of them
(`shared/hooks/use-async-list/use-async-list.ts`, whose folder and split both predate it).
The config is now `off` in both hosts and the reasoning is appended to
`docs/adr/011-no-barrel-files.md`. No other dharness rule was touched.

## Deviation from the recorded delivery plan

The stored preference was a `feature-branch-chain` with each work unit as its own local
commit. All four units ship in **one** commit instead, because unit 1 cannot pass the gate
alone: `fallow audit` reports an exported symbol whose only consumer is its own test as
unused, so a commit holding the shared `AirisEmptyState` before any feature renders it fails
for dead code. The units remain the review and rollback boundaries recorded in `tasks.md`.
