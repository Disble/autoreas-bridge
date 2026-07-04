# Anime Chapter Management Plan

Bridge should implement anime chapter management as a first-class desktop workflow, not as a thin clone of Legacy screens. The goal is to preserve Legacy's proven behavior while using Bridge's existing write-back, OCC, Wails, React, and Hexagonal boundaries.

> Dependency: sync changelog retention and pairing-token cleanup are now tracked separately in `docs/sync-changelog-retention-plan.md`. Chapters should be implemented after that foundation is planned, because chapter management will increase write frequency.

## Legacy behavior baseline

| Capability | Legacy evidence | Bridge target |
| --- | --- | --- |
| Daily schedule | `main.js` exposes `Animes -> Ver`; `RenderVerAnime._verAnime()` chooses current weekday or `Ver hoy` in season mode; `BDAnimes.buscar(dia)` filters active anime by `dias[].dia` and sorts by `dias[].orden`. | Add a Chapters section with day/season lenses using Bridge snapshots as source. |
| Increment/decrement watched chapters | `RenderVerAnime` has `+`/`-`; left click changes by `1`, right click by `0.5`; floor is `0`; blocked when `estado` is final/no-liked/paused. | Add explicit progress commands supporting `±1` and `±0.5`, including fractional progress. |
| First-watch date stamping | `actualizarCap(id, cont, estrenar)` sets `fechaUltCapVisto`; also sets `fechaEstreno` only when both `fechaUltCapVisto` and `fechaEstreno` are null. | Preserve Legacy date semantics in backend write service, not UI helpers. |
| State changes | Card modal changes `estado`: `0=Viendo`, `1=Finalizado`, `2=No me gusto`, `3=En pausa`; state > 0 disables chapter buttons. | Expose state transition commands and UI affordances. |
| Remaining chapter preview | Hover over progress text temporarily shows `totalcap - nrocapvisto` when total is known. | Show remaining count persistently or as a secondary metric; no hidden hover-only UX. |
| Open/copy folder and page | Card icons open folder/page on left click and copy path/url on right click. | Provide safe desktop actions through Wails bindings: open page, open folder, copy value. |
| History table | `Historial.imprimirHistorial()` lists all anime, sorted by `fechaUltCapVisto`, including inactive rows with trash marker. | Reuse existing Catalog/History direction: history is the audit/detail lens, chapters is the operational lens. |
| Search/filter history | `Historial` supports query, state/type filters, and sorting. | Add later as a History/Catalog enhancement, not MVP chapter controls. |
| Detail panel | `Historial.infoAnime()` displays progress, total, duration, type, page, folder, origin, dates, genres, studios, charts, repeat history. | Share a full Anime Detail read model between Catalog, History, and Chapters. |
| Soft delete / restore | Edit screen calls `desactivarAnime()` (`activo=false`, `fechaEliminacion=now`); history can restore (`activo=true`, `fechaEliminacion=null`). | Bridge MUST support soft delete/restore as the only deletion model. Data is valuable and must remain recoverable. |
| Hard delete | History calls `borrarAnime()` and physically removes the NeDB row. | Bridge MUST NOT implement hard delete. This is an intentional product divergence from Legacy. |
| Repeat anime | History snapshots current progress/state/dates into `repetir[]`, then resets progress/state/dates and reactivates. | Requires typed `repetir` support and full-snapshot write; plan as a later slice after detail read model. |
| Statistics | Legacy has charts for chapters watched, chapters remaining, pages, and per-anime timeline. | Defer until the operational update loop is correct. Statistics consume the same read models later. |

## Current Bridge baseline

- Bridge already exposes `AnimeListItem` and `MobileAnime` with `estado`, `nrocapvisto`, `totalcap`, `dias`, dates, page/folder flags, and OCC token.
- `App.GetAnimes()` currently returns catalog-style list items only.
- `AnimePatch` currently supports `estado`, `nrocapvisto`, `fechaUltCapVisto`, `dias`, and `base`.
- `WriteService.PatchAnime()` is the correct write boundary because it durably appends to `animes.dat`, updates confirmed snapshots, and participates in OCC/conflict handling.
- The frontend `AnimePanel` is read-only catalog UI. Chapter management must not put Wails calls or business rules in `.tsx`; use generated feature folders, hooks, helpers, tests, and HeroUI primitives.

## Product split

Bridge should introduce **Chapters** as a new operational section:

- **Catalog**: inventory and data quality.
- **History**: rich cross-app activity timeline and future analytics surface.
- **Chapters**: "what do I watch/update today?"

This separation matters. If we overload Catalog, Bridge repeats Legacy's coupling. We can do better.

History is not only a "viewing history" screen. Bridge's History must become the transversal record of user actions across the app: chapter updates, state changes, soft delete/restore, repeat flows, sync/conflict decisions, download-related user actions, and later catalog edits. Chapters is one of the first producers of this activity stream.

The transversal Activity architecture is documented in `docs/sync-changelog-retention-plan.md`. Chapters must use the shared `ActivityRecorder` port instead of writing directly to History tables.

## Architecture guardrail harness

Because Chapters will be one of the first producers of transversal History data, this change must include an automated guardrail harness to protect the architecture from future drift.

The goal is not only to document the rule, but to make violations visible during local development and pre-commit checks.

Guardrails to add:

- Go linter/check: feature modules must not write directly to `activity_log`.
- Go linter/check: only `internal/activity` may own SQL statements targeting activity tables.
- Go linter/check: chapter/application commands must depend on an `ActivityRecorder`-style port, not on an activity SQLite implementation.
- React/ESLint rule or repo validator: History UI must read through the approved Activity query source/hook and must not call unrelated Wails bindings directly.
- React/ESLint rule or repo validator: Chapters UI must stay dumb; activity recording belongs to backend commands, not `.tsx` components.

Suggested implementation shape:

```text
tools/checkarchitecture
  - validates forbidden Go imports / SQL table access
  - validates frontend forbidden bindings / direct cross-context access
  - runs from lefthook with the existing repo-owned validators
```

This harness should start narrow. The first version only needs to protect the new Activity/History boundary:

```text
Only internal/activity can write activity_log.
Features can only record History through ActivityRecorder.
History UI can only read through the Activity query path.
```

If the architecture changes later, update the harness with the decision. Do not bypass it with ad-hoc exceptions.

## Implementation plan

### Slice 1 — Backend chapter commands

Create backend contracts and commands for:

- `ListChapterSchedule(dayOrMode)` returning active anime ordered by `dias[].orden`.
- `AdjustWatchedChapters(id, delta, base)` where `delta` is `1`, `-1`, `0.5`, or `-0.5`.
- `SetAnimeState(id, estado, base)`.

Rules:

- Never decrement below `0`.
- Preserve fractional progress.
- Set `fechaUltCapVisto` on progress change.
- Set `fechaEstreno` only when current `fechaEstreno` and `fechaUltCapVisto` are both absent.
- Do not allow progress changes when state is `1`, `2`, or `3`, unless the command explicitly resumes the anime first.
- Continue writing through `WriteService.PatchAnime`; no direct file writes.
- Emit/record a user-action telemetry event for every successful command, with enough context for History and future behavioral analysis.

### Slice 1.5 — User action telemetry foundation

Before the Chapters UI becomes interactive, define a small append-only activity model for user-originated actions:

- actor/source: desktop user, mobile sync, system automation, or legacy import
- action type: chapter adjusted, state changed, soft deleted, restored, repeated, opened page/folder, copied page/folder
- target: anime id and display name at the time of action
- before/after payload for important fields (`nrocapvisto`, `estado`, `activo`, dates)
- timestamp from Bridge, not from the client
- correlation id for linking UI command, write-back, sync event, and notification/log rows

This telemetry must be privacy-local and app-owned. It is not "analytics tracking" in the cloud sense; it is a local historical data asset for future analysis and product insight.

Performance guidance:

- Do not reuse the in-memory observability log for History. `logger.MemLogger` is intentionally bounded to recent runtime diagnostics.
- Do not overload the sync `changelog` as the product History table. `changelog` is for device propagation; History needs product semantics and longer retention.
- Store user-action telemetry in a dedicated SQLite table such as `user_activity` / `activity_log`.
- Keep writes append-only and small: one row per meaningful user action, not one row per render, hover, polling loop, or background heartbeat.
- Index the read paths History will use: `(occurred_at_ms DESC)`, `(anime_id, occurred_at_ms DESC)`, `(action_type, occurred_at_ms DESC)`, and optionally `correlation_id`.
- Keep heavy before/after payloads in JSON columns, but duplicate query-critical fields into typed columns (`anime_id`, `action_type`, `source`, `occurred_at_ms`) so History does not scan JSON.
- Read History through paginated queries (`LIMIT`, cursor/offset) and never load the full activity table into the UI.
- Add retention/archival policy only for noisy operational diagnostics. User activity should be retained by default because it is product data.
- Treat pairing tokens as ephemeral security material, not history. Bridge normally pairs with ~1 device at a time, so token accumulation is over-engineered waste: keep at most one active unconsumed token per Bridge instance/session, reuse it until it expires or is consumed, and prune consumed/expired tokens on startup and whenever a new token is issued.
- Treat sync `changelog` as a temporal outbox/inbox feed, not durable product history. It may grow between syncs, but unbounded growth means sync is unhealthy and must be surfaced as an operational problem.
- Durable History must record product actions from all sources, including Bridge desktop actions and actions received from Mobile sync. Mobile-origin actions should enter History with `source=mobile` and device context when available.

Expected load: chapter management is user-paced. Even thousands of chapter/state actions per year are trivial for SQLite with the indexes above. Performance becomes a risk only if we record high-frequency technical events, store large full snapshots for every tiny action without bounds, or query the table without pagination/indexes.

Legacy data sizing baseline, measured from `C:\Users\User\AppData\Roaming\Autoreas\data` on 2026-07-03:

| Dataset | Rows / records | Size | Notes |
| --- | ---: | ---: | --- |
| `animes.dat` | 818 lines / 818 unique anime | 500 KB | Effective current-state records, not a real action log. |
| Active anime | 14 | — | `activo != false`. |
| Inactive anime | 804 | — | Soft-deleted/hidden from active lists. |
| `repetir[]` entries | 57 | included above | Legacy's only rich-ish repeat history; very small. |
| Estimated lifetime watched chapter units | 9,355.5 | not separately stored | Inferred from current `nrocapvisto` plus `repetir[].nrocapvisto`. |
| `bridge.db` current | mixed tables | 2.2 MB | Includes 818 snapshots, 1,235 changelog rows, devices/tokens/download rows. |

Simulation from the real 2017-2026 Legacy usage rate:

| Scenario | What is recorded | Estimated rows/year | 10-year SQLite footprint | 20-year SQLite footprint |
| --- | --- | ---: | ---: | ---: |
| Low | Only meaningful user actions, some batched edits | ~862 | ~10 MB | ~21 MB |
| Realistic | One row per chapter adjustment + state/delete/repeat/open-copy actions | ~1,329 | ~16 MB | ~32 MB |
| High | Corrections, half-episode edits, richer action capture | ~2,166 | ~26 MB | ~52 MB |
| Bad design | Noisy technical events, UI noise, over-captured snapshots | ~12,431 | ~327 MB | ~654 MB |

Conclusion: a dedicated SQLite `activity_log` is safe for realistic Bridge History. The real risk is not SQLite; the risk is undisciplined event capture. Bridge MUST log product actions, not UI/render noise.

Retention policy implications are handled in `docs/sync-changelog-retention-plan.md`. The key dependency for Chapters is: `changelog` must stay a temporary delivery queue, while `activity_log` becomes durable History.

Legacy backfill policy:

- Do not synthesize rich Activity rows from existing Legacy state.
- Preserve only the historical data Legacy already has, such as current fields and `repetir[]`.
- Accept that pre-Bridge history is asymmetric and lower fidelity than future Bridge/Mobile activity.
- Start rich transversal History from new actions recorded after the Activity module exists.

### Slice 2 — Full anime detail read model

Expose a Bridge desktop detail DTO that includes:

- identity, state, active flag, first-time flag
- progress: watched, total, remaining
- schedule: days and order
- dates: creation, premiere, last watched, deletion
- content metadata: type, duration, genres, studios, origin, cover
- download metadata: page, folder
- OCC `modified_at`
- typed `repetir` once supported

This should become shared infrastructure for Catalog, History, and Chapters.

### Slice 3 — Chapters frontend section

Generate a feature folder instead of hand-rolling it:

```powershell
bun --cwd="frontend" run generate:feature chapters ChapterSchedulePanel
```

UI structure:

- left filter rail: Day, Premieres/Season, Watching, Seen/Completed
- main list: card per anime with cover, title, progress, remaining count, state, page/folder actions
- actions: `-1`, `-0.5`, `+0.5`, `+1`, state menu
- empty state matching current visual language

Frontend rules:

- `.tsx` renders only HeroUI + Tailwind.
- Hook owns Wails calls.
- Helpers own progress/state calculations.
- Tests come before helper/hook changes.

### Slice 4 — Detail/history integration

Add shared Anime Detail route/modal and wire:

- Chapters card -> detail.
- Catalog row -> same detail.
- History row -> same detail.

Do not duplicate Legacy's detail logic across three screens.

History requirements:

- Show user actions, not only anime rows.
- Support filtering by action type, anime, source, and date range.
- Link each chapter/state action back to the anime detail.
- Preserve enough before/after data to answer questions like "what did I watch this week?", "which anime did I pause frequently?", and "what changes came from Bridge vs Mobile vs Legacy?"

### Slice 5 — Advanced Legacy parity

Implement after MVP:

- soft delete/restore
- repeat anime flow
- history search/filter/sort
- charts: watched, remaining, pages, timeline
- page/folder open/copy desktop actions

Hard delete is permanently out of product scope unless a future explicit data-retention decision reverses it. The default and intended model is recoverable soft delete.

## Acceptance checkpoints

- Updating chapters in Bridge appends a valid Legacy-compatible line to `animes.dat`.
- Legacy sees the updated chapter count after its normal data refresh.
- Mobile receives the same update through existing sync mechanisms.
- Concurrent Bridge/Mobile changes produce the existing OCC behavior, not silent clobber.
- `0.5` chapter increments round-trip without truncation.
- First watch sets `fechaEstreno` once, not on every progress update.
- Completed/paused/no-liked anime cannot be accidentally incremented from the schedule card.
- Soft delete marks an anime inactive and recoverable; no Bridge path physically removes anime data.
- Every successful user action creates a local activity record consumable by History.

## Suggested SDD change

Create a formal SDD change named:

```text
2026-07-03-sdd-36-anime-chapter-management
```

Recommended first PR/work unit: backend chapter commands + tests only. UI should come second. This is the foundation; if we get write semantics wrong, the pretty cards are just a corruption machine.
