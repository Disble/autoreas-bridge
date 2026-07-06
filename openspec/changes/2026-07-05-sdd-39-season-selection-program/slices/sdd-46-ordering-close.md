# SDD-46 — season-ordering-close

> Slice of program SDD-39. The OrderGrid replacement: distribute animes into
> viewing days, apply `dias` automatically, close the season.

## Objective

Distribute ALL active animes (approved newcomers + continuing titles) into
weekdays, in explicit order, entirely visually — then one confirmation writes
every `dias` change and the season closes. No OrderGrid, no hand-editing.

## Scope adjustments (user feedback)

- **No "unassigned" concept.** The current DB truth: every anime's `dias`
  holds either weekday entries or an Estrenos section ("Sin ver", "Ver hoy",
  "Visto") — that IS how the system works. The board is a **view over real
  `dias` values plus a draft overlay**, nothing more. Season animes to place
  simply sit in their Estrenos groups (mostly "Visto" by now); placing them
  means drafting a weekday target. Zero new business concepts.
- **No 3-per-day limit.** Three/day is the historical average, not a rule —
  in or out of season mode. No capacity warnings; columns show a neutral
  count only.
- Day-suggestion logic (12→Thu–Sun, 9→Fri–Sun) DROPPED: all seven day columns
  always render; the user places freely (dynamic and subjective, as lived).

## The ordering board — full UI specification

### Layout

Two zones, fixed left rail + fluid week grid (single screen, no page scroll
traps; each column scrolls internally with `ScrollShadow`):

```
┌───────────────┬──────────────────────────────────────────────────────────┐
│ APPROVED      │  Lunes   Martes  Miérc.  Jueves  Viernes  Sábado Domingo │
│ TO PLACE (12) │  (2)     (1)     (0)     (3)      (3)      (3)     (3)   │
│               │  ┌────┐  ┌────┐  drop    ┌────┐  ┌────┐  ┌────┐  ┌────┐ │
│  [▦ card]     │  │ 1  │  │ 1  │  hint    │ 1  │  │ 1  │  │ 1  │  │ 1  │ │
│  [▦ card]     │  │ 2  │  └────┘          │ 2  │  │ 2  │  │ 2  │  │ 2  │ │
│  [▦ card]     │  └────┘                  │ 3  │  │ 3  │  │ 3  │  │ 3  │ │
│   ...         │                          └────┘  └────┘  └────┘  └────┘ │
├───────────────┴──────────────────────────────────────────────────────────┤
│  4 changes · [Reset draft]                        [Apply schedule ▸]     │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Left rail — "Approved, to place" (user-refined)**: ONLY the season
  animes that PASSED selection and await a weekday. Rejected animes and
  unrelated Estrenos rows are simply not this board's business. Each card
  shows its current section as a small chip ("Visto") for context.
- **Week grid**: seven columns, Lunes→Domingo (Spanish data literals — they
  ARE the `dias` values). Column header: day name + neutral count `Chip`.
  Animes already on a weekday (continuing titles) **appear in their previous
  position within each day** (user wording) and are reorderable/movable like
  everything else ("order everything").

### Cards

Compact horizontal card (`Card`, cover micro-thumb from the SDD-38 pipeline,
name, drag affordance). Draft-moved cards get a distinct treatment: `accent`
left border + an origin chip ("Visto → Jueves 2") so pending changes are
legible at a glance. Newcomers (this season's approved) carry a small
`success` dot to distinguish them from continuing titles.

### Interactions

1. **Drag & drop** (pointer): rail→column at a position, column→column,
   within-column reorder, column→rail (returns to its ORIGINAL section in the
   draft). Insertion line indicator while dragging; order renumbers on drop.
2. **Keyboard/menu parity (ships regardless of the dnd spike)**: every card
   has a `⋯` menu — "Move to… → [day / position]", "Move up/down", "Return to
   <original section>". This is the guaranteed baseline interaction.
3. **Reset draft**: reverts the overlay to current DB truth (confirmation).
4. **Apply schedule** (primary) → `Dialog` listing the per-anime diff
   ("Nippon Sangoku: Visto → Domingo 1 · Re:Zero S4: Domingo 2 → Domingo 3")
   → executes. Partial failures surface inline per card; re-apply is
   idempotent (value-equal patches no-op via OCC).
5. Draft **autosaves** and survives restarts.

### dnd technology

Spike task #1: React Aria `useDrag`/`useDrop` (HeroUI's foundation) +
jsdom testability (virtual-press knowledge in `autoreas-theme` applies).
If the spike fails, pointer-dnd moves to a follow-up and the menu interaction
ships as THE interaction — the slice never blocks on dnd.

## Design

### Backend

- `GetOrderingBoard(seasonID)`: two sets — (a) the rail: season rows whose
  derived verdict is Aprobado with linked `anime_id` and no weekday
  assignment yet; (b) the grid: ALL `activo=1` animes currently on weekdays
  via the existing `contracts.AnimeQueryService` seam, in `orden` position.
  Weekday-vs-Estrenos discrimination uses the SAME logic the codebase
  already uses (dia value, not `primeravez` — SDD-31 finding).
- `SaveOrderingDraft(seasonID, draft)`: JSON draft on `seasons`
  (`ordering_draft_json`, additive `ColumnAdds` migration). Draft is scratch
  space; APPLIED truth lives only in the animes' `dias`.
- `ApplySchedule(seasonID)`: milestone action (workspace model) — sets
  `applied_at`. Diff draft vs current → per changed anime one
  `AnimePatch{Dias, Base}` (verified seam: whole-array day+order replace,
  `contracts.go:314-329`) through `AnimeGateway`. Partial-failure: apply
  what succeeds, report per anime, `applied_at` stays unset until clean.
  While `applied_at` is set the board renders read-only; **"Reopen
  ordering"** clears it (re-apply is diff-based, idempotent — corrections
  are cheap, user-confirmed).
- `CloseSeason(seasonID)`: sets `closed_at` — the only terminal state;
  warns if the schedule was never applied; returns a season-mode-still-ON
  hint.

### Integration architecture

| Action | File | Pattern |
|---|---|---|
| MODIFY | `internal/season/schema.go` | additive `ColumnAdds` for `ordering_draft_json` (registry pattern, `schema_test.go:51` precedent) |
| MODIFY | `internal/season/service.go` + `domain/ordering.go` | `PlanSchedule(current, draft) []DiasPatchIntent` as a PURE diff function (mirror of SDD-45's `Reconcile` intent pattern); service executes intents via `AnimeGateway` |
| MODIFY | `app_season.go` | `GetSeasonOrderingBoard`, `SaveSeasonOrderingDraft`, `ApplySeasonSchedule`, `CloseSeason` nil-safe bindings |
| REUSE | `SetAnimeDays` seam from SDD-43 / `AnimePatch.Dias` | no new persistence machinery for apply — zero |
| MODIFY | `season-source.ts`, `season-store.ts` | draft autosave (debounced), board state |
| NEW | `features/season/ui/OrderingBoard/` via `generate:feature` | board = dumb components; ALL layout/diff/renumber logic in `ordering-board.helpers.ts` (pure, TDD-first) |
| MODIFY | umbrella close: `SetSeasonMode` existing binding | reused as-is from SDD-31 |

Event flow: apply → N standard anime writes → `AnimeChangedEvent`s →
changelog → mobile sees the new week layout through NORMAL sync; plus
`season_changed` for the hub. Close emits `season_changed` only.

### Close panel (shown once `applied_at` is set)

Summary `Alert status="success"` ("Season Julio 2026 applied — 12 animes
scheduled") + "Turn season mode off" primary button (existing
`SetSeasonMode`) → `CloseSeason`. Hub then shows the closed-season registry
read-only (grades, consideraciones, verdicts — the Excel, archived forever).

## Decision points — ALL RESOLVED (user, 2026-07-05)

1. Draft persistence: `ordering_draft_json` on `seasons`.
2. Pre-assigned continuing titles render in place from real `dias`;
   diff-based apply touches only actual changes.
3. No weekday→section demotion in this board — it schedules; normal tools
   cover demotions.
4. After apply, board is read-only; corrections via "Reopen ordering"
   (diff-based, idempotent re-apply).

## TDD plan

- `PlanSchedule` golden: the Image-2 OrderGrid layout as draft → exact
  expected `Dias` patches; renumbering on insert/remove; no-op stability;
  both-direction moves (weekday→weekday, section→weekday, return-to-section
  within draft).
- Migration test: additive column via `EnsureTableSchema`.
- Service: partial failure + idempotent re-apply; close transition + hint.
- Frontend helpers: grouping by discriminator, diff summary formatting,
  renumber logic; hook: debounced autosave, optimistic apply states;
  interaction tests per spike outcome (menu path always tested).

## Size & delivery

Large — **three chained work units**: (1) domain planning + draft + schema
(Go), (2) board UI with the menu interaction (fully shippable), (3) dnd
enhancement + close panel.

## Exit criteria

- A 12-anime season distributes freely across days, applies in one
  confirmation, and every anime shows the right day+order in Chapters AND in
  `animes.dat` (fixture line parity).
- Draft survives restart; Reset restores DB truth; re-apply after partial
  failure completes without duplicating writes.
- Close flips the mode off (on accept) and the registry stays queryable —
  the Excel and OrderGrid are now history.
