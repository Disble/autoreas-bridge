# Tasks: MyAnimeList Metadata Autofill (SDD-70)

Change: `2026-09-12-sdd-70-mal-metadata`
Inputs: `proposal.md`, `explore.md`, `design.md` (D1–D12), `specs/myanimelist-metadata-source/spec.md`
(6 requirements, 13 scenarios), `specs/anime-metadata-autofill/spec.md` (8 requirements, 16 scenarios),
`specs/anime-create-editor/spec.md` (1 modified requirement, 4 scenarios).

> **Format note.** The generic `sdd-tasks` skill caps this artifact at 530 words. This change carries
> eleven strict-TDD work units across two languages with a mandatory MUTATE step per unit, plus
> fourteen orchestrator-named non-negotiable traps. `openspec/changes/archive/2026-09-11-sdd-67-keymap-in-backups/tasks.md`
> set the precedent for overriding the cap at this detail level; this document follows the same shape —
> per-task RED/GREEN/MUTATE labels, exact file/test names, and a coverage matrix.

## Task-Planning Notes (read before Slice 1)

**A. `AppliedMetadata<TPatch>` and `buildUndoPatch` are generic and belong in the shared module, not
in Create's helpers file.** `design.md`'s File Changes table lists `buildUndoPatch` only under
`anime-create-metadata.helpers.ts` (Slice 6), but D9's own snippet types it `<TPatch>` and both
features need it identically. Placing it under Create and having Editor import a peer feature's
helper file would be a features→features import, which this repo avoids. Resolution: `AppliedMetadata`
lands in `metadata-lookup.types.ts` (4a) and `buildUndoPatch` in `metadata-lookup.helpers.ts` (4b);
Slices 6 and 7 both import from `shared/metadata-lookup/`, never from each other.

**B. Fixture provenance.** HTML fixtures (`testdata/detail_*.html`) carry a literal HTML comment
header (`source`, `capture date`, `what was removed`) at the top of the file — CLAUDE.md #14's
requirement, made concrete. JSON fixtures cannot hold comments without polluting the real MAL shape,
so `internal/myanimelist/testdata/PROVENANCE.md` carries their source query and capture date instead,
one entry per fixture, updated alongside each fixture that adds one.

**C. The depguard guard (non-negotiable #12) is a manual lint probe, not a permanent Go test.**
Grep across the repo found no precedent of `domain-purity`/`wails-confined-to-edge` being verified by
a committed Go test — every existing depguard rule is verified by running `golangci-lint run` itself.
Task 3.3 follows the same mechanism: add a deliberate `internal/anime` import to a scratch file,
confirm the new rule fails the build with its message, delete the scratch file. No permanent test
file is left behind, matching how the two existing rules are verified today.

**D. Threat Matrix: N/A row for chained-PR/gate obligations.** `design.md`'s own Threat Matrix records
no routing/shell/subprocess/VCS surface; its four trust notes (untrusted HTML never rendered, body
caps, cover resolver reuse, no injection) are discharged structurally by D1/D5's design choices and
need no dedicated RED task beyond what Slices 1–2 already build.

**E. Non-Latin probing is already done.** D7a's table is measured evidence from explore.md, not a
task to redo — 4b.1 only pins the already-measured rows into a table test.

**F. `internal/myanimelist/live_test.go` (D3) is opt-in and MUST compile.** It ships with Slice 2b,
gated on `MYANIMELIST_LIVE=1` with `t.Skip` otherwise — never a build tag, so `go vet`/golangci always
see it (D3's rejection of `//go:build mal_live`).

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ≈2,935–3,935 authored (design.md § Sizing, measured against real comparables) + 40–80 lines of artifact prose per slice, excluding HTML fixture byte counts |
| 400-line budget risk | High against a PR budget — but the PR is not this repo's delivery unit (one PR in its entire history). Against the real unit, the ~600-line-per-**commit** cap (CLAUDE.md § 22, D12), the risk is **Medium**: three of the eight design slices already required subdivision and are pre-split below into eleven work units |
| Chained PRs recommended | No — `single-pr` with `size:exception` accepted at the branch level (preflight-resolved) |
| Suggested split | Eleven sequential commits on one branch, each independently gated by RED→GREEN→MUTATE→REFACTOR and its own `git commit` |
| Delivery strategy | `single-pr` (size:exception accepted) |
| Chain strategy | `size-exception` |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High
```

`size:exception` was already accepted at session start (preflight), so `Decision needed before apply`
resolves to `No` — `sdd-apply` proceeds directly with Slice 1, subdividing further per CLAUDE.md § 22
if any unit's measured `wc -l` reaches the ~600-line band at apply time.

### Per-Unit Line Forecast (inherited from design.md D12 — not re-derived)

| Unit | Band (prod+test) | Over ~600? |
|---|---|---|
| 1. Go foundation (types/errors/client/search) | 410–575 | No |
| 2a. `parse.go` locators + `parseDurationMinutes` | ~280–370 (half of Slice 2's 560–730) | No |
| 2b. `detail.go` orchestration + integration + live probe | ~280–360 | No |
| 3. Bindings + DTO + depguard | 240–340 | No |
| 4a. Shared types + constants + vocab map | ~150–220 (part of 455–625) | No |
| 4b. `normalizeLookupQuery`/`meetsMinimumQueryLength`/`rankCandidates` | ~305–405 | No |
| 5a. Hook + `renderHook` suite | ~260–340 (part of 570–760) | No |
| 5b. Modal + candidate + states + layout fixture | ~310–420 | No |
| 6. Create wiring | 275–335 | No |
| 7. Editor wiring | 275–335 | No |
| 8. ADR + docs | 160–250 | No |

### Suggested Work Units

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| 1 | Search client + typed errors, one request per query | `go test ./internal/myanimelist/...` | N/A — no consumer yet | `git revert`; module new, unreferenced |
| 2a | Parser locators, label sets, `parseDurationMinutes` | `go test ./internal/myanimelist/... -run 'Parse\|Duration'` | N/A — unit-level, no consumer | `git revert`; parse.go only used by its own tests |
| 2b | `detail.go`, anchor gate, `Unfilled`, live probe | `go test ./internal/myanimelist/... -run Detail` | N/A — not wired to Wails yet | `git revert`; detail.go unreferenced outside its tests |
| 3 | Wails bindings, DTOs, isolation depguard | `go test ./internal/desktop/... ./internal/api/contracts/...` | N/A — no UI trigger yet | `git revert`; bindings additive, no existing binding touched |
| 4a | Shared types, constants, MAL→bridge vocab map | `bun --cwd="frontend" run test -- metadata-lookup` | N/A — types/constants only | `git revert`; no consumer yet |
| 4b | Query normalize, min-length floor, local re-rank | `bun --cwd="frontend" run test -- metadata-lookup` | N/A — helpers only | `git revert`; no consumer yet |
| 5a | Debounce/newest-wins/cache hook | `bun --cwd="frontend" run test -- use-anime-metadata-lookup` | N/A — buildable/testable with no UI (design's own rationale for the split) | `git revert`; hook has no UI consumer yet |
| 5b | Modal, candidate card, three states, layout fixture | `bun --cwd="frontend" run test -- AnimeMetadataLookupModal` | `bun --cwd="frontend" run render:smoke` | `git revert`; modal has no feature consumer yet |
| 6 | Create row: button, mapping, undo, folder re-derivation | `bun --cwd="frontend" run test -- anime-create` | `bun --cwd="frontend" run render:smoke` | `git revert`; hand-typed Create flow unaffected |
| 7 | Editor form: button, mapping, undo, five-field guard | `bun --cwd="frontend" run test -- anime-editor` | `bun --cwd="frontend" run render:smoke` | `git revert`; hand-typed Editor flow unaffected |
| 8 | ADR-022, ubiquitous language, CHANGELOG, drift record | N/A — documentation | N/A — no runtime path | `git revert`; docs only, zero runtime behavior |

---

## Slice 1 — Go Foundation: Types, Errors, Client, Search

**Leaves the app working because:** the module is new and imported by nothing yet.
**Forecast:** 410–575 lines. Closes `myanimelist-metadata-source`'s "Two-stage retrieval gates the
detail fetch on confirmation" (search half) and "Zero search results is not an error".

### 1.1 `go.mod` — promote the HTML parser (D1)

- [x] **1.1.1** [GREEN] Edit `go.mod`: move `golang.org/x/net v0.56.0` from the indirect block to a
  direct `require`. Confirm `go.sum` has zero diff (D1 — already resolved by the build graph).

### 1.2 Fixtures

- [x] **1.2.1** [DATA] Create `internal/myanimelist/testdata/PROVENANCE.md` (Note B) — a running log
  of every fixture's source query/URL and capture date, seeded with the three entries below.
- [x] **1.2.2** [DATA] Create `internal/myanimelist/testdata/search_bleach.json` — pinned `prefix.json`
  response for `Bleach: Sennen Kessen-hen` (explore § 2.2, 6 hits).
- [x] **1.2.3** [DATA] Create `internal/myanimelist/testdata/search_typo.json` — pinned response for the
  one-letter-off `Bleach: Sennen Kesen-hen` (still 6 hits, same top result) — proves typo tolerance
  survives the fixture layer.
- [x] **1.2.4** [DATA] Create `internal/myanimelist/testdata/search_zero_hits.json` — pinned empty-items
  response for `Shokuguemi no Soma` (explore § 2.2, 0 hits).

### 1.3 `types.go` and `errors.go`

- [x] **1.3.1** [GREEN] Create `internal/myanimelist/types.go`: `Candidate{ID, Name, Image, MediaType,
  StartYear, Score}`, `SearchResult{Candidates []Candidate}`, `Detail{Title, Type, Episodes, Duration,
  Source string; Studios, Genres, Unfilled []string}` (no independent RED — exercised by 1.6/1.7).
- [x] **1.3.2** [RED] Write `internal/myanimelist/errors_test.go`: `DriftError{Anchor,URL}.Error()`
  names the anchor; `errors.As` unwraps a wrapped `*DriftError`.
- [x] **1.3.3** [GREEN] Create `internal/myanimelist/errors.go`: `DriftError{Anchor, URL string}` with
  `Error() string`, `ErrNotFound`, status/transport sentinel errors.

### 1.4 `client.go` — port/adapter mirroring `cover/http_fetcher.go`

- [x] **1.4.1** [RED] Write `internal/myanimelist/client_test.go`: `httpClient.Fetch` against
  `httptest.Server` — 200 returns the body; non-200 returns a transport sentinel; a body beyond
  `maxBytes` is capped by `io.LimitReader` (mirrors `cover/http_fetcher_test.go`).
- [x] **1.4.2** [GREEN] Create `internal/myanimelist/client.go`: port `Fetcher`, adapter `httpClient`,
  `NewHTTPClient(timeout, maxBytes)`, `http.NewRequestWithContext`, status check, `io.LimitReader`,
  honest `autoreas-bridge/<version>` User-Agent (design's Threat Matrix note).

### 1.5 `search.go`

- [x] **1.5.1** [RED] Write `internal/myanimelist/search_test.go`: `Client.Search` over
  `search_bleach.json` returns the pinned candidates; `search_zero_hits.json` returns an empty (not
  error) `SearchResult`; the request the fake server received carries the `url.QueryEscape`d keyword.
- [x] **1.5.2** [GREEN] Create `internal/myanimelist/search.go`: `Client{fetch Fetcher; baseURL string}`,
  `Search(ctx, query) (SearchResult, error)` — `GET /search/prefix.json?type=anime&keyword=<escaped>&v=1`.

### 1.6 Non-negotiable #4 (search half) — exactly one request per query

- [x] **1.6.1** [RED] Extend `search_test.go`: `TestSearchIssuesExactlyOneRequestPerQuery` — an
  `httptest.Server` counting requests via an atomic counter; one `Search` call asserts
  `requestCount == 1` (D11 — "no retry" is otherwise unverified).
- [x] **1.6.2** [GREEN] Expected: no production change — `Search` performs one `fetch.Fetch` call by
  construction. A failing counter names a defect in `search.go`, not in the test.

### 1.7 Testing & Verification

- [x] **1.7.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go
  test -count=1 -json ./internal/myanimelist/"`.
- [x] **1.7.2** [VERIFY] `go test ./internal/myanimelist/...`; both golangci profiles; `go run
  ./tools/checkgofilesize`; `git status --porcelain` scoped to this slice's files.
- [x] **1.7.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(myanimelist): add search client and typed errors`).

**Rollback:** `git revert`. Module new and unreferenced outside its own tests.

---

## Slice 2a — `parse.go`: Locators, Extractors, `parseDurationMinutes`

**Leaves the app working because:** parse.go is only exercised by its own tests until Slice 2b wires it.
**Forecast:** ~280–370 lines (half of the 560–730 pre-subdivision Slice 2 band). Closes
`myanimelist-metadata-source`'s "Genre label matches both singular and plural forms" (fully), "Duration
parsing recognizes known shapes..." (fully), "Source label handles anchor text, bare text, and
padding" (fully).

### 2a.1 Fixtures (Note B — HTML comment provenance header on every file)

- [x] **2a.1.1** [DATA] Update `testdata/PROVENANCE.md` with entries for the four fixtures below.
- [x] **2a.1.2** [DATA] Create `internal/myanimelist/testdata/detail_tv.html` — a TV anime (e.g. Bleach,
  `anime/41467`) trimmed to the title heading + information block; plural `Genres:`/`Studios:`.
- [x] **2a.1.3** [DATA] Create `internal/myanimelist/testdata/detail_single_genre.html` — a single-genre
  anime, singular `Genre:`/`Studio:` (explore trap #1) — **non-negotiable #1**.
- [x] **2a.1.4** [DATA] Create `internal/myanimelist/testdata/detail_ona.html` — `Type: ONA` (e.g.
  Devilman Crybaby, explore trap #5).
- [x] **2a.1.5** [DATA] Create `internal/myanimelist/testdata/detail_movie.html` — `Duration: 1 hr. 46
  min.`; `Source:` as an anchor whose text is padded with newlines (explore trap #3).

### 2a.2 Locators and label sets — non-negotiable #1

- [x] **2a.2.1** [RED] Write `internal/myanimelist/parse_test.go`: over `detail_tv.html`, `Type:`→`TV`
  and `Status:` presence-only; over `detail_single_genre.html`, the genre locator (accepted set
  `{"Genres:","Genre:"}`) returns the one genre — **the single-genre fixture is the highest-value test
  in this change (non-negotiable #1)**; over `detail_tv.html`, the same locator returns every listed
  genre for the plural form.
- [x] **2a.2.2** [GREEN] Create `internal/myanimelist/parse.go` (part 1): `golang.org/x/net/html` DOM
  walk, ordered locator lists (itemprop first where a fixture proves one exists, label-anchored
  second, per D1), label-set matching for `Genres:`/`Genre:` and `Studios:`/`Studio:`.

### 2a.3 Trap #3 — `Source:` anchor vs. bare text vs. padding

- [x] **2a.3.1** [RED] Extend `parse_test.go`: `Source:` over `detail_movie.html` (anchor, newline-
  padded) trims to the exact text, no leading/trailing whitespace; a bare-text `Source:` case (add to
  `detail_tv.html` or a minimal fifth fixture) returns the plain text unchanged.
- [x] **2a.3.2** [GREEN] Extend `parse.go`: `Source:` extractor prefers anchor text, falls back to bare
  text, `strings.TrimSpace` on the result.

### 2a.4 `parseDurationMinutes` — non-negotiable #2, D2a's exact table

- [x] **2a.4.1** [RED] Write `internal/myanimelist/duration_test.go`: table test over every D2a row —
  `"24 min. per ep."→24`, **`"1 hr. 46 min."→106`** (never `1` — assert the literal, never a value
  re-derived from the production constant, CLAUDE.md § 16), `"2 hr."→120`, `"2 hr. 5 min."→125`,
  `"46 min."→46`, `"24 minutes/episode"→ok:false`, `"Unknown"→ok:false`.
- [x] **2a.4.2** [GREEN] Implement `func parseDurationMinutes(raw string) (minutes int, ok bool)` in
  `parse.go` exactly per D2a's signature.

### 2a.5 `Episodes:` raw extraction and `ONA`'s raw text (mapping stays outside this module)

- [x] **2a.5.1** [RED] Extend `parse_test.go`: `Episodes:` digits extract as string; the literal
  `Unknown` extracts as-is (the unfilled/drift decision is made one layer up, in 2b); `Type: ONA` over
  `detail_ona.html` extracts the plain string `"ONA"` with no special-casing inside
  `internal/myanimelist` — the closed 4-value kind mapping happens in the frontend hop (D6, Slice 4a).
- [x] **2a.5.2** [GREEN] Extend `parse.go`: `Episodes:` raw extraction.

### 2a.6 Testing & Verification

- [x] **2a.6.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go
  test -count=1 -json ./internal/myanimelist/"`.
- [x] **2a.6.2** [VERIFY] `go test ./internal/myanimelist/...`; both golangci profiles;
  `checkgofilesize`.
- [x] **2a.6.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(myanimelist): add detail page parser and duration table`) —
  left for the orchestrator per CLAUDE.md § 3/4 (commits are orchestrator-owned).

**Rollback:** `git revert`. `parse.go` is not yet called outside its own tests.

---

## Slice 2b — `detail.go`: Anchor Gate, `Unfilled`, Integration, Live Probe

**Leaves the app working because:** detail.go is not wired to any Wails binding yet.
**Forecast:** ~280–360 lines. Closes `myanimelist-metadata-source`'s "Required-anchor parsing aborts
loudly; optional fields degrade visibly" (fully), "Two-stage retrieval..." (detail half + zero-hit
already covered in 1.6), "Module boundary isolation" (structural half proven here, static proof in
Slice 3).

### 2b.1 Drift fixture

- [x] **2b.1.1** [DATA] Update `testdata/PROVENANCE.md`: the drift fixture's entry names `Type:` as
  deliberately removed to simulate markup drift, not a capture artifact.
- [x] **2b.1.2** [DATA] Create `internal/myanimelist/testdata/detail_drift.html` — `detail_tv.html` with
  the `Type:` label/value block deleted; HTML comment header naming the deliberate removal.

### 2b.2 Anchor gate — non-negotiable #3

- [x] **2b.2.1** [RED] Write `internal/myanimelist/detail_test.go`:
  `TestDetailMissingTypeAnchorReturnsDriftErrorAndZeroFields` — parsing `detail_drift.html` returns
  `errors.As(err, &driftErr)` with `driftErr.Anchor == "Type:"`, and the returned `Detail` is the zero
  value — **non-negotiable #3, the drift trap this whole contract exists to prevent**.
- [x] **2b.2.2** [GREEN] Create `internal/myanimelist/detail.go`: orchestrates `parse.go`'s extractors,
  checks the three anchors (title heading, `Type:`, `Status:` — presence-only, discarded per D2),
  returns `*DriftError{Anchor, URL}` on any miss, aborting with a zero `Detail`.

### 2b.3 Mapped fields → `Unfilled`, present-but-unparseable → drift

- [x] **2b.3.1** [RED] Extend `detail_test.go`: over the Slice 2a fixtures, an absent mapped field (no
  `Studios:` block) appends its label to `Unfilled` and leaves the value empty, never defaulted; a
  present-but-unparseable mapped field (a doctored `Duration: 24 minutes/episode` variant) returns
  `*DriftError{Anchor:"Duration:"}`, never a zero (D2's "third outcome").
- [x] **2b.3.2** [GREEN] Extend `detail.go`: mapped-field assembly — success → value; legitimate
  absence → `Unfilled` append; unparseable-but-present → `*DriftError`.

### 2b.4 Full-page integration over `httptest` — non-negotiable #4 (detail half)

- [x] **2b.4.1** [RED] Write `internal/myanimelist/detail_integration_test.go`: `httptest.Server`
  serving `detail_tv.html` at `/anime/{id}`; `Client.Detail(ctx, id)` returns the fully mapped
  `Detail`; a second case counts requests on the server and asserts exactly one GET per `Detail` call.
- [x] **2b.4.2** [GREEN] Add `Client.Detail(ctx, malID int) (Detail, error)` to `detail.go`: builds
  `fmt.Sprintf("%s/anime/%d", base, malID)` — never a slug (design's Interfaces note) — fetches via
  `Fetcher`, delegates to the parser.

### 2b.5 Non-negotiable #5 (Go structural half) — search never chains into detail

- [x] **2b.5.1** [RED] Extend `detail_integration_test.go`: a fake `Fetcher` that fails if invoked
  proves `Client.Search` alone never triggers a detail-page fetch — `Search` and `Detail` share no
  internal call edge. (The user-confirmation gate itself is enforced at the hook/UI layer, proven again
  in 5a.5/5b.2; this proves the Go-side half — nothing inside `internal/myanimelist` chains a search
  into a detail fetch on its own.)
- [x] **2b.5.2** [VERIFY] Passes by construction. A failure here names a coupling defect between
  `search.go` and `detail.go`.

### 2b.6 Live probe (D3, opt-in, never a build tag)

- [x] **2b.6.1** [GREEN] Create `internal/myanimelist/live_test.go`: gated on `MYANIMELIST_LIVE=1`
  (`t.Skip` otherwise, Note F); against a live, stable anime ID, asserts every required anchor is
  present and the parse returns no `*DriftError`; asserts **no** score/rank/member values (D3 — those
  change hourly and pinning them would be flaky for a reason that is not drift).

### 2b.7 Testing & Verification

- [x] **2b.7.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go
  test -count=1 -json ./internal/myanimelist/"`.
- [x] **2b.7.2** [VERIFY] `go test ./internal/myanimelist/...` (confirm `live_test.go` SKIPs, not
  fails, with the env var unset); both golangci profiles; `checkgofilesize`.
- [x] **2b.7.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(myanimelist): add detail fetch, anchor gate, and live probe`).

**Rollback:** `git revert`. `detail.go` not yet wired to any Wails binding.

---

## Slice 3 — Bindings, DTOs, Isolation Depguard

**Leaves the app working because:** bindings are additive; no existing binding is touched.
**Forecast:** 240–340 lines. Closes `myanimelist-metadata-source`'s "Module boundary isolation"
(static proof).

### 3.1 DTOs

- [x] **3.1.1** [GREEN] Create `internal/api/contracts/myanimelist.go`: `MyAnimeListSearchResult{
  Outcome, Message string; Candidates []CandidateDTO}`, `MyAnimeListDetailResult{Outcome, Message
  string; <flat detail fields>}` — same role as `AnimeEditorRecordResult` (structural-only; exercised
  by 3.2's binding test, no standalone RED).

### 3.2 Wails bindings + domain→DTO conversion (D4)

- [x] **3.2.1** [RED] Write `internal/desktop/app_myanimelist_test.go`: `SearchMyAnimeList` — candidates
  present → `Outcome: AnimePatchOutcomeApplied`; zero candidates → `AnimePatchOutcomeNoOp` (not an
  error — the UI renders `AirisEmptyState`); a `*DriftError` or transport failure → `AnimePatchOutcomeError`
  with `Message` naming the anchor. `GetMyAnimeListDetail` — the same three-way mapping over
  `Detail`/`*DriftError`. Assert `AnimePatchOutcomeConflict` is never produced (D4 — unused dimension).
- [x] **3.2.2** [GREEN] Create `internal/desktop/app_myanimelist.go`: `func (a *App)
  SearchMyAnimeList(query string) contracts.MyAnimeListSearchResult` and `func (a *App)
  GetMyAnimeListDetail(malID int) contracts.MyAnimeListDetailResult`, converting `myanimelist.Client`
  calls per D4's outcome table.

### 3.3 Isolation depguard — non-negotiable #12 (Note C)

- [x] **3.3.1** [VERIFY] Add a deliberate `internal/anime` import to a throwaway
  `internal/myanimelist/zz_depguard_probe.go`; run `golangci-lint run` and confirm it fails on the new
  `myanimelist-speaks-only-mal` rule's message; delete the probe file. Manual lint-probe verification,
  matching how `wails-confined-to-edge` is verified elsewhere in this repo (no permanent test file).
- [x] **3.3.2** [GREEN] Modify `.golangci.yml`: add the `myanimelist-speaks-only-mal` depguard rule
  (D5) — denies `internal/anime` and `internal/api/contracts` imports from `internal/myanimelist/**`.

### 3.4 Testing & Verification

- [x] **3.4.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --exclude-prefix
  internal/myanimelist/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/desktop/"`.
- [x] **3.4.2** [VERIFY] `go test ./internal/desktop/... ./internal/api/contracts/...`; both golangci
  profiles (confirm the new rule doesn't false-positive on existing code); `checkgofilesize`.
- [x] **3.4.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(desktop): add MyAnimeList Wails bindings and isolation guard`).

**Rollback:** `git revert`.

---

## Slice 4a — Shared Types, Constants, MAL→Bridge Vocabulary Map

**Leaves the app working because:** no consumer exists yet.
**Forecast:** ~150–220 lines (part of the 455–625 Slice 4 band).

### 4a.1 Types (D6, D9 per Note A)

- [x] **4a.1.1** [GREEN] Create `frontend/src/shared/metadata-lookup/metadata-lookup.types.ts`:
  `AnimeMetadataCandidate`, `AnimeMetadataSelection` (exact shape — `name`, optional
  `kind/totalEpisodes/duration/origin/genres/studios/coverURL`, `unfilled: readonly string[]`),
  `LookupState = 'idle'|'loading'|'resolved'|'failed'`, and (Note A) the generic
  `AppliedMetadata<TPatch>{patch, previous, appliedFields, unfilled}`. Every property `readonly`;
  JSDoc on every declaration.

### 4a.2 Constants + MAL→bridge vocabulary map — non-negotiable #6

- [x] **4a.2.1** [RED] Write `metadata-lookup.constants.test.ts`: the tipo map — `'TV'→'0'`,
  `'Movie'→'1'`, `'Special'→'2'`, `'OVA'→'3'`, and `'ONA'`/`'Music'`/anything else → `undefined`
  (unmapped) — **non-negotiable #6: `ONA` never maps to TV**.
- [x] **4a.2.2** [GREEN] Create `metadata-lookup.constants.ts`: `METADATA_LOOKUP_DEBOUNCE_MS = 300`
  (declared separately from `ANIME_CREATE_NAME_CHECK_DEBOUNCE_MS`, D7), `METADATA_LOOKUP_MIN_LENGTH_WIDE
  = 2`, `METADATA_LOOKUP_MIN_LENGTH_LATIN = 3`, the MAL-type→kind map, `METADATA_LOOKUP_SKELETON_ROW_COUNT`.

### 4a.3 Testing & Verification

- [x] **4a.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to these two files.
- [x] **4a.3.2** [VERIFY] `bun --cwd="frontend" run test -- metadata-lookup`; ESLint `max-lines`;
  `fallow audit` (no unused-export finding — consumed starting 4b/5a).
- [x] **4a.3.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(metadata-lookup): add shared types and MAL vocabulary map`).

**Rollback:** `git revert`. Pure types/constants, no consumer yet.

---

## Slice 4b — Query Normalize, Min-Length Floor, Local Re-Rank

**Leaves the app working because:** no consumer exists yet.
**Forecast:** ~305–405 lines (remainder of the 455–625 Slice 4 band).

### 4b.1 `meetsMinimumQueryLength` — non-negotiable #10, D7a's eight-row table

- [x] **4b.1.1** [RED] Write `metadata-lookup.helpers.test.ts` — table test over all eight D7a rows:
  `鬼` (1 code point) → false, `銀魂` (2) → true, `ナル` (2) → true, `進撃の` (3) → true, `進撃の巨人`
  (5) → true, `bl` (2) → false, `ble` (3) → true, `''`/whitespace → false.
- [x] **4b.1.2** [GREEN] Implement `meetsMinimumQueryLength(query): boolean` exactly per D7a's shipped
  form — spread into code points, numeric `> 127` check, never a regex character-class range.

### 4b.2 `normalizeLookupQuery`

- [x] **4b.2.1** [RED] Extend the helpers test: `"  Bleach  "` and `"bleach"` normalize to the same
  cache key (case-fold, collapse whitespace).
- [x] **4b.2.2** [GREEN] Implement `normalizeLookupQuery(raw): string`.

### 4b.3 `rankCandidates` — measured Jujutsu Kaizen case

- [x] **4b.3.1** [RED] Extend the helpers test: over MAL's own order (2026 sequel ranked first),
  `rankCandidates` reorders so the real *Jujutsu Kaisen* ranks first — asserting **order only**, never
  the 0.93/0.55 scores (D11 — those belong to the explore's metric).
- [x] **4b.3.2** [GREEN] Implement `rankCandidates(candidates, query)`: normalized Levenshtein ratio
  over case-folded, punctuation-stripped strings.

### 4b.4 `buildUndoPatch` (Note A — generic, shared home)

- [x] **4b.4.1** [RED] Extend the helpers test: `buildUndoPatch(draft, patch)` copies exactly
  `Object.keys(patch)` from the current draft — no more, no fewer.
- [x] **4b.4.2** [GREEN] Implement `buildUndoPatch<TPatch>(draft, patch): TPatch`, pure.

### 4b.5 Testing & Verification

- [x] **4b.5.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to
  `metadata-lookup.helpers.ts`.
- [x] **4b.5.2** [VERIFY] `bun --cwd="frontend" run test -- metadata-lookup`; ESLint; `fallow audit`.
- [x] **4b.5.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(metadata-lookup): add query normalize, min-length floor,
  and local re-rank`).

**Rollback:** `git revert`. Helpers have no UI consumer yet.

---

## Slice 5a — `use-anime-metadata-lookup.ts` Hook

**Leaves the app working because:** buildable/testable with no UI, per design's own rationale for
this split (strict hook anatomy).
**Forecast:** ~260–340 lines (part of the 570–760 Slice 5 band).

### 5a.1 Newest-wins sequence counter — non-negotiable #9 (stale-drop)

- [x] **5a.1.1** [RED] Write `use-anime-metadata-lookup.test.ts` (`renderHook` + fake timers + an
  injected fake `source.SearchMyAnimeList`): a stale response resolving **after** a newer one is
  dropped — final state reflects the newer query only.
- [x] **5a.1.2** [GREEN] Implement the `requestSeq` ref + `runSearch` callback exactly per D7's code
  shape — floor gate, cache lookup, `seq !== requestSeq.current` drop.

### 5a.2 Cache hit — non-negotiable #9 (no request)

- [x] **5a.2.1** [RED] Extend the test: a second search for an already-**normalized**-cached query
  issues zero calls to the injected source.
- [x] **5a.2.2** [GREEN] Confirm the cache-hit short-circuit (implemented in 5a.1.2); extend if the RED
  exposes a gap.

### 5a.3 Sub-minimum query — non-negotiable #9 (no request) + #5 (frontend half)

- [x] **5a.3.1** [RED] Extend the test: a query below `meetsMinimumQueryLength`'s floor issues zero
  calls and sets `idle` — half of **non-negotiable #5** (no request fires below the floor either).
- [x] **5a.3.2** [GREEN] Wire `meetsMinimumQueryLength` (Slice 4b) into the top of `runSearch`.

### 5a.4 Debounce coalescing

- [x] **5a.4.1** [RED] Extend the test: three keystrokes inside 300 ms issue exactly one request, for
  the final query only (fake-timer advance).
- [x] **5a.4.2** [GREEN] Wrap `runSearch` in `METADATA_LOOKUP_DEBOUNCE_MS` via a `timerRef`; the hook's
  only `useEffect` is the teardown `clearTimeout` (D7 — no effect drives the search itself).

### 5a.5 Non-negotiable #5 (hook half) — detail fetch gated on confirmation

- [x] **5a.5.1** [RED] Extend the test: highlighting/selecting a candidate calls no
  `GetMyAnimeListDetail`; only an explicit `confirmCandidate(id)` call does.
- [x] **5a.5.2** [GREEN] Implement `confirmCandidate` as the sole path to
  `source.GetMyAnimeListDetail`.

### 5a.6 Name pre-fill, first-open-only

- [x] **5a.6.1** [RED] Extend the test: `hasSeededRef` seeds the query from the passed-in `name` prop
  only on first open; a second open does not overwrite a user-typed value.
- [x] **5a.6.2** [GREEN] Implement the `hasSeededRef` gate.

### 5a.7 Testing & Verification

- [x] **5a.7.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to
  `use-anime-metadata-lookup.ts`.
- [x] **5a.7.2** [VERIFY] `bun --cwd="frontend" run test -- use-anime-metadata-lookup`; strict hook
  anatomy order (imports, signature, refs, state, 3rd-party hooks, queries/mutations, derived state,
  callbacks, effects, return); ESLint.
- [x] **5a.7.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(metadata-lookup): add debounced newest-wins lookup hook`).

**Rollback:** `git revert`. No UI consumer yet.

---

## Slice 5b — Modal, Candidate Card, Three States, Layout Fixture

**Leaves the app working because:** no feature consumer wires the modal yet.
**Forecast:** ~310–420 lines (remainder of the 570–760 Slice 5 band).

### 5b.0 Missing task: `toAnimeMetadataSelection` (hop one, orchestrator-assigned)

- [x] **5b.0.1** [RED/GREEN] Add `toAnimeMetadataSelection(detail): AnimeMetadataSelection` to
  `metadata-lookup.helpers.ts`, consuming `METADATA_LOOKUP_KIND_MAP`; added `AnimeMetadataDetail` to
  `metadata-lookup.types.ts`. Table-tested per the Field Mapping rules (kind/totalEpisodes/duration/
  origin/genres/studios/coverURL; `Status:` has no field at all in the input type — structurally
  unavailable). Wired into the hook's new `onConfirmSelection`.

### 5b.1 Three exclusive states — non-negotiable #11

- [x] **5b.1.1** [RED] Write `AnimeMetadataLookupModal.test.tsx`: `loading` renders the skeleton and
  asserts the **negative** (no candidate card in the document); `failed` renders the error `Alert`,
  asserting no skeleton/candidates; `resolved` + zero candidates renders `AirisEmptyState` naming the
  query with **no action button** (D11), asserting no skeleton/error; `resolved` + candidates renders
  the list, asserting no skeleton/error/empty-state. **All four assert the negative.**
- [x] **5b.1.2** [GREEN] Implement `AnimeMetadataLookupModal.tsx` — HeroUI v3 compound (`RateAnimeModal`
  shape), D8's four mutually-exclusive branches verbatim, `role="status"` + `aria-live="polite"` +
  `aria-labelledby` → `sr-only` span holding `METADATA_LOOKUP_LOADING_LABEL`. Also wired `rankCandidates`
  (built in 4b, never consumed until now) into the resolved-state render.

### 5b.2 Candidate card + confirm gate — non-negotiable #5 (UI half)

- [x] **5b.2.1** [RED] Extend the modal test: selecting a candidate card without pressing the primary
  confirm button fires no `onConfirm`/detail call; pressing it with a candidate selected does.
- [x] **5b.2.2** [GREEN] Implement `AnimeMetadataLookupCandidate.tsx` and the modal's selection state.
  Selection tracking (`selectedMalId`), `onSelectCandidate`, `confirmError`, and `onConfirmSelection`
  (the sole path to a mapped selection) were added to `use-anime-metadata-lookup.ts` (5a's hook,
  additive-only — all 14 pre-existing tests still pass), matching the "no business logic in the .tsx"
  convention rather than the literal file split.

### 5b.3 Fetch-metadata trigger — disabled/enabled on Name

- [x] **5b.3.1** [RED] Extend the modal test: the trigger is disabled while Name is empty, enabled
  once non-empty (`anime-metadata-autofill` requirement 1).
- [x] **5b.3.2** [GREEN] Wire the `disabled` prop to the caller-supplied Name value.

### 5b.4 Cancel leaves the form byte-identical (modal-level contract)

- [x] **5b.4.1** [RED] Extend the modal test: cancel closes the modal and calls no
  apply/patch callback.
- [x] **5b.4.2** [GREEN] Plain Cancel `Button` (not `Modal.CloseTrigger`, matching
  `AnimeDetailMutationControls.tsx`'s controlled-modal shape) calls no patch function (the end-to-end,
  byte-identical-form assertion is proven in Slices 6/7).

### 5b.5 Layout fixture — non-negotiable #13

- [x] **5b.5.1** [DATA] Modify `frontend/scripts/layout-fixtures/loading-skeletons-fixture.tsx`:
  import the candidate-row skeleton and `METADATA_LOOKUP_CANDIDATE_ROW_CLASS`, add a case measuring
  the skeleton row's height against a real candidate row's height.
- [x] **5b.5.2** [VERIFY] `bun --cwd="frontend" run layout:smoke` and `render:smoke` — placeholder
  height matches the real row's height (D8's shared row-shape class), measured in headless Edge. Found
  and fixed a real defect: the row class needed `min-h-14 h-auto` (missing from the first draft) and
  the `<img>` needed explicit `width`/`height` attributes, or the real row collapsed 22px short of its
  placeholder in headless Edge with no network access to MyAnimeList's CDN.

### 5b.6 Testing & Verification

- [x] **5b.6.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to the staged files
  via `git add` (no commit). Measured **91.55%** overall (threshold 80) after two iterations —
  `AnimeMetadataLookupModal.tsx` 94.64%, `use-anime-metadata-lookup.ts` 93.83%,
  `AnimeMetadataLookupCandidate.tsx` 91.67%, `AnimeMetadataLookupCandidateSkeleton.tsx` 100%. First run
  scored 77.85% (candidate/skeleton had no dedicated tests, and the "all four states assert every
  other branch's negative" instruction was only half-applied); added
  `AnimeMetadataLookupCandidate.test.tsx`, `AnimeMetadataLookupCandidateSkeleton.test.tsx`, per-state
  negative assertions for the candidates-container and empty-state text, a two-candidate
  highlight/confirm-failure/confirm-title-fallback set. Remaining 15 survivors in
  `metadata-lookup.helpers.ts` are almost all inside 4b's pre-existing `levenshteinDistance` (mutated
  as a side effect of the whole staged file being new, not touched by this slice); one `readKind`
  ternary mutant is structurally equivalent (`METADATA_LOOKUP_KIND_MAP[undefined]` is `undefined` too).
- [x] **5b.6.2** [VERIFY] `bun --cwd="frontend" run test -- AnimeMetadataLookupModal`; `bun
  --cwd="frontend" run render:smoke` and `layout:smoke`; `bun run typecheck`; ESLint (clean, after
  moving a stray value out of `.helpers.ts` and splitting `use-anime-metadata-lookup.test.ts` at 541
  lines into two files); JSDoc on every declaration; every `*Props` property `readonly`; no `index.ts`
  barrel.
- [x] **5b.6.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(metadata-lookup): add lookup modal, candidate card, and
  three-state list`) — left for the orchestrator per CLAUDE.md § 3/4.

**Rollback:** `git revert`. No feature consumer yet.

---

## Slice 6 — Create Row Wiring

**Leaves the app working because:** the button is additive; the hand-typed Create flow is unchanged.
**Forecast:** 275–335 lines. Closes `anime-metadata-autofill`'s remaining requirements (Create half)
and `anime-create-editor`'s modified requirement (all 4 scenarios).

### 6.1 Hop-two mapping (D6) — non-negotiable #6 (mapping half) and #7 (Create half)

- [x] **6.1.1** [RED] Write `anime-create-metadata.helpers.test.ts`: `toCreateRowPatch(selection)` maps
  `AnimeMetadataSelection` → `AnimeCreateRowPatch` (name, kind, totalEpisodes, duration, origin,
  genres, studios, `coverType:'url'`/`coverPath`) and never emits `page`, `folder`, or
  `episodesWatched` — **non-negotiable #7, Create half**; a selection with an unmapped `kind` (from the
  `ONA` case, Slice 4a) leaves `kind` absent from the patch rather than defaulting it in this hop too
  — **non-negotiable #6, mapping half**.
- [x] **6.1.2** [GREEN] Create `anime-create-metadata.helpers.ts`: `toCreateRowPatch`, importing
  `buildUndoPatch`/`AppliedMetadata` from `shared/metadata-lookup/` (Note A) rather than
  reimplementing them.

### 6.2 D10 — `name` autofill re-derives `folder` through the existing channel

- [x] **6.2.1** [RED] Extend/write `use-anime-create-rows.test.ts`: a row with `folderManual: false` —
  applying a metadata `name` patch through `onRowChange` re-derives `folder` from the new name, exactly
  as hand-typing would — **non-negotiable #8, first RED**.
- [x] **6.2.2** [RED] Same file: a row with `folderManual: true` — applying the same `name` patch keeps
  `folder` byte-identical — **non-negotiable #8, second RED**.
- [x] **6.2.3** [GREEN] Both pass via the existing `onRowChange` derivation with no new production code
  (design: the autofill "never *writes* folder"). A failing RED here names a defect in the patch
  channel itself, not a missing special case.

### 6.3 Applied/undo state (D9)

- [x] **6.3.1** [RED] Extend `use-anime-create-rows.test.ts`: confirming a candidate calls
  `onRowChange(draftId, patch)` and stores `AppliedMetadata<AnimeCreateRowPatch>`; undo replays
  `previous` through the same `onRowChange` channel.
- [x] **6.3.2** [GREEN] Modify `use-anime-create-rows.ts`: add applied/undo state,
  `handleMetadataApplied`/`handleMetadataUndo`.

### 6.4 Never-touched set — non-negotiable #7 (Create surface)

- [x] **6.4.1** [RED] Extend `AnimeCreateRow.test.tsx` (or the helpers test): confirming a candidate
  leaves Download page, Folder (when `folderManual: true`, 6.2.2), and Watched episodes unchanged.
- [x] **6.4.2** [GREEN] Confirm via 6.1's `toCreateRowPatch` never emitting those keys — no new
  production code expected.

### 6.5 Button placement — `anime-create-editor` delta, outside the disclosure

- [x] **6.5.1** [RED] Extend `AnimeCreateRow.test.tsx`: the Fetch metadata action renders outside the
  optional-metadata disclosure and stays reachable regardless of its expanded/collapsed state; it is
  the sole permitted nested dialog inside the Create tab; closing it (cancel or confirm) returns to the
  plain inline layout with no modal open (spec's four delta scenarios).
- [x] **6.5.2** [GREEN] Modify `AnimeCreateRow.tsx`: render `AnimeMetadataLookupModal`'s trigger outside
  the disclosure, wired to the new handlers.

### 6.6 Testing & Verification

- [x] **6.6.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to the three touched
  files.
- [x] **6.6.2** [VERIFY] `bun --cwd="frontend" run test -- anime-create`; `bun --cwd="frontend" run
  render:smoke`; ESLint; `fallow audit`.
- [x] **6.6.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(anime-create): wire MyAnimeList metadata lookup into the
  row card`) — left for the orchestrator per CLAUDE.md § 3/4 (commits are orchestrator-owned); this
  apply pass does not commit.

**Rollback:** `git revert`. Hand-typed Create flow unaffected.

---

## Slice 7 — Editor Form Wiring

**Leaves the app working because:** the button is additive; the hand-typed Editor flow is unchanged.
**Forecast:** 275–335 lines. Closes `anime-metadata-autofill`'s remaining requirements (Editor half),
including the full five-field never-touched assertion.

### 7.1 Hop-two mapping (D6) — the mapping trap, made structurally unavailable

- [x] **7.1.1** [RED] Write `anime-editor-metadata.helpers.test.ts`: `toEditorDraftPatch(selection)`
  maps to `Partial<AnimeEditorDraft>`, **never emitting `status`, `progress`, or `premieredAt`** —
  non-negotiable #7, Editor half; MAL's airing `Status:` is discarded upstream (D2, Slice 2b) and never
  reaches `AnimeMetadataSelection`, so assert this hop has no code path reading any status-shaped input
  into the form's watching-`estado` field — the mapping trap's structural proof (proposal.md's
  "Approach").
- [x] **7.1.2** [GREEN] Create `anime-editor-metadata.helpers.ts`: `toEditorDraftPatch`, reusing
  `buildUndoPatch` from `shared/metadata-lookup/` (Note A, Slice 4b).

### 7.2 Never-touched set — non-negotiable #7, the complete five-field assertion

- [x] **7.2.1** [RED] Extended `use-anime-editor-record.test.ts` instead of `AnimeEditorFormPanel.test.tsx`
  (Note: deviation, mirroring the precedent Slice 6's task 6.4 already set — the assertion belongs where
  the patch actually applies to state, `use-anime-editor-record.ts`, since `AnimeEditorFormPanel` is dumb
  UI with no business logic of its own to exercise): a record pre-seeded with Download page, Folder,
  Watched episodes, watching estado, and premiere date — confirming a candidate leaves **all five**
  byte-identical. Closes `anime-metadata-autofill`'s "Confirm leaves protected fields untouched" scenario
  in full.
- [x] **7.2.2** [GREEN] Confirmed via `toEditorDraftPatch` never emitting those five keys — no new
  production code needed; 7.2.1 found no gap.

### 7.3 Applied/undo state (D9)

- [x] **7.3.1** [RED] Extended `use-anime-editor-record.test.ts`: confirm stores
  `AppliedMetadata<Partial<AnimeEditorDraft>>`; undo replays `previous`; also added a record-swap test
  (clears a pending Undo once a different record loads, so a stale pre-image is never replayed onto it).
- [x] **7.3.2** [GREEN] Modified `use-anime-editor-record.ts`: applied/undo state, `onMetadataApplied`/
  `onMetadataUndo`, routed through a new shared `patchDraft` setState primitive so hand-typing
  (`onDraftChange`) and autofill apply/undo all funnel through the exact same draft-mutation channel.

### 7.4 Button placement — beside Name

- [x] **7.4.1** [RED] Extended `AnimeEditorFormPanel.test.tsx`: the Fetch metadata action renders beside
  Name, disabled while Name is empty, enabled once non-empty; also added a wiring test (typed Name still
  forwards to `onDraftChange`) and an Undo-without-unfilled-report test (mutation-testing gaps found
  during 7.5.1).
- [x] **7.4.2** [GREEN] Modified `AnimeEditorFormPanel.tsx`: render the trigger beside Name (wrapped in a
  flex row with the Name field), wired to `onMetadataApplied`/`onMetadataUndo`, with the same Undo +
  unfilled-report affordance Create's row uses.

### 7.5 Testing & Verification

- [x] **7.5.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to the four touched
  production files via a temporary `GIT_INDEX_FILE` (the real staged index holds Slices 1-6 and was never
  touched). Measured **anime-editor-metadata.helpers.ts 100%**, **AnimeEditorFormPanel.tsx 100%**,
  **use-anime-editor-record.ts 93.33%** (1 survivor) after two iterations — first run surfaced two real
  gaps on `AnimeEditorFormPanel.tsx` (Name's `onChange` had no dedicated test; the unfilled-report
  conditional's negative branch was never asserted), closed with two new tests. The one remaining
  `use-anime-editor-record.ts` survivor (`onMetadataApplied`'s `[patchDraft]` dependency array mutated to
  `[]`) is structurally equivalent: `patchDraft` is a `useCallback` with an empty dependency array, so its
  identity never changes across renders and removing it from a caller's deps has no observable behavior
  to test against — same class of equivalent survivor Slice 5b already documented for `readKind`.
- [x] **7.5.2** [VERIFY] `bun --cwd="frontend" run test -- anime-editor` (94/94 passed); full suite
  `bun --cwd="frontend" run test` (2818/2818 passed); `bun --cwd="frontend" run typecheck` (clean); `bun
  --cwd="frontend" run render:smoke` (passed); ESLint on all seven touched files (clean); no direct
  `wailsjs/go/desktop` import under `features/anime-editor/` (grep-verified). `fallow audit` exits 1 at
  the whole-repo level from **pre-existing, unrelated** findings (a `shared/preferences` boundary
  violation and repo-wide interface-shape duplicate clone groups predating this slice) — none of the four
  slice-7 files appear in any blocking-category finding (`boundary-violation`/`unused-exports`/etc.);
  `use-anime-editor-record.ts` newly appears in the advisory "High complexity functions" section
  (cognitive 18, from the added `appliedMetadata` state + 3 callbacks), not a blocking rule.
- [x] **7.5.3** [GATE] SUPERSEDED by 8.7.3 — `git commit` (`feat(anime-editor): wire MyAnimeList metadata lookup into the
  form panel`) — left for the orchestrator per CLAUDE.md § 3/4; this apply pass does not commit.

**Rollback:** `git revert`. Hand-typed Editor flow unaffected.

---

## Slice 8 — Documentation

**Leaves the app working because:** documentation-only, zero runtime behavior changes.
**Forecast:** 160–250 lines.

### 8.1 ADR-022

- [x] **8.1.1** [DATA] Create `docs/adr/022-myanimelist-metadata-source.md` (021 is the highest
  existing) covering D1 (HTML parsing library choice and the `regexp`/`goquery`/headless-browser
  rejections), D2 (the noisy-error three-tier contract and its third outcome), D5 (the isolation
  depguard rule and its rationale).

### 8.2 Ubiquitous language

- [x] **8.2.1** [DATA] Update `docs/ubiquitous-language.md`: add an entry distinguishing MAL's
  `Status:` (airing status) from the editor's `estado` (the user's watching status) — the mapping trap
  the whole design exists to prevent.

### 8.3 Changelog

- [x] **8.3.1** [DATA] Update `CHANGELOG.md`: add a `## [Unreleased]` → `### Added` entry (English,
  user-facing wording, never a pasted commit subject) describing the MyAnimeList metadata autofill
  action on Create and Edit.

### 8.4 Learning log

- [x] **8.4.1** [DATA] Run `node scripts/log-lesson.mjs "<lesson>"` — one line, ≤300 chars, appended
  only via the writer script (never hand-edited). Candidate lesson: the singular-`Genre:` silent-empty
  trap or the `1 hr. 46 min.` duration trap, whichever apply/verify confirms was the highest-value
  catch; exact wording decided at that time, not pre-written here.
  Shipped instead: the measured search-engine-vs-catalogue typo-tolerance finding (explore.md § 2.1-
  2.2) — the highest-value, most transferable lesson of the whole change, and the one that reversed
  the initial design (no local fuzzy-matching architecture needed).

### 8.5 Drift recording — non-negotiable #15 (CLAUDE.md #2)

- [x] **8.5.1** [DATA] Record in `explore.md` § 5 (addendum) the VERIFIED consequence measured during
  this phase: `checksdd`'s `detectActiveChange` fallback treats every non-`archive`-named directory
  under `openspec/changes/` as active, and dozens of legacy change directories were never relocated
  under `archive/` — so `.atl/active-sdd-change` is load-bearing for `git commit` to resolve a single
  active change, yet `.atl/` is git-untracked and therefore absent from a freshly created worktree.
  This worktree already carries it (verified present, naming `2026-09-12-sdd-70-mal-metadata`), so this
  change's own commits are unaffected; record the risk for a future worktree, no fix in scope.
  Verified: 37 non-archive directories exist today, so the fallback always errors in practice.
- [x] **8.5.2** [DATA] Record (no fix): `bridge-testing` and `bridge-debugging`, named by CLAUDE.md
  notes #5/#6, resolve to nothing locally or globally (explore.md § 5.2, re-verified during this
  phase).

### 8.6 Skill note (conditional — apply only if triggered)

- [x] **8.6.1** [DATA] IF Slices 5b/6/7 surface a loading/empty-state convention not already covered
  by `autoreas-theme`, amend `.claude/skills/autoreas-theme/SKILL.md`; otherwise skip — the three-state
  pattern is copied verbatim from the existing skill, so no new convention is anticipated.
  Evaluated: no new convention surfaced (5b.1/5b.2 note the pattern is copied verbatim from the
  existing skill); condition is false, so `.claude/skills/autoreas-theme/SKILL.md` is left unmodified.

### 8.7 Final verification

- [x] **8.7.1** [VERIFY] `git diff --stat -- docs/openapi.yaml` is empty (desktop-only Wails bindings,
  no REST/WS surface).
  Confirmed: empty for both the unstaged and staged diff.
- [x] **8.7.2** [VERIFY] `go test ./...`; `bun --cwd="frontend" run test`; both golangci profiles;
  `checkgofilesize` with an empty baseline; `bun --cwd="frontend" run render:smoke`.
  Run by the orchestrator (CLAUDE.md § 3 requires final verification to be orchestrator-owned, not
  delegated). Results: `go build ./...` and `go vet ./...` clean; the whole Go suite green;
  `checkgofmt`, `checkgofilesize`, `checkarchitecture` and `checkopenapi` all passed; both golangci
  profiles 0 issues; frontend typecheck clean; 308 frontend test files / 2818 tests passed;
  `render:smoke` renders every checked route; `layout:smoke` 212 assertions passing.
- [x] **8.7.3** [GATE] The single commit for the whole change. The per-slice commit tasks above are
  marked SUPERSEDED rather than done because no per-slice commit ever happened: `tools/checksdd`
  globs on `*.go` and requires the COMPLETE change — all four artifacts, every task checked, and a
  passing verify verdict — so no partial commit can land while a change is active. The plan's
  eleven-commit granularity was structurally impossible in this repository; the work is unaffected,
  only the delivery shape.

**Rollback:** `git revert`. Documentation only.

---

## Requirement → Task Coverage Matrix

| Spec | Requirement | Closed by |
|---|---|---|
| `myanimelist-metadata-source` | Two-stage retrieval gates the detail fetch on confirmation | 1.5–1.6 (search), 2b.4–2b.5 (detail gate), 5a.3/5a.5, 5b.2 |
| `myanimelist-metadata-source` | Required-anchor parsing aborts loudly; optional fields degrade visibly | 2b.2–2b.3 |
| `myanimelist-metadata-source` | Genre label matches both singular and plural forms | 2a.1–2a.2 |
| `myanimelist-metadata-source` | Duration parsing recognizes known shapes, rejects unknown ones as drift | 2a.4 |
| `myanimelist-metadata-source` | Source label handles anchor text, bare text, and padding | 2a.3 |
| `myanimelist-metadata-source` | Module boundary isolation | 2b.5 (structural), 3.3 (static/lint) |
| `anime-metadata-autofill` | Fetch-metadata action availability | 5b.3, 6.5, 7.4 |
| `anime-metadata-autofill` | Lookup modal search behavior | 5a.1–5a.6, 5b.1 |
| `anime-metadata-autofill` | Candidate list renders exactly one of three exclusive states | 5b.1 |
| `anime-metadata-autofill` | Candidate list is locally re-scored for presentation order only | 4b.3 |
| `anime-metadata-autofill` | Detail fetch and form writes are gated on explicit confirmation | 2b.5, 5a.5, 5b.2, 5b.4 |
| `anime-metadata-autofill` | MAL-to-form mapping applies only the mapped, form-owned fields | 4a.2, 6.1, 7.1 |
| `anime-metadata-autofill` | Never-touched fields stay untouched | 6.2, 6.4, 7.2 |
| `anime-metadata-autofill` | Unfilled optional fields are reported, not silently skipped | 2b.3, 6.1, 7.1 |
| `anime-create-editor` (delta) | No modal-over-modal, no chip inputs, one transient lookup exception | 6.5 |

## Conventions Applied Throughout (not repeated per task)

- Every implementation task follows RED → GREEN → MUTATE → REFACTOR (CLAUDE.md § 16, strict TDD mode).
- Go MUTATE always names `./internal/myanimelist/` or `./internal/desktop/` explicitly with `-json`;
  never a bare `ditto staged` (CLAUDE.md § 16's measured 10-minute-hang warning).
- Frontend MUTATE isolates to each slice's own touched files and reads the per-file table, never the
  blended score.
- Mandatory JSDoc on every new/modified frontend declaration; every `*Props` property `readonly`; no
  `index.ts` barrels; strict colocation (`__tests__/` beside the files it tests); strict hook anatomy
  order in every `use-*.ts` edit.
- `fallow audit` fails on an unused file or export — no helper ships ahead of its consumer slice.
- Go files stay under the 400-line warning / 500-line hard-fail effective-line policy;
  `tools/checkgofilesize/baseline.yaml` stays empty.
- `internal/myanimelist` never imports `internal/anime` or `internal/api/contracts` (D5, enforced from
  Slice 3 onward, structurally true from Slice 1).
