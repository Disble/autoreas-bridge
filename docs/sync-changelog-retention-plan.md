# Sync Changelog Retention Plan

Bridge needs a bounded sync delivery model before anime chapter management becomes a high-frequency writer. The changelog must be a temporary delivery queue, not the durable History store.

## Decision

Use three separate stores:

| Store | Responsibility | Retention |
| --- | --- | --- |
| `anime_snapshots` | Current effective anime state | One row per effective anime. |
| `activity_log` / `user_activity` | Durable product History across Bridge + Mobile actions | Long-lived. |
| `changelog` | Temporary sync delivery queue | Pruned after active devices acknowledge delivery. |

This keeps sync healthy without sacrificing History.

## Transversal Activity architecture

History must be implemented as a transversal bounded context, not as a table that other modules write directly.

Add a dedicated module:

```text
internal/activity
  event.go
  recorder.go
  store.go
  sqlite_store.go
  query_service.go
```

Ownership rules:

| Area | Responsibility |
| --- | --- |
| `internal/activity` | Owns `activity_log`, activity event shape, recording rules, and History read models. |
| Feature modules | Produce meaningful activity through a small port. They do not insert into `activity_log`. |
| SQLite adapter | Lives inside `internal/activity/sqlite_store.go`, matching the repo's existing per-context SQLite adapter pattern. |
| History UI | Reads activity through `ActivityQueryService`; it does not read `changelog`. |

The shared port should stay intentionally small:

```go
type ActivityRecorder interface {
    Record(ctx context.Context, event ActivityEvent) error
}
```

Expected dependency flow:

```text
internal/anime     \
internal/device     \
internal/download    -> ActivityRecorder -> internal/activity -> activity_log
internal/sync       /
```

This follows the current Bridge architecture: each bounded context can own its SQLite adapter (`sync`, `device`, `download`, `preferences` already do), but no context writes another context's tables directly.

Hard rule:

> `activity_log` belongs exclusively to `internal/activity`.

This matters because History is product data. If each module writes its own ad-hoc rows, Bridge loses consistent event shape, validation, source/device attribution, pagination guarantees, and future analytics quality.

## Current problem

Measured on `2026-07-03`:

- `pairing_tokens`: 1,095 rows, only 11 consumed.
- `changelog`: 1,235 rows, all `pending`.
- Bridge normally connects to ~1 device at a time.

That means:

- Pairing tokens are accumulating because tokens are generated on UI mount/refresh.
- Changelog currently behaves like an infinite append-only table.
- If Chapters starts writing progress frequently, the current model will grow unnecessarily.

## Pairing token cleanup

Pairing tokens are ephemeral security material, not history.

Rules:

- Keep at most one active unconsumed token per Bridge instance/session.
- Reuse the active token until it expires or is consumed.
- Add a short unused-token TTL: **10 minutes**.
- If a pairing token is not used within its TTL, expire it and make it unusable.
- If a pairing token is used, mark it as consumed immediately and never allow it to pair again.
- A consumed pairing token may be retained as a permanent audit trace if useful, but it must be tiny and bounded by real pair events, not UI refreshes.
- The long-lived credential is the paired device `auth_token`; it can be permanent until the user explicitly unpairs/revokes the device.
- Prune expired unused tokens:
  - on startup
  - before issuing/reusing a token
  - after successful pairing
- Do not prune active paired devices just because the original pairing token expired; token TTL only protects unused pairing attempts.

Expected result:

- `pairing_tokens` should normally have 0-1 active unused rows, plus consumed rows only for real pair events.
- In the common one-device setup, token growth should be near-zero after the first successful pairing.

## Connected devices management

Bridge needs a device-management surface before sync retention is fully safe.

Place it under **Settings / Configs** as a subsection such as **Connected Devices**.

The UI should show:

- device name
- device id
- paired date
- last sync / last seen
- current connection status: connected, disconnected, warning, stale, revoked
- whether the device currently blocks changelog pruning
- auth state: active or revoked
- action: **Unpair**

Connection status should be derived from recent heartbeat/sync activity, not from the existence of an auth token. A device can have a valid permanent auth token and still be disconnected or stale.

Unpair behavior:

- Revoke/delete the device auth token so the device can no longer call Bridge APIs.
- Mark the device as `revoked` or remove it from active device state.
- Stop considering the device for changelog pruning.
- Keep durable History rows that mention the device; do not erase product history.
- Do not hard-delete durable device history. The user action is credential revocation, not historical erasure.

This matters because stale devices should not keep active credentials forever and should not block changelog cleanup indefinitely.

## Device sync state

Add a per-device sync checkpoint:

```sql
CREATE TABLE IF NOT EXISTS device_sync_state (
  device_id TEXT PRIMARY KEY,
  last_ack_changelog_id INTEGER NOT NULL DEFAULT 0,
  last_seen_at_ms INTEGER NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'active'
);
```

Statuses:

| Status | Meaning |
| --- | --- |
| `active` | Device counts for changelog pruning. |
| `warning` | Device is near stale deadline; user should be notified. |
| `stale` | Device no longer blocks changelog pruning; requires full refresh if it returns. |
| `revoked` | Device is intentionally removed/unauthorized. |

## Changelog pruning flow

1. Mobile syncs with Bridge.
2. Bridge returns pending changelog rows newer than the device checkpoint.
3. After successful delivery/ack, Bridge updates:

```sql
UPDATE device_sync_state
SET last_ack_changelog_id = ?,
    last_seen_at_ms = ?,
    sync_status = 'active'
WHERE device_id = ?;
```

4. Bridge computes the minimum checkpoint among active devices:

```sql
SELECT MIN(last_ack_changelog_id)
FROM device_sync_state
WHERE sync_status = 'active';
```

5. Bridge prunes delivered rows:

```sql
DELETE FROM changelog
WHERE id <= ?;
```

For the common one-device case, this becomes simple:

```text
Device ACKs id 1235 -> Bridge deletes changelog <= 1235.
```

## Stale-device warning

Bridge must notify before a device stops blocking changelog pruning.

Suggested thresholds:

| Setting | Value |
| --- | --- |
| `stale_after` | 60 days without sync |
| `warn_before_stale` | 7 days |

Warning example:

> Device X has not synced in 53 days. If it does not reconnect within 7 days, Bridge will stop preserving old sync changes for it.

Rules:

- If the device reconnects before the deadline, clear the warning and keep incremental sync.
- If the device passes the deadline, mark it `stale`.
- A stale device remains listed and recoverable.
- If a stale device reconnects after changelog rows were pruned, it must use full refresh/snapshot sync.

## History relationship

Do not use `changelog` as History.

When a product action happens:

1. Write/update the current state in `anime_snapshots`.
2. Record durable action in `activity_log`.
3. Insert temporary sync row in `changelog`.

After devices acknowledge sync:

- Keep `activity_log`.
- Keep `anime_snapshots`.
- Delete eligible `changelog` rows.

## Legacy asymmetry and backfill policy

History data is intentionally asymmetric across sources.

Legacy did not record the same rich action stream Bridge is about to record. Therefore Bridge must not invent bidirectional or fully detailed historical actions for Legacy-only data.

Rules:

- Keep only the historical information Legacy already brings in its data model.
- Do not backfill inferred user actions from current Legacy state.
- Do not pretend old Legacy data has the same action granularity as new Bridge/Mobile activity.
- Bridge-origin and Mobile-origin actions can be rich and transversal from the moment Activity exists.
- Legacy-origin state remains valid current/product data, but its historical detail is limited to the fields Legacy actually persisted.

This means History queries must tolerate mixed fidelity:

| Source | Historical fidelity |
| --- | --- |
| Legacy existing data | Asymmetric and limited to persisted Legacy fields. |
| Bridge actions after Activity exists | Rich action event with source, actor, before/after, target, and correlation metadata. |
| Mobile actions after Activity exists | Rich action event with source/device context when available. |

This is a product truth, not a migration bug.

## Implementation slices

### Slice 1 — Pairing token cleanup

- Add 10-minute TTL for unused tokens.
- Reuse the current unconsumed token until it expires or is consumed.
- Mark used tokens as consumed and non-reusable.
- Keep the paired device auth token permanent until explicit unpair/revoke.
- Add pruning function for expired unused tokens.
- Run pruning on startup and token issue.
- Add tests proving repeated panel mounts do not create unlimited tokens.

### Slice 2 — Device sync state

- Add `device_sync_state` schema.
- Upsert state when a device pairs or syncs.
- Track `last_seen_at_ms` and `last_ack_changelog_id`.
- Add Settings/Configs Connected Devices read model with last sync and status.

### Slice 3 — Changelog ack + pruning

- Extend sync flow to acknowledge delivered changelog rows.
- Prune rows acknowledged by all active devices.
- Add tests for one-device and multi-device pruning.

### Slice 4 — Stale-device warning

- Add stale threshold evaluation.
- Emit user notification before stale deadline.
- Mark devices stale after deadline.
- Ensure stale devices do not block pruning.

### Slice 5 — Connected devices management

- Add Connected Devices subsection under Settings/Configs.
- Show device identity, last sync, connection/stale status, and pruning-blocking status.
- Add Unpair action that revokes the device auth token and removes it from active sync pruning.

### Slice 6 — Full refresh fallback

- Define behavior for stale devices reconnecting after pruning.
- Prefer full snapshot refresh from `anime_snapshots`.
- Keep this as a controlled fallback, not the normal path.

## Acceptance criteria

- Reopening Pairing UI repeatedly does not create unbounded `pairing_tokens`.
- An expired unused pairing token is pruned.
- A consumed pairing token cannot be reused and exists only as a bounded real-pair audit trace if retained.
- A paired device auth token remains valid until the user unpairs the device.
- A synced one-device setup prunes delivered changelog rows.
- Multiple active devices prune only up to the slowest active checkpoint.
- Stale devices stop blocking pruning.
- User receives a warning before a device becomes stale.
- Settings/Configs exposes connected devices with last sync/status and an Unpair action.
- Unpaired devices can no longer authenticate and no longer block changelog pruning.
- Durable History remains available after changelog pruning.
