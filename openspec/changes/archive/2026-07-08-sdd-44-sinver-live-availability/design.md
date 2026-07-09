# Design — sdd-44-sinver-live-availability

## Overview

Two orthogonal fixes, one per work unit, sharing no code seam:

- **wu1 (backend)** unfreezes `AvailableChapters` for CREATED rows that are still
  in the *Sin ver* section, by relaxing the single skip condition in
  `Service.RecheckAvailability` (`internal/season/service.go:307-345`). The row's
  live section is not on the `season_anime` row — it is derived from the anime's
  `dias`, reachable through the EXISTING batched port
  `AnimeGateway.CurrentPlacements`. No new port, no domain field.
- **wu2 (frontend)** renders the now-live chapter count + open-page link +
  availability dot on each *Sin ver* row of `DailyBoard.tsx`, mirroring
  `IntakePanel`'s wording. Pure presentational addition — the data
  (`availableChapters`, `matchedSlug`) already flows on `SeasonAnimeRow`.

The split is clean because the DTO already carries the field: `app_season.go:417`
maps `AvailableChapters: r.AvailableChapters` unconditionally (`app_season.go:116`
JSON `availableChapters`). Once the backend writes it, the frontend sees it — the
frontend WU is render-only, the backend WU is write-only.

## Architecture — where the "section" of a created row lives

A `domain.SeasonAnime` row has NO section field (`internal/season/domain/season_anime.go:45-68`).
The frontend-visible `section` ("Sin ver" / "Ver hoy" / "Visto") is derived from
the anime's legacy snapshot as `Dias[0].Dia`, exactly what the App layer already
does for the DTO (`app_season_availability.go:218` `animeSectionsByID`).

The season package reaches this through a port it already owns, batched by anime
ids:

```
AnimeGateway.CurrentPlacements(ctx, animeIDs) (map[string][]domain.Placement, error)
```

declared `internal/season/ports.go:68-70`, implemented at the composition root
(`app_season_availability.go:114`, backed by `snapshots.ListSnapshots`).
`placements[animeID][0].Dia` IS the current section string. Section constants
already exist: `sinVerSection = "Sin ver"` (`internal/season/service.go:69`).

This is the load-bearing reuse decision — see ADR-1.

## wu1 — RecheckAvailability relaxation

### Current behavior (the frozen-count root cause)

The loop skips a row when it is not matched OR already created
(`service.go:318`):

```go
if row.MatchStatus != domain.MatchMatched || row.Availability == domain.AvailabilityCreated {
    continue
}
```

So the moment a row reaches `AvailabilityCreated`, its `AvailableChapters` is
frozen at the value captured at creation time, and the Daily Board's own
"Re-check now" button has ZERO effect on the rows it actually shows (all of which
are created).

### New behavior

1. **Collect eligible-created anime ids up front.** Before the loop, scan `rows`
   once for CREATED rows that still carry a probeable slug
   (`row.Availability == AvailabilityCreated && row.MatchStatus == MatchMatched &&
   row.AnimeID != ""`), collecting their `AnimeID`s.
2. **One batched section lookup.** `placements, err := s.gateway.CurrentPlacements(ctx, animeIDs)`
   — a SINGLE call, not per-row. On error, treat all created rows as ineligible
   (fall back to today's blanket skip) rather than failing the run — this method
   already tolerates probe errors per-row and never fails as a whole.
3. **Two eligibility paths in the loop:**
   - **matched-uncreated row** (today's path, unchanged): probe →
     `Availability`+`AvailableChapters` update, append to `res.Available` on the
     waiting→available transition.
   - **created row still in *Sin ver*** (new path): eligible only when its derived
     section (`placements[row.AnimeID]` first entry's `Dia`) equals
     `sinVerSection`. Probe → write ONLY `AvailableChapters`. Never touch
     `Availability`; never append to `res.Available` (see ADR-3, ADR-4).
   - A created row in *Ver hoy* / *Visto*, or with an empty/absent section, or with
     no matched slug → skipped, exactly like today.
4. `res.Checked` increments for BOTH paths (see ADR-4).

The per-row probe-error tolerance, the `res` bookkeeping mechanics, and
`s.repo.UpdateSeasonAnime(ctx, row)` all stay as-is.

### nil-dep invariant

`RecheckAvailability` guards only `if s.probe == nil` (`service.go:308`). Adding a
`s.gateway.CurrentPlacements` call is safe WITHOUT a second guard because
`SetAvailabilityDeps` (`service.go:104-106`) wires `probe` and `gateway` together
in one call — they are never independently nil. This invariant is asserted by an
existing test path and MUST be preserved; if the two deps ever split, the guard
must become `s.probe == nil || s.gateway == nil`.

### Sequence — RecheckAvailability, before

```
User ──▶ DailyBoard "Re-check now"
          │
          ▼
     Service.RecheckAvailability(seasonID)
          │  repo.ListSeasonAnimes
          ▼
     for each row:
          │
          ├─ MatchStatus != matched  ─────────────▶ skip
          ├─ Availability == created ─────────────▶ skip   ◀── FREEZES every board row
          └─ (matched & uncreated) ──▶ probe ──▶ update Availability + AvailableChapters
```

### Sequence — RecheckAvailability, after

```
User ──▶ DailyBoard "Re-check now"
          │
          ▼
     Service.RecheckAvailability(seasonID)
          │  repo.ListSeasonAnimes
          │
          │  collect AnimeIDs of created+matched rows
          │  gateway.CurrentPlacements(animeIDs)  ── ONE batched call
          │     └─ err ─▶ treat all created rows as ineligible (no fail)
          ▼
     for each row:
          │
          ├─ matched & uncreated ─────▶ probe ─▶ update Availability + AvailableChapters
          │                                        (append res.Available on waiting→available)
          │                                        Checked++
          │
          ├─ created & matched & section=="Sin ver"
          │        └─▶ probe ─▶ write AvailableChapters ONLY
          │                     (Availability stays 'created'; never in res.Available)
          │                     Checked++
          │
          └─ otherwise (created in Ver hoy/Visto, empty section, unmatched) ─▶ skip
```

### Data-flow after the fix

```
probe.AvailableChapters(slug)
   → row.AvailableChapters (created row)
   → repo.UpdateSeasonAnime
   → DTO app_season.go:417 (unconditional map)
   → SeasonAnimeRow.availableChapters
   → DailyBoard Sin ver row  (wu2 renders it)
```

## wu2 — DailyBoard Sin ver enrichment

`DailyBoard.tsx` currently renders each *Sin ver* row as a bare
`LabeledCheckbox + rawName` (`DailyBoard.tsx:80-86`). It must gain, mirroring
`IntakePanel.tsx:110-182`:

- **"N chapters available" text** — same wording/pluralization as
  `IntakePanel.tsx:111-113`.
- **Open-page link icon** — same `linkIcon` anchor pattern as
  `IntakePanel.tsx:116-132`, `href={row.matchedSlug}`, shown only when
  `matchedSlug !== ''`.
- **Availability dot** — a small colored dot like
  `IntakePanel.tsx:171-182`, but with board-appropriate labels.

`SeasonAnimeRow` already carries `availableChapters`, `matchedSlug`, `animeId`,
`section` (`season-source.ts:63-74`) — no source/store/hook data change needed.
`use-daily-board.ts` stays unchanged; the enrichment is pure derivation +
presentation.

### New colocated helpers (`daily-board.helpers.ts`, JSDoc'd, per ADR-2)

- `formatAvailableChapters(count: number): string` → `"N chapter available"` /
  `"N chapters available"` (singular/plural), the one-line rule mirrored from
  IntakePanel's inline text.
- `getSinVerAvailabilityIndicator(row: SeasonAnimeRow): { color: 'success' | 'danger'; label: string }`
  → `success` + `"N chapters available"` when `availableChapters >= 1`; `danger` +
  `"No chapters online yet"` when `0`. (For created *Sin ver* rows the match/create
  semantics are moot, so the labels differ from `getAvailabilityIndicator`'s
  "Available to create" / "Waiting for chapter 1" — see ADR-2.)

`.tsx` stays dumb UI: it calls the helpers and renders. No `useEffect`, no Wails,
no logic (frontend constraint #1).

## ADR-style decisions

### ADR-1 — Reuse `AnimeGateway.CurrentPlacements`; add no new port and no domain field

**Decision.** Derive the created row's section inside `RecheckAvailability` via the
existing batched `s.gateway.CurrentPlacements(ctx, animeIDs)`, taking
`placements[animeID][0].Dia`.

**Rationale.** The port already exists, is already batched, is already implemented
at the composition root, and is already the exact derivation the App layer uses for
the DTO. Reusing it keeps `internal/season` decoupled from the anime context
(hexagonal ports-adapters) with zero new surface.

**Rejected — add a `Section` field to `domain.SeasonAnime`.** The section lives in
the anime's `dias` (the runtime source of truth). Copying it onto the season row
would duplicate state that can drift, and would leak an anime-side concern into the
season repository contract. Project rule #2: the code/`dias` wins as runtime truth.

**Rejected — add a new `AnimeGateway.SectionOf` port method.** Redundant:
`CurrentPlacements` already returns the placements from which the section is the
first `Dia`. A second method would be a narrower duplicate of an existing capability.

### ADR-2 — Duplicate the tiny formatting rule in `daily-board.helpers.ts`; do NOT import from `intake-panel.helpers.ts`

**Decision.** Add colocated helpers in `daily-board.helpers.ts` rather than
importing `getAvailabilityIndicator` / the chapters text from IntakePanel.

**Rationale.** (a) The project enforces strict per-feature colocation
(frontend constraint #3; each complex module owns its `*.helpers.ts`). A
cross-feature import would couple DailyBoard and IntakePanel so they must evolve
together. (b) The reused *semantics* differ: `getAvailabilityIndicator` labels a
row "Available to create" / "Waiting for chapter 1" — both wrong for a Sin-ver row
that is ALREADY created. The board needs "N chapters available" / "No chapters
online yet". (c) The duplicated rule is a single pluralization ternary — three
similar lines beat a premature cross-feature abstraction. IntakePanel's own
chapters text is itself inline JSX, not a shared helper, so there is nothing
canonical to import.

**Rejected — extract a shared helper into a season-wide `ui/shared`.** Premature:
one duplicated ternary does not justify a new shared module and its coordination
cost. Revisit only if a third consumer appears.

### ADR-3 — Leave `Availability` at `AvailabilityCreated` for probed Sin-ver rows; write ONLY `AvailableChapters`

**Decision.** For a created *Sin ver* row, the new path writes `AvailableChapters`
and NEVER changes `Availability` (stays `created`).

**Rationale — this is the one subtle risk of an otherwise mechanical change.**
`Availability` and "created" are orthogonal once a row is created, and the
`available`/`waiting` values gate creation-eligibility, which is moot post-creation.
Flipping a created row's `Availability` back to `available`/`waiting` would break
two things:
- **Frontend grouping.** `groupCreatedBySection` (`daily-board.helpers.ts:14`)
  drops any row whose `availability !== 'created'`. Flipping it would make the row
  VANISH from the Daily Board entirely — the exact opposite of the fix.
- **Creation re-exposure.** `isCreatableRow` / `CreateSeasonAnimes` act on
  `AvailabilityAvailable`; flipping back could re-offer an already-created anime for
  creation.

So created rows carry live `AvailableChapters` with a frozen `Availability` — the
field means "creation-eligibility state," which is permanently `created`.

### ADR-4 — Extend `res.Checked` to probed Sin-ver rows; do NOT extend `res.Available`

**Decision.** Increment `res.Checked` for created Sin-ver rows probed this run.
Do NOT append them to `res.Available`.

**Rationale.** `Checked` means "rows probed this run"; extending it keeps the count
honest now that created rows are probed (its doc comment updates from "matched,
uncreated rows" to "rows probed"). `res.Available`, by contrast, drives the
"these newly became available to create" report — meaningless for an already-created
anime, and a misleading toast if appended. This also falls out naturally from ADR-3:
since the new path never touches `Availability`, the existing `wasAvailable` →
append logic simply never fires for created rows.

## TDD (strict, both stacks)

**Backend (`internal/season/availability_test.go`, Go: `go test ./...`).** Extend
the existing fakes: `fakeProbe` already exists; add a fake/stub `AnimeGateway`
exposing `CurrentPlacements` returning a scripted `map[animeID][]Placement`. New
regression tests, written FIRST:
- Created + matched + section "Sin ver" + probe returns 3 → `AvailableChapters==3`,
  `Availability` stays `created`, `res.Checked` counted, name NOT in `res.Available`.
- Created + section "Ver hoy" / "Visto" → untouched, not probed.
- Created + empty/absent placements → untouched (blanket-skip parity).
- `CurrentPlacements` returns error → all created rows untouched, matched-uncreated
  rows still probed, run does not fail.
- Idempotency: two runs on a stable probe leave the row identical.
- Existing matched-uncreated assertions (`availability_test.go:127-130`) still pass.

**Frontend (`DailyBoard/__tests__`, vitest via `bun`).** Written FIRST:
- `daily-board.helpers.test.ts`: `formatAvailableChapters` singular/plural (0, 1,
  N); `getSinVerAvailabilityIndicator` success vs danger by `availableChapters`.
- `use-daily-board.test.ts`: the frozen-count regression anchor — a
  `createdRow({ availableChapters: 0 })` then a store refresh reflecting the live
  count renders through (guards the render path the backend fix feeds).
- `DailyBoard.test.tsx`: a Sin-ver created row renders the chapters text, the
  open-page link (only when `matchedSlug !== ''`), and the availability dot.

File-size 400/500, JSDoc on every exported helper, `readonly` on every `*Props`
field, English-only — all hold. No Wails bindings regenerated (no new binding).
```
