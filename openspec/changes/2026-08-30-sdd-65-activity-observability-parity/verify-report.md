# Verify Report — SDD-65 Activity ↔ MCP Observability Parity

### Verdict

PASS

Verified by the orchestrating agent directly, not delegated (CLAUDE.md #3). Covers all five
committed slices: 0 (SDD debt closure), A1 (Go read seam), A2a (feed helpers), A2b (Runtime
Events repoint), B (Transactions cursor), C (Overview surfaces).

## Commits

| Commit | Slice |
|---|---|
| `c1f7266` | 0 — seven changes archived, spec deltas merged |
| `d840cb3` | Proposal |
| `86f65bb` | Specs, design, tasks |
| `624ebd8` | Task-list gaps from the A2 split |
| `5c087b6` | A1 — Go read seam over `eventlog.Reader` |
| `5d4f310` | Slice B acceptance criteria replaced with measured ones |
| `6c5f3cd` | A2a — feed helpers and store state |
| `e83a3c6` | A2b — Runtime Events reads the durable store |
| `8cb6f7f` | B — Transactions reach the whole capture table |
| `9f1fabb` | C — Overview summary surfaces |

## Gates (run by the orchestrator, actual output)

| Gate | Result |
|---|---|
| `go build ./...` | Clean |
| `go test ./...` | All packages pass |
| `go vet ./...` | Clean |
| `gofmt -l .` | Empty |
| **`scripts/lint.ps1 -Profile all`** | **0 issues** (both passes) — superset of `golangci-lint run`, adds `dlinter` and `gocognit` |
| `go run ./tools/checkgofilesize` | "Go file size check passed." (3 pre-existing warnings in untouched files) |
| `go run ./tools/checkarchitecture` | Clean |
| `bun --cwd=frontend run test` | 253 files / **2258 tests** passed (2143 before the change) |
| `bun --cwd=frontend run typecheck` | Clean |
| `bun --cwd=frontend run fallow audit` | **exit 0** — dead exports 0; duplication is warn-only and not a blocking rule |
| `bun --cwd=frontend run render:smoke` | Green on all five routes |
| Stryker (`test:mutation:staged`) | A2a **95.79**, A2b **90.09**, B and C green — threshold 80 |
| ditto (Go MUTATE, root package) | A1 wiring 12/12 and bindings 25/25; C 6 killed / 0 survived |

## Runtime validation beyond the gate

CLAUDE.md 18b: "the process is alive" is never a smoke test. Both checks below render real DOM.

| Check | Result |
|---|---|
| `bun --cwd=frontend run build` | 1,460.80 kB bundle / 443.50 kB gzip, built in 834 ms |
| `wails build` | `build/bin/autoreas-bridge.exe`, 21 MB, exit 0 in 30.7 s. Bindings regenerated and the tree stayed clean, so the committed `frontend/wailsjs/` was already current |
| Dev server, `/#/activity` | Vite 5173 + headless Edge `--dump-dom`: `#root` populated, marker present |
| Dev server, `/#/activity/runtime-events` | Same — `#root` populated, marker present |

## Phase 5 cross-slice checks

| # | Check | Evidence |
|---|---|---|
| 5.1 | `docs/openapi.yaml` untouched by A–C | `git diff 5d4f310..HEAD -- docs/openapi.yaml` empty. Reported as a positive finding, separate from Slice 0's already-merged document writes to `mobile-sync-contract` / `rest-api-write-sync` (R-7) |
| 5.2 | No schema change, migration, or capture-write-path edit | `git diff --name-only 5d4f310..HEAD` matches nothing under `internal/observability/requestcapture/`, `internal/observability/eventlog/` or `internal/mcp/requestcapture/`; no added `CREATE TABLE` / `ALTER TABLE` / `ADD COLUMN` anywhere in the diff |
| 5.3 | `GetRecentLogs()` retained | Still at `app_runtime.go:109`; `app_runtime.go` and `internal/logger/` are byte-unchanged since before A1 |
| 5.4 | Both MODIFIED `observability` requirements reflected | `Dashboard Feed Stays Live` and `Persisted Runtime-Event Log` are the two MODIFIED blocks in the delta. Shipped: the rail reads `SearchRuntimeEvents` (persisted page + live overlay), and `a.memLogger.Recent()` is still wired behind `GetRecentLogs()` |
| 5.5 | The three unrelated changes still unarchived | `dlinter-fallow-quality-remediation`, `fix-schedule-missed-selected-day`, `season-selection-desktop-actions` all still under `openspec/changes/`, recorded as open debt in proposal §3.1 |

## What the change actually fixed

The Runtime Events tab read a 500-entry in-process ring buffer, truncated to 200 in the
frontend and lost on restart, while the MCP read the durable 20,000-row `runtime_events`
table. No Wails binding read that table at all, so a human in the UI had strictly less access
to the bridge's own telemetry than an agent did. `docs/mcp-event-visibility-report.md` had
named this "Two stores, not one"; its drop-window fixes had shipped, the split had not closed.

Also closed: Transactions stopped at 25 rows while `ListCaptureTransactions` already returned a
cursor nothing consumed, and the domain filter hardcoded six values while the store held nine —
`download`, the third busiest domain at 10.2% of all events, could not be filtered for at all.

## Scope decisions, each backed by a measurement

| Decision | Measurement that drove it |
|---|---|
| No `Virtualizer`, no windowing — progressive append over a server cursor | `runtime_events` 4,530 rows of a 20,000 cap (22.7%), `request_captures` 1,317 of 5,000 (26.3%), busiest day 538 events. ADR-012's five-figure revisit trigger has not fired |
| The correlation Timeline slice was **cut**, and with it the only schema change | `runtime_events.correlation_id` holds download run ids (`run-…`, 463 rows, all domain `download`); `request_captures.correlation_json` holds `changelog_ids` + `anime_id` and no run id at all, 82.5% empty. The proposed scalar column would have been 100% NULL. Parity is claimed on **6 of the MCP's 7** read tools, and the seventh does not work in the MCP either, for the same key mismatch |
| The "debug events are lost" risk demoted High/High → Low/Low | Exactly **one** production debug emit site exists in the tree (`internal/events/instrumented_bus.go:27`). Persisted levels: info 98.4%, warn 1.5%, error 0.1%, debug 0% |
| The status filter's NULL semantics decided explicitly | 537 of 1,317 captures are websocket rows with no `http_status` — 40.8%. A naive `WHERE http_status = ?` would have erased every one of them |
| Slice B's acceptance check uses 404, not 5xx | There are **zero** 5xx captures in a month of real use. A 5xx check would have passed while proving nothing |
| `EVENT_PAGE_INITIAL_COUNT` is 20 | Every other rail uses 20 or 25. It was briefly 10 only because a guard test asserted a window of 11 from a `currentVisibleCount` of 10 — a state the initial-batch floor makes unreachable |

## Known gaps, deliberately left

- **Free-text search over transactions is gone, not moved server-side.** No LIKE or substring
  predicate exists in `requestcapture`, and `Route` is exact equality — so the spec's "route
  substring" is drift against the code, recorded per CLAUDE.md #2. The box only narrowed the
  loaded page: 25 rows of 1,317, so it searched 1.9% of the data and returned false negatives
  the user could not detect. Restoring real search needs a text predicate in `requestcapture`,
  which is a separate change.
- **Status-class pills became an exact status field**, for the same reason: `SearchFilters`
  exposes `http_status = ?` and a class is a range.
- **`get_correlation_timeline` has no UI affordance**, recorded as an explicit exclusion with
  its structural reason in `docs/mcp-event-visibility-report.md`.

## Guards added, since ADR-012 rules out a lint rule for this

Both rails carry two deterministic tests: rendered rows **equal** the batch size (never "rows
are unmounted"), and a pushed event does not reset window, filter, selection or scroll.
`ROUTE_MARKERS` gained both Activity routes, which had never been covered by the render smoke
test at all. `overview-surface-routing.test.ts` pins the 21 route paths and 10 nav entries as
literals so the Overview stays a tab rather than drifting into a route.
