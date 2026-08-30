# Tasks: Activity ↔ MCP Observability Parity (SDD-65)

Inputs: `proposal.md` (§7, §12, §14), `design.md` (D-1..D-6, §4, §6, §7, §9), `specs/` (4 artifacts).
**Slice 0 is DONE and committed (`c1f7266`) — it is deliberately absent below.**

> **Deliberate override of the `sdd-tasks` 530-word budget**, on the same grounds as the proposal's, the spec's and the design's. `strict_tdd: true` makes every behavioural task a RED → GREEN → **MUTATE** triple with a named package, the chained slices carry five PR boundaries, and `openspec/config.yaml` `rules.tasks` requires one-session granularity. A 530-word checklist would collapse the MUTATE step and the spec links, which are the two things this change is most likely to lose.

**Legend** — `‖` = runs in parallel with its siblings; unmarked = strictly sequential. `[REQ:…]` names the spec requirement the task satisfies.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,400–1,800 (A1 ≈ 380, A2a ≈ 300, A2b ≈ 320, B ≈ 340, C ≈ 300) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (A1) → PR 2 (A2a) → PR 3 (A2b) → PR 4 (B) → PR 5 (C) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Slice A2 is split into A2a and A2b.** The proposal pre-declared only an A1/A2 split; it was written before this phase's line estimate existed, and A2 forecasts at ~620 lines — over the budget on its own. `auto-chain` splits automatically when the forecast exceeds budget rather than asking, so the split is declared here, not raised as a question. The cut follows the dependency: **A2a** (tasks 2.1–2.9) is pure and DOM-free — the reconciliation helpers, the overlay dedup, the derived-domain aggregate, the infrastructure adapter, and the store evolution that drops `MAX_LOG_ENTRIES`/`keepRecent`. **A2b** (tasks 2.10–2.27) owns the hooks, the read-path cutover, and both deterministic DOM guards.

Base boundaries: PR 1 base = tracker branch; each later PR bases on the previous PR branch (PR 2 = PR 1, PR 3 = PR 2, PR 4 = PR 3, PR 5 = PR 4). If a child diff shows a previous slice, the base is wrong — retarget or rebase before review.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| A1 | Go read seam over `eventlog.Reader`: contracts, wiring, three bindings | PR 1 | `go test -count=1 -run 'RuntimeEvent\|EventReader' .` | `wails dev`, open Activity → Runtime Events; tab still renders from `GetRecentLogs()` (unchanged) | Delete `app_runtime_events.go` + `internal/api/contracts/event.go`, revert the 3 wiring hunks. No frontend depends on it yet. |
| A2a | Frontend pure helpers: reconciliation with the `+ prependedCount` term, timestamp+fingerprint dedup, derived domain facets, store page/overlay state | PR 2 | `bun --cwd="frontend" run test -- src/shared/store/network-store src/infrastructure/runtime-event-source src/features/network/ui/NetworkPanel/__tests__/network-feed.helpers.test.ts` | None — no rendered behaviour changes yet; helpers are unreferenced until A2b | Revert; nothing consumes them, so the rail is untouched. |
| A2b | Hooks, composition root and DOM guards: `-window`/`-sync` split, stick-to-bottom removal, both deterministic guards | PR 3 | `bun --cwd="frontend" run test -- src/features/network` | `bun --cwd="frontend" run render:smoke`, then `wails dev` -> Runtime Events survives a restart, `download` is filterable | Revert; `observability-log-source.helpers.ts:42` returns to `GetRecentLogs()`, which was never removed. |
| B | Transactions consume the cursor + server-side filters | PR 4 | `go test -count=1 -run 'Capture' .` and `bun --cwd="frontend" run test -- src/features/network/ui/TransactionPanel` | `wails dev` → Transactions pages past row 25; a 5xx filter finds a match beyond page 1 | Revert; `cursor = null` and the two additive `CaptureQuery` fields disappear. `'append'` returns to dormant. |
| C | Overview surfaces (request health + event summary) | PR 5 | `go test -count=1 -run 'Summar' .` and `bun --cwd="frontend" run test -- src/features/network/ui/ActivityOverview` | `bun --cwd="frontend" run render:smoke`, then `wails dev` → Overview tab inside Activity | Revert; the tab disappears. Additive bindings only. |

**MUTATE is a step, not a suggestion.** Go: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./<owning-package>/"` — the owning package is named in each task; keep `-json` (without it a never-compiled mutant returns `unknown` and scores as a KILL). **Measured cost**: the root package suite (`go test -count=1 -p=4 .`) runs in 4.5s test time / 6.2s wall over 96 `.go` and 56 `_test.go` files, so a Go MUTATE pass costs roughly 6s per mutant — about two minutes for twenty. ditto prints nothing between `Releasing Ditto…` and its final report unless `-verbose` is passed, so a healthy multi-minute run and a hang look identical; this figure is what tells them apart. Frontend: automated by `lefthook.yml` `test:mutation:staged` (Stryker) over the added lines of staged files — do not hand-roll it. Expected values in tests are **literals**, never the production symbol being pinned.

---

## Phase 1: Slice A1 — Go read seam (PR 1, package `.` at repo root)

- [ ] 1.1 Create `internal/api/contracts/event.go` with `EventFilterQuery`, `EventQuery`, `EventRow`, `EventPage`, `EventCountGroup`, `EventSample`, `EventSummary` exactly as design §5. English JSON tags; `Available` and `Degraded` stay **distinct fields**. Pure DTOs — no behaviour, no test.
- [ ] 1.2 RED: new `app_runtime_events_wiring_test.go` — `configureEventReader()` is idempotent (a second call does not replace the reader), no-ops on nil `bridgeDB`, no-ops on nil `newEventReader`, and passes **`a.bridgeDB` itself** to the seam (D-1: never a second SQLite connection). Mirror `app_startup_test.go`'s style.
- [ ] 1.3 GREEN: add `newEventReader func(db *sql.DB) *eventlog.Reader` + `eventReader` to `app.go`; default to `eventlog.NewReader` in `app_defaults.go`; add `configureEventReader()` to `app_runtime_services.go` and call it from `configureRuntimeServices` after `configureEventLogQueue`.
- [ ] 1.4 MUTATE 1.2–1.3: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ."` (preview with `--dry` first).
- [ ] 1.5 RED: `app_runtime_events_test.go` — nil reader → empty never-nil `Items` with `Degraded:true`; missing `runtime_events` table → `Available:false, Degraded:false` (the two states must not collapse); query error → `Degraded:true`; reader row → `EventRow` mapping incl. `Metadata`. [REQ: Persisted Runtime Event Read Binding; The Surface Discloses What It Cannot Show]
- [ ] 1.6 RED: same file — populated filters compose as AND; results are newest-first; `AppliedLimit` and `NextCursor` are carried; no match returns an empty page, not an error. [REQ: Persisted Runtime Event Read Binding → "Populated filters compose as a conjunction", "No match is an empty page, not an error"]
- [ ] 1.7 GREEN: create `app_runtime_events.go` with `SearchRuntimeEvents`, `SummarizeRuntimeEvents`, `RuntimeEventsAvailable` + the reader→DTO mappers, under `app_captures.go:12-21`'s never-panic contract.
- [ ] 1.8 RED+GREEN: `SummarizeRuntimeEvents` returns `ByDomain`/`ByLevel`/`ByEventType`/`Samples` from ONE `Reader.Summary` call (D-2 — A2 consumes `ByDomain`, Slice C the rest), honouring `Available`/`Degraded`. [REQ: Runtime Event Summary Surface]
- [ ] 1.9 RED+GREEN integration test: persist an event → close the DB → reopen → `SearchRuntimeEvents` returns it with domain/level/message/timestamp/correlation/entity/event-type intact. Temp-file sqlite via the `EnsureTableSchema` path. This is the §12 restart-survival criterion. [REQ: Persisted Runtime Event Read Binding → "Events survive an application restart"; observability → "A logged event is queryable after an app restart"]
- [ ] 1.10 RED+GREEN parity test: for one filter set, the binding returns the same rows in the same order as the `eventlog.Reader` path `search_events` delegates to — assert equality against the reader, not against a re-implementation. [REQ: Persisted Runtime Event Read Binding → "The desktop surface and the MCP agree"]
- [ ] 1.11 MUTATE 1.5–1.10: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ."`.
- [ ] 1.12 Regenerate `frontend/wailsjs/go/main/App.*` with the Wails generator. Never hand-edit generated bindings.
- [ ] 1.13 Confirm the diff touches **no** file under `internal/observability/eventlog/`, `internal/mcp/requestcapture/`, or `internal/observability/requestcapture/`, and does not modify `app_runtime.go`. Slice A adds a consumer, not a query engine.
- [ ] 1.14 `git commit` (allow ≥ 300000 ms — the full gate is ~90s and a kill leaves changes staged but unrecorded).

## Phase 2: Slice A2 — Frontend repoint (split into A2a = PR 2, A2b = PR 3)

> **A2 was split under `auto-chain`**: the combined slice forecast ~620 lines, over the 400 review budget on its own. **A2a = tasks 2.1-2.9** (pure helpers, no DOM, base = PR 1 branch). **A2b = tasks 2.10 onward** (hooks, composition, DOM guards, base = PR 2 branch). Task 3.8 depends on `network-feed.helpers.ts`, which lands in A2a, so Slice B may not be reordered ahead of A2a but no longer waits on A2b.

Pure helpers first: `network-feed.helpers.ts` has no dependency on the Go work, so 2.1–2.4 are writable RED immediately (design §6 ordering note).

- [ ] 2.1 ‖ RED: `NetworkPanel/__tests__/network-feed.helpers.test.ts` — `reconcileVisibleEventCount` rules 1–5, **one test per rule, expected values as literals**. The rule-2 test is the R-4 guard: `currentVisibleCount=10, prependedCount=1, nextRows.length=51` MUST return `11`, not `10`. A constant count silently drops the bottom visible row on every event. [REQ: Runtime Events Rail Is A Live Progressive List]
- [ ] 2.2 ‖ RED: same file — `admitOverlayEntry`: `occurredAtMs > head` admitted; equal-ms duplicate dropped through the shipped fingerprint reconciliation (`network-store.helpers.ts:283-330`); equal-ms distinct entry admitted; an entry outside the active filters not admitted. **Dedup is timestamp+fingerprint, never `id`** — the push is emitted before the async INSERT assigns one (D-4). [REQ: Live Push Overlays The Persisted Page]
- [ ] 2.3 ‖ RED: same file — `toDomainFilterOptions` derives `download` from a fixture (a domain the deleted constant never contained); an empty aggregate offers only the `all` sentinel and fabricates no names; options come from the **unfiltered** summary (D-5). [REQ: Domain Filter Options Are Derived From The Data]
- [ ] 2.4 ‖ RED: same file — `mergeEventFeed` produces `[...overlay, ...page]` newest-first without reordering or duplicating a persisted row.
- [ ] 2.5 GREEN: create `NetworkPanel/network-feed.helpers.ts` with the four pure, React-free functions. JSDoc on every declaration.
- [ ] 2.6 `network-panel.constants.ts`: **delete** `NETWORK_DOMAIN_FILTER_OPTIONS` (lines 19-27); add `EVENT_PAGE_INITIAL_COUNT`, `EVENT_PAGE_SIZE`, `NETWORK_EVENTS_UNAVAILABLE_MESSAGE`, and the one-line "debug-level events are not persisted" note (R-1). [REQ: The Surface Discloses What It Cannot Show → "Debug absence is stated, not implied"]
- [ ] 2.7 `network-panel.types.ts`: add `RuntimeEventRow`, `EventFeedState`, `EventWindowInput`; make `NetworkDomainFilterOption` derived rather than enumerated. Every member `readonly`.
- [ ] 2.8 ‖ Create `frontend/src/infrastructure/runtime-event-source/` (`.helpers.ts`, `.types.ts`, `.constants.ts`, `__tests__/`) exposing `searchEvents`/`summarizeEvents`/`subscribe` behind the `waitForBindings` guard. Peer of `capture-transaction-source`, no barrel (ADR-011). RED first.
- [ ] 2.9 RED+GREEN: evolve `shared/store/network-store/**` in place (D-6) — `page`, `overlay`, `nextCursor`, `head`, `isLoadingMore`, `available`, `domainOptions`; `setPage(items, cursor, mode)` modelled on `transaction-store.helpers.ts:17-23`. **Remove `MAX_LOG_ENTRIES`/`keepRecent` from the runtime-event path** — a cap deletes rows the user just paged in (D-6.2).
### --- A2a ends / A2b begins (PR 2 -> PR 3 boundary) ---

- [ ] 2.10 Create `use-network-panel-window.ts`: `visibleCount` state, `onScroll` via `isNearListBottom`, the `reconcileVisibleEventCount` call. Its JSDoc **MUST** classify the list as **live** (ADR-012:102-103). No `useProgressiveListWindow`, no windowing, no virtualizer.
- [ ] 2.11 Create `use-network-panel-sync.ts`: first page, filter-driven reload, load-more by cursor, the unfiltered domain-facet fetch, the `EventsOn` subscription. Mirror `use-transaction-panel-sync.ts` including its `active` cancellation bookkeeping. [REQ: Cursor-paged load — "Exhausted pagination stops requesting"]
- [ ] 2.12 Reduce `use-network-panel.ts` to a composition root and **remove the `useLayoutEffect` stick-to-bottom at lines 98-113** (`node.scrollTop = node.scrollHeight`). Under newest-first it would scroll to the oldest loaded row on every push and fight `isNearListBottom` (D-6.1). Preserve hook anatomy order.
- [ ] 2.13 **Rewrite, do not delete**, `NetworkPanel/__tests__/autoscroll.test.tsx` as the overlay-does-not-move-the-viewport test: a pushed event leaves `scrollTop` unchanged. [REQ: Live Push Overlays The Persisted Page]
- [ ] 2.14 DOM guard 1 — create `NetworkPanel/__tests__/NetworkPanel.windowing.test.tsx`: render more events than one batch, assert **rendered rows equal the batch size**, NOT that rows are unmounted. Reference `AnimeEditorWorkspace.windowing.test.tsx`. ADR-012:62-68 rules out a lint rule, so this test is half the entire enforcement. [REQ: Runtime Events Rail Is A Live Progressive List → "The first render shows exactly one batch"]
- [ ] 2.15 DOM guard 2 (live-specific) — with the window grown past the first batch and a row selected, push an event: `visibleCount` grew by exactly 1, the same rows stay mounted, `scrollTop` unchanged, active filter unchanged, `nextCursor` unchanged. This is the other half of the enforcement and the direct R-4 guard. [REQ: Runtime Events Rail Is A Live Progressive List → "An incoming event does not reset the visible window"]
- [ ] 2.16 RED+GREEN: scroll-near-bottom appends the next cursor page below existing rows and unmounts nothing; a page with no cursor stops further requests. [REQ: Runtime Events Rail Is A Live Progressive List → "Scrolling near the bottom appends the next cursor page", "Exhausted pagination stops requesting"]
- [ ] 2.17 `network-panel.helpers.ts`: drop the client-side `matchesEntry*` filtering now served server-side; give `getNetworkTraceEntries` (lines 185-208) an **explicit sort** instead of inheriting array order (D-6.3), with a RED test feeding it unsorted input.
- [ ] 2.18 RED+GREEN: `NetworkDetailTrace` resolves siblings from the persisted store, so a correlation is followable across a restart; an event with no correlation id renders an explicit "no correlation" state, not an empty list. [REQ: Correlation Trace Spans The Persisted Store]
- [ ] 2.19 `NetworkPanel.tsx` / `NetworkFilterBar.tsx`: render the degraded-availability state naming the reason, the debug-not-persisted note, and the derived domain options. Dumb UI only — no Wails call, no `useEffect`, no business logic. [REQ: The Surface Discloses What It Cannot Show → "Unavailable event store degrades visibly"]
- [ ] 2.20 Repoint `infrastructure/observability-log-source/observability-log-source.helpers.ts:42` off the Activity read path. **`GetRecentLogs()` and its four tests stay untouched** (`app_startup_test.go:243,252`, `app_runtime_events_persistence_test.go:59`).
- [ ] 2.21 Dead-code check **before** removing anything: run `bun --cwd="frontend" run fallow` against `foldByCorrelationId`, `selectFilteredRows`, `matchesStatusFilter`, `NetworkRequestRow`, `MutableRowAccumulator`, `statusFilter`. A test-only consumer is not a consumer. Remove only what fallow confirms.
- [ ] 2.22 Size check: `bun --cwd="frontend" run filesize:warning` (warns at 400; ESLint `max-lines` + `dharness/max-file-lines` hard-fail above 500). The hook split above is the plan — do not improvise a new one here.
- [ ] 2.23 ‖ Append the ADR-012 addendum to `docs/adr/012-progressive-list-rendering.md`, **verbatim from design §7**. `Status: Accepted` unchanged, no amendment, nothing superseded.
- [ ] 2.24 ‖ Append the "Two stores, not one" closing note to `docs/mcp-event-visibility-report.md`.
- [ ] 2.25 ‖ Append the measurement lesson with `node scripts/log-lesson.mjs "…"` — never by hand; one line, ≤300 chars.
- [ ] 2.26 Verify `/#/activity` and `/#/activity/runtime-events` are in `ROUTE_MARKERS`, then run `bun --cwd="frontend" run render:smoke` (~4s). A healthy Go startup with a blank WebView is not a passing build (CLAUDE.md #18b, R-9).
- [ ] 2.27 `git commit` — the frontend MUTATE step runs automatically here via `lefthook.yml` `test:mutation:staged`. Allow ≥ 300000 ms.

## Phase 3: Slice B — Transactions reach the whole table (PR 4, base = PR 3 branch)

- [ ] 3.1 RED: `app_captures_test.go` table test — `toSearchParams` carries `DeviceID`; a `*int64` pointing at **0** survives as a real filter (a value type could not tell "no filter" from "changelog 0"); `nil` stays absent.
- [ ] 3.2 GREEN: add `DeviceID string` + `ChangelogID *int64` to `internal/api/contracts/capture.go` and the passthroughs to `app_captures.go:41-56`. Both already exist on `requestcapture.SearchFilters` and already translate to SQL — only the DTO and the mapper lacked them. [REQ: Transaction List Filtering]
- [ ] 3.3 MUTATE: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ."`. Then regenerate `frontend/wailsjs/go/main/App.*`.
- [ ] 3.4 RED: `transaction-panel.helpers.test.ts` — `toBackendCaptureFilters` sends exact status, status class, kind, route substring, outcome, anime id, error code, device id, changelog id and the `start_ms`/`end_ms` window to the backend; **nothing is filtered client-side over the loaded rows**. [REQ: Transaction List Filtering → "Filter by status class", "A match outside the loaded page is reachable", "Device and changelog filters reach the whole table", "Time window bounds the result"]
- [ ] 3.5 GREEN: widen `toBackendCaptureFilters` and delete the client-side status/text filtering path from `transaction-panel.helpers.ts`.
- [ ] 3.6 RED: `use-transaction-panel-sync.ts:39` stops passing `cursor = null` unconditionally — the next page appends, selection and filters survive, an exhausted cursor stops requests, and a filter change restarts from page one with no rows from the previous query. [REQ: Cursor-Paged Transaction Loading, all four scenarios]
- [ ] 3.7 GREEN: implement cursor consumption in `use-transaction-panel-sync.ts` and the `Table.LoadMore` / `Table.LoadMoreContent` affordance in `TransactionTable.tsx`. No `Virtualizer`, no `ListLayout`.
- [ ] 3.8 Create `use-transaction-panel-window.ts` reusing the `+ prependedCount` reconciliation from `network-feed.helpers.ts` — a capture push is a **head insertion** here too, so a constant count drops the bottom visible row. JSDoc classifies the list as **live**.
- [ ] 3.9 DOM guard — create `TransactionPanel/__tests__/TransactionPanel.windowing.test.tsx`: rendered transaction rows equal the batch size, not "rows are unmounted". [REQ: Transactions Rail Is A Live Progressive List → "The first render shows exactly one batch"]
- [ ] 3.10 DOM guard live — an arrival or terminal capture delta does not shrink the window to the first batch; selection, filters and scroll position preserved. [REQ: Transactions Rail Is A Live Progressive List → "An incoming capture push does not reset the visible window"]
- [ ] 3.11 `bun --cwd="frontend" run filesize:warning` — `transaction-panel.helpers.ts` starts at 277 and grows here; split colocated if it crosses 400.
- [ ] 3.12 `bun --cwd="frontend" run render:smoke`, then `git commit` (≥ 300000 ms).

## Phase 4: Slice C — Overview (PR 5, base = PR 4 branch)

- [ ] 4.1 RED: request-health aggregation — groups by (route, `http_status`, outcome), ordered count-descending, ≤5 latest error samples per group, accepting the same filters as the transaction list query, mutating nothing; an empty match is a zeroed aggregation, not an error. [REQ: Request Health Summary Surface]
- [ ] 4.2 GREEN: add the summary contract types to `internal/api/contracts/capture.go` and the read-only binding (new `app_capture_summary.go`, naming per `app_captures.go`), never-panic contract.
- [ ] 4.3 RED+GREEN parity test: the grouped counts are identical to `summary_requests` over the same data. [REQ: Request Health Summary Surface → "Aggregation agrees with the MCP"]
- [ ] 4.4 MUTATE 4.1–4.3: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ."`. Regenerate the Wails bindings.
- [ ] 4.5 RED: `ActivityOverview` consumes `SummarizeRuntimeEvents` (already bound in A1, D-2) for `ByLevel`/`ByEventType`/`Samples`; an unavailable store **reports degraded availability and is never silently zeroed**. [REQ: Runtime Event Summary Surface → "Unavailable event store is reported, not silently zeroed"]
- [ ] 4.6 GREEN: create `features/network/ui/ActivityOverview/` (strict colocation, no barrel, readonly props, JSDoc) and mount it as a **tab inside `ActivityView.tsx`**.
- [ ] 4.7 RED+GREEN: assert the route table and `app-layout.constants.ts` navigation entries are **unchanged** — the Overview adds no route and no nav entry (Q-5). A new route would also need a `ROUTE_MARKERS` entry. [REQ: Overview Is A Surface Inside Activity]
- [ ] 4.8 Record the parity checklist: six of the MCP's seven tools each have a named Activity affordance, and `get_correlation_timeline` is an explicit exclusion, not a miss. No merged request+event timeline surface ships. [REQ: No Merged Request And Event Timeline]
- [ ] 4.9 `bun --cwd="frontend" run render:smoke`, `bun --cwd="frontend" run filesize:warning`, then `git commit` (≥ 300000 ms).

## Phase 5: Cross-slice verification (orchestrating agent, not a subagent)

- [ ] 5.1 ‖ Confirm `docs/openapi.yaml` is untouched by Slices A–C and report it as a **positive** finding, separately from Slice 0's already-merged document writes to `mobile-sync-contract` / `rest-api-write-sync` (R-7).
- [ ] 5.2 ‖ Confirm **no schema change, no migration, no capture-write-path edit**: the diff touches no file under `internal/observability/requestcapture/`, registers no table, and adds no column.
- [ ] 5.3 ‖ Confirm `GetRecentLogs()` still exists with its contract and that its four tests are byte-unchanged. [REQ: observability → Persisted Runtime-Event Log, "In-memory feed is unaffected by persistence"]
- [ ] 5.4 ‖ Confirm the two MODIFIED `observability` requirements are reflected in the shipped behaviour: `Dashboard Feed Stays Live` (persisted page + live overlay, Transactions still not rendering `ObservabilityLogEntry` rows) and `Persisted Runtime-Event Log` (the tab clause narrowed while `MemLogger` and `GetRecentLogs()` stay retained).
- [ ] 5.5 ‖ Confirm the three unrelated changes from proposal §3.1 are **still unarchived** and recorded as open debt.
- [ ] 5.6 Run the full gate and create the final commit before reporting the change verified (CLAUDE.md #3, #4).
