# Archive Report: Airis Empty States

**Date:** 2026-09-07
**Branch:** `dev`
**Commit:** `fbab6a9` (full pre-commit gate passed, exit 0)
**Status:** Complete — implemented, verified, and committed

## Executive Summary

Today, the Editor Library and Catalog each rendered a bare line of text when a request came
back with nothing, and none of them distinguished an empty collection from a filtered-down
one or from a request that had never resolved. Today was the worst case: it showed its empty
message before any request had been made, so an unresolved board invited the user to create
anime they already had.

Every scoped surface now classifies its own resolved-empty result and offers the single
recovery that fits it, on a shared accessible shell with surface-specific artwork. All
fifteen tasks across three phases are delivered; the full gate passes; the staged mutation
score is 83.57 against a break threshold of 80.

## Change Closure

### Scope Delivered

- **Phase 1 — assets and shared shell:** three distinct transparent 512×512 WebP
  compositions, a presentation-only `AirisEmptyState` (HeroUI `Card`, `Typography`, optional
  primary `Button`, decorative native image), and `scripts/check-airis-assets.mjs`, which
  fails a wrong codec, wrong dimensions or fully opaque alpha.
- **Phase 2 — error lifecycle and feature states:** an additive `error` on `useAsyncList`
  cleared at every request start and success; Today's loading flag, contextual day/lens copy
  and Create action; the Editor Library's actual/criteria classification with exclusive
  recovery actions; Catalog's rejection-before-classification and full default reset.
- **Phase 3 — routing, layout and verification:** a static `/editor/create` route resolved
  before `/editor/:id`, `AnimeEditorRoute` keyed by its requested tab so an already-mounted
  `/editor` remounts on Create, a real-browser layout fixture measuring all three
  compositions at both viewports, and a `/#/editor/create` render-smoke marker.

### Measured Results

**Gate status:** `lefthook run pre-commit` exit 0 — `quick`, `dharness` and `frontend-heavy`
all green; every Go job correctly skipped for a frontend-only change.

| Check | Result |
|---|---|
| `bun --cwd=frontend run test` | 267 files / 2417 tests (2395 before) |
| `bun --cwd=frontend run typecheck` | Clean |
| `bunx eslint <staged>` | 0 problems |
| `dharness check` (react-doctor + fallow changed-code audit) | Clean |
| `bun --cwd=frontend run check:airis-assets` | 3 assets validated |
| `bun --cwd=frontend run layout:smoke` | 12 new checks green at 1280×900 and 1600×1000 |
| `bun --cwd=frontend run render:smoke` | 6 routes green |
| `bun --cwd=frontend run test:mutation:staged` | 83.57 (threshold 80) |
| `bun --cwd=frontend run build` | 1,468.29 kB / 446.23 kB gzip |
| `wails build` | 21 MB binary, bindings clean |
| Dev server + headless Edge | All four affected routes paint their new state |

### Spec Deltas Merged

| Delta | Destination |
|---|---|
| `airis-empty-states` (new capability) | `openspec/specs/airis-empty-states/spec.md` |
| `anime-editor` — Library empty-state truth and recovery | appended to `openspec/specs/anime-editor/spec.md` |
| `catalog-lists-all` — Catalog empty-state truth and recovery | appended to `openspec/specs/catalog-lists-all/spec.md` |
| `desktop-navigation` — Default Landing and Route Redirects (MODIFIED) | rewritten in place, with the two new Create-route scenarios |

## Decisions Worth Carrying Forward

- **`dharness/folder-ownership` was drifted, not merely noisy.** It demanded the `index.ts`
  barrels ADR-011 forbids, was `off` in `.dharness/eslint.config.js` and `error` in
  `frontend/doctor.config.json`, and fired on the first change to stage one of the eight
  modules it would reject. Now `off` in both, with the reasoning appended to ADR-011.
- **The changed-code audit judges what you touch.** Adding a loading flag to
  `useEpisodeSchedulePanel` made its pre-existing complexity a finding this change owned.
  It was paid down by extraction — five focused hooks, plus `use-catalog-filters` — never by
  `fallow-ignore`. That hook no longer appears in `fallow health` at all.
- **Delivery deviated from the recorded plan, deliberately.** The stored preference was one
  local commit per work unit; all four ship in one, because a commit holding the shared
  `AirisEmptyState` before any feature renders it fails `fallow audit` as dead code. The
  units remain the review and rollback boundaries recorded in `tasks.md`.

## Follow-ups Not Taken Here

- Three equivalent Stryker mutants survive in the changed code (two `useCallback` dependency
  arrays and the `AnimeEditorRoute` tab default, where React Aria selects the first tab for
  any unmatched key). None is a coverage gap.
- The `features/episodes` → `features/season` boundary violation and the repository's 54
  duplicate clone groups are untouched pre-existing debt.
