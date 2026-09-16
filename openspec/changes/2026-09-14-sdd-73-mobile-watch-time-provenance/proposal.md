# Proposal: Mobile Watch-Time Provenance (SDD-73)

## Intent

`watch_history` records a phone-marked episode at the moment the bridge **received** the
change. When the phone was offline, hours of viewing collapse onto the reconnect instant: on
the live database every one of the four episodes in the parked report is stamped 17–24 h late,
and 186 of the 207 history rows come from the phone.

The phone already sends one operation per watch action, each carrying its own
`lastWatchedAt`, and the bridge already stores it on the anime. What is missing is that the
watch-time projection throws it away in favour of the receive clock.

## Scope

### In Scope

- `watchhistory.Change` carries an optional source-reported timestamp; `Derive` selects it for
  the landing episode under explicit bounds and falls back to the receive time otherwise.
- The `activity_log` row carries that same reported time, so rebuilding the projection
  reproduces what live recording wrote instead of re-creating the defect.

### Out of Scope

- **Any Mobile change.** Mobile persists and transmits one operation per watch action with its
  own `lastWatchedAt` (see explore.md), so the wire contract does not need to move.
- **Rewriting rows that already exist.** Correcting stored history is a maintenance job on a
  database, not a step of opening one. It was run once, deliberately, as a separate operation
  outside the application; no part of it ships in the application's startup path, and no
  migration or marker for it remains in the code.
- **Timezone handling.** The displayed times are already correct for the machine's zone. No
  fixed offset is added anywhere.
- **`activity_log.occurred_at_ms` and the `anime.patch:<id>:<ms>` correlation id.** They remain
  the bridge's receipt time; that is what an audit of "what the bridge received" means.
- Repairing intermediate episodes of a genuine multi-episode jump. Their watch time was never
  transmitted by anyone, so no evidence can recover it.

## Decisions

| # | Decision | Consequence |
| --- | --- | --- |
| a | The reported time is accepted only when it is positive and not later than the receive time | A wrong device clock can never write a future row; a rejected value degrades to today's behaviour, never to a fabricated time |
| b | No lower bound against already-recorded history | The snapshot's `lastWatchedAt` is stamped by unrelated patches (`write_service.go:326-327`), so it is not a trustworthy floor |
| c | Only the **landing** episode takes the reported time; inferred intermediates keep the receive time | A multi-episode jump invents nothing. Episodes that were never dated stay dated by observation |
| d | The reported time is persisted on the audit row | A replay reproduces the rows live recording produced |
| e | Correcting existing rows is done once, outside the application, and leaves no code behind | The application's startup path stays free of data mutation, and the repository carries no dead migration |

## Capabilities

### Modified Capabilities

- `watch-history`:
  - **ADDED** "The Landing Episode Carries The Source-Reported Time" — the bounded selection
    rule, its fallback, and the inferred-intermediate rule.
  - **ADDED** "Recording Provenance Survives A Replay" — the activity row carries the reported
    time and the replay applies the same rule.
  - Existing recording, retraction, cycle, retention and read-model requirements are
    **unchanged**.
- `observability`:
  - **ADDED** "An Activity Audit Row Distinguishes Observation From Report" — the row's own
    instant stays the receipt time while a separately stored reported instant may accompany it.
    The distinct-table and retention guarantees are unaffected.

No change: `mobile-sync-contract` (the wire already carries the field), `anime-history`,
`anime-detail-watch-history`, `openapi`.

## Approach

- **Go, `internal/watchhistory`.** `Change` gains `ReportedAtMS int64` (0 = not reported).
  `Derive` stays pure and now resolves one landing timestamp under the rule in (a)–(c),
  exposing it on the existing `Effect`; `Store.insertEpisodes` uses it for the highest
  newly-reached episode and `OccurredAtMS` for the rest. Guard order stays significant, so the
  new rule is placed after the existing retraction/reset guards and is covered by the same
  table-driven MUTATE discipline.
- **Go, `internal/activity`.** One additive column plus the field on `Record` and
  `ProgressEvent`, following the existing `ColumnAdds` registry pattern. The desktop path
  passes 0 so its rows are byte-compatible with today's.
- **Tests.** Strict TDD: a RED test per behaviour, table rows for variants rather than new
  functions per mutant, expected values as literals.

## Affected Areas

| Area | Impact | Description |
| --- | --- | --- |
| `internal/watchhistory/derive.go` | Modified | `ReportedAtMS`, landing-time selection, `Effect.LandingAtMS` |
| `internal/watchhistory/store.go` | Modified | Landing episode uses the selected time |
| `internal/activity/schema.go`, `store.go` | Modified | Additive `reported_at_ms` column, record and replay field |
| `internal/anime/episode_service.go` | Modified | `ActivityRecord` carries the reported time (0 for desktop) |
| `internal/desktop/app.go`, `app_activity_write.go` | Modified | Adapter and mobile write path pass the reported time |
| `internal/sync/watch_history_backfill.go` | Modified | Replay passes the persisted reported time |
| `docs/learning-log.md`, `CHANGELOG.md` | Modified | Lesson line and user-facing notes |
| `docs/reports/mobile-watch-time-stamped-at-sync.md` | Modified | Status moves from open to fixed |
| `docs/openapi.yaml`, frontend, Mobile | **Untouched** | No wire or UI change |

## Size Forecast

Measured with `wc -l` in this worktree. The cap counts insertions **plus** deletions.

| Unit | Scope | Forecast | Actual |
| --- | --- | ---: | ---: |
| U1 | Landing-time selection in `Derive` + store application + desktop wiring (+ tests) | 260–330 | ~330 |
| U2 | Activity provenance column, record/replay plumbing, backfill parity (+ tests) | 210–280 | ~310 |

Two work units, both within reach of the 400-line review budget, and neither touches the
application's startup path.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| A device with a wrong clock writes nonsense | Low | Bounds in (a); rejection degrades to today's behaviour |
| Live and replayed recording diverge | Med | (d) plus an explicit parity test asserting the replayed row equals the live one |
| Intermediate episodes of a jump look like they were watched at reconnect | Med | Documented behaviour (c), stated in the spec rather than implied |
| Rows written before this change keep their wrong times | High, accepted | Corrected once, deliberately, outside the application; the code carries no migration |

## Rollback Plan

Every unit reverts with `git revert`. The `activity_log` column is additive, so an older build
ignores it and still reads every existing row.

## Success Criteria

- [ ] A mobile patch whose reported time is hours before receipt stores that time on the
  landing episode, and `activity_log.occurred_at_ms` plus the correlation id stay at receipt.
- [ ] A reported time that is zero, negative or later than receipt falls back to the receive
  time and never writes a future row.
- [ ] A genuine multi-episode jump records its intermediates at the receive time and only the
  landing episode at the reported time (or the receive time when the value is rejected).
- [ ] Desktop-derived writes, retractions, zero-delta writes and cycle resets are unchanged.
- [ ] The replay produces a row identical to the one live recording wrote for the same event.
- [ ] The application's startup path gains no data-mutating step, and no migration code,
  marker, restore point or maintenance command for this change exists in the repository.
- [ ] `go test ./...`, both golangci profiles, `checkgofilesize`, `checkarchitecture` and the
  SDD gate pass, with `ditto staged` MUTATE evidence on `./internal/watchhistory/`,
  `./internal/activity/` and `./internal/sync/`.
