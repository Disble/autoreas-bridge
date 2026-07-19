# SDD-52 — Standardize the Ubiquitous Language on "episode"

Standardize the anime-progress domain vocabulary on **"episode"** and eliminate
"chapter" — a Spanish calque of the legacy `NroCapVisto`/"capítulo" field — from
every bridge-owned surface, keeping only the sanctioned ADR-007 legacy boundaries
Spanish. The change ships as a chained, multi-slice refactor plus a new
ubiquitous-language reference document.

## Why

- **Competing synonyms in one domain.** Newer subsystems (`internal/download`,
  `internal/season`, the mobile-sync wire contracts) already say "episode", while
  the older anime-progress subsystem (`internal/anime` chapter-service family,
  the Wails `App` methods, the frontend `chapters` feature, the `/chapters` route)
  still says "chapter". Two words for one concept makes the code harder to grep,
  read, and reason about, and forces every contributor to hold a mental
  translation table.
- **"chapter" is a calque, not a domain term.** It entered the codebase as a
  literal translation of the legacy NeDB field `NroCapVisto` ("número de capítulo
  visto"). The anime domain term is **episode**. ADR-007 already governs the
  Spanish→English boundary but is silent on this English↔English synonym conflict;
  SDD-52 closes that gap and records the decision.
- **The decision is already made.** "episode" wins. This change executes and
  documents it; it does not relitigate the term.

## What Changes

The rename spans four qualitatively different surfaces (this is NOT a flat
find-and-replace):

1. **Go backend (in-process).** Rename the `chapter_service*` file family to
   `episode_service*`, the exported contracts (`ChapterScheduleItem`,
   `ChapterDayCount`, `ChapterCommandResult`, `ListChapterSchedule`,
   `AdjustWatchedChapters`, `ListChapterDayCounts`, …), wiring helpers
   (`wireChapterService*`, `a.chapterService`), and the `remainingChapters` helper
   to their `episode` equivalents.
2. **Wails-bound `App` method surface.** Rename the 8 bound methods in
   `app_runtime.go`/`app_desktop_actions.go` (`GetChapterSchedule`,
   `AdjustWatchedChapters`, `GetChapterDayCounts`, and the `ChapterCommandResult`
   returners). Renaming these regenerates `frontend/wailsjs` bindings via
   `wails generate`; the generated files are never hand-edited.
3. **Persistence.** Additively migrate the SQLite column
   `season_animes.available_chapters` → `available_episodes`, and rename the
   activity-log action constant for future writes while keeping historical rows
   readable (see Decisions).
4. **Frontend + route.** Rename the `features/chapters` feature folder and
   `ChapterSchedulePanel` → `features/episodes` / `EpisodeSchedulePanel`, rename
   the `/chapters` route and its "Chapters" nav label to `/episodes` / "Episodes",
   update the binding shims and season-store field, and sweep incidental
   copy/comments.
5. **Documentation.** Add a ubiquitous-language reference document and update the
   living openspec specs.

### Decisions (open questions resolved)

| Question | Decision | Rationale |
|----------|----------|-----------|
| DB column `available_chapters` → `available_episodes` migration strategy | **Clean `RENAME COLUMN` cutover** via the existing `ColumnMigration` registry entry in `internal/season/schema.go` (`ALTER TABLE season_animes RENAME COLUMN available_chapters TO available_episodes`), idempotent by probing the new column name. No backfill / no dual-read. | Directly matches the SDD-44 grade-rename precedent already in this file (lines 56-58). SQLite `RENAME COLUMN` is atomic and preserves every value; the DB is a single-user desktop store with no concurrent cross-service reader, and `docs/openapi.yaml` is already "chapter"-free, so there is no wire consumer requiring a dual-read window. Dual-read would add complexity with zero benefit here. |
| Persisted activity-log literal `"chapter_adjusted"` | **Rename the Go constant to `ActionEpisodeAdjusted = "episode_adjusted"` for future writes; make the read/display side accept BOTH `"chapter_adjusted"` and `"episode_adjusted"`. Do NOT backfill historical rows.** | The activity log is an append-only audit trail; historical rows are immutable facts, consistent with the learning-log "never rewrite past entries" convention. A tolerant reader lets old rows keep rendering while new rows use the correct term. Backfilling would rewrite history for no functional gain and risk an in-place UPDATE on audit data. |
| Route `/chapters` → `/episodes` + nav label | **Rename freely to `/episodes` / "Episodes".** Verified safe: the route string exists only in client-side react-router registration (`App.tsx`), the nav constant (`app-layout.constants.ts`), and one test (`App.test.tsx`). No backend, DB, preferences, or mobile-sync surface persists or deep-links the route string. | This is a single-user desktop Wails app; there are no external bookmarks or stored landing routes to break. Grep for `/chapters` across the whole repo confirms only in-app usages plus historical openspec docs. |
| Triage of non-archived openspec change folders (sdd-38/39/40/41b/43/48) that mention "chapter" | **Treat committed change-folder artifacts (proposal/design/explore/slices) as immutable historical records — do NOT rewrite them.** Only the living `openspec/specs/**/spec.md` files (rest-api-write-sync, availability, anime-editor) describe present-day behavior and get updated. The tasks phase confirms each folder's status from its `state`/git history before touching anything, but the default is: change folders under `openspec/changes/` are the record of a past decision even when not yet moved under `archive/`. | A change proposal documents the intent at the time it was written; rewriting it falsifies the historical record. Living specs are current truth (the "code wins" drift rule) and must reflect "episode". This mirrors the learning-log immutability principle and avoids scope creep into six unrelated past changes. |
| Documentation deliverable | **Add `docs/ubiquitous-language.md`** recording the episode-vs-chapter decision, the reasoning, and a pointer to the sanctioned ADR-007 Spanish boundaries (LegacyAnimeRaw `NroCapVisto`/`.dat` byte-compat fields and Spanish data literals). Cross-link ADR-007; append one dated line to `docs/learning-log.md`. | The user explicitly asked for documentation. A dedicated ubiquitous-language doc is the durable home for the term decision and keeps ADR-007 focused on the Spanish/English boundary while SDD-52 owns the English/English synonym resolution. |

## Scope

**In scope**

- Rename all bridge-owned Go identifiers, files, and comments from "chapter" to
  "episode" across `internal/anime`, `internal/api/contracts`, `internal/activity`,
  `internal/season`, `app.go`, `app_runtime.go`, `app_desktop_actions.go`,
  `app_season_availability.go`, and their tests/helpers.
- Rename the 8 Wails-bound `App` methods and regenerate `frontend/wailsjs`.
- Additive SQLite migration `available_chapters` → `available_episodes` and the
  matching Go struct field (`internal/season` ports/store/domain).
- Rename the activity-log action constant and make the reader tolerant of both
  string values.
- Rename the frontend `chapters` feature folder + `ChapterSchedulePanel`, the
  `/chapters` route + nav label, binding shims, `availableChapters` season-store /
  season-source field, and incidental copy/comments across season, anime-editor,
  anime-detail, and download features.
- Rename dev/debug scripts that query the migrated column
  (`tools/probe_intake_first_chapter.py`, `tools/check_intake_availability.py`).
- Add `docs/ubiquitous-language.md`; update living openspec specs
  (rest-api-write-sync, availability, anime-editor); append a learning-log line.

**Out of scope (non-goals)**

- **The ADR-007 legacy boundary stays Spanish.** `LegacyAnimeRaw` and all `.dat`
  byte-compat fields (`NroCapVisto`, `TotalCap`, `Pagina`, `Dias`, …) are a
  compatibility contract and are NOT renamed. Spanish runtime data literals
  (`"Sin ver"`, `"Ver hoy"`, `"Visto"`, `"No me gusto"`) are unaffected.
- **No behavior change.** This is a pure vocabulary refactor; scheduling logic,
  availability counting, download behavior, and API semantics are unchanged.
- **No historical rewriting.** Archived openspec changes, non-archived
  change-folder artifacts, past learning-log entries, and historical activity-log
  rows are left intact.
- **No backfill of historical activity-log rows** and **no wire-contract change**
  (`docs/openapi.yaml` is already clean).
- **Generated Wails bindings are not hand-edited** — they regenerate from the Go
  rename.
- **Vocabulary owned by a pending sibling slice is not pre-empted** (none touching
  "chapter" identified; SDD-45 selection vocabulary is separate).

## Approach

Execute as a chained, multi-PR refactor (~6 slices, each within the ~400
changed-line budget). Slice boundaries are defined here at a high level; the tasks
phase finalizes exact file lists, ordering, and the chained-PR plan.

1. **Go backend rename** — `chapter_service*` family → `episode_service*`,
   contracts, activity constant (with tolerant reader), `remainingChapters`
   helper, and their tests. In-process only; no binding regen yet.
2. **DB migration + season field rename** (HIGH RISK, isolate for review) — add the
   `available_episodes` `RENAME COLUMN` migration to the schema registry, rename the
   Go struct field through `internal/season` ports/store/domain and the
   `season-source`/`season-store` frontend field, and the two Python probe scripts.
3. **Wails `App`-method rename + binding regen** (own PR) — rename the 8 bound
   methods, run `wails generate`, update the frontend binding shims.
4. **Frontend feature-folder rename** — `features/chapters` → `features/episodes`,
   `ChapterSchedulePanel` → `EpisodeSchedulePanel`, the `/chapters` → `/episodes`
   route + "Episodes" nav label, and the associated tests.
5. **Incidental copy/comment sweep** — validation messages, UI copy
   ("Download missing episodes"), and comments across season, anime-editor,
   anime-detail, and download features.
6. **Docs + living-spec update** — add `docs/ubiquitous-language.md`, update the
   three living openspec specs, append the learning-log line, and record the
   change-folder triage policy.

Each slice keeps the build/tests green on its own so PRs stack cleanly. The
fallow dead-code ledgers (`frontend/fallow-list.json`, `fallow-dead-code.json`)
that hardcode `features/chapters/**` paths are updated in the slice that moves the
folder so the guards stay accurate.

## Impact

- **Users:** desktop nav label and URL change from "Chapters"/`/chapters` to
  "Episodes"/`/episodes`; no data or workflow change. Existing installs migrate the
  DB column transparently on first launch.
- **Contributors:** one consistent term ("episode") across the whole domain;
  greppable, with the calque removed and the decision documented.
- **Cross-repo:** none. Wire contracts (`docs/openapi.yaml`, mobile-sync payloads)
  are already "episode"-neutral, so the sister mobile repo needs no coordination.
- **Risk surface:** the DB migration and the Wails binding regen are the two
  higher-risk slices; both are isolated into their own PRs for focused review.

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| DB migration corrupts or drops the availability count on existing installs | High | Use SQLite's atomic `RENAME COLUMN` (preserves values), gate it behind the idempotent new-column probe like SDD-44, and validate against a real fixture DB before merge. Isolate as its own slice/PR. |
| Wails binding regen drifts from hand-written shims, breaking the frontend calls | Medium | Do the method rename + `wails generate` + shim update atomically in one slice; never hand-edit generated files; run the frontend build/tests in that PR. |
| Tolerant activity-log reader misses a code path, so old `"chapter_adjusted"` rows stop rendering | Medium | Centralize the action-label mapping to accept both strings; add a test asserting a historical `"chapter_adjusted"` row still renders. |
| Silent inclusion/exclusion of the ambiguous non-archived openspec change folders causes scope creep or lost history | Medium | Explicit triage policy above: change folders are historical records, only living specs are updated; tasks phase confirms per-folder status before any edit. |
| Incidental "chapter" mentions in season/anime-editor fixtures are missed, leaving synonyms behind | Low | Finish with a repo-wide case-insensitive "chapter" grep in the docs/sweep slice; only ADR-007 boundary hits and historical records should remain. |
| Slice ordering breaks the build mid-chain (e.g. frontend renamed before bindings regen) | Low | Order slices backend → DB → bindings → frontend → sweep → docs so each PR compiles and tests green independently. |

## Open Questions (for tasks phase)

- Confirm per-folder status (shipped-but-unarchived vs genuinely active) of
  sdd-38/39/40/41b/43/48 from their `state`/git history; the default policy is
  "do not rewrite", but flag any folder that is genuinely still open.
- Confirm whether `docs/anime-chapter-management-plan.md` is a live plan (rename +
  rewrite) or superseded (leave as historical); resolve at tasks/apply time.
