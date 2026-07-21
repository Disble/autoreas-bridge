# Delta for Writeback

Full retirement. SDD-55 removes the durable-writeback contract for REST
PATCH persistence into `animes.dat` (append-before-response, explicit
append-failure surfacing, precise self-echo suppression). Bridge PATCH
requests now persist directly to SQLite and never touch a Legacy file.

## REMOVED Requirements

### Requirement: PATCH success MUST mean the append already exists
**Reason**: `PATCH /api/animes/:id` no longer appends to `animes.dat`;
durability is now defined entirely in terms of the SQLite write completing
before the handler returns success.
**Migration**: None required for callers. `PATCH /api/animes/:id` continues
to exist and continues to guarantee the update is durably persisted before
returning success — the durability target is SQLite, not a file append. See
the `openapi` capability delta for the accompanying English wire-field
rename.

### Requirement: Append failures MUST be visible
**Reason**: There is no `animes.dat` append step left to fail; SQLite write
failures are already surfaced as request failures by the existing
repository/handler error path, independent of this requirement.
**Migration**: None. SQLite write-failure surfacing is unaffected by this
removal.

### Requirement: Writer confirmation MUST remain serialized
**Reason**: Single-writer-lane serialization existed to protect concurrent
`animes.dat` appends; SQLite's own transaction semantics already serialize
concurrent writes at the database layer.
**Migration**: None.

### Requirement: Self-echo MUST suppress only the bridge's own write
**Reason**: Self-echo suppression existed only because a filesystem watcher
could observe the bridge's own `animes.dat` append; both the watcher and the
append path are removed together, so there is no self-echo condition left.
**Migration**: None.

### Requirement: Diagnostics MUST distinguish sync traces from write confirmation
**Reason**: This requirement distinguished write-back diagnostics from
tracer-bullet `SyncRequestedEvent` sync logs, both of which were part of the
Legacy synchronization channel being removed in full.
**Migration**: None. Any remaining SQLite write diagnostics are unaffected;
tracer-bullet sync logging tied to the Legacy channel is removed along with
the rest of that channel.
