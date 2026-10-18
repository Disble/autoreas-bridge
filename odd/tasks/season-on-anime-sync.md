# Season on anime sync (bridge vN, additive)

Objective: season candidacy travels on the anime sync path so a backgrounded phone learns it through reconcile. Branch `feat/season-on-anime-sync` off `dev`; delivery `ask-on-risk`; runner `go test` (+ ditto per owning package).

## Specs

- S1 — `MobileAnime` gains `season` (omitempty), present only while the anime is a candidate of the open active season. Shape agreed with mobile:
  ```go
  Season *MobileAnimeSeason `json:"season,omitempty"`
  type MobileAnimeSeason struct {
      SeasonID string `json:"seasonId"`
      Grade    *int   `json:"grade"` // always present; null = not graded yet
  }
  ```
  Candidate rule = today's `activeSeasonCandidates`: a row of the OPEN season with `anime_id != ""`; `grade` set only when the row is graded (1–6). No `gradeSource`. Joined at serve time (never stored in `snapshot_json`) on GET /api/animes, GET /api/animes/{id} and every changes/reconcile row.
- S2 — "Whenever an anime's season projection changes, the anime gets a new change in the changelog with its full snapshot, so the reconcile cursor delivers it": becoming/ceasing to be a candidate, grade changing, season opening/closing/being replaced (one change per affected anime). Row = ordinary `update`, `changed_fields ["season"]`.
- S3 — Mobile invariant (verbatim): "a ["season"]-only row must NOT bump the anime's OCC token. Its snapshot has to carry the anime's current `modified_at`, unchanged." and "The row's change `timestamp` must still be newer than earlier rows of that anime".
- S4 — Ownership: the season context does not write the changelog. It publishes a payload-free `season.projection_changed` signal. The sync context owns `season_projection_published(anime_id PK, season_id, grade)` and, in ONE transaction, diffs it against the current projection, inserts the ["season"] rows and updates the table. Runs on the signal and on startup (idempotent, convergent; first run backfills every current candidate). Backup restore/import is covered.
- S5 — `ReconcileResponse` gains `season_mode` (boolean, always present) = "an open season exists". Amended (L4): HTTP reconcile only — the WS `reconcile` message has no response body.
- S6 — POST /api/seasons/active/ratings accepts optional `season_id`; on a mismatch with the open season it answers the existing 404 "not a season candidate". Other fates unchanged: 204 · 404 · 409 {"grade":n,"source":"manual"} · 422 · 503/500.
- S7 — docs/openapi.yaml documents S1, S2 (changed_fields "season"), S5, S6; old season paths stay alive in vN (retired in vN+1).

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1, S2, S3, S4 | inline | done (ditto sync 0.97, season 1.00, desktop 0.95) | the commit holding this document |
| T2 | S5 | inline | done (RED observed) | 9ac4338a |
| T3 | S6 | inline | done (RED observed) | 329c8102 |
| T4 | S7 | inline | done (checkopenapi passed) | split across the three commits |
| T5 | all | delegated verify (project rule; Risk item 3: contract others consume) | PASS, no blockers | n/a |

## Log

- L1 (2026-10-18, user): "Vas a ayuda a mobile team en un worktree nuevo." Then: "revisa bien la propuesta de mobile y discute como un senior backend developer para tu sostener una buena arqutiectura de backend y base de datos. Pero tampoco te vuelvas un bloqueante".
- L2: contract negotiated with autoreas-mobile-12; mobile accepted amendments (no gradeSource, season_mode on ReconcileResponse), OCC invariant, optional season_id, and handles the upgrade gap with its existing GET /api/animes heal (no re-emit).
- L3: evidence — `ChangelogStore.InsertPending` drops non-delete rows with empty changed_fields; `insertPendingTx` stores the current anime_snapshots snapshot and stamps past the anime's last row (S3 holds by construction). Mobile join seam: `withMobileProjection` (internal/desktop/app_mobile_projection.go). Season writes: Repository Create/Update methods + backup import (direct SQL).
- L4: WS reconcile (`applyReconcileMessage`) sends no ReconcileResponse, so `season_mode` is HTTP-only; to tell mobile. Also found: a WS `season_rating` message is another season path (not in mobile's list) — keeps working, season_id not added there; propose retiring it in vN+1.
- L5: backup import writes season tables with direct SQL (bypasses the repository decorator) → `ConfirmBackupImport` publishes the signal after Apply. anime_changed WS nudge payload is the stored snapshot (never carries `season`), same as the episodes precedent.
- L6: mutation — internal/sync/season_projection.go 36 mutants, 35 killed; survivor at :184 (`err != nil || !found` → `false || !found`) is equivalent: currentAnimeSnapshot returns found=false whenever err != nil. internal/season 9/9. Lint gocognit on Publish fixed by extracting publishChangedCandidacies.
- L7: mutation — internal/desktop app_season_projection.go 21 mutants, 20 killed; survivor :39 (`err != nil || active == nil` → `false || active == nil`) equivalent: Service.ActiveSeason returns a nil season whenever it errors, so the branch returns the same (nil, err). First desktop run (0.83) exposed real gaps (start guards, announce loop continue, logger guard) now pinned by tests. internal/api/handlers 3/3. Tiers: CORE = sync publisher diff/tx, season signal + season_id rule, candidacy rule + serve join; IMPORTANT = handler fields, nudge; INFRASTRUCTURE = events const, schema registration, api.Config/router/startup wiring (out of mutation scope).
- L8: independent verifier PASS on S1–S7 (real SQLite probes, differential vs 159d46c6: only `season_mode:false` added on reconcile; go test ./... 64 packages ok; lint 0; gates pass). Advisories accepted: (1) every decorated season write runs one synchronous publication (bulk CreateSeasonAnimes of N rows = N small passes; correct, not measured); (2) a candidate whose anime is missing is marked published, so an anime restored later gets no ["season"] row until its candidacy changes (mobile's GET /api/animes heal still serves it); (3) a signal after shutdown only logs.
- L9: delivery — ~1500 authored lines (814 tests), committed as three work units on feat/season-on-anime-sync: 9ac4338a (S5), 329c8102 (S6), then S1–S4 + docs. lefthook only hides partially staged files, so each unit was committed over `git stash --keep-index -u` to validate a consistent tree. Push/PR are the user's decision.
