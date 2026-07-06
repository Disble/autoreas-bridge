# SDD-43 — season-availability

> Slice of program SDD-39. Daily chapter-1 watch + the FIRST anime-creation
> capability in bridge + the availability board WITH section movement (the
> user's daily driving seat during the evaluation window).

## Objective

Every day (and on demand), re-check which matched animes have chapter 1 on
jkanime; newly available ones are CREATED in bridge (landing in "Sin ver")
and the user is notified. From the board the user then stages the day: move
animes into "Ver hoy" (which the download flow picks up) and later to
"Visto". The board answers "what do I do today?".

## Key facts this slice absorbs (verified)

- **No anime-creation path exists** (`POST /api/animes` rejected,
  `router.go:153-156`), but the write seam is create-ready:
  `WriteService.PatchAnime` legitimate-create branch (`service.go:375-376`),
  single-writer `UpdateWriter` appending to `animes.dat`
  (`writer.go:219-235`) with self-echo suppression, snapshot, changelog, and
  the already-defined `anime_created` realtime type.
- **The download scheduler's config MUST NOT be shared** (user decision:
  different features, different schedules). The `schedule` package itself is
  generic and reusable; see the composition pattern below.
- **Section movement UI does not exist**: nothing in bridge today moves an
  anime between "Sin ver"/"Ver hoy"/"Visto". `AnimePatch.Dias` (whole-array
  replace) is the writable seam for it — this slice ships that UI, because
  without it the evaluation window cannot be driven from bridge at all.

## Design

### 1. `CreateAnime` — a normal anime operation (lives in `internal/anime`)

Explicit `contracts.AnimeCreate{Nombre, Pagina, FechaEstreno, Tipo, ...}` →
builds a full `LegacyAnimeRaw` (new `_id`, `estado=0`, `nrocapvisto=0`,
`activo=1`, `primeravez` semantics, `fechaCreacion=now`,
`dias=[{dia:"Sin ver", orden:<next free in section>}]`) → funnels through the
SAME `applyWrite` path as every write today. Season consumes it via the
`AnimeGateway` port (closure-injected at the composition root — the
`ServiceDeps.SeasonMode` precedent, `app_preferences.go:42-53`).

### 2. Scheduler composition pattern (user-mandated separation)

The `schedule` package (`internal/download/schedule/scheduler.go`) is already
a generic component: `Deps{Store ConfigStore, Clock, Run RunFunc, Log}` with
an injected clock, atomic run guard, and `TriggerNow`. The pattern this slice
formalizes — **one Scheduler instance per job kind, each composed with its own
`ConfigStore` adapter and `RunFunc` strategy**:

```
schedule.Scheduler (generic component — NOT modified)
├── downloads job:  Store=downloadStore config      Run=download run   (existing)
└── season job:     Store=seasonScheduleStore (NEW) Run=RecheckAvailability (NEW)
```

- **Package moves to `internal/schedule`** (user-approved): two features now
  compose it, the path should say so. Mechanical move, no logic changes,
  no registry impact; downloads' imports updated in the same commit.
- `internal/season/schedule_store.go`: implements `schedule.ConfigStore`
  backed by season-owned KV keys in `app_settings` (`season_check_time`,
  **default 21:00 local (GMT-5) — user decision**, all weekdays; editable in
  the workspace Overview config, NOT in Preferences) — preferences-store
  shape (`internal/preferences/sqlite_store.go:13-72`).
- `RunFunc` strategy: no-ops unless season mode is ON **and** an OPEN season
  exists (workspace model — no phase gating) — "daily check during season
  mode on" is a guard inside the strategy, not scheduler configuration.

### 3. Recheck use case

For each row `availability=waiting`: `AvailabilityProbe.HasChapterOne(pageURL)`
= existing sites registry `Resolve(pageURL).ListEpisodes(...)` and
`HighestEpisodeNumber >= 1` (`service_pipeline.go:59`, `decision.go:9-33`).
Newly available → `AnimeGateway.Create` (exactly once — idempotency by
`availability` state) → row `created` + `anime_id` link. Scrape error → row
stays `waiting`, `last_checked_at` updated, run continues (never fails whole
run). One AGGREGATE notification per run
(`notification.Notifier` — verified: one call reaches HeroUI toast + Windows
toast with zero frontend wiring).

**Download chaining (user-confirmed)**: at the end of a recheck run, trigger
the download flow so today's "Ver hoy" animes fetch immediately —
`TriggerDownloads func(ctx) error` closure wired to the download scheduler's
`TriggerNow` (tolerating `ErrRunInProgress` as success). Which animes
download is still decided by the existing SDD-32 selection (`dias=="Ver hoy"`,
`activo==1`) — season never picks downloads itself.

### 4. Section movement (NEW capability, ships here)

- `internal/anime/chapter_service.go` gains `SetAnimeDays(animeID, dias,
  base)` — thin over `AnimePatch{Dias}` with the same OCC/activity shape as
  `SetAnimeState` (`chapter_service.go:270+`).
- Binding `app_runtime.go`: `SetAnimeDays(animeID string, dias []string,
  base ...)` following `SetAnimeState`'s nil-guard + result contract
  (`app_runtime.go:237-312`).
- Board actions per created anime: **Move to Ver hoy / Sin ver / Visto**
  (writes the full Estrenos-section `dias` entry). **Orden convention
  data-verified** against `animes.dat`: orden within Estrenos sections is a
  real sequential position (Visto reaches 25–56 historically; "Ver hoy"
  clusters at orden 1–3 — the daily batch, visible in the data) → new
  entries take the **next free integer at the end of the target section**.
  Mobile's own moves arrive through the existing PATCH path and just show up.

### Integration architecture

| Action | File | Pattern |
|---|---|---|
| NEW | `internal/api/contracts` — `AnimeCreate` | 3-layer validation scheme (transport → domain → legacy-compat), `docs/architecture.md:57-60` |
| NEW | `internal/anime/create_service.go` (+ golden tests vs a real `animes.dat` line) | use case over existing writer queue; publishes `AnimeChangedEvent` → changelog recorder picks it up unmodified |
| NEW | `internal/season/schedule_store.go`, `probe.go` (adapter over sites registry) | ConfigStore adapter + anti-corruption reuse |
| MODIFY | `internal/season/service.go` — `RecheckAvailability(ctx, trigger)` | domain use case; state-based idempotency |
| MODIFY | `internal/anime/chapter_service.go` — `SetAnimeDays` | clone of `SetAnimeState` shape incl. activity record |
| MODIFY | `app_startup_runtime.go` | second `schedule.NewScheduler` instance next to `:234-246`; wire `season.Deps{Gateway, Probe, Notifier, TriggerDownloads}` closures at the composition root |
| MODIFY | `app_runtime.go`, `app_season.go` | `SetAnimeDays`, `RecheckSeasonAvailability` nil-safe bindings |
| MODIFY | `frontend/src/infrastructure/bridge-runtime-source.ts` (SetAnimeDays), `season-source.ts`, `season-store.ts` | source ports |
| NEW | `features/season/ui/AvailabilityBoard/` via `generate:feature` | dumb UI + hook + helpers |

Event flow: recheck → season rows mutate → `season_changed`; creation →
`AnimeChangedEvent` → changelog + `anime_created` broadcast → mobile syncs;
section moves → standard anime write events. Nothing new on the event bus.

### Frontend — Daily Board (workspace section)

Groups ordered by actionability, evolved from the user's notepad sketch:

1. **Available today** (`success` chip) — created moments ago or awaiting
   staging; primary action per card: "Move to Ver hoy".
2. **In today's queue** — animes currently in "Ver hoy" (with download state
   glance if cheap); action: "Move to Visto" after watching.
3. **Waiting ch.1 — day N** (`warning`, N since import).
4. **Not found / discarded** (`default`, collapsed).

Header: "Re-check now" primary `Button` + last-check timestamp
(`Typography color="muted"`). Cards use the cover pipeline thumbnails
(SDD-38) for instant recognition.

## Decision points — ALL RESOLVED (user, 2026-07-05)

1. Daily check time: **21:00 GMT-5 default**, editable in the workspace
   Overview (season-scoped config, not Preferences).
2. Auto-download on create: NO — recheck chains the download trigger;
   selection stays SDD-32's ("Ver hoy" only).
3. `orden` in Estrenos sections: next free integer at the end (data-verified;
   only the three sections exist — Sin ver / Ver hoy / Visto).
4. `schedule` package moves to `internal/schedule` (mechanical).

## TDD plan

- `CreateAnime`: golden raw-line vs a real Legacy line; id uniqueness; writer
  integration (existing harness); event/changelog emission; Legacy read-back
  parity on fixture.
- Probe: ch.1 present / absent / scrape error fixtures.
- Recheck job with fake `Clock`: fires daily; guard (mode OFF, wrong phase) →
  no-op; idempotent same-day re-run; aggregate notification content; download
  trigger invoked (spy) incl. `ErrRunInProgress` tolerance.
- `SetAnimeDays`: OCC base handling, section+orden shape, activity record.
- Frontend: grouping/derivation helpers, staging action flows (optimistic +
  rollback).

## Size & delivery

Large — **three chained work units**: (1) `CreateAnime` (+contracts, golden
tests) — independently valuable; (2) probe + scheduler composition + recheck
use case + download chaining; (3) `SetAnimeDays` + bindings + board UI.

## Exit criteria

- Ch.1 appearing on jkanime → anime created exactly once, visible in
  "Sin ver", one notification, season row `created`.
- From the board: stage to "Ver hoy" → the download run picks it up
  (SDD-32 selection observed) → move to "Visto" after watching.
- Legacy still reads `animes.dat` after bridge-created lines.
- Season schedule config independent from the downloads schedule config.
