# Proposal — sdd-42-intake-validation

## Intent

Turn a plain-text intake list (~24–27 names) into resolved season anime rows:
each name is searched against jkanime, matched by similarity, and confirmed /
corrected / discarded by the user in the Season Workspace.

## Scope

- **jkanime search** (NEW): a `Searcher` over the server-rendered
  `/buscar/{query}/` page (validated live), separate from the download
  `EpisodeSource` contract; golden HTML fixture.
- **Name matcher** (`internal/season/match`): Normalize (accent/bracket/
  punctuation folding), ExtractSeasonMarkers (numeric/ordinal season+part only),
  trigram Dice Score, Resolve (clear-winner auto-match with a season-marker
  guard; ambiguous keeps ranked candidates; below floor → not_found).
- **Season intake use cases**: living intake list (ImportIntake / AddIntakeName),
  RunMatching, ResolveMatch (candidate pick or pasted URL), DiscardName; the
  `season_animes` table gains its match columns of use. `NameSearcher` port +
  jkanime adapter wired at the composition root (season stays decoupled from
  download).
- **Bindings + frontend**: `GetSeasonAnimes` / `ImportSeasonIntake` /
  `RunSeasonMatching` / `ResolveSeasonMatch` / `DiscardSeasonName`; the
  "Intake & Matching" workspace section (paste, run matching, resolve/discard).

## Out of scope

- Availability recheck / anime creation (SDD-43); grading (SDD-44). Rows sit at
  `availability=waiting` after matching.

## Reference

Full plan: `openspec/changes/2026-07-05-sdd-39-season-selection-program/slices/sdd-42-intake-validation.md`.
