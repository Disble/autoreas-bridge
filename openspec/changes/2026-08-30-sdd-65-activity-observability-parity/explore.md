# Exploration: Activity section at functional parity with the in-repo MCP server

> Source of record: Engram observation **#8887**, topic `sdd/activity-mcp-parity/explore`, captured 2026-08-30.
> Copied verbatim into the change folder so the later phases have a filesystem baseline (`artifact_store=hybrid`).

## Headline finding

The Activity UI and the MCP sidecar do NOT read the same data. One tab does, one does not.

- **Transactions tab** reads `request_captures` through `App.ListCaptureTransactions` (`app_captures.go:12`) → `App.captureReader` (`requestcapture.Reader`). Same table the MCP's `search_requests` reads. Source parity exists; capability parity does not.
- **Runtime Events tab** reads `App.GetRecentLogs()` (`app_runtime.go:109`) → `a.memLogger.Recent()`, an in-process ring buffer (`internal/logger/mem.go`, default capacity 500), further capped to `MAX_LOG_ENTRIES = 200` in `network-store.constants.ts`. The MCP's `search_events`/`summary_events`/`get_correlation_timeline` read the SQLite `runtime_events` table (20,000-row cap).
- **No Wails binding reads `runtime_events`.** Verified by enumerating every `func (a *App) <Exported>` across `app_*.go`: `eventlog` appears only in `app.go` (field), `app_defaults.go` (sink/queue construction), `app_runtime_services.go` (bind) and tests. There is no read method.
- `docs/mcp-event-visibility-report.md` already documented this divergence ("Two stores, not one") and is marked HISTORICAL because the *drop-window* fixes shipped in SDD-64. The two-store split itself was never closed and is still the runtime truth.

## MCP tool inventory (verified, 7 tools)

Registered in `internal/mcp/requestcapture/server.go:19-68`. `ToolNames()` always lists 7; `registerEventTools` (server.go:51) registers the last 3 only when the reader also implements `EventReader` — production `sqliteReader` does.

| # | Tool | Params (type) | Returns | Question it answers |
|---|---|---|---|---|
| 1 | `search_requests` | limit int (default 25, clamp 100), cursor string (keyset base64), route, status *int, outcome, kind, device_id, anime_id, error_code, start_ms *int64, end_ms *int64, changelog_id *int64 — all AND-composed | `obs.SearchPage{Items []CaptureRecord, NextCursor, AppliedLimit, MalformedRowsSkipped, WarningCount}` | "Show me the captured requests matching X, newest first, page by page" |
| 2 | `summary_requests` | same 10 filters, no pagination | `SummaryResult{Groups []{Route, HTTPStatus, Outcome, Count, LatestErrorSamples (max 5)}}`, GROUP BY (route,http_status,outcome) ORDER BY count DESC | "Which routes are failing, how often, and give me recent examples" |
| 3 | `get_request_context` | request_id string | `GetResult{Found, Item CaptureRecord}` sanitized (authorization/auth_token scrubbed in `mapGetResult`) | "Show me everything about this one request" |
| 4 | `resolve_request_context` | reference string (free-form) | `{candidates []{request_id}}` ranked | "I half-remember a request — find it" (parses HTTP status, route fragment, `latest`/`today`, anime id; ANDs recognized components; 3 rank tiers; pages the WHOLE table at 100/page) |
| 5 | `search_events` | limit, cursor, domain, level, event_type, correlation_id, entity_id, text (LIKE over message OR domain OR event_type), start_ms, end_ms | `eventlog.EventSearchPage` | "Show me the persisted runtime events matching X across restarts" |
| 6 | `summary_events` | same filters, no pagination | `EventSummaryResult{ByDomain, ByLevel, ByEventType []EventCountGroup, Samples (cap 5), Available bool}` — three independent GROUP BY queries | "What is this bridge actually doing, aggregated by domain/level/type" |
| 7 | `get_correlation_timeline` | correlation_id string (required; empty → `invalid_params`) | `{requests []CaptureRecord, events []EventRecord, events_available bool}` | "One correlation id → the merged HTTP + runtime story" |

Known weakness, documented in `event_tools.go:87-108`: `request_captures` has no scalar `correlation_id` column, so tool 7's request side is a best-effort match against the `Correlations` JSON envelope (changelog ids, activity ids, conflict ids) plus `RequestID` equality — which "matches approximately never". A true scalar join needs capture-pipeline work.

## Activity UI today

Routing (`frontend/src/App.tsx:35-39`): `/activity` → `ActivityRoute`, `/activity/runtime-events` → `ActivityRoute initialTab="runtime-events"`. `/events`, `/network`, `/status` are all redirects. **There is no `EventsRoute.tsx`** and the nav has one entry (`app-layout.constants.ts:41`).

`ActivityRoute` = `BridgeStatusCard` + `ActivityView` (two HeroUI `Tabs`).

### Transactions tab (`TransactionPanel`)

Read: `createCaptureTransactionSource()` → `ListCaptureTransactions` / `GetCaptureTransaction`. Push: `capture.transaction` runtime event → `upsertRows`.

Filters that exist, literally:

- route / outcome / kind — free-text `LabeledTextField`, forwarded server-side (`toBackendCaptureFilters`)
- statusClass 2xx/3xx/4xx/5xx — **client-side only**, over the loaded page
- free-text query over route|kind|outcome|errorCode — **client-side only**

Detail tabs: General (label/value fields + flat correlations list), Request (CodeBlock), Response (CodeBlock).

**Page limit is 25 and there is no pagination UI.** `nextCursor` is stored (`transaction-store.helpers.ts:144-148`), `mergeTransactionPage` supports `'append'`, and nothing ever calls it with `'append'`. `use-transaction-panel-sync.ts:39` always passes `cursor = null`. You see the newest 25 matches, full stop.

### Runtime Events tab (`NetworkPanel`)

Read: `GetRecentLogs()` (memLogger, 500) + `EventsOn` push; store caps at 200.

Filters: free-text query; level all/info/warn/error/debug; domain from a **hardcoded** option list (`network-panel.constants.ts:19-27`: all/system/anime/bus/sync/websocket/api) — not derived from the data.

Detail tabs: General, Metadata (sorted k/v), Trace (siblings sharing `correlationId`, from the 200-entry buffer only).
Autoscroll-to-bottom (`useLayoutEffect` in `use-network-panel.ts:98`). Footer: entries / errors / shown.

## Parity gap matrix

| MCP capability | In Activity today? | Where it would live | What blocks it |
|---|---|---|---|
| `search_requests` route filter | Yes (server-side) | `TransactionFilterBar` | nothing |
| `search_requests` outcome/kind filters | Yes (server-side) | `TransactionFilterBar` | nothing |
| `search_requests` status filter | Partial — client-side class bucket, not the exact `status` int the backend supports | `toBackendCaptureFilters` | `CaptureQuery.HTTPStatus *int` already exists; the FE simply never sends it |
| `search_requests` device_id filter | **No** | filter bar + `CaptureQuery` | `contracts.CaptureQuery` has NO DeviceID field (`internal/api/contracts/capture.go:14-25`) even though `obs.SearchFilters` does — Go-side gap |
| `search_requests` anime_id filter | **No** (field exists in `CaptureQueryFilters`, never surfaced) | filter bar | UI only |
| `search_requests` error_code filter | **No** (same) | filter bar | UI only |
| `search_requests` start_ms/end_ms time window | **No** | new time-range control | UI + a HeroUI date/range control decision |
| `search_requests` changelog_id filter | **No** | filter bar / deep link | `contracts.CaptureQuery` has no ChangelogID field — Go-side gap |
| `search_requests` cursor pagination | **No** — 25 rows, no more | `use-transaction-panel-sync` + a load-more affordance | store already supports `'append'`; nothing calls it |
| `summary_requests` aggregation | **No** | new Summary/Overview surface | no binding at all |
| `get_request_context` full detail | Yes | `TransactionDetail` | nothing |
| `resolve_request_context` fuzzy lookup | **No** | a command-palette / smart search box | no binding; `Reader.Resolve` is MCP-package-local (`internal/mcp/requestcapture/reader.go:184`), not in `internal/observability` |
| `search_events` over persisted events | **No** — the tab shows a 200-entry in-memory buffer instead | Runtime Events tab read path | **no Wails binding reads `runtime_events`**; this is the single biggest gap |
| `search_events` domain/level filters | Partial — client-side over the buffer, hardcoded domain list | `NetworkFilterBar` | needs the server-side binding first |
| `search_events` event_type / entity_id / correlation_id filters | **No** | `NetworkFilterBar` | same |
| `search_events` text filter | Partial — client-side substring | same | same |
| `search_events` time window | **No** | same | same |
| `search_events` cursor pagination | **No** | same | same |
| `summary_events` aggregation | Partial — footer shows entries/errors/shown over the 200-entry buffer, nothing by domain/level/type | new Summary surface | no binding |
| `get_correlation_timeline` merged view | **No** — the Trace tab groups events only, within 200 in-memory rows, and never joins captures | a real Timeline tab | no binding; and the backend join itself is best-effort (`event_tools.go:87`) |
| Events availability signal (`events_available`) | **No** | degraded banner | no binding |

## Drift record (CLAUDE.md rule 2 — code wins)

> **Correction (2026-08-30): the exploration found SIX unarchived changes; there are SEVEN in this capability closure.** It missed `mobile-catch-request-mcp` (commit `c7ee906`), whose `specs/mobile-request-mcp/spec.md` is a **full spec that seeds** the capability three of the six then modify, and which ADDs three `observability`, one `mobile-sync-contract` and one `rest-api-write-sync` requirement — all five absent from the live specs. Merging six without it would silently drop baseline requirements including the sanitization default-deny rule. Three further unarchived changes (`dlinter-fallow-quality-remediation`, `fix-schedule-missed-selected-day`, `season-selection-desktop-actions`) are unrelated and stay out of scope. Authoritative ledger: `proposal.md` §3 and §3.1.

All six named changes have every executor task checked `[x]`. None is archived. `openspec/specs/` contains **no** `activity-network-transactions` and **no** `mobile-request-mcp` capability, so the spec deltas were never merged. `openspec/changes/archive/` does not contain them.

| Change | State | Documented drift vs. code |
|---|---|---|
| `activity-devtools-network-view` | Applied, not archived. All 30 `[x]` | Tasks 4.3/4.4/4.5 created `EventsRoute.tsx`, wired `/events`, added an "Events" nav item. **All three are gone.** `/events` is now `<Navigate to="/activity/runtime-events">`, `ActivityView` holds both panels as tabs, nav has one Activity entry. Task 4.6 said to leave `NetworkRoute.tsx` untouched — that file no longer exists either. |
| `activity-transaction-inspect-ui` | Applied except 6.1 (orchestrator verification, unchecked) | Task 2.3 created `shared/ui/CodeBlock/index.ts` as a pure re-export barrel — **superseded by ADR-011** (2026-08-02), the file is gone, imports are concrete. Tasks 3.3/3.5 mandate `CAPTURE_REDACTION_MARKER` and `TRANSACTION_RESPONSE_REDACTED_NOTICE`; neither exists in `transaction-panel.constants.ts` today — a later hotfix preserves exact bodies and the constants were replaced by 65536-byte truncation/omission notices. An **orphaned JSDoc block survives at `transaction-panel.constants.ts:17-20`** describing a redaction notice with no declaration under it. |
| `mcp-runtime-events-read` | Applied, not archived. All `[x]` including 13.x | Matches code. `defaultRowCap = 20000`, `defaultPruneEvery = 200`, `maxTimelineItems = 200`, sample cap 5 all verified in `eventlog/types.go`. Task 7.5 asked for a measured events-per-session figure; the measurement landed later in `docs/mcp-event-visibility-report.md` ("tens to low hundreds of rows per day"), not in this change. |
| `capture-middleware-realtime` | Applied except 11.1 (orchestrator verification) | Tasks name `mobilecapture` throughout; the package is `requestcapture` since `capture-nomenclature-rename`. `internal/api/middleware.go` was deleted outright rather than modified (recorded in-task). |
| `capture-nomenclature-rename` | Applied except 8.1 (orchestrator verification) | Matches code: `internal/observability/requestcapture`, `internal/mcp/requestcapture`, `cmd/autoreas-request-mcp`, tables `request_captures`/`request_capture_metadata` at schema v3, four bare tool names. Group 4 shipped 4 tool names; `mcp-runtime-events-read` later grew it to 7. |
| `mobile-request-mcp-debugging-improvements` | Applied, all `[x]` | Oldest of the six. Every path in it (`internal/mcp/mobilecapture`, `internal/observability/mobilecapture`, tool names `search_mobile_requests`/`summary_mobile_requests`) was renamed by `capture-nomenclature-rename`. `internal/api/handlers/capture_response.go` (task 5.2) was deleted by `capture-middleware-realtime` task 5.3. Reading this document without the two later ones is actively misleading. |

Also drifted: **`docs/mcp-event-visibility-report.md` is accurate.** Its banner says every recommendation shipped, and spot-checks hold (`eventlog/reader_search.go:93` initializes `Items: []EventRecord{}`; `eventlog/store.go:62` has `s.successful > 1 &&`). Its "Two stores, not one" root cause is still live and is the core of this change.

## Constraint verdicts

| Constraint | Verdict | Evidence |
|---|---|---|
| CLAUDE.md #1 "no `useEffect` in `.tsx` under `features/`" | **Non-issue as a blocker; keep it.** | It is not enforced by any deterministic gate today. `frontend/eslint.config.js` enables only `max-lines` and `no-restricted-imports`; the dlinter preset that carried `no-view-effects`/`no-infrastructure-in-view`/`hook-anatomy` was removed 2026-08-11 (comment at eslint.config.js:1-14). `frontend/doctor.config.json` enables exactly six dharness rules: `folder-ownership`, `max-file-lines`, `pure-index-barrel`, `require-jsdoc`, `require-variable-jsdoc`, `role-file-shape`. **None is an effect rule.** More importantly the existing hooks already prove live streaming works inside them: `use-network-panel.ts` runs three `useEffect`s plus a `useLayoutEffect` autoscroll, and `use-transaction-panel-sync.ts` runs four `useEffect`s including the `capture.transaction` push subscription. Nothing about a DevTools panel needs an effect in the `.tsx`. |
| CLAUDE.md #8 / file-size 400-warn / 500-hard-fail | **Cost, not a blocker.** | The biggest file in the whole `features/network` tree is `network-panel.helpers.ts` at 321 physical lines; `transaction-panel.helpers.ts` is 277. Everything else is under 140. The 500 ceiling is enforced twice (ESLint `max-lines` skipping blanks/comments, and `dharness/max-file-lines` counting everything). The ceiling forces colocated splits — which `TransactionPanel` already demonstrates (`use-transaction-panel` + `-sync` + `-store-bindings` + `-filter-callbacks`, split 2026-08-14 for exactly this reason). Plan the split up front; do not ask to raise the ceiling. |
| ADR-012 progressive rendering vs true virtualization | ~~**Real fork, and the ADR anticipated it.**~~ **CORRECTED — see the note below this table.** | ADR-012 says explicitly: "revisit if a collection reaches five figures." `runtime_events` caps at **20,000** (`eventlog/types.go:17`) — five figures. `request_captures` caps at **5,000** (`requestcapture/types.go:6`) — not. Also note ADR-012 forbids `useProgressiveListWindow` for LIVE lists (its render-phase reset snaps the user to the top on every pushed event); both Activity tabs are live. ~~So neither existing option is a drop-in.~~ |
| HeroUI v3 component availability | **Non-issue — better than assumed.** | `@heroui/react@^3.2.4` re-exports `Virtualizer`, `TableLayout` and `ListLayout` straight from `react-aria-components` (`dist/components/rac/index.d.ts:1`), and the `Table` compound already exposes `Table.ColumnResizer`, `Table.ResizableContainer`, `Table.SortableColumnHeader`, `Table.LoadMore` and `Table.LoadMoreContent` (`dist/components/table/index.d.ts:3-52`). True virtualization, column resize, sortable headers and an infinite-scroll sentinel are all in the box, unused. **No split-pane / Splitter primitive exists** — a resizable master/detail divider would be hand-built. Note the theme skill's verified caveat: `Table.ScrollContainer` scrolls horizontally only; the vertical scroller must be your own wrapper div. |
| ADR-011 no barrels | **Non-issue.** Import concrete paths; the tree already does. |
| CLAUDE.md #13 code in English | **Non-issue.** Wire fields are already English (`requestId`, `capturedAtMs`, `httpStatus`). |

> **Correction (2026-08-30, propose phase — supersedes the ADR-012 row above and the virtualization recommendation below).**
> The exploration overstated ADR-012. It is **not** a real fork, it needs **no** amendment and supersedes nothing, and **virtualization is not proposed** — only a short ADR-012 *addendum* covering one narrow case (a live list whose batches arrive from a cursor-paged server query rather than a client buffer).
> **Virtualization is rejected on honesty, not on cost.** `use-progressive-list-window.ts:7-12` states the reason verbatim: *"Rows are never unmounted, so the scrollbar starts short and grows — which reads honestly, unlike windowing's full-height padded track."* ADR-012:79-84 rejects `ListBox` + `Virtualizer`/`ListLayout` on the same grounds. A virtualizer restores the padded track this repo deliberately chose against; "HeroUI ships it for free" is an installation cost, not a behavioural one. Risk 6 below still stands, but on the live-streaming + cursor-pagination workload alone — not on virtualization, which is out.
> ADR-012:46-49 documents two branches, and Activity belongs to the second one: **live** lists keep their own reconciliation and reuse only `isNearListBottom`. ADR-012:51-55 already names the reference implementation — `reconcileVisibleRunCount` (`run-history-panel.helpers.ts:132`, fed by `subscribeRunEvents`), which preserves the window, keeps the selected item rendered, and keeps a fully-revealed list revealed.
> ADR-012:96's "revisit if a collection reaches five figures" does **not** trigger: the caps are irrelevant next to the measured rate of tens to low hundreds of rows per day.
> The genuinely open question is narrower than an ADR: Run history reconciles over an in-session memory buffer, while Activity reads tables that outlive the process, so the "load more on scroll-near-bottom" batch must come from a backend **cursor page** instead of a local buffer. Same UX gesture, batch source moved from memory to SQLite. Authoritative statement: `proposal.md` §6.1.

## Data volume reality check

| Store | Cap | Prune cadence | Source |
|---|---|---|---|
| `request_captures` | 5,000 rows | every 100 writes | `requestcapture/types.go:6-7`, `store.go:93` |
| `runtime_events` | 20,000 rows | every 200 writes; first write of a process prunes unconditionally | `eventlog/types.go:17-18`, `store.go:60-62` |
| memLogger (Runtime Events tab today) | 500 entries | ring buffer | `internal/logger/mem.go:25` |
| frontend network-store | 200 entries | `keepRecent` | `network-store.constants.ts:4` |
| Transactions page fetch | 25 rows, no pagination | — | `transaction-panel.constants.ts:4` |

`docs/mcp-event-visibility-report.md` §"Retention sizing" measured the persisted rate as "tens to low hundreds of rows per day" in shipped configuration, because the only per-operation emitter (`InstrumentedBus.Publish`) logs at `debug` and `PersistDebug` defaults off.

**Conclusion:** 10,000 rows in one table is reachable only for `runtime_events` with debug persistence on. The absolute worst case across both tables is 25,000. Today the UI never renders more than 25 or 200 rows, so the real decision is the FETCH policy, not the renderer. ~~Recommend virtualization anyway for the events table, because HeroUI ships `Virtualizer` free and a live list cannot use `useProgressiveListWindow` (ADR-012).~~ **CORRECTED — virtualization is NOT recommended and is not proposed.** "The real decision is the FETCH policy, not the renderer" is the correct half of this paragraph and is exactly what `proposal.md` §6.1 acts on: progressive rendering on ADR-012's live branch, with the next batch fetched as a backend cursor page. See the correction note above.

## Approaches

1. **Bind the seven MCP tools as seven Wails read methods, rebuild Activity on them.** Pros: exact parity by construction; kills the two-store divergence; every filter becomes server-side and correct beyond the loaded page. Cons: largest Go surface; `Reader.Resolve` must move from `internal/mcp/requestcapture` into `internal/observability/requestcapture` to be reachable in-process; `contracts.CaptureQuery` must grow DeviceID + ChangelogID. Effort: High.
2. **Events-only: add a `runtime_events` read binding, leave Transactions alone.** Pros: closes the single biggest gap; smallest honest slice; makes the Runtime Events tab tell the truth. Cons: leaves transaction pagination/summary/resolve untouched — no parity claim can be made. Effort: Medium.
3. **Frontend-only polish over existing bindings.** Pros: no Go. Cons: cannot fix anything real — the events tab reads the wrong store, there is no summary binding, no resolve binding, and no cursor consumption. Effort: Low, value: near zero. **Reject.**

Recommend (1) delivered as the slices below.

## Candidate scope cuts

**Slice A — "the events tab tells the truth" (foundational, ~250-350 lines).** Add `App.SearchRuntimeEvents(contracts.EventQuery) contracts.EventPage` + `App.GetRuntimeEventsAvailable() bool` over `eventlog.Reader`. Repoint `NetworkPanel` from `GetRecentLogs`/memLogger to it. Derive the domain filter list from the data instead of the hardcoded seven. Keep the live push as an overlay on the persisted page. Independently shippable; makes the UI and MCP agree for the first time.

**Slice B — "transactions reach the whole table" (~250-350 lines).** Consume `nextCursor` (the store already supports `'append'`); push statusClass, anime_id, error_code and the time window server-side; add DeviceID/ChangelogID to `contracts.CaptureQuery`. Independently shippable, no new screens.

**Slice C — "summary + timeline" (~350-450 lines).** Bind `summary_requests`/`summary_events` and `get_correlation_timeline`; add an Overview tab (counts by route/status/outcome and by domain/level/event-type) and a real Timeline tab replacing the buffer-scoped Trace tab. Depends on A and B. Record explicitly that the timeline's request side is best-effort until a scalar `correlation_id` column exists on `request_captures` — or make that column part of this slice.

Deliberately deferred: `resolve_request_context` as a UI command palette (needs the resolver moved out of the MCP package; low value once B lands filters). Column config / saved filters (no persistence surface exists for them). Split panes (no HeroUI primitive; hand-built divider is unrelated cost).

## Risks

> **Correction (2026-08-30): risks 1, 2 and 3 below were derived from documentation prose and a source comment, and measurement against the live `bridge.db` falsified all three.** Risk 1 (losing debug events) is Low/Low — debug is 0 rows, with one production emit site. Risk 2 (timeline join) is worse than stated and unfixable as scoped — the two stores use different keys, so the proposed column would be 100% NULL, and the timeline was **cut**. Risk 3's premise stands but its answer is now recorded. Authoritative figures: `proposal.md` §14 and Engram observation **#8891**.

1. The Runtime Events tab silently changes meaning under Slice A: today it shows every entry including `debug` from the ring buffer; `runtime_events` filters `debug` out by default (`PersistDebug` off). Users will see FEWER rows unless the change either enables debug persistence or states the tradeoff. This is the same defect class `docs/mcp-event-visibility-report.md` diagnosed.
2. `get_correlation_timeline`'s request side is a best-effort JSON-envelope match, documented as matching "approximately never" (`event_tools.go:87-108`). Shipping a Timeline tab over it without fixing the join would ship an empty panel that looks broken.
3. Six unarchived changes with merged-but-unmerged spec deltas mean `openspec/specs/` has no `activity-network-transactions` capability. A new change writing deltas against a capability that does not exist in `specs/` needs an explicit decision: archive the six first, or declare the capability new.
4. `mobile-request-mcp-debugging-improvements` and `capture-middleware-realtime` reference paths and files that no longer exist. Do not use them as the spec baseline.
5. `contracts.CaptureQuery` is deliberately narrower than `obs.SearchFilters` (no DeviceID, no ChangelogID). Widening it touches the `app_captures.go` mapper and the generated Wails bindings.
6. Two panels doing live streaming + virtualization + cursor pagination will push `network-panel.helpers.ts` (321) and `transaction-panel.helpers.ts` (277) toward the 400 warn line. Plan the colocated splits in tasks, not during apply.
