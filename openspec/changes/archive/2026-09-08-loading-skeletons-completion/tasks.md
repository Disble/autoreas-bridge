# Tasks: Loading Skeletons Completion

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900–1,100 authored lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | one local commit |
| Chain strategy | feature-branch-chain (local commits, no pull requests) |

Decision needed before apply: Resolved
Chain strategy: feature-branch-chain, delivered as one local commit

### Chain-strategy decision

Same as the two preceding changes, and the same reason: `fallow audit` reports a component whose only
consumer is its own test as dead code, so `LoadingBars` cannot be committed before its adopters. The
work units below remain the review and rollback boundaries.

### Work Units

| Unit | Goal, acceptance, rejection, forbidden behavior | Focused test command | Rollback boundary |
|---|---|---|---|
| 1 | Shared bars. Accept one component owning the status region, adopted by eight surfaces. Reject any adopter still hand-rolling bars or relying on a section `aria-label`. | `bun --cwd=frontend run test -- LoadingBars HistoryTable` | `shared/ui/LoadingBars/` + adopters |
| 2 | Text surfaces. Accept shape-mirroring placeholders on AnimeDetail, SoloAnimeDownloadPanel and SyncingAnimePanel. Reject any surviving sentence or lone spinner. | `bun --cwd=frontend run test -- AnimeDetail SoloAnimeDownload SyncingAnime` | those three feature folders |
| 3 | Tables. Accept skeleton rows that keep the header, plus `aria-busy` and an adjacent status region. Reject replacing the table wholesale. | `bun --cwd=frontend run test -- NetworkTable TransactionTable ActivityOverview` | `features/network/ui/` |
| 4 | Rule and proof. Accept a mandatory skill section naming both components and the exact markup, and a measured table-row height match. Reject a rule stated without the markup to copy. | `bun --cwd=frontend run layout:smoke` | skill + `scripts/layout-fixtures/` |

## Phase 1: Shared bar placeholder

- [x] 1.1 RED: `shared/ui/LoadingBars/__tests__/LoadingBars.test.tsx` — renders `count` bars, exposes `getByRole('status', { name: label })`, forwards `className`.
- [x] 1.2 GREEN: create `LoadingBars.tsx` and `loading-bars.types.ts` with readonly props and JSDoc.
- [x] 1.3 Adopt in `HosterPriorityEditor`, `RunHistoryPanel`, `EpisodeRenamePanel`, `SchedulePanel`, `JDLimitsPanel`, `JDConfigPanel`, `SeasonWorkspace` — deleting the hand-rolled bars and the `aria-label`-only `<section>`.
- [x] 1.4 Adopt in `HistoryTable`, moving its visible label into the region; rewrite its loading assertion as a role-and-name query.

## Phase 2: The surfaces still showing text

- [x] 2.1 RED then GREEN: `AnimeDetailSkeleton` mirroring the hero, tiles and field groups; replaces the loading paragraph.
- [x] 2.2 RED then GREEN: `SoloAnimeDownloadSkeleton` mirroring the readiness rail rows; replaces the spinner and sentence.
- [x] 2.3 RED then GREEN: `SyncingAnimeSkeleton` mirroring the two-column card grid; replaces the spinner and sentence.

## Phase 3: The tables

- [x] 3.1 RED: assert per table that the header is present while loading, the table is `aria-busy`, an adjacent `role="status"` names the load, and placeholder rows are present.
- [x] 3.2 GREEN: skeleton `Table.Row`s in `NetworkTable`, `TransactionTable` and both `ActivityOverview` tables.
- [x] 3.3 Stop the `isLoading ? LOADING : EMPTY` helpers conflating the two states; `renderEmptyState` now returns only the empty message. Update their helper tests.

## Phase 4: The rule and the proof

- [x] 4.1 Add a mandatory loading-state section to `.claude/skills/autoreas-theme/SKILL.md`: `AirisEmptyState` for resolved-empty, a shape-mirroring skeleton or `LoadingBars` for unresolved, the exact status-region markup, and why `aria-labelledby` is required.
- [x] 4.2 Extend the layout fixture with a table-row comparison; confirm it FAILS on a deliberately wrong row height before accepting it green.
- [x] 4.3 Sweep: `grep` for remaining loading sentences and `aria-label="Loading` sections; confirm none render as the only feedback.
- [x] 4.4 Run focused tests, `typecheck`, staged `lint`, `layout:smoke`, `render:smoke`, and `dharness check`.
- [x] 4.5 Stage and run `test:mutation:staged`; resolve observable survivors.
- [x] 4.6 Write `verify-report.md` as the orchestrating agent, run the full gate, commit, then archive.
