# Archive Report — SDD-60 Notification Center

## Executive Summary

SDD-60 is complete and closed. Thirteen commits (`8899908`..`6c6630d`, 175 files, +17 093 / −3 742)
turn every notification the app already emits from a toast that vanishes in four seconds into a
durable, queryable, actionable record — without touching the existing `Notifier` port, the
`Dispatcher`, either existing adapter, or a single byte of the REST/WebSocket wire contract.

Verification was performed by the orchestrating agent, as CLAUDE.md #3 requires. Verdict: **PASS**,
with four gaps documented rather than hidden.

## What Shipped

**Shape: a decorator, not a replacement.**

`center.Service` wraps the existing `*notification.Dispatcher`; both satisfy `notification.Notifier`,
so every producer keeps calling the same port and none of them knows the Center exists. The
load-bearing invariant is **persist-then-ALWAYS-project**: the decorator writes its record first and
then delegates *unconditionally*, even when its own write failed. An early return there would silently
delete user-visible notifications, because every non-download producer discards the returned error with
`_ =`. That exact regression was written into an early draft of this design and caught by an independent
reviewer before it reached code; `TestServiceNotifyPersistFailureStillDispatches` now pins it by forcing
a real write failure against a schema-less SQLite database.

- **Core** — `internal/notification/center/`: the decorator, a keyset-cursor read model, count-based
  retention, lifecycle (read / archive / restore), and the intent executor.
  `internal/notification/centerschema/` is a leaf package importing only `internal/persistence`,
  mirroring the `internal/download/dbschema` precedent. Both are CHILD packages of
  `internal/notification` on purpose: the port package still imports only `internal/logger`, and a
  `go list -deps` test fails if that ever stops being true.
- **Actions** — the PendingIntent model, adopted in response to the user's rejection of an earlier
  registry-of-command-strings sketch: *"no veo un design pattern detrás de él, parece un botón arbitrario
  que se quema por cada evento."* A record stores `{label, intent, args}` and nothing else; resolution
  happens ON PRESS, potentially days later and after a process restart. This dissolves a real
  wiring-order problem — `a.notifier` is built at `app_startup_runtime.go:139`, `a.downloadService` not
  until `app.go:243` — because a token needs no live target at creation time. Refusals are a closed set
  of four: `intent_unregistered`, `target_missing`, `already_executed`, `foreign_action`.
- **Frontend** — `frontend/src/features/notifications/`: the `/#/notifications` route, a HeroUI v3 master
  list with `Table.LoadMore` keyset paging, multi-select bulk actions, search and filters, a detail pane,
  and toast correlation via `persistedId`.
- **Two pre-existing production bugs fixed on the way**, both found by reading the code rather than by a
  failing test: the toast carrier silently discarded every action past `actions[0]` (and
  `use-missed-schedule-resolver.ts` pushes two, so this was live), and the frontend resolver dropped
  `Source`, `CorrelationID` and `Timestamp` outright, making every backend event an uncorrelatable toast.
- **Design canvas** — nine annotated artboards (`design-canvas/`) driven directly by the user's review
  comments, covering per-type notification anatomy, the intent model, lifecycle, component and sequence
  diagrams, and an A/B comparison of the toast surface that the user resolved in favour of Option B.

**Verification**: 43 Go packages green (`-count=1`), `scripts/lint.ps1 -Profile all` clean, 1 767
frontend tests across 211 files, render smoke, dharness, Stryker, and the full pre-commit hook.

## The Gaps, Stated Plainly

1. **Dismissal was designed and never built.** The lifecycle artboard treats dismissal as an axis
   *separate* from read — dismissed-but-still-unread is a real state, which is why it needed its own
   timestamp. There is no `Dismiss` method, no `dismissed_at` column, and, decisively, **no spec scenario
   requiring one**. It was lost between the canvas and the spec, not dropped during implementation.
   Recorded here so nobody rediscovers it later as "this was designed, where did it go?"
2. **Source and Level filter controls are absent from the UI.** The backend applies both — wired and
   tested in Slice 3b, with `TestListSourcesEmptySliceMatchesEverything` pinning that an empty filter
   means *no filter* rather than *no results*. The canvas draws the dropdowns; no task builds them and no
   scenario demands them. Absent beats inert: a rendered control that does nothing is precisely the class
   of failure this whole change exists to correct.
3. **`jdownloader_offline` and `season.anime_available` name their anime in body text, not as `Rows`**
   (tasks 6b.3.1 / 6b.3.2, the only two left unchecked, and conditional in their own wording).
4. **`NotificationRow.ActionCount` is always 0 in list rows**; the list query does not load per-row
   actions, and `GetNotification` reports the real count. A test asserts the zero, so changing it has to
   be deliberate.

None of the four blocks archive, because none of them is asserted by any merged spec — verified by
grepping the installed specs for `dismiss`, filter-control wording, and `ActionCount`: zero hits.

## Repo Issues Surfaced (Not Fixed)

1. **The SDD gate never validated this change.** `tools/checksdd` reads the active change from
   `.atl/active-sdd-change`, which still points at `2026-07-31-sdd-59-backup-import` — finished, fully
   checked, PASS. So `sdd-gate` passed on all 13 commits by re-validating sdd-59 while SDD-60's
   `tasks.md` carried 13 unchecked boxes. It cannot be repaired inside this change: pointing the marker
   at SDD-60 and archiving in the same commit breaks `validateChange` (the folder moves out from under
   it), and clearing the marker makes discovery find 41 unarchived folders and fail with "multiple active
   SDD changes". The underlying condition is that backlog of 41 unarchived change folders.
2. **`tools/mutationstaged` is unreliable**, and its scoping has a real defect: `computeScope` collapses
   N independent whole-file ranges into a single `[0, largest-file-length)` when several brand-new files
   are staged together, so the scope silently falls open to whole files. It also blew its own 10-minute
   `harnessTimeout` on slices 1, 2b and 5 while completing on 2a, 3b and 6a. Both affected slices used
   CLAUDE.md #16's hand-mutation fallback with revert proofs.
3. **`react-doctor` supports no path exclusion.** `ignores`, `ignorePatterns`, `exclude` and
   `excludePatterns` were all tried; none is honored, so committed generated Wails bindings produced 95
   findings on code nobody wrote and nobody may edit. Resolved by untracking `frontend/wailsjs/` behind a
   `postinstall` regeneration hook — safe because `wails generate module` owns that directory outright
   (`build.go:131-136`, and `base.go:436-437` does `os.RemoveAll` on it). The hook verifies its output
   files exist, because `wails generate module` **exits 0 even when it fails**. The request to the tool's
   maintainers is written up in `docs/reports/dharness-generated-code-exclusion.md`.
4. **`vitest`'s `maxWorkers` had been benchmarked standalone.** The gate runs `frontend-heavy` beside
   `go-heavy` and `dharness`, so at 8 workers four integration tests starved past Vitest's 5s per-test
   budget and failed **only inside the hook** — which is what made it look like four unrelated flaky
   tests. It was one contention problem with four symptoms. Restored to 4, the value CLAUDE.md had
   documented all along; the ~17s it costs standalone is what buys a gate that does not fail on load.

## What Mutation Testing Actually Caught

Recorded because it is the justification for the step's cost. Every one of these passed `go test` with
full coverage while proving nothing:

- A keyset paging test seeded every row at one timestamp, so the primary comparison could never be
  reached — only the tie-break branch ever executed.
- No test landed on a page exactly filling the limit, so the `hasMore` boundary survived untested.
- A `useCallback` stale closure: nothing proved `press()` used the latest notification id after re-render.
- Refusal precedence between two simultaneously-true reasons was unpinned; each reason had a test, and
  none of them would have noticed a reorder.
- The outcome-collapse boundary had no case with exactly one uneventful anime.

## Spec Archive Details

Four capabilities, 23 requirements, 61 scenarios. Every scenario title was verified present in the
installed specs after merge (0 missing).

| Capability | Action | Result |
|---|---|---|
| `notification-center` | NEW | `openspec/specs/notification-center/spec.md` — 389 lines, 10 requirements, 34 scenarios |
| `notification-actions` | NEW | `openspec/specs/notification-actions/spec.md` — 184 lines, 7 requirements, 15 scenarios |
| `notifications` | MODIFIED + ADDED | merged into `openspec/specs/notifications/notifications.md` — 8 requirements, 17 scenarios |
| `desktop-navigation` | MODIFIED + ADDED | merged into `openspec/specs/desktop-navigation/spec.md` — 10 requirements, 19 scenarios |

Two things about the merge are worth recording.

**The `notifications` delta had already been merged during Slice 6b (`6c6630d`) — in abbreviated form.**
It preserved the meaning but dropped the verbatim evidence the requirements are built on: the exact
re-export line at `frontend/src/app/NotificationToasts.tsx:1`, the `app-notification.helpers.tsx:17-22`
and `use-backend-event-resolver.ts:18-27` code fences, the concrete `use-missed-schedule-resolver.ts`
evidence, the test-must-fail clause, and most of the `(Previously: …)` drift record. That contradicts
this change's standing documentation-fidelity constraint, so the archive restored the full delta text.
The spec grew from 150 to 234 lines; nothing was removed.

**The `notifications` MODIFIED block reconciles a requirement that had been unsatisfiable since it was
written.** It demanded the toast surface live inside `frontend/src/app/**`, while CLAUDE.md #4 forbids
hooks and business logic anywhere in `frontend/src/app/**` — and a toast surface needs a subscription
effect, so no hook-bearing implementation could ever have satisfied it literally. Shipped reality is a
one-line re-export over an implementation in `features/notifications/`. Per CLAUDE.md #2 the code wins;
the delta replaces the file-path rule with the three structural invariants it was actually protecting
(shared reusability, no single-feature ownership, no feature-to-feature coupling). The drift was logged
to `docs/learning-log.md` on 2026-08-23, before the spec phase, not after the fact.

`(Previously: …)` prose is retained in the merged main specs, matching the convention already visible in
nine other main spec files.

## Change Folder Archiving

Moved `openspec/changes/2026-08-23-sdd-60-notification-center/` to
`openspec/changes/archive/2026-08-23-sdd-60-notification-center/`, preserving the folder name as every
prior archive does.

Archived artifacts:

- `explore.md` — 516 lines, 3 mermaid diagrams
- `proposal.md` — 421 lines, 2 mermaid diagrams, decisions D-1…D-4 plus the slice plan
- `design.md` — 1 414 lines, 4 mermaid diagrams, decisions A–I
- `tasks.md` — 8 slices, 117 tasks closed, 2 explicitly deferred, plus the archive reconciliation table
  recording what closed each of the 11 tasks a sub-agent structurally could not close
- `verify-report.md` — verdict PASS, gates run by the orchestrating agent
- `design-canvas/` — 9 artboards plus `canvas.json` and a README
- `specs/` — the 4 delta/new specs as authored
- `archive-report.md` — this file

## Status

COMPLETE. Verified, committed, and archived. Two deferred tasks and four documented gaps remain visible
inside the archived change rather than being quietly closed.
