# Verify Report: 2026-09-12-sdd-68-ui-bug-batch

**Verified on**: 2026-09-12
**Mode**: Automatic, OpenSpec artifact store, Strict TDD
**Verifier**: Root orchestrator, run directly rather than delegated (project CLAUDE.md #3)
**Branch**: `fix/sdd-68-ui-bug-batch` in worktree `autoreas-bridge-worktrees/sdd-68-ui-bugs`

### Verdict

**PASS WITH WARNINGS**

Every reported defect is fixed and proven. The warnings below are real and none of them is a defect in
this change's code: one is a check this change cannot run locally, one is a repo tooling defect that made
a gate silently inert, one is a budget overshoot recorded rather than paid for by deleting tests, and two
are adjacent defects deliberately left unfixed because they were never reported.

## What was verified

Run by the orchestrator after the final slice, against the working tree that includes Slice B's
uncommitted Go code:

| Check | Result |
|---|---|
| `go build ./...` | exit 0 |
| `go vet ./...` | exit 0 |
| `go test ./internal/sync/... ./internal/events/... ./internal/desktop/... ./internal/api/contracts/...` | ok |
| `bun --cwd="frontend" run test` (anime-detail, ConnectedDevicesPanel, anime-editor) | 25 files, 241 tests, all pass |
| `bun --cwd="frontend" run filesize:warning` | "none" |
| `bun --cwd="frontend" run render:smoke` | "the production bundle renders" |

Each of these was also green in the baseline captured before the change's first edit, so the comparison is
against a known-good starting point rather than an assumption. The full pre-commit gate additionally ran on
every landed slice: typecheck, the whole 2690-test suite, dharness (react-doctor + fallow), render-smoke,
layout-smoke, and on the Go slice also gofmt, go-vet, go-cover, architecture, checkgofilesize and
golangci-lint (0 issues).

## Requirement coverage

| Capability | Requirements | Where satisfied |
|---|---|---|
| `anime-cover-rendering` (NEW) | Covers resolve through the binding, never a raw stored path; every resolution failure falls back to the placeholder | Slice A `9578318` |
| `connected-devices-realtime` (NEW) | Acknowledgment publishes a realtime signal; the panel reflects changes without a remount; `connection_status` remains untouched | Slice B (final commit) + Slice C `812e9bf` |
| `anime-editor` (MODIFIED) | General form scope and lifecycle separation, amended so Repeat and Restore live inside the form under confirmation while the Deactivate sentence is preserved verbatim | Slices D `dc6dce3` + E `776d35a` |

`anime-update-repeat-restore` is inherited by name, not amended. Its normative sentences were already
surface-agnostic, and the editor's scenarios live in the `anime-editor` delta, so no second capability
owns the same scenario.

## Defects fixed

1. **Anime Detail never showed the stored cover.** Root cause measured against the live `bridge.db`, not
   inferred: the stored cover is an object flattened by Go to a Windows path, which WebView2 cannot load
   from the Wails asset origin. Fixed structurally — `portadaUrl` no longer exists on the view model, so no
   stored path can reach an image element even by accident.
2. **The Connected Devices panel never refreshed.** It loaded once on mount and subscribed to nothing.
   Fixed by publishing on the bus `TriggerService` already held and re-emitting at the desktop edge.
3. **The editor's Activate button wrote with no confirmation.** The report had this inverted; the code and
   the screenshots agreed. Renamed to Restore, confirmed before writing, and Deactivate kept byte-identical.
4. **Every GitHub Action still declared the Node 20 runtime.** Not only `actions/checkout` — `setup-go`,
   both artifact actions and the SHA-pinned release action as well.

Additionally the editor gained a **Repeat** button it never had, which was part of the request.

## Warnings

1. **Bug 4 is manifest-verified, not CI-verified.** Each action's `runs.using` was read at its pinned ref
   and the upload/download pairing was checked, but no CI run has executed these workflows. Proof arrives
   on the next push. This report does NOT claim CI-green.
2. **The frontend staged-lines mutation gate was silently inert for this entire change.**
   `frontend/scripts/dlinter-mutation-staged.mjs:12` derives its path prefix from
   `git rev-parse --show-toplevel`, which under the GIT_DIR git exports into hook processes answers with the
   current directory instead of the repo root. The prefix computes to `''`, the filter tests `src/` against
   repo-relative `frontend/src/...` paths, and everything is filtered away: the job printed "no staged
   production TypeScript lines" on commits staging six and then five production TypeScript files. It reports
   success having checked nothing. Slice A's mutation coverage was obtained independently (80.00% → 95.38%
   after chasing survivors, which found a real `?? false` / `?? true` gap). Slices C, D and E compensated
   with deliberate hand-mutation — D and E each mutated real guards, confirmed the tests failed, and
   reverted. This is a repo defect, not a defect of this change, and it is recorded for a separate fix.
3. **Slice A ran 466 changed lines against the 400 budget** (165 production / 301 test). Folding six
   settled-outcome test cases into a table was attempted and reverted: it recovered three lines and
   introduced a type error. That is the evidence that the volume is legitimate test weight rather than
   over-engineering, so it is recorded as a planning miss per CLAUDE.md #22 rather than paid for by deleting
   cases that kill known mutants. Every other slice came in under budget (B 337, C 179, D 283, E 223).
4. **Slice D disclosed a strict-TDD sequencing deviation.** Its generalize-the-hook and rename-the-write-path
   tasks are not independently orderable — the transitions option needs the renamed record handler to
   compile — so one test passed on first run instead of failing first. It was reported rather than hidden,
   and the guard was proven meaningful by hand-mutation instead.

## Deliberately not fixed

Both are code-proven and neither was reported. Recording them rather than fixing them is the scope
decision, not an oversight:

1. **`connection_status` can never read "connected".** `internal/device/service.go:238-248` derives it from
   `sync_status` — only ever `active|stale|revoked`, which is sync *health*, never socket presence — and
   inverts `active` into `disconnected`, so a perfectly healthy device renders as disconnected. The real
   liveness signal already exists and is never consulted: `internal/realtime.MemoryHub`'s per-device
   register/unregister. **The Devices Status chip therefore still reads "disconnected" after this change,
   and that is not a failed fix.** The `connected-devices-realtime` spec pins this explicitly so a later
   reader does not mistake the unchanged chip for a regression. What this change repairs is staleness of the
   device list and Last sync.
2. **`docs/openapi.yaml`'s `DeviceInfo` schema is missing five fields** that `contracts.go` already ships.
   Pre-existing drift, recorded under CLAUDE.md #2.

Also left alone: the `ConnectedDevicesPanel` has no loading skeleton, which is genuine drift against the
mandatory three-state rule but predates this bug; and `registerDownloadRuntimeEventBridge` emits raw event
structs, so download payloads already cross into the WebView with Go field names ungoverned by a contract.
Slice B was explicitly required to copy the anime bridge instead, so this change documents that drift rather
than extending it.

## Delivery note

Slice B's Go code was implemented, verified and mutation-tested at its own point in the chain, but its
commit is deferred to this change's final commit. `tools/checksdd` globs `*.go` and refuses any such commit
until the active change has all four artifacts, zero unchecked tasks and a passing verdict — so a Go slice
structurally cannot land mid-change. The frontend slices were unaffected and landed individually.

The two archive-time spec edits (the `anime-editor` ASCII mockup and the `anime-update-repeat-restore`
Purpose line) were performed before this commit rather than during archive. `sdd-archive`'s merge only
matches named Requirement blocks and never touches `## Purpose` or `## UI Structure`, so performing them
earlier is equivalent and lets their tasks be ticked truthfully.
