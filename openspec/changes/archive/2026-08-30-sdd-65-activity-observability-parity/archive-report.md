# Archive Report: Activity ↔ MCP Observability Parity (SDD-65)

**Archived:** 2026-08-30
**Verdict:** PASS — `verify-report.md`, produced by the orchestrating agent directly, not
delegated (CLAUDE.md #3).
**Head at archive:** `a2ecad4` — "docs(openspec): verify SDD-65 — PASS".
**Tasks:** 69/69 complete. Nothing was reconciled at archive time; every box was already ticked
by `sdd-apply`.

## What shipped

| Commit | Slice | What it does |
| --- | --- | --- |
| `c1f7266` | 0 | Seven applied-but-unarchived changes archived and their spec deltas merged — the SDD debt this change had to stand on |
| `5c087b6` | A1 | Go read seam over `eventlog.Reader`: the durable runtime-event log reaches the desktop app, reusing the MCP's reader rather than a second implementation |
| `6c5f3cd` | A2a | Runtime-event feed helpers and store state — the `+ prependedCount` reconciliation, timestamp+fingerprint dedup, derived domain aggregate |
| `e83a3c6` | A2b | Runtime Events reads the durable store instead of the in-process ring buffer |
| `8cb6f7f` | B | Transactions reach the whole capture table through the cursor the binding already returned |
| `9f1fabb` | C | Overview summary surfaces, as a tab inside Activity rather than a new route |

The Runtime Events tab read a 500-entry in-process ring buffer, truncated to 200 in the
frontend and lost on restart, while the MCP read the durable 20,000-row `runtime_events`
table. No Wails binding read that table at all — a human in the UI had strictly less access to
the bridge's own telemetry than an agent did. Transactions stopped at 25 rows while
`ListCaptureTransactions` already returned an unconsumed cursor, and the domain filter
hardcoded six values while the store held nine.

## Specs merged into `openspec/specs/`

| Domain | Action | Detail |
| --- | --- | --- |
| `activity-runtime-events` | **Created** | Full spec, 6 requirements / 17 scenarios: Persisted Runtime Event Read Binding, The Surface Discloses What It Cannot Show, Domain Filter Options Are Derived From The Data, Live Push Overlays The Persisted Page, Runtime Events Rail Is A Live Progressive List, Correlation Trace Spans The Persisted Store. |
| `activity-observability-overview` | **Created** | Full spec, 4 requirements / 9 scenarios: Request Health Summary Surface, Runtime Event Summary Surface, No Merged Request And Event Timeline, Overview Is A Surface Inside Activity. |
| `activity-network-transactions` | Updated | 1 MODIFIED (Transaction List Filtering), 2 ADDED (Cursor-Paged Transaction Loading, Transactions Rail Is A Live Progressive List). |
| `observability` | Updated | 2 MODIFIED (Dashboard Feed Stays Live, Persisted Runtime-Event Log). No requirement added, removed, or renamed. |

### Requirement counts, before and after the merge

| Spec | Requirements before | after | Scenarios before | after |
| --- | --- | --- | --- | --- |
| `observability` | 27 | **27** | 64 | 64 |
| `activity-network-transactions` | 12 | **14** | 40 | 50 |
| `activity-runtime-events` | — | **6** | — | 17 |
| `activity-observability-overview` | — | **4** | — | 9 |

The `observability` heading set was captured before and after and diffed: **empty**. No
requirement was lost. Its two MODIFIED blocks replaced text in place, and both kept their
scenario count (3 and 2), which is why the totals do not move.

## The correction the merge forced

The archive brief specified `activity-observability-overview` as **4 requirements / 11
scenarios**. The artifact carries **9**: 3 + 3 + 2 + 1. The spec was merged as authored, and
the count above is the counted one, not the briefed one.

## Merge interpretation recorded at archive time

**Both `observability` requirements were replaced whole**, heading through last scenario,
because both contained text that forbade what shipped. Merging line-by-line would have left
the contradiction standing:

- **Dashboard Feed Stays Live** required the panel to render "the recent buffered
  `ObservabilityLogEntry` entries returned by the backend" from a separate "Events" route.
  Shipped behaviour is a persisted cursor page as the feed with the live push as an overlay,
  under a Runtime Events surface inside Activity.
- **Persisted Runtime-Event Log** asserted that the `MemLogger` ring buffer, `GetRecentLogs()`
  **and the Runtime Events tab** "MUST continue to operate exactly as before". Only the tab
  clause narrowed. `MemLogger` and `GetRecentLogs()` are retained, and `verify-report` §5.3
  records `app_runtime.go` and `internal/logger/` as byte-unchanged since before A1.

**Slice 0's drift note is retired, not deleted by accident.** The note inside Dashboard Feed
Stays Live said the separate "Events" route no longer existed and that "amending the route
wording is SDD-65 Slice A's job, not Slice 0's". Slice A did exactly that, so the note left
with the text it annotated.

**`Requirement: Wails Exposes Recent Logs` is retained untouched**, deliberately. The delta
authored no block for it; `GetRecentLogs()` keeps its contract and its existing tests and
simply stops being the Activity read path.

The two ADDED requirements were appended to the end of `## Requirements` in
`activity-network-transactions`, before its `## Non-Functional Constraints` section.

## Mechanical-copy evidence

Every byte moved by shell command; no artifact content passed through the model.

- Both new capability specs: `cp` then `diff -r` against the change-folder source — **empty**.
- Both merges: each merged requirement block was re-extracted from the live spec after the
  splice and diffed against the same block extracted from the delta — **empty**, five for five.
- Archive move: `diff -r` between the archived folder and the pre-move source reconstructed
  from the committed tree (`git archive HEAD`) — **empty**. All nine files are staged `R100`.
- `openspec/specs/` carries no `## ADDED` / `## MODIFIED` / `## REMOVED` / `## RENAMED` marker
  in any file this change touched.

**Operational note for the next archive on Windows.** `git mv` and `mv` of the change
*directory* both failed with `Permission denied` — a watcher holds directory handles, so
directory renames are blocked while file renames are not. The move was completed file-by-file
with `git mv`, after which the emptied directories removed cleanly. The failure is
environmental, not a repository or permission defect; do not read it as a corrupted change
folder.

## Drift recorded, not fixed here

Per CLAUDE.md #2, recorded rather than tidied away:

- **`openspec/specs/availability/spec.md:3` and `openspec/specs/season-overview/spec.md:3`
  still carry a bare `## ADDED Requirements` delta marker.** Both are present at `HEAD`,
  predate this change, and belong to other capabilities. Untouched here.
- **`activity-network-transactions`' purpose-level drift note stands.** It records that the
  capability text still names `mobile_request_captures` and `mobilecapture.Reader` after
  `capture-nomenclature-rename`. This change's delta did not address it, so it was not amended.
- **Free-text search over transactions is gone, not moved server-side**, and status-class pills
  became an exact status field. `requestcapture` has no LIKE or substring predicate and
  `SearchFilters` exposes `http_status = ?`, so the spec's "route substring" is drift against
  the code. Per `verify-report`, the old box searched 25 of 1,317 rows — 1.9% of the data —
  and returned false negatives the user could not detect. Restoring real search needs a text
  predicate in `requestcapture`, which is a separate change.
- **Parity is claimed on 6 of the MCP's 7 tools.** `get_correlation_timeline` is an explicit
  exclusion with a structural reason — the two stores are keyed on different values — and is
  recorded as a requirement (`No Merged Request And Event Timeline`), not as an unnoticed gap.

## Tasks

69/69 complete.

## Traceability

| Artifact | Engram | Path |
| --- | --- | --- |
| explore | `#8887` | `explore.md` |
| proposal | `#8890` | `proposal.md` |
| spec | `#8901` | `specs/` |
| design | `#8902` | `design.md` |
| tasks | `#8903` | `tasks.md` |
| verify-report | **none** | `verify-report.md` |
| Slice 0 archive report | `#8900` | — |
| archive report | `sdd/2026-08-30-sdd-65-activity-observability-parity/archive` | this file |

Supporting observations: `#8889` pre-work drift record, `#8891` live-database measurements,
`#8905` Slice B acceptance criteria falsified by measurement, `#8904` the standing rule that
delicate decisions are taken with measurements.

`verify-report` has **no Engram observation**; it exists only as the file in this folder. That
is a gap in the artifact set, not a missing verification — the report is present, its verdict
is PASS, and the archive read it from disk.

## Still open after this change

The three unrelated unarchived changes remain under `openspec/changes/`, recorded as open debt
in the proposal §3.1 and deliberately out of scope here: `dlinter-fallow-quality-remediation`,
`fix-schedule-missed-selected-day`, `season-selection-desktop-actions`.
