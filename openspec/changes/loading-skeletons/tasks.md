# Tasks: Loading Skeletons

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 550–700 authored lines |
| 400-line budget risk | Moderate |
| Chained PRs recommended | No |
| Delivery strategy | one local commit |
| Chain strategy | feature-branch-chain (local commits, no pull requests) |

Decision needed before apply: Resolved
Chain strategy: feature-branch-chain, delivered as one local commit

### Chain-strategy decision

Same strategy as the archived `airis-empty-states` change, and the same reason for one commit rather
than four: a commit holding a skeleton component before its panel renders it fails `fallow audit` as
dead code. The work units below stay the review and rollback boundaries.

### Work Units

| Unit | Goal, acceptance, rejection, forbidden behavior | Focused test command | Rollback boundary |
|---|---|---|---|
| 1 | Catalog. Accept a shape-mirroring placeholder and a named status region. Reject losing the spinner's `role="status"`. Forbid state or data access in the extracted row. | `bun --cwd=frontend run test -- CatalogPanel` | `features/catalog/ui/CatalogPanel/` |
| 2 | Editor Library. Accept an extracted rail row and a placeholder sharing its shape class. Reject a placeholder that renders once. | `bun --cwd=frontend run test -- AnimeEditorList` | `features/anime-editor/ui/AnimeEditorWorkspace/` |
| 3 | Today. Accept a card-shaped placeholder mirroring `EpisodeScheduleCard`. Reject any surviving loading sentence as the only feedback. | `bun --cwd=frontend run test -- EpisodeSchedulePanel` | `features/episodes/ui/EpisodeSchedulePanel/` |
| 4 | Layout proof. Accept a measured height match against each real row at both viewports. Reject a tolerance wide enough to hide a shifted row. | `bun --cwd=frontend run layout:smoke` | `scripts/layout-fixtures/` |

## Phase 1: Catalog

- [x] 1.1 RED: rewrite `CatalogPanel.test.tsx`'s loading assertion as `getByRole('status', { name: 'Loading animes...' })`; add a placeholder-count test and a "no status region once resolved" test.
- [x] 1.2 Extract `CatalogListRow.tsx` from the panel's inline `<li>` JSX, with the row-shape class hoisted into `catalog-panel.constants.ts` as `CATALOG_LIST_ROW_CLASS`.
- [x] 1.3 GREEN: add `CatalogListSkeleton.tsx` reusing `CATALOG_LIST_ROW_CLASS`; render it from the loading branch inside the status region; delete the `Spinner` and its span.

## Phase 2: Editor Library

- [x] 2.1 RED: rewrite `AnimeEditorListPanel.test.tsx`'s loading assertion as a role-and-name query; add placeholder-count and resolved-branch tests.
- [x] 2.2 Extract `AnimeEditorListRow.tsx` from the panel's inline `<Button>` JSX, hoisting the row-shape class into `anime-editor-workspace.constants.ts`.
- [x] 2.3 GREEN: add `AnimeEditorListSkeleton.tsx` reusing that class; render it from the loading branch inside the status region.

## Phase 3: Today

- [x] 3.1 RED: rewrite the two `EpisodeSchedulePanel.test.tsx` loading assertions as role-and-name queries; add placeholder-count and resolved/error-branch tests.
- [x] 3.2 GREEN: add `EpisodeScheduleSkeleton.tsx` mirroring `EpisodeScheduleCard` — cover block, title and chip bars, action bars — sharing the card's `min-h-24` geometry; render it from the loading branch inside the status region.

## Phase 4: Layout proof and verification

- [x] 4.1 Add `scripts/layout-fixtures/loading-skeletons-fixture.tsx`: render each skeleton row beside its real row at one container width, and report per surface whether the heights match within tolerance, plus that the placeholder block is taller than a single row.
- [x] 4.2 Register the fixture in `scripts/layout-fixtures/main.tsx` and confirm it FAILS if a skeleton row's height is deliberately changed, before accepting it as green.
- [x] 4.3 Run focused tests, `typecheck`, staged `lint`, `check:airis-assets`, `layout:smoke`, `render:smoke`, and the changed-code `fallow audit` through `dharness check`.
- [x] 4.4 Stage the change and run `bun --cwd=frontend run test:mutation:staged`; resolve observable survivors in the new row-count and branch logic.
- [x] 4.5 Set `.atl/active-sdd-change` to `loading-skeletons`, write `verify-report.md` as the orchestrating agent, then run the full `lefthook run pre-commit` gate and commit.
