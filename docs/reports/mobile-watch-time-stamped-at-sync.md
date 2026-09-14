# Phone-marked episodes are stamped with the sync time, not the watch time

> **Status:** open, parked for a later change. Nothing here has been fixed.
> **Found:** 2026-09-13, while polishing the SDD-72 History UI (worktree `sdd-69-real-history`).
> **Reported as:** "these times are not in the computer's local time, convert them".

## Verdict

This is **not** a time-zone bug. The History screen already converts every
`watched_at_ms` to local time correctly. The wrong value is the one that is
*stored*: an episode marked on the phone is recorded at the moment the bridge
**receives** the change, not at the moment it was watched. When the phone was
offline, every queued episode lands on the reconnect time.

Shifting the displayed times by the UTC offset would make them wrong in a new
way: Yani Neko episode 9 would read 14:02, and it was watched at 01:58.

## Evidence

Machine time zone: `SA Pacific Standard Time`, UTC-05:00. All reads were made
read-only against `%APPDATA%/Autoreas/data/bridge.db`.

1. **The display matches the stored epoch.** Row 293 (Yani Neko, episode 9)
   stores `1789344122760` = `2026-09-14 00:02:02 UTC` = `2026-09-13 19:02:02`
   local. The UI shows 19:02, so `formatRowTime` (`getHours()`) is right.
2. **19:02:02 is when the phone reconnected.** `runtime_events` 6551-6565 show
   the phone's websocket registering at 19:02:02 local and the bridge applying
   four queued patches in the same second. Those are the four rows at 19:02.
3. **The phone kept its own watch time, and it disagrees.** Each anime's
   `lastWatchedAt` in `anime_snapshots` comes from the phone clock:

| Anime | Episode | Stored (local) | Phone `lastWatchedAt` (local) | Gap |
|---|---|---|---|---|
| Yani Neko | 9 | 2026-09-13 19:02:02 | 2026-09-13 01:58:43 | 17.06 h |
| Sayonara Lara | 9 | 2026-09-13 19:02:02 | 2026-09-13 01:24:48 | 17.62 h |
| Youjo Senki II | 9 | 2026-09-13 19:02:02 | 2026-09-13 00:52:49 | 18.15 h |
| Date A Bullet Dead or Bullet | 1 | 2026-09-13 19:02:02 | 2026-09-12 18:50:05 | 24.20 h |
| Bleach: Sennen Kessen-hen - Kashin-tan | 8 | 2026-09-12 17:16:11 | 2026-09-12 00:13:41 | 17.04 h |
| Bleach: Sennen Kessen-hen - Kashin-tan | 7 | 2026-09-12 17:16:11 | 2026-09-12 00:13:41 | 17.04 h |
| Date a Live II | 11 | 2026-09-11 20:03:34 | 2026-09-11 20:03:35 | 0.00 h |
| Tefuda ga Oume no Victoria | 9 | 2026-09-11 17:23:43 | 2026-09-11 02:01:08 | 15.38 h |

The gap is not a constant offset: it is 0 when the phone was online at the
moment of watching (Date a Live II) and 15 to 24 hours after offline viewing.
The 1.12.0 History table showed Bleach at 00:13 because it read the snapshot's
`lastWatchedAt`, which is the phone's time.

The query that produced the table:

```sql
SELECT w.anime_name, w.episode,
       datetime(w.watched_at_ms / 1000, 'unixepoch', 'localtime') AS stored_local,
       datetime(json_extract(s.snapshot_json, '$.lastWatchedAt') / 1000, 'unixepoch', 'localtime') AS phone_local,
       round((w.watched_at_ms - json_extract(s.snapshot_json, '$.lastWatchedAt')) / 3600000.0, 2) AS gap_h
FROM watch_history w
JOIN anime_snapshots s ON s.anime_id = w.anime_id
WHERE w.source = 'mobile'
ORDER BY w.watched_at_ms DESC;
```

## Owner-reported offset (unresolved)

The owner reports that every time on the History screen is five hours early,
across all rows: 19:02 should read 00:02, 17:16 should read 22:16, and so on.

That is a separate claim from the sync-time defect above, and it does not match
the machine as measured on 2026-09-13:

- System UTC `2026-09-14 03:43:59` against the HTTP `Date` header of
  google.com (`03:44:01 GMT`) and cloudflare.com (`03:44:02 GMT`): the clock is
  correct to within two seconds. The time source is `Local CMOS Clock` and
  `w32tm` reports no successful sync.
- Windows time zone `SA Pacific Standard Time`, so `Get-Date` read
  `2026-09-13T22:44:01-05:00`.
- The desktop renders the machine's zone, so a stored instant of `00:02:02 UTC`
  reads 19:02. Adding five hours gives the UTC wall time exactly.

"Five hours more" is therefore correct only if the real local time equals UTC,
which would mean the Windows time zone does not match where the machine is.
Otherwise the displayed times are right for the zone and only the sync-time
defect applies. The next step is to compare the taskbar clock with a trusted
wall clock at the same moment. The answer decides whether the fix is an OS
setting or code; code should not add a fixed offset in either case.

## Root cause

- `internal/desktop/app_runtime_services.go:282`, `newMobileAnimeWriteService`,
  wires `now: func() int64 { return time.Now().UnixMilli() }`.
- `internal/desktop/app_activity_write.go:37` takes `occurredAtMs` from that
  clock and passes it both to the activity log (line 121) and to
  `watchhistory.Change.OccurredAtMS` (line 83).
- The patch the phone sends already carries its watch time:
  `contracts.AnimePatch.FechaUltCapVisto` (`internal/api/contracts/services.go:17`).
  It is written to the snapshot's `lastWatchedAt` and ignored by both logs.

The desktop path (`EpisodeService`) is not affected: there, "now" is the watch
time.

Half of this was a documented decision. The `[Unreleased]` changelog says a
multi-episode jump from the mobile app records each episode in between "all at
the moment the change arrived". That is a reasonable answer for the episodes in
between, which have no time of their own. The defect is that the newest
episode gets the same receive time even though the patch dates it.

## Constraints for the fix

- **Only the newest episode of a patch has a phone timestamp.** A patch that
  moves progress from 6 to 8 records episodes 7 and 8; `FechaUltCapVisto` dates
  episode 8 only. Episode 7 has no watch time of its own anywhere.
- **The phone clock is untrusted input.** A future timestamp, or one older
  than the anime's previous recorded row, needs a rule (clamp, or fall back to
  the receive time).
- **The activity log is an audit of what the bridge received.** Whether its
  `occurred_at_ms` should also move to the phone time is a separate decision
  from the watch-history projection; changing it also changes the
  `anime.patch:<id>:<ms>` correlation id.
- **Keyset paging orders on `watched_at_ms`.** Backdated rows are fine for
  paging, but a live History screen that already loaded older days will not
  show a row inserted into the past until it refetches.

## Open decision

1. **Forward only:** mobile writes use `FechaUltCapVisto` (bounded) for the
   newest episode, and the same time or the receive time for earlier episodes
   in the same patch.
2. **Forward plus repair:** also rewrite existing `source = 'mobile'` rows whose
   anime snapshot still holds a `lastWatchedAt` for that episode. This is a
   data migration: it needs a restore point, a one-shot marker like
   `watch-history-backfill`, and it can only repair the newest episode per
   patch.

Whichever is chosen, the regression test is a mobile patch whose
`FechaUltCapVisto` is hours before the receive clock, asserting the stored
`watched_at_ms` equals the phone time rather than the injected `now`.
