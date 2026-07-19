# Tasks: SDD-52 Episode Ubiquitous Language

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~350-420 · PR2 ~180-240 · PR3 ~260-320 · PR4 ~300-380 · PR5 ~80-120 · PR6 ~150-200 (total ~1300-1700 across 6 slices) |
| 400-line budget risk | PR1 Medium (backend rename + activity consolidation could push past 400 — see split note below); PR2-PR6 Low |
| Chained PRs recommended | Yes — 6 stacked-to-main PRs per design D1 |
| Suggested split | PR1 backend-rename -> PR2 db-migration -> PR3 bindings-regen -> PR4 frontend-feature -> PR5 copy-sweep -> PR6 docs-spec (each merges to main in order; mixed vocabulary between slices is acceptable, broken builds are not) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No — chain strategy is already resolved (stacked-to-main); if PR1 measures over 400 changed lines once diffed, split the activity-const consolidation into PR1a per the design's contingency (documented in PR1's tasks below).

Dependency diagram (📍 marks the slice currently in review; copy into each PR body):

```
main
 └─ PR1 backend-rename ──► PR2 db-migration ──► PR3 bindings-regen ──►
        PR4 frontend-feature ──► PR5 copy-sweep ──► PR6 docs-spec
```

---

## PR1 — Go backend rename (in-process, no binding regen)

**Goal:** rename backend identifiers/files from "chapter" to "episode" and consolidate the duplicated activity-log const, with zero behavior change and zero binding drift (Wails-bound `App` method *names* stay untouched here — that is PR3).

**Spec link:** `episode-vocabulary/spec.md` — "Backend Domain Vocabulary Uses 'Episode'" (contracts scenario), "Activity Log Uses 'episode_adjusted' With Tolerant Historical Reads".

**File list:**
- `internal/anime/chapter_service.go` -> `episode_service.go` (`git mv`)
- `internal/anime/chapter_service_test.go` -> `episode_service_test.go` (`git mv`)
- any other `chapter_service*` sibling files in `internal/anime/` (`git mv` each)
- `internal/api/contracts/contracts.go` — rename `ChapterScheduleItem`, `ChapterDayCount`, `ChapterCommandResult`, `ListChapterSchedule`, `AdjustWatchedChapters`, `ListChapterDayCounts`
- `internal/anime/service.go` — rename `remainingChapters` helper
- `app.go` — rename `wireChapterService*` helpers and `a.chapterService` field
- `internal/activity/store.go` — rename `ActionChapterAdjusted` -> `ActionEpisodeAdjusted = "episode_adjusted"`; add `IsEpisodeAdjusted(action string) bool`
- `internal/activity/store_test.go` — update to `activity.ActionEpisodeAdjusted`
- `internal/anime/chapter_service.go` (pre-rename) / `episode_service.go` (post-rename) — delete `ActivityActionChapterAdjusted`, use `activity.ActionEpisodeAdjusted` at the write site
- `app_activity_write.go` — use `activity.ActionEpisodeAdjusted`
- `app_activity_write_test.go` — update to `activity.ActionEpisodeAdjusted`
- `app_runtime_chapter_test.go` — update assertion to `activity.ActionEpisodeAdjusted` (file itself renames in PR3 alongside the method rename; only the const reference changes here)
- `defaultActivityCorrelationType` constant (wherever it is declared, likely `app.go` or `internal/anime/service.go`) — `"anime.chapter"` -> `"anime.episode"`

**Tasks:**

- [x] 1.1 RED (test-first, D4): add a test in `internal/activity/store_test.go` (or a new `internal/activity/recognizer_test.go`) asserting `IsEpisodeAdjusted("chapter_adjusted") == true`, `IsEpisodeAdjusted("episode_adjusted") == true`, `IsEpisodeAdjusted("something_else") == false`. Run it and confirm it fails (function does not exist yet).
- [x] 1.2 GREEN: `internal/activity/store.go` — add `ActionEpisodeAdjusted = "episode_adjusted"` const and `IsEpisodeAdjusted(action string) bool` per design D4's exact doc comment and body (accepts both `ActionEpisodeAdjusted` and the literal `"chapter_adjusted"`). Confirm 1.1 passes.
- [x] 1.3 GREEN: `internal/activity/store.go` — delete `ActionChapterAdjusted`; update `internal/activity/store_test.go` references to `ActionEpisodeAdjusted`.
- [x] 1.4 GREEN: delete `anime.ActivityActionChapterAdjusted` from `internal/anime/chapter_service.go`; update its one write site (`ActionType: ActivityActionChapterAdjusted` -> `ActionType: activity.ActionEpisodeAdjusted`) and `app_activity_write.go`'s `anime.ActivityActionChapterAdjusted` reference to `activity.ActionEpisodeAdjusted`. Verify `internal/anime` importing `internal/activity` introduces no cycle (confirmed clean in exploration: `internal/activity` does not import `internal/anime`).
- [x] 1.5 GREEN: update `app_runtime_chapter_test.go` and `app_activity_write_test.go` assertions from `activity.ActionChapterAdjusted` to `activity.ActionEpisodeAdjusted`.
- [x] 1.6 GREEN (mechanical, gopls rename + `git mv`): rename `internal/anime/chapter_service.go`/`_test.go` -> `episode_service.go`/`_test.go`; rename `remainingChapters` -> `remainingEpisodes` in `internal/anime/service.go`.
- [x] 1.7 GREEN (mechanical, gopls rename): `internal/api/contracts/contracts.go` — rename `ChapterScheduleItem` -> `EpisodeScheduleItem`, `ChapterDayCount` -> `EpisodeDayCount`, `ChapterCommandResult` -> `EpisodeCommandResult`, `ListChapterSchedule` -> `ListEpisodeSchedule`, `AdjustWatchedChapters` -> `AdjustWatchedEpisodes`, `ListChapterDayCounts` -> `ListEpisodeDayCounts`. Let the rename update every call site automatically (`internal/anime`, `app.go`, `app_runtime.go`, `app_desktop_actions.go`, `app_season_availability.go`).
- [x] 1.8 GREEN (mechanical, gopls rename): `app.go` — rename `wireChapterService*` helpers -> `wireEpisodeService*`, `a.chapterService` field -> `a.episodeService`.
- [x] 1.9 GREEN (mechanical, manual edit — not a symbol): rename `defaultActivityCorrelationType` value `"anime.chapter"` -> `"anime.episode"` at its declaration site.
- [x] 1.10 Verify no `Chapter`-named symbol remains reachable from `internal/anime`, `internal/api/contracts`, `app.go` (excluding `app_runtime.go`/`app_desktop_actions.go`/`app_season_availability.go`, which are PR3's scope): `grep -rn "Chapter" internal/anime internal/api/contracts app.go` (excluding ADR-007 legacy fields).

**Green gate:** `go test ./...`, `golangci-lint run`, `go vet ./...`, `go run ./tools/checkgofilesize`.

**Estimated changed lines:** ~350-420 (15-20 files, mostly rename churn; the activity consolidation is the only net-new logic — ~15 lines).

**Size contingency:** if the diffstat lands over 400, split tasks 1.1-1.5 (activity consolidation) into a standalone PR1a that merges before the rest of PR1's mechanical rename, per design's documented fallback.

**Rollback:** `git revert` clean — in-process only, no persisted state, no bindings, no frontend touched.

---

## PR2 — DB migration + season field rename (HIGH RISK, isolated)

**Goal:** rename the `season_animes.available_chapters` SQLite column to `available_episodes` via an idempotent `RENAME COLUMN` migration, and rename the corresponding Go/TS field end to end.

**Spec link:** `episode-vocabulary/spec.md` — "`available_chapters` Column Migrates to `available_episodes`" (all 3 scenarios); `availability/spec.md` — "Daily availability recheck" (`AvailableEpisodes` field name).

**File list:**
- `internal/season/schema.go` — `CreateDDL` column + `ColumnAdds` migration entry (see DB migration design below)
- `internal/season/schema_test.go` (or new `internal/season/schema_migration_test.go`) — migration probe test
- `internal/season/ports.go`
- `internal/season/sqlite_store.go`
- `internal/season/service_recheck.go`
- `internal/season/domain/season_anime.go`
- `frontend/src/features/season/season-source.types.ts` (or wherever `availableChapters` is declared — confirm exact path during apply)
- `frontend/src/features/season/**` season-store helpers/tests threading the field (confirm exact files during apply; likely `season-store.ts` + colocated `__tests__/`)
- `tools/probe_intake_first_chapter.py`
- `tools/check_intake_availability.py`

**Tasks:**

- [x] 2.1 RED (test-first, D3): add a season-schema migration test seeding a fixture DB with an `available_chapters` column populated with a nonzero value, running the migration, and asserting: (a) the column is now named `available_episodes`, (b) the value survived unchanged, (c) running the migration a second time is a no-op (no error, no duplicate column). Also assert a fresh `CreateDDL` database has `available_episodes` from the start (no `available_chapters` ever exists). Confirm it fails against the current schema. **Done as `TestSeasonAnimesAvailableEpisodesRenameMigration` in `internal/season/schema_migration_test.go`; confirmed RED before 2.2.**
- [x] 2.2 GREEN: `internal/season/schema.go` — `CreateDDL` line: `available_chapters INTEGER NOT NULL DEFAULT 0` -> `available_episodes INTEGER NOT NULL DEFAULT 0`. **Deviation from the literal instruction:** instead of a single `ColumnAdds` RENAME entry, `season_animes` now uses the `persistence.TableSchema.Migrate` hook (`migrateSeasonAnimes`). Reason: a plain `RENAME COLUMN available_chapters TO available_episodes` breaks the pre-existing `TestSeasonAnimesAdditiveMigrationOnExistingInstall` test, which simulates an install skip-jumping straight from the original SDD-41 `season_animes` shape (before SDD-43c ever added `available_chapters`) directly to current — a real, already-tested guarantee of the column-probe migration framework (`persistence.go`'s "safe to call on every application start without a persisted schema-version stamp"). Unlike the SDD-44 grade columns (present in `season_animes` since day-one `CreateDDL`), `available_chapters` was itself an SDD-43c *addition*, so an install that never ran that ADD has neither column — a blind RENAME fails for it. `migrateSeasonAnimes` now: RENAMEs when `available_chapters` is present (the common case), ADDs `available_episodes` fresh when neither column exists (the skip-jump case), and is a no-op when `available_episodes` already exists. Confirmed 2.1 passes and the pre-existing additive-migration test still passes.
- [x] 2.3 Validate against a real fixture DB that already contains `available_chapters`. **No real persisted `bridge.db` snapshot with season data exists in this repo or on this machine** (searched `resources/autoreas-data/**` — legacy `.dat` files only, unrelated to the season SQLite schema; searched common Windows app-data paths — only ephemeral Go-test temp DBs, already cleaned up). Validated instead via a constructed fixture (`preEpisodeSeasonAnimesDDL` in `schema_migration_test.go`) reproducing the exact pre-SDD-52 `season_animes` shape with a populated `available_chapters` value — the same validation method the pre-existing SDD-44 precedent test (`TestSeasonAnimesAdditiveMigrationOnExistingInstall`) uses. The migration test also separately covers the skip-jump case (see 2.2).
- [x] 2.4 GREEN (mechanical, gopls rename): rename the Go struct field `AvailableChapters` -> `AvailableEpisodes` through `internal/season/ports.go`, `internal/season/sqlite_store.go`, `internal/season/service_recheck.go`, `internal/season/domain/season_anime.go`. Cascaded automatically (gopls) into `internal/season/availability_test.go`, `internal/season/availability_test_helpers_test.go`, `app_season_helpers.go`, `app_season_availability.go`, `app_season_availability_test.go`, `app_season_test_helpers_test.go`. Also renamed the `AvailabilityProbe.AvailableChapters` port method (same identifier, distinct symbol) to `AvailableEpisodes` — flagged separately from the design's file list but required so the probe's own vocabulary matches the field it feeds. Manually fixed the raw SQL column-name string literals in `internal/season/sqlite_store.go` (INSERT/SELECT/UPDATE column lists — gopls doesn't touch string literals) and the stale-identifier doc comments/test-failure messages in `internal/season/service_recheck.go` and `internal/season/availability_test.go` that named the old field by name.
- [x] 2.5 GREEN (mechanical, tsserver rename): rename the frontend field `availableChapters` -> `availableEpisodes` in the season-source types and every season-store helper/test that threads it. **DEFERRED — not done in this PR.** Discovered dependency the design/tasks did not account for: `frontend/src/infrastructure/season-source/season-source.helpers.ts`'s `getSeasonAnimes()` returns the Wails-generated `GetSeasonAnimes` binding directly (structural typing, no explicit field-by-field mapping), so `SeasonAnimeRow.availableChapters` must structurally match whatever field name is present in the *generated* `frontend/wailsjs/go/models.ts` `main.SeasonAnimeDTO`, which in turn mirrors the `json:"availableChapters"` tag on `app_season_types.go`'s `SeasonAnimeDTO.AvailableChapters` (the Wails IPC wire field — distinct from the internal-only REST/WS wire fields PR6 already confirmed are chapter-free). Renaming the frontend field without also renaming that JSON tag AND regenerating `models.ts` would either break the wire contract or fail to typecheck; renaming the JSON tag would require running `wails generate module` and hand-updating the binding shims, which the design explicitly reserves for PR3 ("Never hand-edit `frontend/wailsjs/**`"; "own PR, atomic"). Left `app_season_types.go`'s `SeasonAnimeDTO.AvailableChapters int \`json:"availableChapters"\`` and the frontend `SeasonAnimeRow.availableChapters` **unchanged** (still wired together, still passing) to avoid a partial, PR2-scope-violating bindings edit. Recommend PR3 (bindings regen) or a dedicated follow-up absorb this rename alongside its `wails generate module` run, since it is coupled to that regen, not to the DB layer this PR owns. This is a real deviation from the design's PR2 file list — flagged for the orchestrator/gatekeeper. **ORCHESTRATOR DECISION: absorbed into PR3 and completed there** (see task 3.re-scope below) — the field is coupled to the Wails binding regen, so it moves atomically with it.
- [x] 2.6 GREEN (mechanical, manual edit): rename references in `tools/probe_intake_first_chapter.py` and `tools/check_intake_availability.py` (identifiers/comments referencing the column, not the filenames). Updated the `available_chapters` SQL column references (functionally required — the column no longer exists under the old name), the `first_chapter_url`/`db_available_chapters` result keys, and the docstring/CLI-description "chapter" prose in `probe_intake_first_chapter.py`. Left the `.py` filenames unchanged per the design's own file-list wording.

**Green gate:** `go test ./...` (incl. season migration tests), `golangci-lint run`, `go vet ./...`, `bun --cwd=frontend run test`, `bun --cwd=frontend run validate`, `go run ./tools/checkgofilesize`.

**Estimated changed lines:** ~180-240 (schema.go + migration test + Go field rename across 4 files + TS field rename across season-store + 2 Python probe files).

**Rollback:** **NOT a plain `git revert`.** Once merged and an install boots on this code, its DB has `available_episodes`. Reverting to pre-PR2 code means that code will probe for `available_chapters` on `season_animes` and find it absent — treat revert-after-ship as requiring a hotfix that re-adds a reverse `RENAME COLUMN available_episodes TO available_chapters`, not a plain revert. Document this caveat explicitly in the PR body before merge.

---

## PR3 — Wails `App`-method rename + binding regen (own PR)

> **Re-scope (absorbed from deferred task 2.5):** PR3 also renames the Wails IPC field `SeasonAnimeDTO.AvailableChapters`/`json:"availableChapters"` -> `AvailableEpisodes`/`json:"availableEpisodes"` in `app_season_types.go` (+ `app_season_helpers.go` projection), regenerates `models.ts` accordingly, and renames the frontend `SeasonAnimeRow.availableChapters` -> `availableEpisodes` through `frontend/src/infrastructure/season-source/**` and every season-store helper/test that threads it. This is Wails IPC only — the external REST/WS wire remains untouched.

**Goal:** rename the 3 Wails-bound `App` methods whose names change, update the other 9 bound methods' return type (already renamed in PR1's contract rename), regenerate the Wails bindings, and update the hand-written binding shims — atomically.

**Spec link:** `episode-vocabulary/spec.md` — "Backend Domain Vocabulary Uses 'Episode'" (the 8/12-method surface), "Frontend Episode Vocabulary and Route" (regenerated bindings + shims).

**Scope correction from gate review:** the full Wails-bound `App` surface is **12 methods**, not 8. Only 3 are literally renamed here (`GetChapterSchedule` -> `GetEpisodeSchedule`, `AdjustWatchedChapters` -> `AdjustWatchedEpisodes`, `GetChapterDayCounts` -> `GetEpisodeDayCounts`, all in `app_runtime.go`). The other 9 (`SetAnimeState`, `SetAnimeDays`, `SoftDeleteAnime`, `RestoreAnime`, `RepeatAnime` in `app_runtime.go`; `OpenAnimePage`, `CopyAnimePage`, `OpenAnimeFolder`, `CopyAnimeFolder` in `app_desktop_actions.go`) keep their names but their signatures now return `contracts.EpisodeCommandResult` (renamed in PR1) — they still need their generated-binding entries regenerated because the return type's shape changed.

**File list:**
- `app_runtime.go` — rename `GetChapterSchedule`, `AdjustWatchedChapters`, `GetChapterDayCounts`; update the 6 `"chapter service unavailable"` error-string literals (lines ~239, 255, 271, 286, 301, 316) to `"episode service unavailable"`
- `app_desktop_actions.go` — no method renames; confirm return-type references compile against `contracts.EpisodeCommandResult`
- `app_season_availability.go:219` — the `SendToVerHoyDTO{Status: "chapter service unavailable"}` literal -> `"episode service unavailable"` (flagged separately in gate review — this file is outside `app_runtime.go`/`app_desktop_actions.go` and must not be dropped)
- `app_runtime_chapter_test.go` -> `app_runtime_episode_test.go` (`git mv`, update method names and error-string assertions)
- `frontend/wailsjs/go/main/App.d.ts`, `frontend/wailsjs/go/main/App.js`, `frontend/wailsjs/go/models.ts` (regenerated, not hand-edited)
- `frontend/src/infrastructure/bridge-runtime-source/*` — hand-written shims (`getChapterSchedule` -> `getEpisodeSchedule`, `adjustWatchedChapters` -> `adjustWatchedEpisodes`, `getChapterDayCounts` -> `getEpisodeDayCounts`, and the `contracts.*` re-exports for the renamed types)

**Tasks:**

- [x] 3.1 GREEN (mechanical, gopls rename): `app_runtime.go` — rename `GetChapterSchedule` -> `GetEpisodeSchedule`, `AdjustWatchedChapters` -> `AdjustWatchedEpisodes`, `GetChapterDayCounts` -> `GetEpisodeDayCounts`. Also renamed the 3 private helper funcs in the same file (`toChapterScheduleContracts`/`toChapterDayCountContracts`/`toChapterCommandContract` -> `toEpisode*`, not Wails-bound but co-located and chapter-named) and fixed the self-referential doc comments on `GetEpisodeDayCounts` that named the old method by string.
- [x] 3.2 GREEN (manual edit): updated all `"chapter service unavailable"` literals in `app_runtime.go` to `"episode service unavailable"` (7 occurrences — 1 more than the estimated 6, one method had 2 branches).
- [x] 3.3 GREEN (manual edit): `app_season_availability.go:219` — `SendToVerHoyDTO{Status: "chapter service unavailable"}` -> `"episode service unavailable"`.
- [x] 3.4 GREEN (mechanical): `git mv app_runtime_chapter_test.go app_runtime_episode_test.go`; updated method names, error-string assertions, and test names (`Test*DelegatesToChapterService` -> `Test*DelegatesToEpisodeService`, etc.) to match 3.1-3.3.
- [x] 3.5 Confirmed `app_desktop_actions.go`'s 4 methods and `app_runtime.go`'s 5 non-renamed methods compile unchanged against `contracts.EpisodeCommandResult`. **Extra fixups discovered and applied** (not in the original file list, required for `go vet`/`go test` to pass since PR1 left them referencing the pre-PR3 helper/method names): `app_outcome_propagation_test.go` (`toChapterCommandContract` call sites + test names), `app_runtime_cover_test.go` (`toChapterScheduleContracts`/`toChapterDayCountContracts` call sites, `GetChapterDayCounts` call sites, test names), `app_season_test.go` (`SeasonAnimeDTO.AvailableChapters` field reference, see 3.re-scope below).
- [x] 3.6 GREEN: ran `wails generate module` (CLI v2.12.0) to regenerate `frontend/wailsjs/go/main/App.d.ts`, `App.js`, and `frontend/wailsjs/go/models.ts`. Diff reviewed and confirmed to contain exactly the expected renames (3 method renames, `EpisodeCommandResult`/`EpisodeDayCount`/`EpisodeScheduleItem` class renames, `SeasonAnimeDTO.availableEpisodes` field) and nothing else. The background watcher had already applied the identical regen reactively before this explicit run (confirmed by an identical `git diff --stat` before/after).
- [x] 3.7 GREEN (mechanical, tsserver rename): `frontend/src/infrastructure/bridge-runtime-source/*` — renamed shim functions (`getChapterSchedule`->`getEpisodeSchedule`, `adjustWatchedChapters`->`adjustWatchedEpisodes`, `getChapterDayCounts`->`getEpisodeDayCounts`) and `contracts.*` re-exports (`ChapterCommandResult`/`ChapterScheduleItem`/`ChapterDayCount` -> `Episode*`) in `.helpers.ts`, `.types.ts`, `.constants.ts`. **Boundary decision**: the `BridgeRuntimeSource` interface property rename cascades into `frontend/src/features/chapters/**` (PR4's declared scope) because `chapter-schedule-panel.helpers.ts` maps `bridgeRuntimeSource.<prop>` directly. To keep PR3's own green gate (`bun run validate` typecheck) green without pulling PR4's folder/component/route rename forward, only the **3 RHS references** in `chapter-schedule-panel.helpers.ts` (`bridgeRuntimeSource.adjustWatchedEpisodes`/`.getEpisodeDayCounts`/`.getEpisodeSchedule`) were updated; the feature's own LHS property names (`adjustWatchedChapters`, `getChapterDayCounts`, `getChapterSchedule` on its local `ChapterScheduleSource` port) and all `features/chapters/**` folder/component/route identifiers are untouched, left for PR4. Also fixed `anime-detail.helpers.ts` (`contracts.ChapterCommandResult`->`contracts.EpisodeCommandResult`, an existing consumer of the regenerated `models.ts` type not in the original file list) and `bridge-runtime-source-cover-events.test.ts` (direct references to the renamed shim property and the renamed `window.go.main.App.GetChapterDayCounts` mock key).

**Re-scope executed (absorbed 2.5, per the note above PR3's Goal):** `app_season_types.go`'s `SeasonAnimeDTO.AvailableChapters`/`json:"availableChapters"` -> `AvailableEpisodes`/`json:"availableEpisodes"`, `app_season_helpers.go`'s `seasonAnimeToDTO` projection, and the frontend `SeasonAnimeRow.availableChapters` -> `availableEpisodes` in `frontend/src/infrastructure/season-source/season-source.types.ts` plus every season-store/`features/season/**` helper and test that threads the field (20 files total, wider than the design's "season-store helpers/tests" estimate — the field is consumed directly by several `features/season/ui/**` components, not only the store). UI copy strings that happen to say "chapter(s)" next to the renamed property (`IntakeRow.tsx`, `daily-board.helpers.ts`'s `formatAvailableChapters` name and its "No chapters online yet" string) were deliberately left untouched — that is PR5's incidental copy-sweep scope, not PR3's.

**Green gate:** `go test ./...`, `golangci-lint run`, `go vet ./...`, `bun --cwd=frontend run test`, `bun --cwd=frontend run validate` (typecheck catches shim/binding drift), `go run ./tools/checkgofilesize`.

**Estimated changed lines:** ~260-320 (3 Go method renames + 6+1 error strings + test file rename + full regenerated bindings diff + shim updates).

**Rollback:** `git revert` clean — Go method names, regenerated bindings, and shims revert together as one unit.

---

## PR4 — Frontend feature-folder rename + route

**Goal:** rename the frontend feature folder, its schedule-panel component, the route, and the nav label from "chapter(s)" to "episode(s)", keeping the fallow ledgers in sync in the same PR.

**Spec link:** `episode-vocabulary/spec.md` — "Frontend Episode Vocabulary and Route" (nav/route scenario, fallow ledger scenario).

**File list:**
- `frontend/src/features/chapters/**` -> `frontend/src/features/episodes/**` (`git mv`, all 12 colocated files incl. 5 tests)
- `ChapterSchedulePanel` (component + colocated files) -> `EpisodeSchedulePanel`
- `frontend/src/app/routes/ChaptersRoute.tsx` -> `EpisodesRoute.tsx` (component + `<h1>` copy)
- `frontend/src/App.tsx` — `/chapters` -> `/episodes` route registration
- `frontend/src/**/app-layout.constants.ts` — nav item `to`, `label`, and icon variable if named `chaptersIcon`
- `frontend/src/App.test.tsx`
- `frontend/fallow-list.json`
- `frontend/fallow-dead-code.json`

**Tasks:**

- [x] 4.1 RED (test-first, light): update `frontend/src/App.test.tsx` to expect the `/episodes` route and "Episodes" nav label; run it and confirm it fails against the current `/chapters` route.
- [x] 4.2 GREEN (mechanical, `git mv` + tsserver "update imports on move"): `git mv frontend/src/features/chapters frontend/src/features/episodes`; rename `ChapterSchedulePanel` -> `EpisodeSchedulePanel` (component + all 12 colocated files, tsserver-driven import updates).
- [x] 4.3 GREEN (mechanical): `git mv .../ChaptersRoute.tsx .../EpisodesRoute.tsx`; update the component name and `<h1>` copy.
- [x] 4.4 GREEN (manual edit): `App.tsx` — update the route registration to `/episodes` -> `EpisodesRoute`. Confirm 4.1 passes.
- [x] 4.5 GREEN (manual edit): `app-layout.constants.ts` — update nav `to`/`label` to `/episodes`/"Episodes"; rename `chaptersIcon` variable if present.
- [x] 4.6 GREEN (manual edit, same PR per design): `frontend/fallow-list.json` and `frontend/fallow-dead-code.json` — update hardcoded `features/chapters/**` paths to `features/episodes/**`.
- [x] 4.7 Verify `.tsx` files touched stay dumb UI (no Wails calls, no `useEffect`, no business logic added) — this is a rename only.

**Green gate:** `bun --cwd=frontend run test`, `bun --cwd=frontend run validate`, `bun --cwd=frontend run fallow ...` clean (no stale `features/chapters` paths).

**Estimated changed lines:** ~300-380 (folder move touches ~12+ files; route/nav/ledger edits are small but the moved-file diff counts toward the PR).

**Rollback:** `git revert` clean — folder move, route, and fallow ledgers revert together as one unit.

---

## PR5 — Incidental copy/comment sweep

**Goal:** sweep remaining UI copy, error strings, and comments (not structural identifiers) from "chapter" to "episode", excluding the ADR-007 Spanish boundary.

> **Re-scope (flagged during PR3 apply):** PR5 ALSO renames two residual identifiers PR3 deliberately left: (a) the `stubAppChapterService` test-double struct -> `stubAppEpisodeService` (spans `app_test_helpers_test.go`, `app_season_test.go`, `app_season_test_helpers_test.go`, `app_runtime_cover_test.go` — none were in PR3's list); (b) `formatAvailableChapters` helper -> `formatAvailableEpisodes` in `daily-board.helpers.ts` (+ JSDoc/tests). Without (a), task 5.3's residual grep would fail on a real identifier, not a whitelist gap. If PR4's folder move already renamed (b) as part of `features/chapters/**`, skip it here.

**Spec link:** `episode-vocabulary/spec.md` — "Repo-Wide Vocabulary Verification Is Clean" (interim step toward the final PR6 sweep).

**File list:**
- `frontend/src/features/**/SoloAnimeDownloadPanel.tsx` — `'Download missing chapters'` -> `'Download missing episodes'`
- `frontend/src/features/**/anime-editor-workspace.helpers.ts` — `'Watched chapters must be a non-negative number.'` copy
- `frontend/src/**/anime-detail.types.ts` — `per-chapter stat tile` comment
- `frontend/src/features/season/**` — incidental "premiere chapters" comment/fixture wording
- `internal/anime/cover/*` — comment-only references
- `frontend/src/**/anime-estado.constants.ts`, `frontend/src/**/AnimeCoverPlaceholder.tsx` — comment-only references

**Tasks:**

- [x] 5.1 GREEN (manual, targeted edits): update the UI copy strings and comments listed in the file list above. Do not touch ADR-007 Spanish data literals (`"Sin ver"`, `"Ver hoy"`, `"Visto"`, `"No me gusto"`) or `NroCapVisto`-family fields.
- [x] 5.2 GREEN: update any existing component tests/snapshots whose assertions embed the changed copy strings (moves with the copy per work-unit-commits convention).
- [x] 5.3 Run a repo-wide case-insensitive `chapter` grep and confirm the only remaining hits are: ADR-007 boundary fields, Spanish data literals, archived/change-folder docs, `docs/learning-log.md` historical lines, and the NSIS `Chapter4.html` false positive. Any other hit blocks this PR.

**Green gate:** `bun --cwd=frontend run test`, `bun --cwd=frontend run validate`, `go test ./...`, plus the repo-wide grep in 5.3.

**Estimated changed lines:** ~80-120 (copy/comment only, no logic).

**Rollback:** `git revert` clean — copy-only, zero behavior.

---

## PR6 — Docs + living-spec update

**Goal:** add the ubiquitous-language decision doc, update the three living openspec capability specs to "episode" vocabulary, append the learning-log entry, and resolve the two open documentation questions.

**Spec link:** `episode-vocabulary/spec.md` — "Living Specs Reflect Episode Vocabulary; Historical Artifacts Untouched", "Ubiquitous-Language Documentation Exists", "Repo-Wide Vocabulary Verification Is Clean" (final sweep).

**File list:**
- `docs/ubiquitous-language.md` (new)
- `docs/learning-log.md` (append one dated line)
- `openspec/specs/rest-api-write-sync/spec.md`
- `openspec/specs/availability/spec.md`
- `openspec/specs/anime-editor/spec.md`

**Tasks:**

- [x] 6.1 GREEN (manual doc authoring, `cognitive-doc-design`): write `docs/ubiquitous-language.md` — lead with the episode-vs-chapter decision, a table for the term mapping, a checklist for the ADR-007 Spanish boundary, and a cross-link to ADR-007.
- [x] 6.2 GREEN: update `openspec/specs/rest-api-write-sync/spec.md`, `openspec/specs/availability/spec.md`, `openspec/specs/anime-editor/spec.md` to describe present behavior with "episode" vocabulary (these are the delta specs' targets already staged under this change's `specs/` folder — apply them to the living `openspec/specs/**` tree per the archive step).
- [x] 6.3 GREEN: append one dated line to `docs/learning-log.md` recording the SDD-52 decision.
- [x] 6.4 Resolve the two open questions from the design: (a) change folders under `openspec/changes/` are immutable historical records — do not rewrite sdd-38/39/40/41b/43/48 or any other prior change folder; (b) `docs/anime-chapter-management-plan.md` status — confirm during apply whether it is superseded (record the determination in `docs/ubiquitous-language.md` or the PR body).
- [x] 6.5 Run the final repo-wide case-insensitive `chapter` grep (same criteria as 5.3) across the full repo post-PR6 and confirm it is clean per the "Repo-Wide Vocabulary Verification Is Clean" requirement.
- [x] 6.6 Consumer communication (user requirement): the REST/WS endpoints have external consumers (mobile app). Add an explicit "API consumer impact" section to `docs/ubiquitous-language.md` and a dated note in `docs/openapi.yaml` (info/description or changelog block) stating that SDD-52 is a vocabulary-only refactor: no HTTP/WS wire field, path, or payload shape changed; `nrocapvisto`/`totalcap` remain byte-identical per ADR-007. Verified basis: no `internal/api/handlers` reference to the renamed `Chapter*` contract types, `internal/sync` and season snapshot/rating handlers chapter-free, `docs/openapi.yaml` chapter-free. Any FUTURE slice that does touch a wire surface must announce it in `docs/openapi.yaml` before merge.

**Green gate:** markdown builds (no code gate needed); final repo-wide grep from 5.3/6.5 stays clean.

**Estimated changed lines:** ~150-200 (new doc + 3 living-spec updates + 1 learning-log line).

**Rollback:** `git revert` clean — docs only.
