# SDD-53 — season-applied-schedule-snapshot

> Slice of program SDD-39. Make the closed-season registry self-contained: the
> applied schedule becomes a season-owned fact, not a live read that drifts.

## Problem (drift record, 2026-07-20)

The season registry (`seasons` + `season_animes`) is immutable after close, but
the FINAL APPLIED SCHEDULE is not part of it. Today only `applied_at` is
stored; the actual day/order layout is read live from each anime's current
`dias` (`animeOverlaysByID`, ordering board reads). Animes keep moving after
the season closes, so the archived season cannot answer "what was the final
order?" — the past-season Ordering view even warns that it "may have changed
since this season closed". The Excel this workflow replaces DID keep that
record.

## Objective

At the moment the schedule is applied cleanly (the milestone stamp in
`ApplySchedule`), persist a snapshot of the resulting weekday layout on the
season row. A closed season then renders its ordering registry from the
snapshot — never from live `dias`.

## Design sketch

- Additive `ColumnAdds` migration: `applied_schedule_json` on `seasons`
  (same registry pattern as `ordering_draft_json`).
- `ApplySchedule`: on the clean-apply path (where `MarkApplied` runs), also
  store the applied weekday placements (anime id, name, day, orden) as JSON.
  Re-apply after "Reopen ordering" overwrites the snapshot — the milestone and
  the snapshot always move together.
- Past-season workspace: the Ordering tab renders the snapshot read-only and
  drops the "live schedule may have changed" caveat; the live board remains
  the open-season view only.
- No wire/mobile change (bridge-internal read model), but note the addition in
  `docs/openapi.yaml` per the consumer-announcement convention if any REST
  surface ends up exposing it.

## Exit criteria

- Applying a schedule stores the snapshot; reopening + re-applying replaces it.
- A closed season shows its final day/order layout even after the underlying
  animes are later moved, renamed, or deleted.
- Migration test covers the additive column; service test covers
  snapshot-on-clean-apply and no-snapshot-on-partial-failure.
