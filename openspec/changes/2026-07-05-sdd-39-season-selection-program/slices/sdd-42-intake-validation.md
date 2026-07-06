# SDD-42 — season-intake-validation

> Slice of program SDD-39. Plain-text list import + name validation against
> jkanime with human-in-the-loop resolution.

## Objective

Paste the intake list (~24–27 names, one per line) → each name gets matched to
a jkanime page via similarity search → user confirms/corrects/discards →
season rows sit ready for the availability watch (SDD-43).

## Verified search pattern (live validation, 2026-07-05)

`GET https://jkanime.net/buscar/{url-encoded query}/` → HTTP 200,
server-rendered HTML (no JS execution needed). Result items are
`class="anime__item"` blocks; title + page URL come from
`<h5><a href="{pageURL}">{Title}</a></h5>`. Validated with `dr stone` →
8 candidates (Dr. Stone / Stone Wars / New World / New World Part 2 / Ryuusui /
Science Future / Part 2 / Part 3) — the exact multi-candidate scenario this
slice must resolve. Pagination for long result sets is still unverified
(likely `/buscar/{q}/{page}/`) — first apply task confirms it and records the
fixture.

Reminder of what does NOT exist: `sites.EpisodeSource`
(`internal/download/sites/site.go:31-41`) only operates on a KNOWN `pageURL`
(the Legacy `pagina` field — stored, never derived). This slice adds search as
a NEW season-owned capability without touching `EpisodeSource`.

## Multi-candidate resolution method (the "dr stone problem")

Deterministic pipeline, precision over recall — the cost of a false `matched`
is creating the WRONG anime, so franchise families deliberately fall to the
human:

1. **Normalize** query and candidate titles: lowercase, strip diacritics and
   punctuation, collapse whitespace, strip bracket suffixes.
2. **Score** every candidate with trigram Dice similarity on the normalized
   strings.
3. **Season-token guard**: extract season/part markers from both sides
   (`2nd season`, `season 2`, `part 3`, `s2`, `ss`, `ryousuu no youjo`-style
   subtitle tokens are NOT markers — only numeric/ordinal season vocabulary).
   A candidate whose markers do not exactly match the query's markers gets a
   fixed penalty large enough to disqualify it from auto-match (but it stays
   in the candidate list, ranked).
4. **Acceptance rule (score + margin)**: auto-`matched` ONLY if
   `top.score >= 0.93` AND `top.score - second.score >= 0.10` (thresholds are
   constants tuned against the golden corpus, not user config). One clear
   winner or nothing.
5. Everything else → `ambiguous`: ALL candidates persisted (title, pageURL,
   score, ranked) and the USER picks in the resolution UI. `not_found` when
   zero candidates score above a floor (0.55).

Consequence, by design: `Dr. STONE: SCIENCE FUTURE Part 3` in the intake will
auto-match only if its normalized form equals exactly one candidate; a bare
`dr stone`-family query surfaces the ranked list for a one-click human pick.

## Two-cour continuations (user-clarified)

Continuing two-cour animes are NOT in the intake list at all — the existing
anime stays active for the next three months and just keeps living. No
special import flow. Defensive check only: if a resolved `pageURL` equals an
existing ACTIVE anime's `pagina`, flag the row `already_active` (info chip)
and suggest discard — catches accidental re-listing, nothing more.

## Design

### Backend

- **Port** (declared in SDD-41): `NameSearcher` in `internal/season/ports.go`:
  `Search(ctx, query string) ([]Candidate, error)`,
  `Candidate{Title, PageURL string}`.
- **Adapter**: new `internal/download/sites/jkanime/search.go` — fetches the
  verified `/buscar/` URL, parses `anime__item` blocks (title + href). Site
  knowledge stays inside the existing anti-corruption package; golden HTML
  fixtures recorded from the live validation (the `dr stone` capture is
  fixture #1).
- **Matcher**: `internal/season/match/` — pure functions `Normalize`,
  `ExtractSeasonMarkers`, `Score`, `Resolve` implementing the pipeline above.
- **Use cases** (`season/service.go`): `ImportIntake(seasonID, rawText)`
  (parse, trim, dedupe → rows `match_status=pending`);
  `AddIntakeName(seasonID, name)` — the intake stays a LIVING list while the
  season is open (workspace model, SDD-41): a late-announced anime added in
  week 2 flows through matching → availability → evaluation like any other;
  `RunMatching(seasonID)` (search+score, persist status/slug/candidates);
  `ResolveMatch(rowID, pageURL)` / `DiscardName(rowID)` — manual override
  including the **paste-a-URL-directly** escape hatch.
- No phase gate (workspace model): unresolved `ambiguous`/`pending` rows
  simply don't advance to availability; SDD-43's recheck only visits
  `matched` rows. The Overview progress card surfaces what's unresolved.

### Integration architecture

| Action | File | Pattern |
|---|---|---|
| NEW | `internal/download/sites/jkanime/search.go` (+`search_test.go`, `testdata/buscar_dr_stone.html`) | anti-corruption layer extension; same HTTP client/UA discipline as `jkanime.go` |
| NEW | `internal/season/match/{normalize,score,resolve}.go` + tests | pure domain service, zero I/O |
| MODIFY | `internal/season/ports.go`, `service.go`, `sqlite_store.go` (candidates persisted as JSON column `match_candidates_json` — additive `ColumnAdds`) | repository + strategy |
| MODIFY | `app_startup_runtime.go` | inject searcher into season service as `season.Deps.Searcher` — closure/adapter injection, the `download.ServiceDeps` precedent (no season→download import; the CONCRETE adapter is constructed at the composition root) |
| MODIFY | `app_season.go` | new nil-safe bindings: `ImportSeasonIntake`, `RunSeasonMatching`, `ResolveSeasonMatch`, `DiscardSeasonName` (string-result convention of `app_preferences.go:6-53`) |
| MODIFY | `frontend/src/infrastructure/season-source.ts`, `shared/store/season-store.ts` | source port + Zustand, preferences pattern |
| NEW | `features/season/ui/IntakePanel/` via `generate:feature` | dumb UI + hook + helpers, colocated tests |

Event flow: `RunMatching` mutates rows → `season_changed` broadcast (SDD-41
hub pattern) → store refresh. No anime writes happen in this slice at all —
season tables only.

### Frontend (workspace "Intake & Matching" section)

- Paste textarea → parsed preview (count, duplicate lines flagged) → Import
  (`Button variant="primary"`).
- Resolution list (one row per name): raw name | status `Chip`
  (matched=`success`, ambiguous=`warning`, not_found=`danger`,
  already_active=`accent`, discarded=`default`) | best match + score |
  actions. Ambiguous rows expand to the RANKED candidate list (score-ordered,
  season markers highlighted) — one press picks; `Input` for direct URL;
  discard tertiary button.
- "Add name" input always available (living list) — no "continue" gate;
  unresolved rows are surfaced by the Overview progress card instead.

## Risks

| Risk | Mitigation |
|---|---|
| **Scraper pattern for the search page cannot be stabilized** (markup drift, anti-bot measures, pagination surprises) — user-flagged top risk | Pattern already validated live (2026-07-05, fixture recorded); apply task #1 re-validates + captures pagination; parser tested only against fixtures; on ANY runtime parse failure the row degrades to `not_found` with a "search unavailable — paste URL" hint, so the workflow NEVER blocks on the scraper |
| False positive auto-match creates the wrong anime later | score+margin rule + season-token guard + golden corpus asserting ZERO false `matched` before recall |
| Long result sets paginated | verify `/buscar/{q}/{page}/` in apply task #1; cap at first 2 pages (candidates beyond ~20 are noise for this use case) |

## TDD plan

- `match/*_test.go` — GOLDEN CORPUS from real past intake lists vs known
  jkanime pages (user provides 2–3 past seasons; Abril 2026 names are in the
  screenshots). Assert: zero false `matched`; the `dr stone` family resolves
  `ambiguous` with correct ranking; season-marker extraction table-driven.
- `search_test.go` — fixture-driven parse (titles, hrefs, empty result,
  malformed HTML → typed error).
- Service tests: import parsing (blank lines, dupes, whitespace), guard,
  resolve/discard, `already_active` flagging.
- Frontend helpers/hook tests first (status grouping, guard derivation,
  candidate ranking display).

## Size & delivery

Medium. Two work units: (1) search adapter + matcher + fixtures (Go),
(2) import/resolve use cases + bindings + UI.

## Exit criteria

- Real past-season list imports end-to-end; every row reaches
  matched/resolved/discarded; zero false positives on the corpus.
- Scraper failure degrades to manual URL entry without blocking the phase.
- No network in the test suite; lefthook gate green.
