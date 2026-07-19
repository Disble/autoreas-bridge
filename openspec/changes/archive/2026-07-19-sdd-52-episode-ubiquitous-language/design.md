# SDD-52 Design — Execute the "episode" rename as 6 stacked-to-main slices

This design turns the approved decisions in `proposal.md` into an executable,
low-risk refactor plan. The vocabulary decision ("episode" wins, "chapter" is a
legacy calque) is settled; this document specifies **how** to land the rename
without breaking a single-user desktop Wails app, and how to slice it so every
merge to `main` keeps the build and tests green.

## Decision summary (read this first)

| # | Decision | Why it is safe |
|---|----------|----------------|
| D1 | Ship as **6 stacked-to-main PRs**, backend→DB→bindings→frontend→sweep→docs. | Each slice compiles and tests green on its own; mixed vocabulary between slices is acceptable, broken builds are not. |
| D2 | Go renames use **gopls/LSP `Rename Symbol`**, never `sed`. Files renamed with `git mv`. | LSP rename is reference-safe across packages and updates call sites; sed corrupts substrings (`ChapterCommandResult`→ nested identifiers, comments in unrelated packages). |
| D3 | DB column via a **`RENAME COLUMN` `ColumnMigration` probing the new name** (`available_episodes`), replacing the SDD-43c ADD entry. | Migrations run eagerly at every boot, so every persisted DB already has `available_chapters`; fresh installs get `available_episodes` from `CreateDDL`. Exact SDD-44 precedent. |
| D4 | Activity-log: **one canonical const `activity.ActionEpisodeAdjusted = "episode_adjusted"`**, delete the duplicated `anime.ActivityActionChapterAdjusted`, add a tolerant recognizer `activity.IsEpisodeAdjusted(s)` accepting both strings. | Kills the duplicated const flagged in exploration; historical `"chapter_adjusted"` rows stay readable; new writes use the correct term. |
| D5 | Wails bindings regenerate via **`wails generate module`** (the repo's documented command, CLI v2.12.0), done atomically with the App-method rename in slice 3. | Generated `frontend/wailsjs/**` is never hand-edited; regen + shim update in one PR keeps the frontend calls consistent. |
| D6 | Route `/chapters`→`/episodes` and nav label are **renamed freely**. | Single-user desktop app; route string lives only in `App.tsx`, `app-layout.constants.ts`, and `App.test.tsx`. No persisted/deep-linked route. |

## Architecture approach

This is a **pure vocabulary refactor** — no behavior, no new abstraction, no
layering change. The governing principle is **reference-safe mechanical rename
under a green gate**, sliced by *surface* (the four qualitatively different
surfaces the proposal identifies) so each slice has one rename mechanism and one
verification profile.

Layering and boundaries are unchanged. The only genuinely *designed* pieces are:

1. The **DB migration entry** (D3) — must be idempotent and preserve values.
2. The **activity-const consolidation + tolerant reader** (D4) — the one place we
   remove duplication and add a small helper rather than a pure rename.

Everything else is LSP-driven identifier/file/folder renaming plus generated-code
regeneration. The design's job is to sequence these so no slice lands a broken
build.

## Slice plan (stacked-to-main, ~400 changed lines each)

Order is chosen so each PR compiles and tests green independently. Backend
identifiers rename first (in-process only); the binding regen that couples Go↔TS
happens after both sides' names are settled; frontend structure moves last before
the docs sweep.

```
main
 └─ PR1 backend-rename ──► PR2 db-migration ──► PR3 bindings-regen ──►
        PR4 frontend-feature ──► PR5 copy-sweep ──► PR6 docs-spec
   (📍 marks current PR in each child body; each merges to main in order)
```

### PR1 — Go backend rename (in-process, no binding regen)

- **Scope:** rename the `chapter_service*` file family → `episode_service*`
  (`git mv` each), the exported contracts (`ChapterScheduleItem`,
  `ChapterDayCount`, `ChapterCommandResult`, `ListChapterSchedule`,
  `AdjustWatchedChapters`, `ListChapterDayCounts` and the `*CommandResult`
  returners) in `internal/api/contracts/contracts.go`, the `remainingChapters`
  helper in `internal/anime/service.go`, the `wireChapterService*` helpers and
  `a.chapterService` field in `app.go`, `defaultActivityCorrelationType =
  "anime.chapter"` → `"anime.episode"`, and all colocated tests (renamed
  alongside). Activity const consolidation (D4) also lands here.
- **Mechanism:** gopls `Rename Symbol` per identifier; `git mv` for files. The 8
  Wails-bound `App` methods in `app_runtime.go`/`app_desktop_actions.go` are **NOT**
  renamed yet (that is PR3) — but their *internal* calls to the now-renamed
  contract methods are updated by the LSP rename automatically. The bound method
  names stay `GetChapterSchedule` etc. so bindings do not drift in this PR.
- **Green gate:** `go test ./...`, `golangci-lint run`, `go run ./tools/checkgofilesize`.
- **Rollback:** revert PR1; bindings untouched, frontend untouched.
- **Size risk:** ~15–20 files but mostly rename churn; watch the 400-line budget —
  if the activity consolidation + contracts push it over, split the activity work
  into PR1a. Keep `episode_service*` files ≤500 effective lines (they are already
  under; rename does not grow them).

### PR2 — DB migration + season field rename (HIGH RISK, isolated)

- **Scope:** `internal/season/schema.go` — see "DB migration design" below; rename
  the Go struct field `AvailableChapters`→`AvailableEpisodes` through
  `internal/season/ports.go`, `sqlite_store.go`, `service_recheck.go`,
  `domain/season_anime.go`; the frontend `season-source.types.ts`
  `availableChapters`→`availableEpisodes` and the `season-store` helpers/tests
  that thread it; the two Python probes
  (`tools/probe_intake_first_chapter.py`, `tools/check_intake_availability.py`).
- **Mechanism:** gopls rename for Go field; manual edit for schema DDL/migration;
  LSP/tsserver rename for the TS field. **Validate against a real fixture DB**
  (an existing install already carrying `available_chapters`) before merge.
- **Green gate:** `go test ./...` (incl. season migration tests),
  `golangci-lint run`, `bun --cwd=frontend run test`, `bun --cwd=frontend run validate`.
- **Rollback:** revert PR2. NOTE: if a user already launched the reverted build,
  their DB has `available_episodes`; the reverted (older) code probes for
  `available_chapters` on `season_animes` and would not find it. Mitigation: the
  migration is forward-only by design; treat revert-after-ship as requiring a
  hotfix that re-adds a reverse RENAME, not a plain `git revert`. Document this in
  the PR body. This is the single most important rollback caveat in the change.

### PR3 — Wails `App`-method rename + binding regen (own PR)

- **Scope:** rename the 8 bound methods (`GetChapterSchedule`→`GetEpisodeSchedule`,
  `AdjustWatchedChapters`→`AdjustWatchedEpisodes`, `GetChapterDayCounts`→
  `GetEpisodeDayCounts`, and the `*CommandResult` returners keep their names but
  now return the PR1-renamed type) in `app_runtime.go` / `app_desktop_actions.go`,
  the `"chapter service unavailable"` error strings, then run
  **`wails generate module`** to regenerate `frontend/wailsjs/go/**`
  (`models.ts`, `main/App.d.ts`, `main/App.js`). Update the hand-written binding
  shims in `frontend/src/infrastructure/bridge-runtime-source/*` (`getChapterSchedule`
  → `getEpisodeSchedule`, etc. and the `contracts.*` re-exports).
- **Mechanism:** gopls rename for Go methods; `wails generate module` (do not
  hand-edit generated files); tsserver rename for shims. Do the rename + regen +
  shim update **atomically** — a partial PR3 leaves frontend calls pointing at
  gone bindings.
- **Green gate:** `go test ./...`, `golangci-lint run`,
  `bun --cwd=frontend run test`, `bun --cwd=frontend run validate` (typecheck
  catches shim/binding drift).
- **Rollback:** revert PR3 (Go names + regenerated bindings + shims revert together).

### PR4 — Frontend feature-folder rename + route

- **Scope:** `git mv frontend/src/features/chapters` → `features/episodes`,
  `ChapterSchedulePanel`→`EpisodeSchedulePanel` (component + all 12 colocated
  files incl. 5 tests), `app/routes/ChaptersRoute.tsx`→`EpisodesRoute.tsx`
  (component + `<h1>` copy), the `/chapters`→`/episodes` route registration in
  `App.tsx`, the nav item in `app-layout.constants.ts` (`to`, `label`, icon var
  if named `chaptersIcon`), and `App.test.tsx`. Update the fallow ledgers
  (`frontend/fallow-list.json`, `fallow-dead-code.json`) that hardcode
  `features/chapters/**` paths **in this same PR** so the guards stay accurate.
- **Mechanism:** `git mv` + tsserver "update imports on move"; manual JSON edits
  for fallow ledgers and nav constant.
- **Green gate:** `bun --cwd=frontend run test`, `bun --cwd=frontend run validate`,
  and `bun --cwd=frontend run fallow ...` clean (no stale `features/chapters`
  paths). `.tsx` files stay dumb UI — this is a rename, no logic added.
- **Rollback:** revert PR4 (folder move + route + ledgers revert together).

### PR5 — Incidental copy/comment sweep

- **Scope:** UI copy and comments that are *not* structural identifiers:
  `'Download missing chapters'`→`'Download missing episodes'`
  (`SoloAnimeDownloadPanel.tsx`), `'Watched chapters must be a non-negative
  number.'` (`anime-editor-workspace.helpers.ts`), the `per-chapter stat tile`
  comment (`anime-detail.types.ts`), incidental `features/season/**` "premiere
  chapters" comment/fixture wording, and comment-only references in
  `internal/anime/cover/*` and `anime-estado.constants.ts` /
  `AnimeCoverPlaceholder.tsx`.
- **Mechanism:** targeted manual edits (these are strings/comments, not symbols).
  Do **not** touch ADR-007 Spanish data literals or `NroCapVisto`-family fields.
- **Green gate:** `bun --cwd=frontend run test`, `bun --cwd=frontend run validate`,
  `go test ./...`, plus a repo-wide case-insensitive `chapter` grep — only
  ADR-007 boundary hits and historical records (archived/change-folder docs,
  learning-log line 35, the NSIS `Chapter4.html` false positive) should remain.
- **Rollback:** revert PR5 (copy-only, zero behavior).

### PR6 — Docs + living-spec update

- **Scope:** add `docs/ubiquitous-language.md` (episode-vs-chapter decision,
  reasoning, pointer to ADR-007 Spanish boundaries; cross-link ADR-007); update
  the three **living** specs (`openspec/specs/rest-api-write-sync/spec.md`,
  `availability/spec.md`, `anime-editor/spec.md`) to say "episode"; append one
  dated line to `docs/learning-log.md`; record the change-folder triage policy.
  Resolve the two open questions (per-folder status of sdd-38/39/40/41b/43/48;
  live-vs-superseded status of `docs/anime-chapter-management-plan.md`) at this
  point — default: change folders under `openspec/changes/` are immutable
  historical records, only living `specs/**` are current truth.
- **Mechanism:** manual doc authoring (apply `cognitive-doc-design`: lead with the
  decision, table for the term mapping, checklist for the boundary).
- **Green gate:** markdown builds; no code gate needed. Final repo-wide grep from
  PR5 stays clean.
- **Rollback:** revert PR6 (docs-only).

## Rename mechanics per surface

| Surface | Tool | Notes |
|---------|------|-------|
| Go identifiers (types, methods, funcs, fields, consts) | gopls `Rename Symbol` | Reference-safe across packages; renames call sites automatically. NEVER `sed` — it mangles substrings and comments in out-of-scope packages. |
| Go files | `git mv chapter_service*.go episode_service*.go` | Preserves history; do package-by-package. Keep files ≤500 effective lines (rename does not grow them). |
| Wails bindings | `wails generate module` (CLI v2.12.0) | Documented repo workflow (SDD-35 precedent). Regenerates `frontend/wailsjs/go/**`; never hand-edit. Run only in PR3 after Go method rename. |
| Frontend folders/components | `git mv` + tsserver "update imports on move" | Verify with `bun --cwd=frontend run validate` typecheck; update fallow ledgers in the same PR. |
| Frontend binding shims | tsserver rename | `bridge-runtime-source` shims must match regenerated binding names. |
| fallow config JSON | manual edit | `fallow-list.json` / `fallow-dead-code.json` hardcode `features/chapters/**`; update in the folder-move PR (PR4). |
| Route string + nav | manual edit | `App.tsx`, `app-layout.constants.ts`, `App.test.tsx` only. |

## DB migration design (D3)

Follows the SDD-44 grade-rename precedent in `schema.go:56-58` exactly.

**Two edits in `internal/season/schema.go`:**

1. `CreateDDL` line 37: `available_chapters INTEGER NOT NULL DEFAULT 0` →
   `available_episodes INTEGER NOT NULL DEFAULT 0` (fresh installs).
2. Replace the SDD-43c ADD entry with a RENAME entry (existing installs):

```go
// SDD-52 renamed the availability count column from the "chapter" calque to the
// domain term "episode". Existing installs (created SDD-43c+) carry
// available_chapters; probing the NEW name makes this idempotent (fresh installs
// already have available_episodes via CreateDDL).
seasonAnimesAvailableEpisodesDDL = `ALTER TABLE season_animes RENAME COLUMN available_chapters TO available_episodes`
```

```go
ColumnAdds: []persistence.ColumnMigration{
    // ...existing entries unchanged...
    {Column: "available_episodes", AlterDDL: seasonAnimesAvailableEpisodesDDL},
},
```

**Why replacing (not appending) the SDD-43c entry is safe.** The migration engine
runs eagerly at every boot and each `ColumnMigration` runs only when its `Column`
is absent (`internal/persistence/schema.go:31,46` — probe via `PRAGMA table_info`).
Therefore, by the time SDD-52 ships:
- Every **persisted** DB has already applied the SDD-43c ADD → it has
  `available_chapters`. The new entry probes `available_episodes` (absent) → runs
  the `RENAME`. SQLite `RENAME COLUMN` is atomic and preserves every value.
- Every **fresh** SDD-52 DB gets `available_episodes` from `CreateDDL` → the probe
  finds it → skips. No stray column, no double-migrate.

This is the same reasoning that let SDD-44 replace the SDD-41 CreateDDL columns
with RENAME entries. **Ordering:** place the new entry last in `ColumnAdds`
(after `consideration`), consistent with chronological migration order.

**SDD-34 schema-registry implications:** none beyond this file. `season` owns
every reference to its tables (enforced by `tools/checkarchitecture`); the
registry composition root only assembles descriptors and needs no change. No other
`chapter`-named table/column exists.

**Validation:** before merging PR2, run the season migration against a real
fixture DB that already contains `available_chapters` and assert the value
survives the rename (see Test strategy).

## Activity-log dual-read design (D4)

**Current duplication (the exploration flag):** the action strings exist in two
places — `internal/activity/store.go:20` (`ActionChapterAdjusted`) and
`internal/anime/chapter_service.go:22` (`ActivityActionChapterAdjusted`). The
write path (`chapter_service.go:265`, `app_activity_write.go:50`) uses the
`anime` copy. There is **no runtime consumer that switches on the action string
for display** (frontend does not map `action_type`; only Go tests compare it) —
so "dual-read" here is a *tolerant recognizer*, not a rendering switch.

**Design:**

1. **One canonical const** in the `activity` package (the owner of the table):
   `activity.ActionEpisodeAdjusted = "episode_adjusted"`. Delete the duplicated
   `anime.ActivityActionChapterAdjusted`; the write sites import
   `activity.ActionEpisodeAdjusted`. (Check the `internal/anime`→`internal/activity`
   import direction with `tools/checkarchitecture`; if `anime` may not import
   `activity`, keep a single const in `anime` and have `activity` re-export/alias
   it — resolve the exact home in the tasks phase, but there MUST be exactly one
   source-of-truth const.)
2. **Tolerant recognizer** for any code that must classify a row as an
   episode-progress adjustment:

```go
// IsEpisodeAdjusted reports whether an action string denotes an episode-progress
// adjustment, accepting the legacy "chapter_adjusted" value written before SDD-52
// so historical audit rows keep rendering. New writes use ActionEpisodeAdjusted.
func IsEpisodeAdjusted(action string) bool {
    return action == ActionEpisodeAdjusted || action == "chapter_adjusted"
}
```

3. **New writes** emit `"episode_adjusted"`. **Historical rows** keep
   `"chapter_adjusted"` on disk (no backfill — append-only audit trail, per the
   learning-log immutability convention).

The legacy `"chapter_adjusted"` literal appears exactly once, inside
`IsEpisodeAdjusted`, as a documented back-compat constant — not a re-introduced
duplicate.

## Test strategy (Strict TDD active)

Most of this change is **mechanical rename** — tests rename alongside their
subjects and need no new assertions (the compiler + existing green suite is the
safety net). Three pieces are genuine **test-first** work:

| Area | Mode | Test-first work |
|------|------|-----------------|
| PR1 Go identifier/file renames | Mechanical | Rename test files/symbols with the code; existing assertions unchanged. |
| PR1/D4 activity consolidation | **Test-first** | Add a test asserting a historical `"chapter_adjusted"` row is recognized by `IsEpisodeAdjusted` and still lists/renders; assert a new adjustment writes `"episode_adjusted"`. Write the failing test before adding the recognizer. |
| PR2 DB migration probe | **Test-first** | Add a season-schema test: seed a fixture DB with `available_chapters` + a value, run migration, assert the column is now `available_episodes` and the value is preserved; assert a fresh DB (CreateDDL) is a no-op. Write it before editing `schema.go`. |
| PR2 season field rename | Mechanical | tsserver/gopls rename; existing season-store tests move with the field. |
| PR3 bindings regen + shims | Mechanical | Typecheck (`validate`) is the gate; existing `app_runtime_chapter_test.go` renames to `app_runtime_episode_test.go` with updated method names. |
| PR4 route change | **Test-first (light)** | Update `App.test.tsx` to expect `/episodes` / "Episodes" first, watch it fail, then rename the route. |
| PR5 copy sweep | Mechanical | Existing component tests move with the copy; update any snapshot/string assertions. |

## Rollback boundary per slice

| PR | Rollback | Caveat |
|----|----------|--------|
| PR1 | `git revert` clean | In-process only; no persisted state touched. |
| PR2 | **NOT a plain revert** | DB already migrated on shipped installs; reverting requires a reverse-RENAME hotfix, not `git revert`. Highest-attention rollback. |
| PR3 | `git revert` clean | Go names + regenerated bindings + shims revert as one unit. |
| PR4 | `git revert` clean | Folder move + route + fallow ledgers revert together. |
| PR5 | `git revert` clean | Copy/comment only. |
| PR6 | `git revert` clean | Docs only. |

## Risks (design-level)

- **PR2 forward-only migration** is the dominant risk: once shipped, an install's
  DB has `available_episodes` and cannot be served by pre-SDD-52 code. Mitigation:
  validate against a real fixture DB, isolate PR2, and document the
  reverse-RENAME-hotfix rollback path in the PR body.
- **Activity const home** depends on the `anime`↔`activity` import direction
  enforced by `tools/checkarchitecture`; the single-source-of-truth location must
  be confirmed in tasks so consolidation does not violate the architecture gate.
- **fallow ledger drift** if the folder move (PR4) forgets to update
  `fallow-list.json`/`fallow-dead-code.json` — the fallow gate will catch it, but
  keep the ledger edit in the same PR.
- **400-line budget on PR1** — backend rename + activity consolidation may exceed
  budget; be ready to split activity work into PR1a.
- **Assumption to validate:** no runtime consumer filters activity rows by
  `action_type` for display (verified: frontend does not map it, only Go tests
  compare). If a future reader is added, it must use `IsEpisodeAdjusted`.
