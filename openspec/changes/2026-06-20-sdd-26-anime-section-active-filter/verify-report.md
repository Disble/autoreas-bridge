# Verify Report: Active-Only Syncing Anime + New Animes Section

**Change ID:** `2026-06-20-sdd-26-anime-section-active-filter`
**Date:** 2026-06-20
### Verdict

PASS WITH WARNINGS

## Summary

Implemented both requested features:
1. The Syncing Anime panel now filters to active-only animes at the backend.
2. Added a new top-level `/animes` route with `AnimePanel` that shows the full catalog and active/inactive status.

## Verification Results

| Check | Command | Result |
|---|---|---|
| Go build | `go build ./...` | PASS |
| Go tests | `go test ./...` | PASS |
| Frontend tests | `bun --cwd="frontend" run test` | PASS (201 tests) |
| Frontend lint | `bun --cwd="frontend" run lint` | PASS with warnings |
| Frontend typecheck | `bun --cwd="frontend" run typecheck` | PASS |
| Lefthook gate | `git commit` | PASS |

## Warnings

- `react-doctor` reports 4 warnings across `use-anime-panel.ts` and `use-syncing-anime-panel.ts`:
  - 2 `no-cascading-set-state` warnings for grouping `setIsLoading` + `setItems` in the same effect.
  - 2 `no-adjust-state-on-prop-change` warnings for deriving loading state on mount.
- These warnings match the existing pattern in `use-syncing-anime-panel.ts` and do not block the gate.

## Notes

- Wails bindings were regenerated with `wails generate module`.
- The AnimePanel UI uses a card list instead of `Table` because HeroUI v3 `Table` triggered React Aria collection errors in jsdom.
- The backend filter treats absent `activo` as inactive (`0`), consistent with `MobileAnime.Activo` mapping.
