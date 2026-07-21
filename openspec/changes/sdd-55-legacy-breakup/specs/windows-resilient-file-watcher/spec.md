# Delta for Windows-Resilient File Watcher

Full retirement. SDD-55 removes the fsnotify-based runtime watcher that
detected post-startup changes to `animes.dat`, including its Windows
atomic-replace resilience and event-burst debouncing. Bridge has no external
file left to watch.

## REMOVED Requirements

### Requirement: The watcher observes the parent directory, not the file directly
**Reason**: There is no `animes.dat` (or its parent directory) left for
Bridge to watch; Bridge's only state is its own SQLite database, which does
not require filesystem-event observation to stay current.
**Migration**: None. No replacement watcher is introduced.

### Requirement: Runtime watching survives atomic replace flows
**Reason**: Atomic-replace resilience (rename/remove/create) was needed
specifically to survive Legacy's save pattern for `animes.dat`; with no
Legacy file being watched, this resilience concern no longer applies.
**Migration**: None.

### Requirement: Runtime watching coalesces event bursts before parsing
**Reason**: Debouncing existed to avoid redundant reparses of `animes.dat`
after a burst of filesystem events; there is no file left to reparse.
**Migration**: None.

### Requirement: Runtime watcher reuses effective snapshot logic
**Reason**: This requirement tied the watcher to the snapshot parser's
effective-state/diff model, both of which are removed together in this
change.
**Migration**: None. `AnimeChangedEvent` (or its equivalent) continues to be
emitted by direct SQLite write paths (REST/WS handlers), not by a
filesystem watcher.
