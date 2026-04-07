# Append-Only Safe Writer Specification

## Purpose

Definir la escritura append-only segura de `animes.dat` para procesar actualizaciones validadas sin locks concurrentes en Windows y sin duplicar eventos por self-echo del watcher.

## Requirements

### Requirement: Runtime updates are serialized through one writer worker

The system MUST process `AnimeUpdateRequestedEvent` updates through a single serialized writer path.

#### Scenario: Burst of update requests stays sequential
- GIVEN multiple `AnimeUpdateRequestedEvent` messages arrive close together
- WHEN the writer processes them
- THEN it SHALL serialize file writes through one worker path
- AND it SHALL avoid concurrent append opens on `animes.dat`

### Requirement: Successful appends publish confirmation events

The system MUST publish an `AnimeChangedEvent` after each successful append-only write.

#### Scenario: Append success confirms the change
- GIVEN a validated `AnimeUpdateRequestedEvent` is written successfully to `animes.dat`
- WHEN the append completes
- THEN the writer SHALL emit an `AnimeChangedEvent`
- AND downstream domains SHALL not depend on the watcher to learn that local write

### Requirement: Self-echo is ignored precisely

The system MUST ignore filesystem notifications caused by its own writes without hiding unrelated external changes.

#### Scenario: Writer-generated filesystem event is discarded
- GIVEN the writer appended a payload and recorded its self-echo hash
- WHEN the watcher later observes the resulting filesystem change
- THEN the watcher SHALL ignore that self-generated payload
- AND it SHALL NOT emit a duplicate `AnimeChangedEvent` for it

#### Scenario: External payloads are not suppressed by mistake
- GIVEN the self-echo registry contains hashes from prior local writes
- WHEN an external change with a different payload arrives
- THEN the watcher SHALL continue processing that external change normally

### Requirement: Writer keeps the file append-only

The system SHOULD append one JSON line per update instead of rewriting the full file.

#### Scenario: Update writes one new line
- GIVEN `animes.dat` already contains legacy history
- WHEN a new update is persisted by the writer
- THEN the writer SHALL append a new JSON line at the end of the file
- AND it SHALL preserve existing previous lines intact
