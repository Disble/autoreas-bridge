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
- [x] **3. Make the text filters substring through one shared rule.** `route`,
  `outcome`, `kind` (captures) and `text` (events) build their pattern through the same
  helper: escaped metacharacters, `ESCAPE '\'`, and an empty input adds no predicate.
- [x] **4. Declare the shared rule where capability parity can hold it.** The pattern
  rule lives once in the core; both adapters project it; the conformance suite pins
  that both apply the same substring rule and that neither adapter implements matching.
- [x] **5. Record the no-index decision and its trigger.** The measurement, the caps,
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
  **Closed as not implemented, on the measurement** (see Work unit 5).
- [x] **9. Verify at the boundary and close.** Re-measure the same three calls against a
  copy of the live database and through the MCP sidecar, run the repository gates
  (`ditto staged` on the owning packages, frontend mutation gate, lint profiles,
  size/architecture checks), commit per work unit, and record the before/after numbers
  here.
- [x] **10. Stop the resolve pager from reading bodies.** `Reader.Resolve` pages the whole
  capture table; it now asks for the summary projection, since every field its ranking
  reads is a base column. Found while auditing which read paths still pay for the bodies.

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

## Work unit 2 — substring text filters through one shared rule (tasks 3 and 4)

New package `internal/sqltext` holds the single rule: `Contains(raw)` returns `%` + raw
with `\`, `%` and `_` escaped, and every caller pairs it with `LIKE ? ESCAPE '\'` — the
comment states why, because SQLite's LIKE has no default escape character. This is a
fourth-copy avoided: `internal/notification/center` and `internal/watchhistory` each keep
a private copy already, and neither was touched.

Wired through `requestcapture.SearchFilters` (`route`, `outcome`, `kind`) and
`eventlog.EventFilters` (`text`). `http_status`, `device_id`, `anime_id`, `error_code`,
`changelog_id` and the time bounds stay exact: they are identifiers and numbers, not
text.

**Recorded consequence**: `SearchFilters` is the CORE filter set, so the substring
semantics reach BOTH adapters — the desktop binding and the MCP `search_requests` tool.
That is deliberate (one capability, one meaning) and it is stated in the type's doc
comment and in the two MCP tool descriptions. A route search for `/api/animes` now also
returns `/api/animes/<id>/cover`; the alternative was a per-adapter semantics switch,
which would put two meanings behind one filter name.

The escaping is proved against the real engine, not by string shaping: against
`modernc.org/sqlite` a literal `100%` pattern matches only the row containing `100%`,
while the unescaped pattern deliberately matches both rows (`sqltext` package test).

Verification: `go test` green across `sqltext`, `observability/...`, `mcp/requestcapture`
and `desktop`; `gofmt`, `go vet`, `checkgofilesize` (no new warning — the substring test
lives in the package's new `filters_test.go`, matching its eventlog sibling, so
`reader_search_test.go` stays under the 400-line warning) and `checkarchitecture` clean;
the advanced lint profile reports 0 issues.

## Work unit 4 — the resolve pager and the no-index record (tasks 5 and 10)

`Resolve` paged every capture through `Search` with no projection selector, so the
most expensive read path in the app was the one whose output is a list of request ids:
it read each row's request/response body and header maps and used none of them. It now
requests the summary projection, and the comment states why that is sufficient (every
ranked field — `RequestID`, `Route`, `HTTPStatus`, `AnimeID`, `Correlations` — is a base
column the summary projection keeps).

**Known deviation, recorded rather than hidden**: the `Summary` flag on this call is a
performance choice that behaviour cannot observe — the summary projection carries every
field the ranking reads, so the resolve results are identical with the flag set or
unset, and the reader exposes no seam for observing which column list was requested.
Inventing one would test the test. The guard is the comment plus review, and the
behavioural conformance suite still pins that ranking is unchanged.

The mutation gate then found what that observation implies. Its only mutants for this
unit were the batch size the pager passed (`100` → `99` and `100` → `101`), and both
survived — correctly, because the pager loops until the backend stops offering cursors,
so the page size changes the number of round trips and nothing else. That literal
duplicated the reader's own declared ceiling, so it was deleted rather than tested:
the pager now passes `maxSearchLimit` and the staged scope produces no mutants at all
(ditto reports the score as unmeasurable, `-1`). The surviving-literal class was already
declared by the parity unit that moved resolve into the core, which recorded "the
pagination batch size, unobservable without pinning the constant"; this unit removes the
constant instead of pinning it.

The no-index decision now lives where the rule lives: the `internal/sqltext` package doc
carries the measurement (a `SCAN`, 0.13–1.70 ms over 3 043 rows), the bounds (5 000
captures, 20 000 events, both from retention caps wired in
`internal/desktop/app_defaults.go`), the two rejected alternatives (an FTS5 `trigram`
shadow table, with its write amplification and the `name_key` desync class, and a
Go-side index, which goes stale across processes against the read-only sidecar) and the
trigger that reopens it (a cap raised by an order of magnitude, or a substring over an
unbounded table — re-measure first).

## Work unit 5 — debounce re-scoped, and the final measurement (tasks 8 and 9)

**Task 8 was not implemented, deliberately.** The debounce was planned when every
keystroke cost 150–370 ms and up to 24 MB. After units 1 and 2, a query costs
sub-millisecond and returns 25 rows, so a 150–200 ms debounce would not remove any
measurable work — it would only delay the first filtered result by that much, and the
per-keystroke queries it would suppress are now the cheaper feedback. The obsolete-
response guard it was meant to pair with already exists (`active` in the query effect),
so a slow response cannot land out of order either. The mechanism was dropped for the
reason the repository asks for everywhere: no new machinery without a measured cause.
If typing turns out to flicker between the skeleton and the rows, the fix is NOT a
debounce but keeping the loaded rows on screen while a filter-driven refetch is in
flight, with the skeleton reserved for the first load. That is the follow-up to reach
for, and it needs the owner's report first because it was never observed.

Final measurement, read-only against the live store, through the same reader the
desktop binding calls (3 059 captures, 7 677 runtime events, 2026-09-20). The
sub-millisecond entries sit below this machine's ~0.5 ms timer resolution:

| Call | Before | After |
| --- | --- | --- |
| Transactions first page, full projection (the MCP path) | 144–359 ms | ~0.5 ms |
| Transactions first page, summary projection (the desktop list) | n/a — it read the bodies | ~0.5 ms |
| `route` matching substring (`animes`, 336 rows) | exact equality only, so a partial matched nothing | ~0.5 ms, and partials match |
| `route` with no match (the worst case: nothing to stop the scan early) | 58 ms | 3.2 ms |
| `outcome` / `kind` substring | exact equality only | ≤0.5 ms matching, ~3.0 ms with no match |
| Runtime Events text substring (7 677 rows) | ~5 ms at 7.5 k rows | ~0.5 ms matching, 2.6 ms with no match |
| A literal `%` typed into the events search | returned every row (a wildcard) | returns the 2 rows whose text contains a literal `%` |

The last row is the escaping fix observed on real data: the search that used to be a
match-everything wildcard is now an honest literal search.

Gates at close: the Go suite plus both lint profiles green on every work unit; the
frontend gate green including its zero-tolerance staged mutation report (88/88 mutants
killed, 0 survived, 1 static-ignored) after three rounds of closing survivors found by
that gate; `ditto staged` 1.00 on unit 1, no scoreable mutants on unit 2 and unit 4, and
the resolve unit closed by deleting the redundant literal rather than pinning it.

Commits: `5afcf2b` tasks 1–2 · `922aabf` tasks 3–4 · `de3678b` tasks 6–7 · `a764231`
tasks 5 and 10.

### Deviations recorded rather than hidden

- The freeze/crash the owner reported was never reproduced by the agent. The measured
  cost per keystroke is the evidence behind the fix, and the symptom is consistent with
  it, but a reproduction would have been stronger.
- The `Summary` flag on the resolve pager is a performance choice that behaviour cannot
  observe (recorded in Work unit 4); the batch-size literal that could be observed was
  deleted rather than pinned.
- The substring semantics reach the MCP `search_requests` tool as well as the desktop,
  deliberately and documented in both the core type and the tool descriptions.
- One frontend gate run failed on two unrelated 5 s test timeouts under the hook's
  parallel load (a documented contention class in `lefthook.yml`); the same suites passed
  standalone and on the next run, and nothing in this feature was changed for it.

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
