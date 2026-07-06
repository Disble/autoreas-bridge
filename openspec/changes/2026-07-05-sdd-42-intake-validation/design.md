# Design — sdd-42-intake-validation

## Search adapter (`internal/download/sites/jkanime/search.go`)

`Searcher` (separate from the `EpisodeSource` `Adapter`): GET
`{baseURL}/buscar/{PathEscape(query)}/` with a desktop UA (an unset UA returns
an empty body), parse each `<h5><a href="{pageURL}">{Title}</a></h5>` into a
`SearchResult`. Empty result set → empty slice (not an error). Test seam
`newSearcherWithBaseURL` serves the golden fixture via httptest.

## Matcher (`internal/season/match`)

Pure functions: `Normalize` (strip `[...]`, lowercase, fold accents, keep
`[a-z0-9]`), `ExtractSeasonMarkers` (ordinal/`season N`/`part N`/`sN` → sorted
set), `Score` (trigram Dice on normalized strings), `Resolve`:

- score each candidate; penalize (adjusted −0.5) any whose season markers differ
  from the query's, disqualifying it from auto-match but keeping it for ranking;
- auto-`matched` only when the top adjusted score ≥ 0.93 AND (single candidate OR
  lead ≥ 0.10 over the runner-up); else `ambiguous` with ranked candidates ≥ the
  0.55 display floor; `not_found` when none clear the floor.

## Season context

- `domain/season_anime.go`: `SeasonAnime` (intake/matching fields), `MatchStatus`
  / `Availability` / `NotaSource` enums, `MatchCandidate`.
- `Repository` gains `CreateSeasonAnime` / `ListSeasonAnimes` /
  `SeasonAnimeByID` / `UpdateSeasonAnime`; candidates persisted as JSON in
  `match_candidates_json`.
- `NameSearcher` port (returns `[]match.Candidate`); the concrete
  `jkanimeNameSearcher` adapter lives at the composition root (`app_season_searcher.go`)
  so the season context never imports download/jkanime.
- `Service` (now takes a `NameSearcher`): `ImportIntake` (parse one-per-line,
  trim, case-insensitive dedupe, living list), `RunMatching` (search+Resolve per
  pending row), `ResolveMatch`, `DiscardName`, `ListSeasonAnimes`.

## Bindings + frontend

- `app_season.go`: `GetSeasonAnimes` (→ `[]SeasonAnimeDTO`), `ImportSeasonIntake`,
  `RunSeasonMatching`, `ResolveSeasonMatch`, `DiscardSeasonName` (nil-safe,
  broadcast on mutation). Wails bindings regenerated.
- `season-source.ts` / `season-store.ts` gain the intake methods + `seasonAnimes`
  state (refresh after each mutation). `features/season/ui/IntakePanel` (paste
  form, run matching, per-row status chip + candidate resolve buttons + discard),
  wired as the now-enabled "Intake & Matching" workspace tab.

## TDD

Search parser (fixture), matcher golden (franchise families never auto-match the
wrong part), store round-trip (candidates JSON), service use cases (dedupe,
classification, resolve/discard), nil-safe bindings, store + helper + hook +
component tests.
