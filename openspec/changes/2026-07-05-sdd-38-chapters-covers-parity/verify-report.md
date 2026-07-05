# Verify Report — SDD-38 chapters-covers-parity

- Date: 2026-07-05
- Verifier: orchestrating agent (per project rule 3 — final verification NOT delegated to a subagent)
- Result: **PASS** (no CRITICAL, no WARNING; 1 SUGGESTION)

## Gates (all run by the orchestrator on the final tree)

| Gate | Result |
| --- | --- |
| `go test ./...` | PASS (all packages, incl. new `internal/anime/cover`) |
| `go vet ./...` | PASS |
| `gofmt -l .` | clean |
| `go run ./tools/checkgofilesize` | PASS — warnings only (6 files 412–491 effective lines, all pre-existing or test files; none over 500; `baseline.yaml` still empty) |
| `bun --cwd=frontend run test` | PASS — 66 files / 617 tests (605 → 617) |
| `bun --cwd=frontend run validate` (eslint + tsc) | PASS — 0 errors, 19 pre-existing advisory warnings |
| `bun --cwd=frontend run filesize:warning` | none |

## Spec conformance (code inspected directly)

- **Deterministic placeholder-first resolution** — `internal/anime/cover/resolver.go`: `Classify` maps `''`/`'null'` → absent; local paths read live and never cached; URL cache hit returns without network; fetch failure and guardrail rejection (non-image MIME, oversize) return the placeholder signal without cache poisoning; `Result` never carries an error to the caller. Cache adapter uses sha256 keys + atomic rename under `os.UserCacheDir()/autoreas-bridge/covers/` with graceful degradation.
- **Contract swap** — `ChapterScheduleItem` now carries `FolderPath`/`PageURL`/`HasCover`; `hasPage`/`hasFolder` removed from the wire, presence re-derived in the row helper (per orchestrator amendment).
- **Hover swap without truncation** — `chapter-schedule-panel.helpers.ts` computes `totalcap - nrocapvisto` directly (10.5/28 → "17.5 remaining", test-locked); `ChapterScheduleCard.tsx` renders both spans with `group-hover:hidden`/`group-hover:inline` (CSS-only, dumb component).
- **Action hierarchy** — minus `variant="danger"`, plus `variant="primary"`, folder/link `tertiary`, status trigger `secondary`; user's uncommitted icon choices (`add-circle-broken`, `minus-circle-broken`, `menu-dots-bold`) preserved in the extracted card.
- **Real-path tooltips** — `Tooltip.Content` renders literal `row.pageUrl` / `row.folderPath`.
- **Day badges** — `dayBadge` helper returns `undefined` at 0 (no badge rendered), `Chip size="sm" variant="soft"` inside each day `ToggleButton`; Go aggregate `ListChapterDayCounts` counts `estado > 0 AND Activo != 0` (amended spec: badge population = visible-list population; data audit 2026-07-05: 795/795 fixture records carry explicit `activo`).
- **Shared placeholder** — `AnimeCoverPlaceholder` promoted to `frontend/src/shared/ui/`; anime-detail imports updated, its tests unchanged and green.
- **English UI copy** — all new strings English ("N remaining", "N watched", tooltips, aria-labels).

## Deviations recorded (accepted)

1. Day-count active predicate uses `Activo != 0` instead of Legacy's tri-state "active-or-absent" (spec amended; engram decision #4643).
2. Cover cache filename is `sha256(sourceURL).img` without the anime-ID prefix design.md sketched — functionally equivalent, port signature locked in Slice 1 (apply-progress note).
3. Design's same-file `CoverSlot` sub-component was inlined into `ChapterScheduleCard` JSX due to a real bug in `frontend/eslint/architecture-rules.js` colocation exemption (discovery saved to engram; lint-rule fix is follow-up work, out of scope).

## Suggestion (non-blocking)

- `internal/anime/chapter_service.go` sits at 448 effective lines (warning band). Next chapters change should extract before it approaches 500.
