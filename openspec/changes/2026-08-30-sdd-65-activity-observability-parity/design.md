# Design: Activity ↔ MCP Observability Parity (SDD-65)

Change: `2026-08-30-sdd-65-activity-observability-parity`
Inputs: `proposal.md` (§6, §6.1–6.1.2, §6.3, §7, §14), `explore.md`, and the Slice 0 baselines merged by `c1f7266` (`openspec/specs/activity-network-transactions`, `mobile-request-mcp`, `observability`).

> **Deliberate override of the `sdd-design` 800-word budget**, on the same grounds as the proposal's. `openspec/config.yaml` `rules.design` requires sequence diagrams for complex flows and documented decisions with rationale, and the orchestrator additionally requires a precise overlay-reconciliation specification, an ADR-012 addendum text, and an up-front hook-split plan. Every claim carries a `file:line` anchor so no later phase re-derives it.

---

## 1. Technical Approach

Slices A–C add **in-process Wails read adapters over the storage readers the MCP sidecar already delegates to**. No query engine is written, moved, or duplicated. The frontend's Runtime Events tab stops being a 200-entry in-memory buffer and becomes a **cursor-paged persisted feed with a live push overlay**, rendered by ADR-012's live branch.

### 1.1 Correction to the phase brief — recorded before designing on it

The brief states that *"`Reader.Resolve` and the event query logic currently live inside `internal/mcp/requestcapture`, reachable only by the sidecar."* Verified against the code: **that is true of `Resolve` only, and false of the event query logic.**

| Symbol | Actual location | Reachable in-process today? |
|---|---|---|
| Event search engine | `internal/observability/eventlog/reader_search.go:17` (`Reader.Search`) | **Yes** — ordinary package |
| Event aggregation | `internal/observability/eventlog/reader_summary.go:17` (`Reader.Summary`) | **Yes** |
| Filter → SQL | `internal/observability/eventlog/filters.go:24` (`EventFilters.whereClause`) | **Yes** |
| Correlation fetch | `internal/observability/eventlog/reader_correlation.go` (`EventsByCorrelation`) | **Yes** |
| Fuzzy `Resolve` | `internal/mcp/requestcapture/reader.go:184` | **No** — MCP-local |

`internal/mcp/requestcapture/reader.go:143-164` is a **four-method delegating adapter**: `sqliteReader.SearchEvents/SummaryEvents/EventsByCorrelation/EventsAvailable` each forward to `r.events.*` with one nil-guard. The MCP owns a *tool layer* (`event_tools.go`, `event_types.go`), not a query engine.

**Consequence for the central decision: there is nothing to move.** The shared read capability already exists at the right layer. `Resolve` stays put, and stays out of scope (proposal §2.2, Q-4).

---

## 2. Architecture Decisions

### D-1 — The Go read seam: a second adapter over the existing `eventlog.Reader`

| Option | Tradeoff | Verdict |
|---|---|---|
| **Second in-process adapter over `eventlog.Reader`** | Zero movement; one engine, two adapters, two processes | **CHOSEN** |
| Extract a new `internal/observability/eventread` facade both consume | Churns a shipped, tested package to relocate code that is already correctly placed | Rejected |
| Move the MCP tool layer into a shared package | The MCP layer is `mcp-go` tool plumbing (schemas, clamps, JSON envelopes); the Wails layer needs none of it | Rejected |
| App calls the sidecar | A desktop read path through a subprocess and stdio, for data on the app's own handle | Rejected |

**Rationale.** The defect the change exists to fix is *two consumers reading two stores*. `eventlog.Reader` is already the one store's one engine; the MCP just got there first. Slice A adds `app_runtime_events.go` as a peer of `internal/mcp/requestcapture/reader.go` — same reader type, different handle, different process. Creating a third package to hold code that is already shared would be the third path the brief forbids.

**Handle policy is deliberately asymmetric and must stay so.** The MCP opens its own read-only connection (`OpenReadOnlyDB`, `reader.go:126-132`) because it is a separate process. The app reuses `a.bridgeDB` — `configureCaptureReader` (`app_runtime_services.go:85-95`) states the rule: *"over the app's own bridgeDB handle — never a second SQLite connection"*. Slice A's wiring is its exact mirror.

**Wiring**, symmetric to the capture reader (`app.go:56,73`; `app_defaults.go:154-156`):

```go
// app.go struct fields
newEventReader func(db *sql.DB) *eventlog.Reader  // injectable seam, mirrors newCaptureReader
eventReader    *eventlog.Reader

// app_defaults.go
if a.newEventReader == nil { a.newEventReader = eventlog.NewReader }

// app_runtime_services.go — called from configureRuntimeServices, after configureEventLogQueue
func (a *App) configureEventReader() {
    if a.eventReader != nil || a.bridgeDB == nil || a.newEventReader == nil { return }
    a.eventReader = a.newEventReader(a.bridgeDB)
}
```

`eventlog.NewReader` probes `runtime_events` once and never errors on a missing table (`reader.go:20-22,36-46`), so a pre-`mcp-runtime-events-read` database degrades to `Available() == false` instead of failing startup — the same contract the sidecar relies on.

### D-2 — One summary binding, two consumers (Slices A and C)

Slice A needs the domain list; Slice C needs levels, event types and samples. `Reader.Summary` returns **all four in one call** (`reader_summary.go:40-46`). Binding it once in Slice A and having Slice C consume the remaining fields avoids a second aggregate binding over the same three `GROUP BY` queries. Slice A ships the binding and uses `ByDomain`; Slice C ships the Overview UI over the same response. Applying "one implementation, two consumers" to the frontend as well as the backend.

### D-3 — The keyset cursor is what makes the overlay safe

`eventlog`'s cursor is a keyset on `(occurred_at_ms, id)` (`reader.go:48-54`) and paging walks **strictly backwards in time** (`reader_search.go:69`, `occurred_at_ms < ? OR (= ? AND id < ?)`).

**Therefore a head insertion cannot invalidate an outstanding cursor.** Live events are always newer than every loaded row, so they enter at the head; pages are always older, so they enter at the tail. The two never collide, and no page boundary shifts. Under an `OFFSET/LIMIT` cursor the same overlay would duplicate one row per pushed event on every subsequent page — which is why this property is recorded rather than assumed.

### D-4 — Overlay dedup is timestamp-and-fingerprint, NOT id — because the push predates the row

`EventRecord.ID` is a surrogate assigned at `INSERT` (`types.go:28`), and persistence is asynchronous through `eventlog.Queue` (`app_runtime_services.go:108-118`). The `EventsOn` payload is a `logger.LogEntry` emitted by the fanout logger **before** the row exists (`app_defaults.go:277-280`), and `ObservabilityLogEntry` has no `id` field (`observability.types.ts:8-18`).

Making the push carry the persisted id would require a synchronous write on the logging path — precisely what the non-blocking queue exists to prevent. So exact id-dedup is unavailable **by design**, and the design says so instead of inventing a field.

**Admission rule.** An overlay entry is admitted when `occurredAtMs > head.occurredAtMs`, where `head` is the newest row of page 1. Entries at exactly the head millisecond fall back to the already-shipped fingerprint reconciliation (`network-store.helpers.ts:283-330`, `canonicalize`/`consumeReplayMatch`), reused unchanged. The collision window is only the round-trip of the **first** page; later pages are strictly older and can never contain a pushed event.

### D-5 — Domains come from the summary aggregate, not the loaded page

| Source | Tradeoff | Verdict |
|---|---|---|
| **`Summary(EventFilters{}).ByDomain`** | Whole-table `GROUP BY domain ORDER BY COUNT(*) DESC`, already implemented and tested; complete and count-ordered | **CHOSEN** |
| A dedicated `SELECT DISTINCT domain` aggregate | A second query for a strict subset of one that already exists | Rejected |
| Derive from the loaded page | **Can only ever show the domains the page happens to contain.** Page 1 of 50 newest events would offer 2–3 of 9; the filter would flicker as pages load, and the rare domains (`device` 3 rows, `schedule` 2 rows) would be unreachable — the exact defect S-3 exists to fix, reintroduced in a new place | Rejected |

**The call MUST be unfiltered.** Passing the active domain filter would collapse the option list to the selected value, making every other domain unreachable after one click. Domain option counts are whole-table facts; the page is filtered, the facet list is not.

`NETWORK_DOMAIN_FILTER_OPTIONS` (`network-panel.constants.ts:19-27`) is **deleted**, not extended — a constant is what caused the defect. The `all` sentinel stays, prepended in the hook; labels are title-cased from the key.

### D-6 — Row order inverts at the repoint, and the auto-scroll must go with it

Today's buffer is **oldest-first**: `ingest` appends and `keepRecent` keeps the tail (`network-store.helpers.ts:23-27,49-55`). `eventlog.Reader.Search` returns **newest-first** (`reader_search.go:75`). The repoint inverts the feed.

Three consequences that would each ship as a silent regression:

1. `useLayoutEffect` in `use-network-panel.ts:98-113` force-scrolls to `scrollHeight` on **every** `rows` change. Under newest-first that scrolls to the *oldest loaded row* on every push, and it fights `isNearListBottom` for the load-more trigger. It is **removed**; newest-first needs no stick-to-bottom, because new rows arrive at the top. Its guard test (`__tests__/autoscroll.test.tsx`) is rewritten as the overlay-does-not-move-the-viewport test, not deleted.
2. `MAX_LOG_ENTRIES = 200` / `keepRecent` must **not** apply to the paged feed — a cap would delete rows the user just paged in. Both leave the runtime-event path.
3. `getNetworkTraceEntries` (`network-panel.helpers.ts:185-208`) iterates the buffer in order and its output ordering is contractual ("time-ordered"). It must sort explicitly rather than inherit array order.

`network-store` is evolved in place rather than duplicated: `NetworkPanel` is its only production consumer (verified — the other matches are its own module and tests).

---

## 3. Data Flow

```
                       ┌───────────────────────────────┐
  MCP sidecar ───────► │ internal/mcp/requestcapture   │──┐
  (separate process,   │ event_tools.go (tool layer)   │  │
   own read-only conn) │ reader.go:143 (delegate)      │  │
                       └───────────────────────────────┘  │
                                                          ▼
                                          ┌──────────────────────────────┐
                                          │ internal/observability/      │
                                          │   eventlog.Reader            │  ONE engine
                                          │   Search / Summary /         │
                                          │   EventsByCorrelation        │
                                          └──────────────────────────────┘
                                                          ▲
  Wails frontend ────► ┌───────────────────────────────┐  │
  (a.bridgeDB handle)  │ app_runtime_events.go  (NEW)  │──┘
                       │ SearchRuntimeEvents           │
                       │ SummarizeRuntimeEvents        │
                       │ RuntimeEventsAvailable        │
                       └───────────────────────────────┘
```

### 3.1 Sequence — page load, scroll-append, and an event mid-scroll

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant P as NetworkPanel (.tsx, dumb)
    participant H as use-network-panel-*(hooks)
    participant S as network-store
    participant A as App.SearchRuntimeEvents
    participant R as eventlog.Reader
    participant E as EventsOn(observability)

    rect rgb(240,245,255)
    Note over H,R: 1 — Initial page load
    H->>A: SearchRuntimeEvents{limit:50, filters}
    A->>R: Search(EventSearchParams)
    R-->>A: EventSearchPage{items newest-first, nextCursor}
    A-->>H: contracts.EventPage
    H->>S: setPage(items, nextCursor, "replace")
    H->>S: setHead(items[0].occurredAtMs)
    S-->>P: feed = page, visibleCount = min(INITIAL, len)
    end

    rect rgb(240,255,245)
    Note over U,S: 2 — Scroll near bottom appends an OLDER page
    U->>P: scroll
    P->>H: onScroll → isNearListBottom
    H->>A: SearchRuntimeEvents{cursor: nextCursor, filters}
    A->>R: Search (keyset: occurred_at_ms < cursor)
    R-->>A: older items, nextCursor'
    A-->>H: contracts.EventPage
    H->>S: setPage(items, nextCursor', "append")
    S-->>P: feed grows at the TAIL; visibleCount += len(items)
    Note over P: head unchanged, so the cursor stays valid
    end

    rect rgb(255,248,240)
    Note over E,P: 3 — A live event arrives MID-SCROLL
    E-->>H: ObservabilityLogEntry (no persisted id)
    H->>H: admitOverlayEntry(entry, head)
    alt occurredAtMs > head  (or unmatched at head ms)
        H->>S: prependOverlay(entry)
        S-->>P: feed grows at the HEAD; visibleCount += 1
        Note over P: identical rows stay mounted;<br/>scrollTop untouched; filter untouched;<br/>nextCursor untouched
    else duplicate of a row already on page 1
        H->>H: drop (consumeReplayMatch)
    end
    end
```

---

## 4. Push-as-overlay reconciliation — the precise specification

The feed is `[...overlay, ...page]`, newest-first. The window is reconciled by one pure function, modelled on `reconcileVisibleRunCount` (`run-history-panel.helpers.ts:132-157`).

```ts
/** Inputs for one live-feed window reconciliation pass. */
interface EventWindowInput {
  readonly currentVisibleCount: number;
  readonly previousTotal: number;
  readonly nextRows: readonly RuntimeEventRow[];
  readonly selectedId: string | null;
  /** Rows admitted at the HEAD since the last pass (0 for a tail append). */
  readonly prependedCount: number;
}

export function reconcileVisibleEventCount(input: Readonly<EventWindowInput>): number
```

Rules, in order:

1. `nextRows.length === 0` → `EVENT_PAGE_INITIAL_COUNT`.
2. `base = max(EVENT_PAGE_INITIAL_COUNT, min(currentVisibleCount + prependedCount, nextRows.length))`.
3. Fully-revealed stays revealed: `previousTotal > 0 && currentVisibleCount >= previousTotal` → `base = nextRows.length`.
4. Selection stays rendered: `index = nextRows.findIndex(r => r.id === selectedId)`; `index >= 0` → `base = max(base, index + 1)`.
5. Return `min(base, nextRows.length)`.

### 4.1 The three invariants, and where Activity STRENGTHENS one

| # | ADR-012 invariant | Activity form |
|---|---|---|
| 1 | Stable window across refreshes | **Strengthened: `+ prependedCount` in rule 2.** |
| 2 | A fully-revealed list stays revealed | Rule 3 — transferred verbatim. |
| 3 | The selection stays rendered | Rule 4 — transferred verbatim, recomputed against the shifted array. |

**Why invariant 1 is strengthened, and why omitting the term is the bug this section exists to prevent.** Run history reconciles against a *whole refreshed list*, where holding `currentVisibleCount` constant is correct. Activity's overlay is a **head insertion**: every already-rendered row shifts down one index. Holding the count constant would therefore silently drop the row at the bottom of the window on **every single event** — the rows a scrolling user is actually reading. `Math.min(current, total)` type-checks, looks right, and no existing test catches it: ADR-012:57-58's silent regression, reintroduced by hand. The term is the fix.

**What the overlay MUST NOT touch:** `nextCursor`, the active filters, `scrollTop`, `selectedId`, and the identity of any already-mounted row. Rows are appended and never unmounted.

---

## 5. Interfaces / Contracts

Cross-service wire fields are English (CLAUDE.md #13). Go DTOs mirror the reader types; `contracts` may not import `requestcapture` (`capture.go:1-8`), and the same rule is applied to `eventlog` for symmetry.

```go
// internal/api/contracts/event.go  (NEW — Slice A)

// EventFilterQuery is the shared filter set for both runtime-event reads,
// mirroring eventlog.EventFilters. Every populated field composes as AND.
type EventFilterQuery struct {
    Domain        string
    Level         string
    EventType     string
    CorrelationID string
    EntityID      string
    Text          string
    StartMS       *int64
    EndMS         *int64
}

// EventQuery is one page request: the filters plus keyset pagination.
type EventQuery struct {
    Limit   int
    Cursor  string
    Filters EventFilterQuery
}

// EventRow is one persisted runtime event as the frontend consumes it.
type EventRow struct {
    ID            int64          `json:"id"`
    OccurredAtMS  int64          `json:"occurredAtMs"`
    Domain        string         `json:"domain"`
    Level         string         `json:"level"`
    Message       string         `json:"message"`
    CorrelationID string         `json:"correlationId,omitempty"`
    EntityID      string         `json:"entityId,omitempty"`
    EventType     string         `json:"eventType,omitempty"`
    DurationMS    int64          `json:"durationMs,omitempty"`
    Metadata      map[string]any `json:"metadata,omitempty"`
}

// EventPage is one newest-first page. Degraded mirrors CapturePage: a nil
// reader, an unavailable runtime_events table, or a query error yields an
// empty never-nil Items so the frontend ranges without a nil check.
type EventPage struct {
    Items                []EventRow `json:"items"`
    NextCursor           string     `json:"nextCursor,omitempty"`
    AppliedLimit         int        `json:"appliedLimit"`
    MalformedRowsSkipped int        `json:"malformedRowsSkipped"`
    WarningCount         int        `json:"warningCount"`
    Available            bool       `json:"available"`
    Degraded             bool       `json:"degraded"`
}

// EventCountGroup / EventSample / EventSummary mirror eventlog's summary
// shapes; all three slices are never-nil so an empty match is a zeroed
// aggregation rather than a null.
type EventCountGroup struct {
    Key   string `json:"key"`
    Count int    `json:"count"`
}

type EventSummary struct {
    ByDomain    []EventCountGroup `json:"byDomain"`
    ByLevel     []EventCountGroup `json:"byLevel"`
    ByEventType []EventCountGroup `json:"byEventType"`
    Samples     []EventSample     `json:"samples"`
    Available   bool              `json:"available"`
    Degraded    bool              `json:"degraded"`
}
```

Bindings in `app_runtime_events.go` (**new root file**, naming per `app_captures.go`). All three follow `ListCaptureTransactions`'s never-panic contract (`app_captures.go:12-21`): nil reader or query error degrades to an empty `Degraded` envelope.

```go
func (a *App) SearchRuntimeEvents(query contracts.EventQuery) contracts.EventPage
func (a *App) SummarizeRuntimeEvents(filters contracts.EventFilterQuery) contracts.EventSummary
func (a *App) RuntimeEventsAvailable() bool
```

`Available` and `Degraded` are **distinct and both required**: `Available: false` means this database predates `runtime_events` (an expected, explainable state that earns the degraded banner); `Degraded: true` means the read itself failed. Collapsing them would report a broken query as an old database.

### 5.1 `CaptureQuery` grows two fields (Slice B)

`requestcapture.SearchFilters` already carries both (`filters.go:14,19`) and both are already translated to SQL (`filters.go:45-47,68-73`); only the DTO and its mapper lack them.

```go
type CaptureQuery struct {
    // ... existing fields unchanged ...
    DeviceID    string  // mirrors SearchFilters.DeviceID
    ChangelogID *int64  // pointer: 0 is a valid changelog id, so absence needs nil
}
```

`toSearchParams` (`app_captures.go:41-56`) gains the two passthroughs. `ChangelogID` stays `*int64` to match the reader exactly — a value type could not distinguish "no filter" from "changelog 0".

---

## 6. Frontend module shape — the split planned UP FRONT

`useTransactionPanel` was split on 2026-08-14 for the line budget after the fact; that discovery is not repeated. Files warn at 400 and hard-fail above 500 effective lines. Strict colocation, **no barrel** (ADR-011 — import by concrete path), every `*Props` / interface member `readonly`, JSDoc on all declarations including private ones, hook anatomy order preserved.

| File | Action | Role |
|---|---|---|
| `NetworkPanel/use-network-panel.ts` | Modify | Composition root only: refs, state, store bindings, callbacks, return. Owns no async edge and no window arithmetic. |
| `NetworkPanel/use-network-panel-sync.ts` | **Create** | Every async edge: first page, filter-driven reload, load-more, the domain-facet fetch, the `EventsOn` subscription. Mirrors `use-transaction-panel-sync.ts` exactly, including its `active` cancellation bookkeeping. |
| `NetworkPanel/use-network-panel-window.ts` | **Create** | The live window: `visibleCount` state, `onScroll` via `isNearListBottom`, and the `reconcileVisibleEventCount` call. Its JSDoc **MUST** classify the list as **live** (ADR-012:102-103). |
| `NetworkPanel/network-feed.helpers.ts` | **Create** | Pure, React-free: `admitOverlayEntry`, `reconcileVisibleEventCount`, `mergeEventFeed`, `toDomainFilterOptions`. Where the deterministic tests live. |
| `NetworkPanel/network-panel.helpers.ts` | Modify | Stays view-model projection. **Shrinks** from 321 lines as `matchesEntry*` filtering moves server-side; `getNetworkTraceEntries` gains an explicit sort (D-6.3). |
| `NetworkPanel/network-panel.constants.ts` | Modify | Delete `NETWORK_DOMAIN_FILTER_OPTIONS`; add `EVENT_PAGE_INITIAL_COUNT`, `EVENT_PAGE_SIZE`, `NETWORK_EVENTS_UNAVAILABLE_MESSAGE`, and the one-line debug-not-persisted note (R-1). |
| `NetworkPanel/network-panel.types.ts` | Modify | `RuntimeEventRow`, `EventFeedState`, `EventWindowInput`; `NetworkDomainFilterOption` becomes derived, not enumerated. |
| `shared/store/network-store/*` | Modify | Evolve in place (D-6): `page`, `overlay`, `nextCursor`, `head`, `isLoadingMore`, `available`, `domainOptions`; `setPage(items, cursor, mode)` copied from `transaction-store.helpers.ts:17-23`. `keepRecent`/`MAX_LOG_ENTRIES` leave this path. |
| `infrastructure/runtime-event-source/` | **Create** | `searchEvents` / `summarizeEvents` / `subscribe`, behind the `waitForBindings` guard. Peer of `capture-transaction-source`. |
| `observability-log-source.helpers.ts` | Modify | `GetRecentLogs()` at line 42 stops being the Activity read path. The binding itself and its four tests are untouched (proposal §4). |

**Ordering note for `sdd-tasks`:** `network-feed.helpers.ts` is pure and has no dependency on the Go work, so its RED tests can be written before the binding exists.

**Dead-code check (task, not assertion):** `foldByCorrelationId`, `selectFilteredRows`, `matchesStatusFilter`, `NetworkRequestRow`, `MutableRowAccumulator` and `statusFilter` appear to have no production consumer (`getNetworkPanelRows` uses `selectEntryViewRows`). Slice A confirms with `bun --cwd="frontend" run fallow` before removing anything; a test-only consumer is not a consumer.

---

## 7. ADR-012 addendum — the exact text Slice A appends

Appended to `docs/adr/012-progressive-list-rendering.md`. **No amendment, nothing superseded, `Status: Accepted` unchanged.**

```markdown
## Addendum (2026-08-30, SDD-65): live lists whose batches come from a cursor-paged server query

Every rail this ADR was written for slices a collection that is already fully in
memory. Activity's Runtime Events and Transactions rails are the first that are
**live** (an event stream pushes items) **and** read a table that outlives the
process, so "load more on scroll-near-bottom" cannot pull the next batch from a
local buffer — it fetches the next cursor page from the backend.

Nothing about the decision changes. Such a rail takes the **live** branch above:
it does NOT use `useProgressiveListWindow` (its render-phase reset would snap the
user back to the first batch on every event), it keeps its own reconciliation,
and it reuses only `isNearListBottom`. Rows are appended and never unmounted, and
the scrollbar still starts short and grows. Only the ORIGIN of a batch changes:
memory becomes SQLite.

Two things this addendum explicitly does NOT do:

1. **The rejection of `ListBox` + `Virtualizer`/`ListLayout` windowing is
   unchanged.** It was rejected on honesty — a padded full-height track reads as
   "everything is loaded" — not on cost, so "HeroUI ships it for free" does not
   reopen it. `Table.LoadMore` / `Table.LoadMoreContent` are the render
   primitives; `Table.ColumnResizer`, `Table.SortableColumnHeader` and
   `Table.ResizableContainer` are orthogonal to the scroll model.
2. **The "revisit if a collection reaches five figures" trigger has NOT fired.**
   Measured against the live `bridge.db` on 2026-08-30, after roughly one month
   of real use: `runtime_events` 4,530 rows of a 20,000 cap (22.7%),
   `request_captures` 1,317 of 5,000 (26.3%), busiest single day 538 events.

**This is not a contradiction of the rejected "Backend pagination" alternative
above.** That rejection is scoped to collections "small enough to fetch in one
call" — true of the Editor's 857 in-memory animes, and the reason it was right
to refuse round-trips for a rendering problem. It is not available for a
20,000-row cap. Activity's source is ALREADY keyset-cursor-paged by construction:
`ListCaptureTransactions` returns a `nextCursor` today that nothing consumes, and
`eventlog.Reader.Search` is cursor-paged. Activity is not adding wire pagination
to fix rendering; it is consuming a cursor the backend already emits.
```

---

## 8. File Changes

| File | Action | Slice | Description |
|---|---|---|---|
| `internal/api/contracts/event.go` | Create | A | `EventQuery`/`EventFilterQuery`/`EventRow`/`EventPage`; `EventSummary` + groups/samples |
| `app_runtime_events.go` | Create | A | The three bindings + reader→DTO mappers |
| `app.go` | Modify | A | `newEventReader` seam + `eventReader` field |
| `app_defaults.go` | Modify | A | Default `newEventReader = eventlog.NewReader` |
| `app_runtime_services.go` | Modify | A | `configureEventReader()` + its call in `configureRuntimeServices` |
| `internal/observability/eventlog/**` | **Unchanged** | — | Read-only consumer added; no query-engine edit |
| `internal/mcp/requestcapture/**` | **Unchanged** | — | Nothing moves out; `Resolve` stays MCP-local |
| `internal/observability/requestcapture/**` | **Unchanged** | — | No schema change, no capture-write-path edit (§6.3) |
| `app_runtime.go` | **Unchanged** | — | `GetRecentLogs()` (line 109) retained with its contract and four tests |
| `internal/api/contracts/capture.go` | Modify | B | `DeviceID` + `ChangelogID` on `CaptureQuery` |
| `app_captures.go` | Modify | B | `toSearchParams` passthrough for the two fields |
| `frontend/wailsjs/go/main/App.*` | Regenerated | A, B | Generated; never hand-edited |
| `frontend/src/infrastructure/runtime-event-source/**` | Create | A | Bindings adapter |
| `frontend/src/features/network/ui/NetworkPanel/**` | Modify + Create | A | Per §6 |
| `frontend/src/shared/store/network-store/**` | Modify | A | Paged feed + overlay |
| `frontend/src/features/network/ui/TransactionPanel/**` | Modify | B | Cursor consumption, widened `toBackendCaptureFilters`, `Table.LoadMore` |
| `docs/adr/012-progressive-list-rendering.md` | Append | A | §7 addendum verbatim |
| `docs/mcp-event-visibility-report.md` | Append | A | Closing note on "Two stores, not one" |
| `docs/learning-log.md` | Append | A | Via `node scripts/log-lesson.mjs` only |
| `docs/openapi.yaml` | **Untouched** | — | Wails bindings are desktop-local (R-7) |

---

## 9. Testing Strategy

`strict_tdd: true` — RED → GREEN → **MUTATE** → REFACTOR.

| Layer | What to test | Approach |
|---|---|---|
| Go unit | `configureEventReader` idempotence; nil `bridgeDB`; nil reader → `Degraded`; unavailable table → `Available:false, Degraded:false`; DTO mapping incl. never-nil `Items` | `go test ./...`, mirroring `app_startup_test.go`'s wiring style |
| Go unit | `toSearchParams` carries `DeviceID`/`ChangelogID`; `*int64(0)` survives as a filter | Table test against `requestcapture.SearchFilters` |
| Go integration | Persist → close → reopen → `SearchRuntimeEvents` returns the row (the restart-survival criterion) | `sqlite` temp file, `EnsureTableSchema` path |
| Go MUTATE | Every staged Go change | `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./<owning-package>/"` — name the owning package; keep `-json` |
| FE unit | `reconcileVisibleEventCount` rules 1–5, one test per rule, **expected values as literals, never the production constant** | Vitest, colocated `__tests__/` |
| FE unit | `admitOverlayEntry`: newer admitted; equal-ms duplicate dropped; equal-ms distinct admitted | Vitest |
| FE unit | `toDomainFilterOptions` derives a domain absent from the deleted constant (`download`) from a fixture — the S-3 criterion | Vitest |
| FE DOM guard | **Per rail**, per ADR-012:70-75: render more rows than one batch, assert rendered rows **equal the batch size** (not that rows unmount). Reference `AnimeEditorWorkspace.windowing.test.tsx`; name `*.windowing.test.tsx` | Testing Library |
| FE DOM guard | **Live-specific**: with the window grown past the first batch and a row selected, push an event; assert `visibleCount` grew by 1, the same rows stay mounted, `scrollTop` is unchanged, and the filter and `nextCursor` are unchanged | Testing Library |
| FE mutation | Staged frontend lines | Automatic — `lefthook.yml` `test:mutation:staged` (Stryker) |
| Smoke | `/#/activity` and `/#/activity/runtime-events` in `ROUTE_MARKERS` | `bun --cwd="frontend" run render:smoke` before claiming any slice builds (CLAUDE.md #18b, R-9) |

The two DOM guards are the **whole enforcement** — ADR-012:62-68 rules out a lint rule deliberately.

---

## 10. Threat Matrix

**N/A** — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Slices A–C add in-process Wails read bindings over an already-open SQLite handle; the MCP sidecar's subprocess boundary is read as a reference and is not modified. No new query is user-composed: every filter binds as a `?` parameter (`filters.go:24-66`), and `Text` binds a `LIKE` argument rather than interpolating.

---

## 11. Migration / Rollout

**No migration.** SDD-65 registers no schema, adds no column, and touches no capture write path (proposal §6.3, R-3). Slices ship in order `0 → A → B → C`, each independently revertable; per-slice rollback is proposal §10 and is unchanged by this design. A pre-`runtime_events` database is handled at runtime by `Available: false` plus the degraded banner, not by a migration.

---

## 12. Open Questions

- [ ] None blocking. The one product-level assumption this design adds beyond the proposal's §13 round: **Slice A binds `SummarizeRuntimeEvents` even though the Overview surface is Slice C** (D-2), because Slice A needs `ByDomain` and a second aggregate binding would be the duplication this change exists to remove. If a reviewer prefers a narrower Slice A, the correction path is a `ListEventDomains` binding in A superseded by the summary binding in C — at the cost of a binding that lives for exactly one slice.
