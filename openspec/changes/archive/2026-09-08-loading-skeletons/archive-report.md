# Archive Report: Loading Skeletons

**Date:** 2026-09-08
**Branch:** `dev`
**Commit:** `dddcf35` (full pre-commit gate passed, exit 0)
**Status:** Complete — implemented, verified, and committed

## Executive Summary

Today, the Editor Library and Catalog answered an unresolved request with a sentence. They now draw
placeholder rows shaped like the rows about to arrive, announce themselves through a `role="status"`
live region, and are measured in a real browser against the row each one stands in for. All fifteen
tasks across four phases are delivered; the gate passes; the staged mutation score is 83.67 against a
threshold of 80.

## Change Closure

### Scope Delivered

- **Catalog:** `CatalogListRow` extracted from inline JSX, `CatalogListSkeleton` mirroring it through a
  shared row class, the `<Spinner>` and its sentence removed and replaced by a named status region.
- **Editor Library:** `AnimeEditorListRow` extracted, `AnimeEditorListSkeleton` sharing its `min-h-14`
  geometry.
- **Today:** `EpisodeScheduleSkeleton` mirroring `EpisodeScheduleCard` — cover slot, title and chip
  bars, action affordances — sharing its `min-h-24` geometry. No extraction needed; the card was
  already a component.
- **Layout proof:** `loading-skeletons-fixture.tsx` renders each placeholder beside its real row and
  fails on a height drift beyond 6px.

### Measured Results

| Check | Result |
|---|---|
| `bun --cwd=frontend run test` | 267 files / 2425 tests (2417 before) |
| `bun --cwd=frontend run typecheck` | Clean |
| `bunx eslint <staged>` | 0 problems |
| `fallow audit --gate new-only` | exit 0 |
| `bun --cwd=frontend run layout:smoke` | Green at both viewports, 9 new checks |
| `bun --cwd=frontend run render:smoke` | Green, 6 routes |
| `bun --cwd=frontend run test:mutation:staged` | 83.67 (threshold 80) |
| `lefthook run pre-commit` | exit 0 |

### Spec Deltas Merged

| Delta | Destination |
|---|---|
| `loading-skeletons` (new capability) | `openspec/specs/loading-skeletons/spec.md` |

No existing capability spec changed. The empty-state requirements added by `airis-empty-states` on
these same three panels already say that loading feedback remains visible while unresolved, and a
placeholder is that feedback.

## Decisions Worth Carrying Forward

- **`role="status"` does not take its name from its contents.** The design's first status-region
  snippet wrapped an `sr-only` label and computed an accessible name of `""`; ARIA's
  name-from-content allowlist does not include `status`. The fix is `aria-labelledby` pointing at that
  span, which keeps the text a live region can announce *and* gives the region a name. The RED test
  caught it. `design.md` was corrected at the source.
- **HeroUI `Spinner` already ships `role="status"` and `aria-label="Loading"`.** Catalog was the most
  accessible of the three surfaces before this change, not the least. Verified in the installed
  package; the exploration had flagged it as unverifiable because it looked for `node_modules` at the
  repository root rather than under `frontend/`.
- **A gate is not accepted until it has been shown to fail.** Raising one placeholder bar by 8px
  produced a 28px drift and a red run; reverting restored green. The previous change shipped a layout
  fixture that could not fail on the defect it existed to catch, and that is the habit this step
  replaces.
- **`git diff --quiet` does not prove an edit applied to an untracked file.** It compares against the
  index, so a new file always reports clean. During the deliberate-break step it claimed the mutation
  had not applied while the measurement proved it had.

## Follow-ups Not Taken Here

- `AnimeDetail`, `SoloAnimeDownloadPanel` and `SyncingAnimePanel` still show text loading states.
- `ActivityOverview`, `NetworkPanel` and `TransactionPanel` need skeleton `Table.Row`s and a redesign
  of the `isLoading ? LOADING : EMPTY` helper feeding `renderEmptyState`.
- The seven near-identical `<section aria-label="Loading X"><Skeleton/></section>` sites are genuine
  three-times duplication and could become a small shared `LoadingBars`.
- Those seven also rely on a static `aria-label` on a landmark rather than a live region, so they have
  the announcement gap this change closed on its three surfaces.
