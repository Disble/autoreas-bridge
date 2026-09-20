# Activity search: substring over the whole table, without paying for it

## Goal

The Activity text filters must behave like searches, not like equality tests, and the
cost of one keystroke must not depend on how many rows match nor on how large the
stored bodies are. Today the Route field is an exact-match predicate with a placeholder
(`/api/animes/anime-1`) that names a value the database does not contain, every keystroke
issues one unbounded query, and each query decodes every matching row **including the
22.7 MB of response bodies the list projection throws away**. The user reported the
symptom as "the app crashes, at least in dev", and chose its manifestation as *freezes
or goes blank*, which is what an unbounded read per keystroke looks like.

Owner decisions taken for this unit (2026-09-20):

- **Scope**: every text filter in Activity — the Transactions toolbar and the Runtime
  Events search box — gets the same semantics.
- **Semantics**: case-insensitive substring (`LIKE '%texto%'`), consistent with the
  events reader and with the notification center and watch-history stores.
- **Structure**: the owner asked whether an index is needed. Measured answer: **no**
  (see Decisions). The trigger that would reopen it is recorded.
- **Status** stays an exact numeric predicate: it is a number, and `4` matching `404`
  and `204` would be a regression, not a search.

## Measured evidence (live database, read-only)

Path `C:/Users/User/AppData/Roaming/Autoreas/data/bridge.db`, 2026-09-20.
Technique: `uv run python` + `sqlite3.connect("file:...?mode=ro", uri=True)`;
`EXPLAIN QUERY PLAN` on the same handle; timings through the app's own core reader via
the `autoreas-request-mcp` sidecar (`search_requests`), which calls
`requestcapture.Reader.Search` — the exact function the desktop binding calls.

| Fact | Value |
| --- | --- |
| Rows in `request_captures` | 3 043 (retention cap `defaultRetentionLimit = 5000`, prune every 100 writes) |
| Distinct `route` values | **23** |
| `response_body` bytes stored | **22.7 MB** (336 `/api/animes` rows hold 21.7 MB of it) |
| Bytes read per unfiltered search | **24.2 MB** |
| List SELECT includes detail bodies | `payload_json`, `correlation_json`, `request_body`, `response_body`, `request_headers`, `response_headers` (`reader.go::selectColumns`) |
| SQL `LIMIT` in the captures search | **absent** — `reader_search.go::Search` reads every matching row and truncates in Go |
| Cost of one search through the real reader | no filter **144–359 ms**; `route=/api/animes` **222–374 ms**; no match **58 ms** |
| Cost of the same predicate inside SQLite | `count(*) WHERE route LIKE '%animes%'` **0.13 ms**; `kind LIKE '%patch%'` **1.70 ms** |
| Query plan for exact route | `SEARCH request_captures USING INDEX idx_request_captures_route_time (route=?)` |
| Query plan for `LIKE '%x%'` / `LIKE 'x%'` | `SCAN` — the B-tree index cannot serve a substring |
| Debounce in either search box | none; `shared/hooks/use-debounce.ts` exists and is unused |
| Dev-mode amplification | `React.StrictMode` mounts the query effect twice → 2 unbounded reads per change |
| Runtime Events search | already `LIMIT ?` (`limit+1`) in SQL, already substring over `message/domain/event_type` |

The whole gap is one sentence: **the cost lives in Go, not in SQLite.** The predicate
costs under 2 ms; reading and decoding the discarded detail columns costs 150–370 ms.

The events reader already proves the intended shape, in its own words
(`internal/observability/eventlog/reader_search.go`):

> Deliberately unlike `requestcapture.Reader.Search`, the SQL query itself applies
> `LIMIT` (`limit+1`): on the higher-volume events table, scanning the whole table and
> truncating in Go would be exactly the regression the retention risk row warns about.

`requestcapture.Reader.Search` is the outlier that never got that treatment.

## Decisions

- **The page limit goes into SQL.** `limit+1` rows, like the events reader, so the scan
  stops as soon as the page (plus the cursor probe) is satisfied. This alone removes
  almost the entire 150–370 ms.
- **The list projection stops reading detail columns.** Summary projection = the 13 base
  columns plus `request_body_state`, `response_body_state`, `duration_ms`. Bodies and
  headers are read only by `Get`, which is the detail read. `payload_json` and
  `correlation_json` stay: they total 382 KB and the correlation timeline needs them.
- **No index, no FTS5, no schema change.** A substring cannot use a B-tree; the only
  indexed options are an FTS5 `trigram` shadow table or a Go-side index. Neither is
  warranted: the predicate is **0.13–1.70 ms** over the full 3 043 rows and both stores
  are bounded by their retention caps (5 000 captures, 20 000 events, both wired with
  default config in `app_defaults.go`), so the worst case stays in the low tens of
  milliseconds. Buying an index here would add write amplification on every capture and
  re-open the class of desync that the `name_key` generated-column incident taught
  (`docs/reports/…`, memory `anime-schedule/today-blank-diagnosis`).
  **Recorded trigger to reopen**: the unindexed scan cost per row is ~0.35 µs
  (captures) and ~0.65 µs (events); an index becomes justified when a retention cap is
  raised an order of magnitude beyond today's, or when a substring predicate is asked
  over a table without a bounded cap. Re-measure before deciding, do not assume.
- **One rule, not three copies.** `escapeLikePattern` already exists twice
  (`internal/notification/center`, `internal/watchhistory`) and both are unexported.
  The observability readers get **one shared helper** rather than a third private copy,
  so "same semantics" holds by construction: `%`, `_` and `\` are escaped and every
  clause carries `ESCAPE '\'`. Migrating the two older copies is out of scope here and
  recorded below.
- **Status is not text.** Route, outcome, kind and the events free text become
  substrings; the HTTP status filter keeps its exact-integer semantics.
- **Live pushes must respect the active filter.** Today `upsertRows([row])` inserts
  every arrival regardless of the filters, so a filtered rail refills with non-matching
  rows and the user's search appears to stop working. The Runtime Events rail already
  solves exactly this with `admitOverlayEntry`/`matchesEventFilters`; Transactions
  reuses that precedent instead of inventing a second rule.

## Tasks

- [x] **1. Push the page limit into the captures query.** `Search` asks SQLite for
  `limit+1` rows and stops, mirroring `eventlog.Reader.Search`, keeping `NextCursor`
  (only when the probe row proves a further page), `MalformedRowsSkipped` and
  `WarningCount` semantics unchanged.
- [x] **2. Stop reading detail columns in the list projection.** The search select list
  excludes `request_body`, `response_body`, `request_headers`, `response_headers`;
  `Get` keeps the full projection byte-for-byte.
- [ ] **3. Make the text filters substring through one shared rule.** `route`,
  `outcome`, `kind` (captures) and `text` (events) build their pattern through the same
  helper: escaped metacharacters, `ESCAPE '\'`, and an empty input adds no predicate.
- [ ] **4. Declare the shared rule where capability parity can hold it.** The pattern
  rule lives once in the core; both adapters project it; the conformance suite pins
  that both apply the same substring rule and that neither adapter implements matching.
- [ ] **5. Record the no-index decision and its trigger.** The measurement, the caps,
  the per-row cost and the reopening threshold, in the task record and in the code
  comment that owns the query.
- [ ] **6. Wire the substring semantics through the desktop surface.** Transactions
  Route/Outcome/Kind become substrings; Status stays exact; the events search box keeps
  its shape. No capability is added to an adapter.
- [ ] **7. Make the live rail honour the active filters.** Arrival pushes are admitted
  only when they satisfy the active filter set, reusing the events-rail precedent, so
  typing is not buried by non-matching rows.
- [ ] **8. Debounce the query, not the echo.** One query per pause in both rails, with
  the existing obsolete-response guard; the input echoes immediately and no skeleton
  flashes per keystroke.
- [ ] **9. Verify at the boundary and close.** Re-measure the same three calls against a
  copy of the live database and through the MCP sidecar, run the repository gates
  (`ditto staged` on the owning packages, frontend mutation gate, lint profiles,
  size/architecture checks), commit per work unit, and record the before/after numbers
  here.

## Work unit 1 — bounded page + summary projection (tasks 1 and 2)

Production change, 24 lines across three files:

- `reader_search.go`: the query gains `ORDER BY … LIMIT ?` with `limit+1` as the final
  bind argument, and `params.Summary` selects `selectSummaryColumns()` (the 13 base
  columns plus whichever of `request_body_state`, `response_body_state`, `duration_ms`
  exist).
- `types.go`: `SearchParams.Summary bool`, documented, zero value = full detail
  projection, so the MCP `search_requests` output is unchanged.
- `app_captures.go`: `toSearchParams` sets `Summary: true` — the bound `CaptureRow` DTO
  never carries a body, so reading one per row burned I/O for nothing.

Tests: a bounded-read table whose witness is malformed-row counting (a malformed row
past the limit+1 window cannot be counted; one inside the window is counted and
consumes a slot), the cursor contract (full page sets it, partial and zero-match pages
do not), summary-equals-full-minus-blobs field by field, `Get` still carrying bodies and
duration, and a desktop binding test proving the list drops bodies while
`GetCaptureTransaction` keeps them.

Measured on the live store (3 043 rows), read-only, through this same reader:

| Call | Before | After |
| --- | --- | --- |
| first page, full projection (the MCP path) | 144–359 ms | 0.5 ms |
| first page, summary projection (the desktop list) | n/a | below the timer's ~0.5 ms resolution |
| `route=/api/animes`, full projection | 222–374 ms | 2.6–3.2 ms |
| `route=/api/animes`, summary projection | n/a | below resolution |
| no-match route | 58 ms | below resolution |

The residual 0.5–3 ms on the full projection is the bodies being read — which is
precisely why the list projection stops asking for them. The measurement above is not a
committed artifact (the timer on this machine quantises at ~0.5 ms, so sub-millisecond
values read as zero); it is a temporary probe run against the live store and deleted.

Verification: `go test -count=1 ./internal/observability/requestcapture/` and
`./internal/desktop/` green, `go build ./...`, `go vet`, `gofmt -l` clean,
`go run ./tools/checkgofilesize` clean.

## Constraints

- A capability lives in the core; an adapter only names, projects and exposes it. Do not
  implement the match in the Wails binding or in a React component.
- Never restore behaviour by adding a capability to an adapter; move it down.
- `AGENTS.md` forbids suppressing a surviving mutant and forbids weakening a gate;
  survivors are closed by consolidating tests (table rows, stronger fixtures), never by
  adding one test function per mutant.
- The MCP-facing `search_requests` output is **not** part of this unit: it keeps its
  current full-record projection. If it should also return summaries, that is a separate
  decision about the agent-facing contract.
- Never hand-edit `frontend/wailsjs/`; regenerate bindings when a bound method changes.
- English artifacts. Colour and copy tokens stay as the theme skill defines them.

## Evidence to collect at close

- Before/after timings for: unfiltered first page, `route=/api/animes`, no-match route —
  through the same reader the desktop binding calls.
- Mutation score with `ditto staged --exclude-prefix frontend/` on
  `internal/observability/...` plus whatever the change touches.
- Frontend staged mutation result and the JS test count.

## Open follow-ups (recorded, not in scope)

- Migrate the two existing private `escapeLikePattern` copies onto the shared helper.
- `runtimeSource.subscribeCaptureTransactions` pushes the raw row; the client-side
  admission predicate is a projection of the core rule and must be kept in step.
- The `search_requests` MCP tool returns every matching record's bodies; a summary
  projection there is an agent-context win worth its own decision.
