# Delta for Anime Snapshot Parser

Full retirement. SDD-55 removes the entire startup catch-up / snapshot
mechanism (`startup_catchup.go`, `snapshot.go`) that consolidated
`animes.dat`'s effective state on boot. Bridge boots directly from SQLite
and has no external state to catch up on.

## REMOVED Requirements

### Requirement: Startup catch-up is asynchronous and cancellable
**Reason**: There is no `animes.dat` catch-up step left to run
asynchronously; Bridge's SQLite-backed startup does not need to wait on or
cancel a Legacy file read.
**Migration**: None. Application startup no longer spawns a catch-up
goroutine; it initializes services directly from SQLite.

### Requirement: Startup tolerates missing `animes.dat`
**Reason**: `animes.dat` is never read by Bridge, so its absence is no
longer a condition Bridge needs to tolerate or poll for.
**Migration**: None. Bridge boots the same way regardless of whether a
Legacy installation or file exists on the host machine.

### Requirement: Parser streams the file resiliently
**Reason**: The line-by-line, BOM-tolerant, malformed-line-tolerant parser
existed solely to read `animes.dat`; there is no file left to stream.
**Migration**: None. No replacement parser is introduced.

### Requirement: Effective anime state is canonicalized and hashed
**Reason**: Canonicalization and hashing existed to detect changes in
`animes.dat` across restarts; with no external file, SQLite rows are already
the effective and authoritative state with no need for hash-based diffing.
**Migration**: None. The `anime_snapshots` hash-comparison table and its
write path are removed along with this parser.

### Requirement: Tombstones and inactive records remain distinct
**Reason**: `$$deleted` tombstone handling was specific to `animes.dat`'s
append-only history format; Bridge's SQLite soft-delete columns already
express deletion vs. inactivation independently.
**Migration**: None. Existing SQLite soft-delete semantics (unrelated to
this parser) are unaffected.

### Requirement: Persisted snapshots drive startup catch-up and pruning
**Reason**: There is no catch-up cycle left to drive, and no external
snapshot to reconcile against or prune stale entries from.
**Migration**: None. The `anime_snapshots` table and its pruning logic are
deleted along with the rest of this capability; no data migration is
required since it held derived/comparison state, not primary anime data.
