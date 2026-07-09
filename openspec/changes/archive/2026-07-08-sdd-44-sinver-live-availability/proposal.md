# Proposal — sdd-44-sinver-live-availability

## Intent

Give the Daily Board's "Sin ver" section the same at-a-glance availability info
the Intake list already shows, so the user can make an informed
what-to-watch-today pick instead of choosing blind from a bare checkbox + name.
Two problems block that today, and both must be fixed:

1. **Frozen count (root cause).** `RecheckAvailability`
   (`internal/season/service.go:307-345`) skips every row once
   `Availability == domain.AvailabilityCreated` (line 318), so `AvailableChapters`
   freezes at its creation-time value and never updates again — including when the
   Daily Board's own "Re-check now" button fires (`use-daily-board.ts` `onRecheck`
   → same `RecheckAvailability`). The user explicitly chose the REAL fix over a
   cosmetic-only frontend port.
2. **Bare rows.** `DailyBoard.tsx` renders only a `LabeledCheckbox` with
   `row.rawName` — no chapter count, no open-page link, no availability dot — while
   `IntakePanel.tsx` already renders all of that from the same `SeasonAnimeRow`
   type via `getAvailabilityIndicator` + a chip/link/icon layout.

Success: a "Sin ver" row shows its live "N chapters available" count and an
open-page affordance; pressing "Re-check now" measurably updates that count for
Sin-ver rows; Ver hoy / Visto rows and the Intake list are untouched.

## Scope (two work units)

1. **Live recheck for Sin-ver rows (backend).** Extend `RecheckAvailability` so a
   created row that is still in the "Sin ver" section gets its `Availability` +
   `AvailableChapters` refreshed by a probe, exactly like matched-uncreated rows do
   today. The run stays idempotent, never creates or links an anime (creation
   remains the separate consent-gated step), and a probe error still leaves the row
   unchanged without failing the run.
2. **Sin-ver row info parity (frontend).** Add the "N chapters available" text and
   the open-page link icon to each Sin-ver row in `DailyBoard.tsx`, mirroring the
   `IntakePanel.tsx` pattern, and reuse the availability-dot semantics now that the
   count is live. All new derived/lookup logic lands in `daily-board.helpers.ts` /
   `use-daily-board.ts` — the `.tsx` stays dumb UI per the frontend constraints.

## Out of scope

- Ver hoy / Visto rows: NOT probed and NOT re-rendered. The user has already
  committed to watching those — there is no pending decision, and re-scraping a
  page for something already in-flight is wasted work and unwanted noise.
- The Intake list (`IntakePanel.tsx`) rendering and its match-status chip — the
  Sin-ver rows are always already matched + created, so match info is moot there.
- The creation / `sendToVerHoy` / section-move flows — no change to how rows enter
  or leave a section.
- Folder-picker and discard affordances from the Intake row (not relevant to a
  pick-what-to-watch decision on the board).
- The scheduled 21:00 availability job cadence and its notification/download chain
  (unchanged; this only widens which rows a recheck touches).

## Approach & rationale

- **Backend filter widening, not a new path.** The cleanest fix is to relax the
  single skip condition in `RecheckAvailability` so it also admits created rows
  that are still in "Sin ver", rather than adding a parallel probe routine. This
  keeps one idempotent probe loop, one error-swallowing contract, and one place to
  reason about which rows get scraped. The scope boundary ("Sin ver only, never Ver
  hoy / Visto") is the invariant the design must encode precisely.
- **Section resolution is the open design question.** A created anime's live
  section lives only in the anime's `dias` (see `season.go:44-46` and the
  `groupCreatedBySection`/read-model seam that populates
  `SeasonAnimeRow.section`), NOT on the `season_anime` row that
  `RecheckAvailability` iterates via `s.repo.ListSeasonAnimes`. So "refresh only
  Sin-ver created rows" requires the recheck loop to learn each created row's
  current section — via the existing `AnimeGateway` / read-model, not a new store.
  The design phase must pick that seam without leaking anime-side concerns into the
  season repo contract.
- **Frontend reuse, not reinvention.** `IntakePanel` already solved the visual
  vocabulary (`getAvailabilityIndicator`, chapters-available text, open-page link).
  Work unit 2 ports the same helper semantics into the Daily Board's own colocated
  helper/hook so both panels stay visually consistent while respecting the
  dumb-`.tsx` rule.
- **Strict TDD, both stacks.** Go changes lead with a failing `go test` (the
  existing `availability_test.go` + `use-daily-board.test.ts` fixtures — notably
  `createdRow(... availableChapters: 0)` — are the regression anchors); frontend
  helper/hook changes lead with vitest. File-size (400 warn / 500 hard-fail),
  JSDoc-on-exported-helpers, readonly `*Props`, and English-only code all hold.

## Reference

- Exploration: engram `sdd/sinver-live-availability/explore` (obs #4775).
- Backend gotcha: `internal/season/service.go:307-345`.
- Frontend pattern to mirror:
  `frontend/src/features/season/ui/IntakePanel/IntakePanel.tsx` +
  `intake-panel.helpers.ts` (`getAvailabilityIndicator`).
- Board render + grouping:
  `frontend/src/features/season/ui/DailyBoard/DailyBoard.tsx` +
  `daily-board.helpers.ts` (`groupCreatedBySection`).
