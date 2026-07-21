# Delta for Append-Only Safe Writer

Full retirement. SDD-55 removes the serialized append-only writer that
persisted validated updates into `animes.dat` without concurrent-lock or
watcher self-echo problems on Windows. Bridge no longer writes to any
Legacy-owned file.

## REMOVED Requirements

### Requirement: Runtime updates are serialized through one writer worker
**Reason**: Serialized append-only writes existed to avoid concurrent
Windows file-lock contention on `animes.dat`; Bridge no longer writes to
that file, so there is no append path left to serialize.
**Migration**: None. SQLite write concurrency is owned by the existing
SQLite repository layer and its own transaction/locking semantics,
independent of this writer.

### Requirement: Successful appends publish confirmation events
**Reason**: The `AnimeChangedEvent` confirmation was tied to a successful
`animes.dat` append; without that append path, this specific confirmation
trigger no longer applies.
**Migration**: None. `AnimeChangedEvent` (or its equivalent) continues to be
published by the surviving SQLite write paths, driven by successful SQLite
commits instead of file appends.

### Requirement: Self-echo is ignored precisely
**Reason**: Self-echo suppression existed to distinguish the writer's own
`animes.dat` appends from external filesystem changes detected by the
watcher; both the writer and the watcher are removed together, so there is
no self-echo condition left to guard against.
**Migration**: None. No replacement self-echo mechanism is introduced.

### Requirement: Writer keeps the file append-only
**Reason**: Append-only-file semantics are specific to `animes.dat`'s
NeDB-style journal format; SQLite's own storage engine governs how Bridge's
data is persisted, independently of this requirement.
**Migration**: None.
