# SDD-44 — season-evaluation

> Slice of program SDD-39. Grade (1–6) capture: mobile-first ingestion +
> in-context manual capture in bridge. Parallel to SDD-43 (both need only 41).
> Mobile handoff inputs: see `sdd-44x-mobile-handoff.md`.

## Objective

Every created season anime ends up with a `nota_estreno` — normally synced
from mobile the day after watching; captured in bridge, IN CONTEXT, when it
didn't. Watching/moving to "Visto" stays a NORMAL anime operation.

## UI model (user decision — replaces the earlier "Evaluation Deck")

Grading happens **where the anime already lives**: the anime card in the
**Chapters** section gains a rate action, mirroring what mobile will do on
its own cards. No separate grading surface to visit.

- **Chapters card action**: when a season is open AND the anime is a season
  candidate (created, linked `anime_id`), its card in the Estrenos sections
  shows a rate button (`tertiary` icon, hover-tint `accent` — the existing
  utility-action convention). Press → **modal** (`Dialog`): anime name +
  cover slot + a 1–6 **`ToggleButtonGroup`** (renders `role="radio"` — a11y
  free) + current grade preselected if re-grading + source note when the
  grade came from mobile. One press + confirm = graded (optimistic,
  rollback on failure). Graded cards show a small grade `Chip` so the
  season candidates read at a glance inside Chapters.
- **Workspace Evaluation section** (SDD-41 tab): the progress/audit view —
  list of created candidates with grade `Chip` or "No grade"
  (`warning`), source badge (phone = `mobile_sync`, pencil = `manual`),
  rated-at, and per-row "skip grading" (recorded, visible). The SAME modal
  opens from here — one component, two entry points. Live updates via
  `season_changed` (grades synced overnight appear by themselves).
- No gates (SDD-41 workspace model): grading completeness is a WARNING at
  ConfirmSelection time ("3 ungraded animes will derive as Reprobado unless
  graded or skipped"), never a lock.

## Sync contract (bridge side — full mobile inputs in sdd-44x)

- **REST**: `POST /api/seasons/active/ratings`, bearer auth
  (`h.authenticate`, `router.go`). Body (English wire fields, ADR-007):
  `{"anime_id": "<legacy _id>", "grade": 1-6, "rated_at": <epoch ms>}`.
  Responses: `204` recorded · `409` manual grade present (kept; body carries
  it as `{"grade": n, "source": "manual"}`) · `404` no open season / not a
  candidate (terminal, no retry) · `422` invalid grade / malformed body.
- **WS**: incoming type `season_rating` (same payload), dispatched before the
  reconcile branch (`websocket_handler.go`).
- **Broadcast**: `season_changed` after ingestion.

## Conflict rule (user-confirmed)

`mobile_sync` writes only if the manual cell is empty; mobile over manual →
keep manual + `Notifier` warning. Manual edits always win and flip
`nota_source=manual`. Mobile overwriting its own earlier grade: allowed.

## Pos Estreno — descoped (user decision)

The season window (2 weeks) ends long before an anime's 3-month run —
post-season grading inside the season is physically impossible. The nullable
`nota_pos_estreno` column stays dormant (registry shape parity); no service
method, no UI in this program.

## Design

### Backend

- `season/service.go`: `RecordPremiereGrade(animeID, grade, source, ratedAt)` —
  validates 1–6, resolves the OPEN season's row by `anime_id`, applies the
  conflict rule in the domain (handlers stay transport-thin);
  `SkipGrading(rowID)` records the explicit override. Grade vocabulary is
  English (`Grade`/`GradeSource`, columns `premiere_grade`/`grade_source`) per
  ADR-007; the `Consideracion`/`Verdict` selection vocabulary is SDD-45's.

### Integration architecture

| Action | File | Pattern |
|---|---|---|
| NEW | `internal/api/handlers/season_rating_handler.go` (+`httptest` suite) | handler-per-resource, mirror of `NewPatchAnimeHandler` dispatch (`router.go:184-225`) |
| MODIFY | `internal/api/router.go` | route registration (`:64-101` block) + auth wrap |
| MODIFY | `internal/api/handlers/websocket_handler.go` | second incoming-type branch beside reconcile (`:75-112`) |
| MODIFY | `internal/season/service.go`, `sqlite_store.go` | conflict rule + skip override in domain |
| MODIFY | `app_season.go` | `SetSeasonNota(animeID, nota)`, `SkipSeasonGrading(rowID)` nil-safe bindings |
| MODIFY | `frontend/src/features/chapters/ui/ChapterSchedulePanel/**` | card rate action + season-candidate awareness (candidate ids + grades exposed via `season-store`; chapters stays dumb — the hook composes) |
| NEW | `features/season/ui/RateAnimeModal/` (shared component) + `features/season/ui/EvaluationPanel/` via `generate:feature` | ONE modal, two entry points (Chapters card / workspace section) |
| MODIFY | `season-source.ts`, `season-store.ts` | candidate map + optimistic grade + live refresh on `season_changed` |

API service and Wails bindings call the SAME `season.Service` method — one
domain rule, two transports (the `PatchAnime` precedent). The chapters
integration reads season data through the season store ONLY (no new coupling
between `internal/anime` and `internal/season`).

## Decision points (review)

1. ~~UI model~~ RESOLVED: rate action on the Chapters card + modal; workspace
   section = progress/audit with the same modal. Mobile mirrors the pattern.
2. ~~Route shape / manual override~~ RESOLVED earlier: season-scoped; manual
   wins.
3. Grade distribution strip: REMOVED from evaluation (no deck anymore).
   Whether it appears in the Selection decision header is SDD-45's open
   point (pending the "nota de corte" clarification).

## TDD plan

- Service tests: happy ingestion, bounds, conflict matrix (empty+mobile→set;
  manual+mobile→keep+notify; manual edit→wins+flip; mobile self-overwrite→ok),
  skip override, open-season resolution.
- Handler tests (`httptest`): auth, 204/404/409/422, WS envelope dispatch.
- Frontend: helpers (candidate detection, grade/source labels) → modal hook
  (optimistic + rollback; radiogroup interaction via native click — jsdom
  pattern) → chapters card integration test (rate button renders only for
  candidates while a season is open).

## Size & delivery

Medium. Two work units: (1) domain rule + REST/WS ingestion + broadcast,
(2) RateAnimeModal + Chapters card action + EvaluationPanel.

## Exit criteria

- A rating POSTed with a valid token lands in the right row; the Chapters
  card chip and the Evaluation panel update live.
- Grading from the Chapters card works end-to-end offline from mobile's
  perspective (bridge standalone).
- Conflicts warn, never clobber; skips are recorded and visible.
