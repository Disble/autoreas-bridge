# Verify Report — Notification Center (SDD-60)

### Verdict

PASS

Four documented gaps, none of them blocking archive: see §4. The verdict heading above is the exact
shape `tools/checksdd` parses (`verdictPattern`, `tools/checksdd/main.go:13`).

**Verified by the orchestrating agent directly** (CLAUDE.md #3 forbids delegating this phase), against the working tree at `6c6630d`.

Chain: 13 commits, `main..HEAD`, **175 files changed, 17 093 insertions, 3 742 deletions**.

## 1. Gates — run by me, not reported to me

| Gate | Result |
|---|---|
| `go test ./...` (`-count=1`, cache defeated) | **43 packages ok, 0 FAIL** |
| `scripts/lint.ps1 -Profile all` (the gate's real Go lint, stricter than bare `golangci-lint`) | **0 issues**, both profiles |
| `go vet`, `gofmt` | clean |
| `go run ./tools/checkgofilesize` | passes; `baseline.yaml` still `files: []` — no exception parked |
| `tsc --noEmit` | clean |
| `vitest run` (full frontend suite) | **1767 passed / 211 files** |
| `render:smoke` | passes, `/#/notifications` included in `ROUTE_MARKERS` |
| `dharness check` (react-doctor + fallow) | exit 0 |
| `test:mutation:staged` (Stryker) | passes threshold |
| Full pre-commit hook (`lefthook run pre-commit`) | green |

## 2. The claims this change was built on, checked against shipped code

| Claim | How it was checked | Result |
|---|---|---|
| A notification is persisted, then projected **unconditionally** — even when the write failed | `TestServiceNotifyPersistFailureStillDispatches` opens a schema-less SQLite DB to force a real write failure, then asserts the wrapped notifier was invoked exactly once. I read the implementation as well: `Notify` logs `persistErr` without returning and always calls `s.inner.Notify`. | **ok** |
| The four `"see run details"` bodies name their anime | `grep -rn "see run details" --include=*.go` excluding tests | **0 occurrences in production** |
| `internal/notification` gains no new import | `go list -deps ./internal/notification` | only `autoreas-bridge/internal/logger` |
| `center` never imports `internal/download` (the proven cycle) | boundary test | **ok** |
| `download.retry_run` is never registrable — it does not exist | dedicated test against live registry state | **ok** |
| No REST or mobile-sync surface is touched | `git diff main..HEAD -- docs/openapi.yaml openspec/specs/mobile-sync-contract/` | **empty diff — R-7 confirmed as a positive finding, not an omission** |

## 3. Scenario coverage

61 Given/When/Then scenarios across four capabilities, all cited to a task in `tasks.md`:

| Capability | Requirements | Scenarios |
|---|---|---|
| `notification-center` (new) | 10 | 34 |
| `notification-actions` (new) | 7 | 15 |
| `notifications` (modified) | 4 | 7 |
| `desktop-navigation` (modified) | 2 | 5 |

The `notifications` delta reconciles a spec that had been **unsatisfiable since it was written**: it required the toast surface to live in `frontend/src/app/**`, while `CLAUDE.md:43` forbids state or effect hooks anywhere in `frontend/src/app/**`. A toast surface needs a subscription effect. The delta replaces the path rule with three structural invariants the shipped re-export seam actually satisfies.

## 4. Gaps — none blocking, all deliberate

**1. Dismissal was designed and never built.** The lifecycle design treats dismissal as an axis *separate* from read — a record can be dismissed and still unread, which is why they were to carry separate timestamps. There is no `Dismiss` in Go, no `dismissed_at` column, and **no spec scenario requires one**. It was lost between the design canvas and the spec rather than dropped during implementation. Verify does not fail on it because nothing specifies it; it is recorded here so it is not rediscovered later as "this was designed, where is it?".

**2. Source and Level filter controls are absent from the UI.** The backend applies both — wired and tested in Slice 3b, with `TestListSourcesEmptySliceMatchesEverything` pinning that an empty filter means *no filter* rather than *no results*. The design canvas draws the two dropdowns, but no task creates them and no scenario requires them. Left out rather than half-built: an absent control is honest, a rendered control that does nothing is the exact failure this change exists to correct.

**3. `jdownloader_offline` and `season.anime_available` name their anime in body text, not as rows.** Slice 6a enriched both without the port extension, since `ManualLink` already carries the anime name. Upgrading them to full `Rows` is Slice 6b's task 6b.3, whose own wording is conditional and which no scenario forces.

**4. `NotificationRow.ActionCount` is always 0 in list rows.** The list query does not load per-row actions; `GetNotification` reports the real count. A test asserts the zero explicitly, so changing it must be deliberate.

## 5. Tooling defects found along the way

- **`tools/mutationstaged` hangs intermittently** — blew its own 10-minute `harnessTimeout` on slices 1, 2b and 5; completed on 2a, 3b and 6a. Separately, its `computeScope` collapses N independent whole-file ranges into one `[0, largest-file-length)` when several brand-new files are staged together, so the scope falls open. Both slices that hit it fell back to CLAUDE.md #16's hand-mutation path with revert proofs. Worth its own change.
- **`react-doctor` offers no path exclusion**, so committing regenerated Wails bindings put 95 findings on code nobody wrote and nobody can edit. `frontend/wailsjs/` is now untracked with a `postinstall` hook regenerating it; the request to the tool's maintainers is written up in `docs/reports/dharness-generated-code-exclusion.md`.
- **`vitest` `maxWorkers` was benchmarked standalone**, but the gate runs `frontend-heavy` beside `go-heavy` and `dharness`. At 8 workers four integration tests starved past the 5s per-test budget and failed **only inside the hook**. Restored to the 4 that `CLAUDE.md` documented; costs ~17s standalone.
- **The repo's own SDD gate never validated this change.** `tools/checksdd` resolves the active change from `.atl/active-sdd-change`, which still reads `2026-07-31-sdd-59-backup-import` — a finished change with zero unchecked tasks and a PASS verdict. So the `sdd-gate` job passed on all 13 commits by validating sdd-59, never SDD-60, whose `tasks.md` carried 13 unchecked boxes the whole time. The marker cannot simply be pointed at SDD-60 and archived in the same commit (`validateChange` resolves `openspec/changes/<name>/`, which the move empties), and clearing it makes discovery find 41 unarchived folders and fail with "multiple active SDD changes". Fixing it is its own change; it is recorded here rather than papered over.
- **One documented exception** is recorded in `tasks.md`: `NotificationTable.windowing.test.tsx` is excluded from the mutation runner's suite only. It still runs in the normal suite and in the gate, so the DOM-count guard stands.

## 6. What the mutation step actually caught

Recorded because it justifies the cost. Every one of these passed `go test` and full coverage while proving nothing:

- A keyset paging test seeded every row at one timestamp, so the primary comparison could never be reached — only the tie-break branch ever executed.
- No test landed on a page exactly filling the limit, so the `hasMore` boundary survived.
- A `useCallback` stale closure: nothing proved `press()` used the latest notification id after a re-render.
- Refusal precedence between two simultaneously-true reasons was unpinned; each reason had a test, none would have noticed a reorder.
- The collapse boundary had no case with exactly one uneventful anime.

## 7. Ready for archive

Yes. Implementation matches the specs, every gate passes under my own execution, and the four gaps above are documented rather than latent.
